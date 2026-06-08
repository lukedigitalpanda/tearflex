# CLAUDE.md - TearFlex: Smartphone Tear Film Analysis Platform

## Project Overview

TearFlex is a clinical tear film analysis platform used by optometrists and ophthalmologists to assess dry eye disease. It works with a clip-on Placido disc attachment for smartphone cameras, providing automated NIBUT (Non-Invasive Break-Up Time), fluorescein break-up, and lipid layer analysis at a fraction of the cost of desktop devices like the Oculus Keratograph 5M.

The platform consists of three clients sharing a single backend API:

1. **Web app** - accessible via URL for desktop/tablet use in practice (patient management, reporting, admin)
2. **iOS app** - primary capture device (camera + Placido attachment + analysis)
3. **Android app** - secondary capture device (same functionality as iOS)

---

## Technical Architecture

### Backend API

- **Framework:** Django 5.x with Django REST Framework
- **Database:** PostgreSQL 16
- **Auth:** JWT (access + refresh tokens) via djangorestframework-simplejwt
- **File storage:** S3-compatible (AWS S3 or MinIO for local dev)
- **Task queue:** Celery + Redis (for async video processing / ML inference)
- **API docs:** drf-spectacular (OpenAPI 3.0 schema, Swagger UI at /api/docs/)
- **Python version:** 3.12+

### Web Frontend

- **Framework:** Next.js 14 (App Router)
- **Styling:** Tailwind CSS 3.x
- **UI components:** shadcn/ui
- **Charts:** Recharts (patient trend graphs)
- **State management:** TanStack Query (server state), Zustand (client state)
- **Forms:** React Hook Form + Zod validation
- **PDF generation:** Server-side via Django (WeasyPrint or reportlab)

### Mobile Apps (iOS + Android)

- **Framework:** React Native 0.76+ with Expo SDK 52+
- **Navigation:** Expo Router (file-based routing)
- **Camera:** expo-camera with custom overlay components
- **Video processing:** On-device via expo-av for capture, backend for analysis
- **Styling:** NativeWind (Tailwind for React Native)
- **State:** TanStack Query + Zustand (shared approach with web)
- **Auth:** Secure token storage via expo-secure-store
- **Push notifications:** expo-notifications (for follow-up reminders)

---

## Project Structure

