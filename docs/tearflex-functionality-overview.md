# TearFlex — Functionality Overview

> **Purpose of this document:** Full rundown of implemented functionality across all three clients (web app, iOS app, Android app) and the backend API, intended as the basis for a User Acceptance Testing (UAT) plan.

---

## Platform Summary

TearFlex is a clinical tear film analysis platform for optometrists and ophthalmologists. It pairs with a clip-on Placido disc attachment for smartphone cameras to deliver automated tear film analysis (NIBUT, fluorescein break-up, lipid layer grading) at a fraction of the cost of traditional desktop instruments.

**Three clients share one backend API:**

| Client | Primary use | Status |
|--------|-------------|--------|
| Web app | Patient management, results review, reporting, admin | ✅ Implemented |
| iOS mobile app | Capture + immediate results at the slit lamp | ✅ Implemented |
| Android mobile app | Same as iOS | ✅ Implemented (same codebase) |

---

## 1. Authentication

### All clients

| # | Feature | Detail |
|---|---------|--------|
| 1.1 | Login | Username + password; JWT access + refresh tokens issued |
| 1.2 | Token refresh | Access token silently refreshed on 401; user is not interrupted |
| 1.3 | Session expiry | On unrecoverable token failure, user is returned to the login screen |
| 1.4 | Logout | Tokens cleared from secure storage; session ended |

**Mobile specific:**
- Tokens stored in device keychain / keystore via `expo-secure-store`
- App reopens authenticated if a valid refresh token exists (no re-login required)

**Web specific:**
- Session state managed via HTTP-only cookies proxied through the Next.js server
- Unauthenticated users are redirected to `/login`

---

## 2. Patient Management

### Web app + Mobile app

| # | Feature | Detail |
|---|---------|--------|
| 2.1 | Patient list | Paginated list of all patients for the practice; ordered by most recently active |
| 2.2 | Patient search | Real-time search by name; debounced to avoid excessive API calls |
| 2.3 | Patient card | Shows name, date of birth, and most recent dry eye severity badge |
| 2.4 | Create patient | Form: first name, last name, date of birth, sex, email, phone, NHS number, notes |
| 2.5 | Patient profile | Full patient details, NIBUT trend chart, assessment history list |
| 2.6 | Edit patient | Update any demographic field |
| 2.7 | Practice scoping | Clinicians only see patients belonging to their own practice |

### Web only

| # | Feature | Detail |
|---|---------|--------|
| 2.8 | Patient trend chart | Recharts line graph of NIBUT over time with normal/borderline reference lines |
| 2.9 | Assessment history | List of all assessments with eye, date, status; links to full results |

### Mobile only

| # | Feature | Detail |
|---|---------|--------|
| 2.10 | Trend chart (SVG) | NIBUT trend rendered in-app with react-native-svg; no charting library dependency |

---

## 3. Assessment Flow (Mobile)

This is the core clinical workflow on the mobile app.

### 3.1 Test Selection

- Choose which eye is being assessed: **Left** or **Right**
- Choose test type: **NIBUT**, **Fluorescein Break-Up**, or **Lipid Layer**
- Creates an Assessment record on the backend immediately
- Navigates to the pre-capture instructions screen

### 3.2 Pre-Capture Instructions

- Test-specific step-by-step instructions shown before capture begins
- **NIBUT:** Placido disc attachment, patient positioning, blink cue
- **Fluorescein:** Dye instillation, equilibration time, blue filter
- **Lipid layer:** Specular reflection positioning, patient fixation
- "I'm ready — start capture" button navigates to the camera screen

### 3.3 Capture Screen

The most clinically critical screen in the app.

**Layout:**
- Full-screen camera viewfinder (status bar hidden, no navigation chrome)
- Circular alignment overlay showing target eye position
- Top bar: cancel button (hidden during recording) + test type label
- Bottom bar: state prompt text, timer, large capture button

**Camera configuration:**
- Rear camera only (front camera not supported)
- 4K (3840×2160) preferred; falls back to 1080p
- 60fps preferred, 30fps minimum
- Microphone muted (GDPR — clinical videos should not contain audio)
- Auto-focus locked; auto-exposure locked on recording start

**State machine:**

| State | What the user sees |
|-------|--------------------|
| READY | "Position the Placido disc over the patient's eye" |
| ALIGNING | Pulsing amber ring — "Hold steady… aligning" |
| ALIGNED | Green ring — "Aligned. Tap to start recording" |
| RECORDING | Red ring, elapsed timer counting up, "Recording… ask patient to blink twice then hold open" |
| COMPLETE | Auto-navigates to processing screen |

**Safety features:**
- Re-entrancy guard prevents double-tap starting two simultaneous recordings
- Android hardware back button stops recording gracefully (no data loss)
- Cancel button invisible and untappable during recording
- Camera viewfinder only activates after hardware reports ready (no black-screen race condition)
- Safe area insets used for top bar positioning (notch/Dynamic Island compatible)

### 3.4 Processing Screen