```
tearflex/
  backend/
    manage.py
    tearflex/
      settings/
        base.py
        dev.py
        prod.py
      urls.py
      wsgi.py
      asgi.py
    apps/
      accounts/          # User auth, practice/clinic management
        models.py
        serializers.py
        views.py
        urls.py
      patients/           # Patient records, demographics
        models.py
        serializers.py
        views.py
        urls.py
      assessments/        # Test sessions, video uploads, results
        models.py
        serializers.py
        views.py
        urls.py
        tasks.py          # Celery tasks for async processing
      analysis/           # ML inference, image processing pipeline
        models.py
        pipeline.py       # Main analysis orchestrator
        nibut.py          # NIBUT ring distortion analysis
        fluorescein.py    # Fluorescein break-up grading
        lipid.py          # Lipid layer classification
        utils.py          # Shared image processing helpers
      reports/            # PDF report generation
        models.py
        generators.py
        templates/
    requirements/
      base.txt
      dev.txt
      prod.txt
    Dockerfile
    docker-compose.yml
  web/
    src/
      app/
        (auth)/
          login/page.tsx
          register/page.tsx
        (dashboard)/
          layout.tsx
          page.tsx          # Dashboard home
          patients/
            page.tsx        # Patient list
            [id]/
              page.tsx      # Patient profile
              assessments/
                [assessmentId]/page.tsx  # Assessment results
          assessments/
            new/page.tsx    # New assessment flow
          reports/
            page.tsx        # Report generation
          settings/
            page.tsx        # Practice settings
      components/
        ui/                 # shadcn/ui components
        patients/
          PatientList.tsx
          PatientCard.tsx
          PatientProfile.tsx
          TrendChart.tsx
        assessments/
          TestSelector.tsx
          ResultsDisplay.tsx
          TearFilmHeatmap.tsx
        reports/
          ReportPreview.tsx
        layout/
          Sidebar.tsx
          Header.tsx
          BottomNav.tsx
      lib/
        api.ts              # API client (fetch wrapper)
        auth.ts             # Auth helpers
        types.ts            # Shared TypeScript types
        utils.ts
      hooks/
        useAuth.ts
        usePatients.ts
        useAssessments.ts
    tailwind.config.ts
    next.config.ts
    package.json
  mobile/
    app/
      (auth)/
        login.tsx
        _layout.tsx
      (tabs)/
        _layout.tsx
        index.tsx           # Dashboard / patient list
        capture.tsx         # Camera capture (test selection + capture flow)
        reports.tsx         # Reports list
        settings.tsx        # Settings
      patient/
        [id].tsx            # Patient profile
      assessment/
        select-test.tsx     # Test type selection
        instructions.tsx    # Pre-capture instructions
        capture.tsx         # Camera viewfinder (THE KEY SCREEN)
        processing.tsx      # Analysis loading
        results.tsx         # Results display
    components/
      patients/
        PatientList.tsx
        PatientCard.tsx
      capture/
        CameraOverlay.tsx     # Circular alignment guide
        PlacidoDetector.tsx   # Ring detection indicator
        BlinkPrompt.tsx       # "Hold steady" / "Blink now" prompts
        CountdownTimer.tsx
        CaptureButton.tsx
      results/
        NIBUTResult.tsx
        TearFilmHeatmap.tsx
        ComparisonBadge.tsx
      common/
        StatusBadge.tsx
        TrendChart.tsx
    lib/
      api.ts
      auth.ts
      types.ts              # Shared with web where possible
    hooks/
      useCamera.ts
      useAuth.ts
      usePatients.ts
    app.json
    package.json
  shared/
    types/                  # TypeScript types shared between web and mobile
      patient.ts
      assessment.ts
      user.ts
      api.ts
    constants/
      thresholds.ts         # Clinical threshold values (NIBUT cutoffs etc.)
      testTypes.ts
```

---

## Data Models

### accounts app

```python
class Practice(models.Model):
    """A clinic or optician practice."""
    name = models.CharField(max_length=255)
    address_line_1 = models.CharField(max_length=255)
    address_line_2 = models.CharField(max_length=255, blank=True)
    city = models.CharField(max_length=100)
    postcode = models.CharField(max_length=10)
    phone = models.CharField(max_length=20, blank=True)
    email = models.EmailField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    is_active = models.BooleanField(default=True)

class Clinician(models.Model):
    """A clinician user linked to a practice."""
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    practice = models.ForeignKey(Practice, on_delete=models.CASCADE, related_name='clinicians')
    title = models.CharField(max_length=20, blank=True)  # Mr, Mrs, Dr, Prof
    professional_registration = models.CharField(max_length=50, blank=True)  # GOC number etc.
    role = models.CharField(max_length=20, choices=[
        ('admin', 'Practice Admin'),
        ('clinician', 'Clinician'),
        ('technician', 'Technician'),
    ], default='clinician')
    created_at = models.DateTimeField(auto_now_add=True)
```

### patients app

```python
class Patient(models.Model):
    """A patient record belonging to a practice."""
    practice = models.ForeignKey('accounts.Practice', on_delete=models.CASCADE, related_name='patients')
    first_name = models.CharField(max_length=100)
    last_name = models.CharField(max_length=100)
    date_of_birth = models.DateField()
    sex = models.CharField(max_length=10, choices=[('M','Male'),('F','Female'),('O','Other')], blank=True)
    email = models.EmailField(blank=True)
    phone = models.CharField(max_length=20, blank=True)
    nhs_number = models.CharField(max_length=20, blank=True)
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-updated_at']
        unique_together = ['practice', 'first_name', 'last_name', 'date_of_birth']
```

### assessments app

```python
class Assessment(models.Model):
    """A tear film assessment session for a patient."""
    patient = models.ForeignKey('patients.Patient', on_delete=models.CASCADE, related_name='assessments')
    clinician = models.ForeignKey('accounts.Clinician', on_delete=models.SET_NULL, null=True)
    assessed_at = models.DateTimeField(auto_now_add=True)
    eye = models.CharField(max_length=5, choices=[('left','Left'),('right','Right')])
    notes = models.TextField(blank=True)
    status = models.CharField(max_length=20, choices=[
        ('capturing', 'Capturing'),
        ('processing', 'Processing'),
        ('complete', 'Complete'),
        ('failed', 'Failed'),
    ], default='capturing')

class TestCapture(models.Model):
    """An individual test capture within an assessment."""
    assessment = models.ForeignKey(Assessment, on_delete=models.CASCADE, related_name='captures')
    test_type = models.CharField(max_length=20, choices=[
        ('nibut', 'NIBUT'),
        ('fluorescein', 'Fluorescein Break-Up'),
        ('lipid', 'Lipid Layer'),
    ])
    video_file = models.FileField(upload_to='captures/%Y/%m/%d/')
    thumbnail = models.ImageField(upload_to='thumbnails/%Y/%m/%d/', blank=True)
    duration_seconds = models.FloatField(null=True)
    resolution_width = models.IntegerField(null=True)
    resolution_height = models.IntegerField(null=True)
    fps = models.FloatField(null=True)
    captured_at = models.DateTimeField(auto_now_add=True)
    device_model = models.CharField(max_length=100, blank=True)  # e.g. "iPhone 15 Pro"
    status = models.CharField(max_length=20, choices=[
        ('uploaded', 'Uploaded'),
        ('processing', 'Processing'),
        ('analysed', 'Analysed'),
        ('failed', 'Failed'),
    ], default='uploaded')

class TestResult(models.Model):
    """Analysis results for a test capture."""
    capture = models.OneToOneField(TestCapture, on_delete=models.CASCADE, related_name='result')

    # NIBUT results
    nibut_first_breakup_seconds = models.FloatField(null=True, blank=True)
    nibut_mean_breakup_seconds = models.FloatField(null=True, blank=True)
    nibut_heatmap = models.ImageField(upload_to='heatmaps/%Y/%m/%d/', blank=True)

    # Fluorescein results
    fluorescein_grade = models.IntegerField(null=True, blank=True)  # 0-5 Oxford scale
    fluorescein_breakup_seconds = models.FloatField(null=True, blank=True)

    # Lipid layer results
    lipid_grade = models.IntegerField(null=True, blank=True)  # 1-5 Guillon scale
    lipid_thickness_nm = models.FloatField(null=True, blank=True)

    # Tear meniscus
    tear_meniscus_height_mm = models.FloatField(null=True, blank=True)

    # Overall
    dry_eye_severity = models.CharField(max_length=20, choices=[
        ('normal', 'Normal'),
        ('mild', 'Mild'),
        ('moderate', 'Moderate'),
        ('severe', 'Severe'),
    ], null=True, blank=True)

    # Metadata
    confidence_score = models.FloatField(null=True, blank=True)  # 0.0-1.0
    analysis_version = models.CharField(max_length=20, blank=True)  # Algorithm version
    processing_time_seconds = models.FloatField(null=True, blank=True)
    analysed_at = models.DateTimeField(auto_now_add=True)
    raw_output = models.JSONField(default=dict, blank=True)  # Full analysis payload
```

---

## API Endpoints

### Authentication
```
POST   /api/auth/login/              # JWT token pair
POST   /api/auth/refresh/            # Refresh access token
POST   /api/auth/register/           # Register new clinician (invite-based)
GET    /api/auth/me/                 # Current user profile
```