- Video uploaded to backend in the background (multipart, S3 storage)
- Animated loading UI with phase-specific subtitle:
  - "Uploading video…" during upload
  - "Running analysis…" during server-side processing
- Polls backend every 2 seconds for analysis status
- Auto-navigates to results when status becomes `analysed`
- Error state: shows failure message, "Try again" (back to capture) and "Cancel" (home) buttons
- Android back button blocked during upload/processing to prevent data loss

### 3.5 Results Screen

**For NIBUT captures:**
- Large headline metric: first break-up time in seconds (e.g. "8.2s"), colour-coded by severity
- Severity badge (Normal / Mild / Moderate / Severe)
- Supporting metrics grid: mean NIBUT, analysis confidence %
- Background card colour matches severity (green/amber/orange/red)

**For Fluorescein captures:**
- Oxford Grade card (0–5 scale)
- Supporting metrics: break-up time

**For Lipid Layer captures:**
- Guillon Grade card (1–5 scale)
- Supporting metrics: estimated lipid thickness (nm)

**Action bar:**
- **Done** — marks session complete, returns to home
- **Share PDF** — generates a PDF report and opens the native iOS/Android share sheet
- **Repeat test** — returns to capture screen

---

## 4. Analysis Engine (Backend)

### NIBUT Analysis (Phase 1 — algorithmic, no ML)

| Step | What happens |
|------|-------------|
| Frame extraction | Video sampled at 10fps using OpenCV VideoCapture |
| ROI detection | Hough circles algorithm detects Placido ring pattern; falls back to frame centre if rings not found |
| Edge density | Canny edge detection within ROI per frame; outputs a fraction 0–1 |
| Normalisation | Per-frame densities z-scored relative to first 5 (baseline) frames |
| Break-up detection | First frame where distortion exceeds 1.5 standard deviations above baseline = first break-up time |
| Mean break-up | Average time of all frames exceeding the threshold |
| Heatmap generation | BGR colour overlay (orange→red) on first frame, intensity proportional to distortion |
| Confidence score | Inverse of baseline coefficient of variation (stable baseline = higher confidence) |
| Severity mapping | ≥10s Normal / ≥5s Mild / ≥2s Moderate / <2s Severe (TFOS DEWS II thresholds + TearFlex sub-classification) |

**Fluorescein and Lipid Layer** — algorithmic stubs in Phase 1; return realistic placeholder values with confidence = 0.1 (signals to the UI that these are not real results). Full CV implementation planned for Phase 2.

### Processing infrastructure

- Analysis triggered asynchronously by Celery worker on upload
- Status updates: `uploaded` → `processing` → `analysed` (or `failed`)
- Retry logic: 3 attempts with exponential back-off on transient failure
- When all captures in an assessment are analysed, assessment status cascades to `complete`
- Heatmap stored as a PNG image file in S3-compatible storage

---

## 5. Assessment Results (Web)

| # | Feature | Detail |
|---|---------|--------|
| 5.1 | Results page | Accessible from patient profile → assessment history |
| 5.2 | NIBUT display | Large first break-up time with severity colour coding |
| 5.3 | Metrics grid | Mean NIBUT, fluorescein grade, lipid grade, tear meniscus height, confidence score |
| 5.4 | Tear film heatmap | Colour-coded overlay image showing break-up locations on cornea |
| 5.5 | Severity badge | Normal / Mild / Moderate / Severe with practice threshold configuration |
| 5.6 | Generate report button | Triggers PDF report generation directly from the results page |

---

## 6. PDF Reporting

### Report generation

| # | Feature | Detail |
|---|---------|--------|
| 6.1 | Trigger | POST to API from web or mobile; returns HTTP 202 immediately |
| 6.2 | Async generation | Celery background task; Celery retries up to 2× on failure |
| 6.3 | Status polling | Client polls GET `/api/reports/{id}/` until `status = ready` |
| 6.4 | Content | Practice header, patient demographics, per-capture result tiles, embedded heatmap, TFOS DEWS II reference values, clinician name |
| 6.5 | Format | A4 PDF via WeasyPrint; print-ready with 2cm margins |

### Report content per test type

| Test | Shown in PDF |
|------|-------------|
| NIBUT | First break-up time, mean break-up time, confidence %, severity badge, heatmap image |
| Fluorescein | Oxford Grade (0–5), break-up time |
| Lipid Layer | Guillon Grade (1–5), estimated thickness (nm) |
| All | Tear meniscus height (if measured), dry eye severity badge |

### Download + share

| # | Feature | Detail |
|---|---------|--------|
| 6.6 | Web download | PDF opens in new browser tab via `/api/reports/{id}/download/` |
| 6.7 | Web report list | Paginated list of all reports for the practice; shows status |
| 6.8 | Mobile share | PDF downloaded to device cache, opened in native iOS/Android share sheet |
| 6.9 | Practice branding | Practice name, city, and postcode shown in report header |

---

## 7. Practice Management (Web)