### Patients
```
GET    /api/patients/                # List patients (practice-scoped, paginated, searchable)
POST   /api/patients/                # Create patient
GET    /api/patients/{id}/           # Patient detail with assessment summary
PATCH  /api/patients/{id}/           # Update patient
DELETE /api/patients/{id}/           # Soft delete patient
GET    /api/patients/{id}/trend/     # NIBUT trend data for charting
```

### Assessments
```
GET    /api/assessments/             # List assessments (filterable by patient, date range)
POST   /api/assessments/             # Create new assessment session
GET    /api/assessments/{id}/        # Assessment detail with all captures and results
PATCH  /api/assessments/{id}/        # Update assessment (add notes etc.)
```

### Test Captures
```
POST   /api/captures/                # Upload video capture (multipart)
GET    /api/captures/{id}/           # Capture detail with result
POST   /api/captures/{id}/analyse/   # Trigger analysis (returns task ID)
GET    /api/captures/{id}/status/    # Poll analysis status
```

### Reports
```
POST   /api/reports/generate/        # Generate PDF report for assessment
GET    /api/reports/{id}/download/   # Download generated PDF
```

### Practice Admin
```
GET    /api/practice/                # Current practice details
PATCH  /api/practice/                # Update practice details
GET    /api/practice/clinicians/     # List clinicians in practice
POST   /api/practice/clinicians/invite/  # Invite new clinician
```

---

## Clinical Thresholds (shared/constants/thresholds.ts)

These are the clinical reference values used for colour-coding results:

```typescript
export const NIBUT_THRESHOLDS = {
  normal: 10,      // >= 10 seconds = normal (green)
  borderline: 5,   // 5-9.9 seconds = borderline (amber)
  // < 5 seconds = concern (red) - TFOS DEWS II diagnostic cutoff
};

export const FLUORESCEIN_GRADES = {
  // Oxford Grading Scale 0-5
  0: 'Absent',
  1: 'Minimal',
  2: 'Mild',
  3: 'Moderate',
  4: 'Marked',
  5: 'Severe',
};

export const LIPID_GRADES = {
  // Guillon classification
  1: 'Open meshwork (very thin, ~15nm)',
  2: 'Closed meshwork (~30nm)',
  3: 'Wave / flow (~60nm)',
  4: 'Amorphous (~80nm)',
  5: 'Coloured fringes (>90nm)',
};

export const DRY_EYE_SEVERITY_COLOURS = {
  normal: '#4ADE80',     // soft green
  mild: '#FBBF24',       // warm amber
  moderate: '#FB923C',   // orange
  severe: '#F87171',     // muted red
};
```

---

## Key Screen Specifications

### Capture Screen (mobile/app/assessment/capture.tsx)

This is the most critical screen in the entire app. The clinician is holding the phone with the Placido attachment near a patient's eye.

**Layout:**
- Full-screen camera viewfinder (no status bar, no nav)
- Circular alignment overlay (semi-transparent ring showing target eye position)
- Top-left: Cancel button (X icon)
- Top-centre: Test type label ("NIBUT Test")
- Top-right: Settings gear (flash, resolution)
- Centre: Alignment indicator that turns green when Placido rings are detected on cornea
- Bottom-centre: Large capture button (red circle, tap to start recording)
- Bottom: Status prompt area with animated text transitions

**State machine for capture flow:**
```
READY -> "Position the Placido disc over the patient's eye"
ALIGNING -> "Hold steady... aligning" (auto-detected)
ALIGNED -> "Aligned. Tap to start recording"
RECORDING -> "Recording... [countdown timer]"
  -> For NIBUT: "Ask patient to blink twice, then hold eyes open"
  -> Timer counts from 0 upward, stops at 25s max or on manual stop
COMPLETE -> Auto-navigates to processing screen
```

**Camera requirements:**
- 4K (3840x2160) if available, fall back to 1080p
- 60fps preferred, 30fps minimum
- Auto-focus locked once aligned (prevent hunting)
- Auto-exposure locked once recording starts
- Torch/flash OFF (Placido disc provides its own illumination)
- Front camera NOT supported (rear only, with attachment)

### Results Screen (mobile/app/assessment/results.tsx)

**Layout:**
- Scrollable single-column layout
- Top: Large headline metric (e.g. "8.2s" in 48pt with colour-coded background card)
- Below headline: Severity badge ("Borderline" in amber)
- Comparison to previous: arrow icon with delta ("2.3s improvement from last visit")
- Tear film heatmap: colour-coded overlay on a frame from the captured video
- Action bar (sticky bottom): Save | PDF Report | Repeat Test

---

## Analysis Pipeline (Phase 1 - Algorithmic)

The initial analysis pipeline uses deterministic image processing, not ML. This removes the training data dependency for MVP.

### NIBUT Analysis (apps/analysis/nibut.py)

```
Input: Video file (MOV/MP4, 4K, 60fps)
Process:
  1. Extract frames at 10fps (sufficient for NIBUT timing)
  2. Detect Placido ring pattern in first frame (Hough circles or template matching)
  3. Define region of interest (corneal reflection area)
  4. For each subsequent frame:
     a. Convert to grayscale
     b. Apply edge detection (Canny) within ROI
     c. Calculate fractal dimension of edge pattern (box-counting method)
     d. Calculate ring distortion metric (deviation from expected concentric pattern)
  5. Build time series of distortion metric
  6. Detect first break-up point (distortion exceeds threshold)
  7. Detect mean break-up point (average distortion exceeds threshold)
  8. Generate heatmap overlay showing break-up locations
Output: {
  first_breakup_seconds: float,
  mean_breakup_seconds: float,
  heatmap_image: PIL.Image,
  confidence: float,
  frame_metrics: list[dict]  # Per-frame distortion values for debugging
}
```

### Dependencies for analysis:
- OpenCV (cv2) - image processing, ring detection
- NumPy - numerical operations
- scikit-image - texture analysis, fractal dimension
- Pillow - image manipulation, heatmap generation
- FFmpeg (system) - video frame extraction

---

## Design System

### Colour Palette

```css
/* Primary */
--teal-600: #0E7C7B;      /* Primary actions, headers */
--teal-700: #0A5E5D;      /* Hover states */
--teal-50: #EFFEFE;        /* Light backgrounds */

/* Neutral */
--slate-900: #0F172A;      /* Primary text */
--slate-600: #475569;      /* Secondary text */
--slate-300: #CBD5E1;      /* Borders */
--slate-50: #F8FAFC;       /* Page background */
--white: #FFFFFF;          /* Cards */

/* Status */
--green-400: #4ADE80;      /* Normal */
--amber-400: #FBBF24;      /* Borderline */
--orange-400: #FB923C;     /* Moderate */
--red-400: #F87171;        /* Severe / concern */

/* Accent */
--coral-500: #F97066;      /* CTAs, capture button */
```

### Typography (Web)
- Headings: Inter (600, 700 weights)
- Body: Inter (400, 500 weights)
- Monospace numbers (results): JetBrains Mono or tabular Inter

### Typography (Mobile)
- System fonts (SF Pro on iOS, Roboto on Android) via NativeWind
- Large tabular numbers for results display

---

## Development Priorities

### Sprint 1: Foundation (Weeks 1-3)
- [ ] Backend: Django project setup, Docker Compose, PostgreSQL, Redis
- [ ] Backend: accounts app (Practice, Clinician models, JWT auth)
- [ ] Backend: patients app (CRUD + search)
- [ ] Web: Next.js project setup, Tailwind, shadcn/ui
- [ ] Web: Auth flow (login, token management)
- [ ] Web: Patient list and patient profile pages
- [ ] Mobile: Expo project setup, NativeWind, Expo Router
- [ ] Mobile: Auth flow with secure token storage
- [ ] Mobile: Patient list screen