| # | Feature | Detail |
|---|---------|--------|
| 7.1 | Practice details | Name, address, city, postcode, phone, email |
| 7.2 | NIBUT thresholds | Configurable normal/borderline thresholds (TFOS DEWS II defaults; per-practice overrides stored in database) |
| 7.3 | Clinician list | All clinicians in the practice with name, role, registration number |
| 7.4 | Invite clinician | Send invite to new clinician by email; sets role (Admin / Clinician / Technician) |
| 7.5 | Role-based access | Practice Admins can manage settings and clinicians; Clinicians can access patients and assessments |

---

## 8. API (Backend)

All endpoints require JWT authentication. All patient and assessment data is practice-scoped.

### Authentication
| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/auth/login/` | Obtain JWT access + refresh token pair |
| POST | `/api/auth/refresh/` | Refresh access token |
| GET | `/api/auth/me/` | Current user profile with clinician and practice details |

### Patients
| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/patients/` | List patients (paginated, searchable by name) |
| POST | `/api/patients/` | Create patient |
| GET | `/api/patients/{id}/` | Patient detail with assessment summary |
| PATCH | `/api/patients/{id}/` | Update patient |
| GET | `/api/patients/{id}/trend/` | NIBUT trend data for charting |

### Assessments
| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/assessments/` | List assessments (filterable by patient, date range) |
| POST | `/api/assessments/` | Create new assessment session |
| GET | `/api/assessments/{id}/` | Assessment detail with all captures and results |
| PATCH | `/api/assessments/{id}/` | Update assessment (add notes etc.) |

### Captures
| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/assessments/captures/` | Upload video (multipart); triggers Celery analysis task |
| GET | `/api/assessments/captures/{id}/` | Capture detail with nested result |
| GET | `/api/assessments/captures/{id}/status/` | Poll analysis status |

### Reports
| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/reports/` | List reports for the practice |
| POST | `/api/reports/generate/` | Trigger PDF generation (returns 202 + pending report) |
| GET | `/api/reports/{id}/download/` | Stream PDF as file attachment |

### Practice
| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/practice/` | Current practice details + thresholds |
| PATCH | `/api/practice/` | Update practice details or NIBUT thresholds |
| GET | `/api/practice/clinicians/` | List clinicians in practice |
| POST | `/api/practice/clinicians/invite/` | Invite new clinician |

---

## 9. Clinical Thresholds

Default values (TFOS DEWS II); configurable per practice via the settings page.

| Metric | Normal | Borderline | Concern |
|--------|--------|------------|---------|
| NIBUT (first break-up) | ≥ 10s | 5–9.9s | < 5s |

| Severity | Dry Eye Grade | NIBUT range |
|----------|--------------|-------------|
| Normal | None | ≥ 10s |
| Mild | Grade 1 | 5–9.9s |
| Moderate | Grade 2 | 2–4.9s |
| Severe | Grade 3 | < 2s |

| Oxford Scale | Fluorescein Grade |
|-------------|-------------------|
| 0 | Absent |
| 1 | Minimal |
| 2 | Mild |
| 3 | Moderate |
| 4 | Marked |
| 5 | Severe |

| Guillon Scale | Lipid Layer Grade |
|--------------|-------------------|
| 1 | Open meshwork (~15nm) |
| 2 | Closed meshwork (~30nm) |
| 3 | Wave / flow (~60nm) |
| 4 | Amorphous (~80nm) |
| 5 | Coloured fringes (>90nm) |

---

## 10. Infrastructure & Compliance Notes

| Area | Detail |
|------|--------|
| Hosting | VPS (Linux), Docker Compose |
| Database | PostgreSQL 16 |
| File storage | S3-compatible (configurable: AWS S3 or MinIO) |
| Task queue | Celery + Redis |
| API docs | OpenAPI 3.0 — Swagger UI at `/api/docs/` |
| Auth | JWT; access token short-lived, refresh token persisted securely |
| Patient data | All endpoints practice-scoped; cross-practice access returns 403 |
| Video files | Uploaded directly to S3; not processed in-memory in full |
| Encryption | S3 server-side encryption; HTTPS enforced in production |
| Audit | All analysis results include `analysis_version` and `processing_time_seconds` |

---

## 11. Known Phase 1 Limitations

These are intentional MVP limitations to be addressed in later phases:

| # | Limitation | Planned resolution |
|---|------------|-------------------|
| L1 | Fluorescein and lipid analysis return placeholder values (confidence = 0.1) | Phase 2: full CV pipeline for both test types |
| L2 | NIBUT heatmap is a single-colour overlay (not per-pixel break-up map) | Phase 2: per-region temporal heatmap |
| L3 | No ML model integration | Phase 3: CNN-based grading when training data available |
| L4 | Placido ring detection is algorithmic (Hough circles); may need tuning per device model | Phase 2: device-specific calibration profiles |
| L5 | PDF reports are generated synchronously in the background; no push notification when ready | Phase 2: push notification via `expo-notifications` |
| L6 | No data export / subject access request tooling | Phase 2: GDPR export endpoint |
| L7 | No audit log | Phase 2: structured audit trail per GDPR + IEC 62304 requirements |
| L8 | Invite-only registration (no self-service sign-up) | By design for MVP |