### Sprint 2: Capture Flow (Weeks 4-6)
- [ ] Mobile: Camera integration with expo-camera
- [ ] Mobile: Capture overlay (alignment guide, ring detection indicator)
- [ ] Mobile: Capture state machine (ready -> aligning -> recording -> complete)
- [ ] Mobile: Test selection screen
- [ ] Mobile: Pre-capture instructions screen
- [ ] Backend: assessments app (Assessment, TestCapture models)
- [ ] Backend: Video upload endpoint (multipart, S3 storage)
- [ ] Web: Assessment list and detail views

### Sprint 3: Analysis MVP (Weeks 7-9)
- [ ] Backend: NIBUT analysis pipeline (ring detection, distortion measurement)
- [ ] Backend: Celery task for async video processing
- [ ] Backend: Heatmap generation
- [ ] Backend: TestResult model population
- [ ] Mobile: Processing/loading screen with status polling
- [ ] Mobile: Results screen with headline metric and heatmap
- [ ] Web: Results display with trend charting

### Sprint 4: Reporting & Polish (Weeks 10-12)
- [ ] Backend: PDF report generation (WeasyPrint)
- [ ] Web: Report preview and download
- [ ] Mobile: PDF share/export
- [ ] Mobile: Patient trend graph
- [ ] Web: Practice settings page
- [ ] Both: Error handling, loading states, empty states
- [ ] Both: Responsive polish and accessibility pass

### Future Sprints (Post-MVP)
- Fluorescein break-up analysis module
- Lipid layer classification module
- ML model integration (when training data available)
- Practice management system integrations (via API)
- Multi-practice / group management
- Push notification reminders for patient follow-ups

---

## Environment Setup

### Local Development

```bash
# Backend
cd backend
cp .env.example .env
docker-compose up -d  # PostgreSQL + Redis
python -m venv venv && source venv/bin/activate
pip install -r requirements/dev.txt
python manage.py migrate
python manage.py createsuperuser
python manage.py runserver

# Web
cd web
npm install
cp .env.example .env.local
npm run dev  # http://localhost:3000

# Mobile
cd mobile
npm install
npx expo start  # Scan QR code with Expo Go, or press i for iOS simulator
```

### Environment Variables (.env)

```
# Backend
DATABASE_URL=postgres://tearflex:tearflex@localhost:5432/tearflex
REDIS_URL=redis://localhost:6379/0
SECRET_KEY=your-secret-key
DEBUG=True
ALLOWED_HOSTS=localhost,127.0.0.1
CORS_ALLOWED_ORIGINS=http://localhost:3000
AWS_STORAGE_BUCKET_NAME=tearflex-dev
AWS_S3_ENDPOINT_URL=http://localhost:9000  # MinIO for local dev

# Web
NEXT_PUBLIC_API_URL=http://localhost:8000/api

# Mobile
EXPO_PUBLIC_API_URL=http://localhost:8000/api
```

---

## Important Notes

1. **Patient data is sensitive.** All API endpoints must be practice-scoped (a clinician can only see patients belonging to their practice). Use Django middleware or queryset filtering on every view.

2. **Video files are large.** 4K 60fps captures can be 50-150MB each. Use chunked upload on mobile, S3 direct upload where possible, and ensure the processing pipeline works with streaming rather than loading entire files into memory.

3. **The capture screen must be rock-solid.** This is a clinician holding a phone near a patient's eye. The UI must be calm, responsive, and give clear unambiguous feedback. No jank, no lag, no confusing states.

4. **Clinical thresholds are configurable, not hardcoded in the UI.** The values in thresholds.ts are TFOS DEWS II defaults but practices may want to adjust them. Store practice-level overrides in the database.

5. **The analysis pipeline will evolve.** Phase 1 is deterministic image processing. Phase 2 adds ML. The pipeline should be modular so individual analysis modules can be swapped without changing the API contract.

6. **GDPR / UK DPA 2018 compliance.** Patient records and video captures must be encrypted at rest. Implement data retention policies. Provide data export and deletion endpoints for subject access requests.

7. **This will become a medical device (SaMD).** Code quality, testing, and documentation standards should reflect this from day one. IEC 62304 compliance will be required. Maintain a software bill of materials, version everything, and write meaningful commit messages.
