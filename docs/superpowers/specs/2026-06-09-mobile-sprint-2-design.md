# TearFlex Mobile App — Sprint 2 Design Spec

**Date:** 2026-06-09  
**Scope:** Full mobile app vertical slice — foundation through capture flow, processing, and results  
**Platforms:** iOS + Android (simultaneously, via expo-dev-client)  
**API target:** `https://tearflex.mydryeyeapp.co.uk/api`

---

## Overview

This spec covers the complete TearFlex React Native mobile app. It folds the unstarted Sprint 1 mobile items (project setup, auth, patient list) in as prerequisites for the Sprint 2 capture work. The result is a shippable vertical slice: a clinician can log in, find a patient, run a NIBUT capture, upload the video, wait for analysis, and see their result.

### What's included

- Expo SDK 52 project with expo-dev-client (custom development build, iOS + Android)
- JWT auth with SecureStore, silent auto-refresh on 401
- Patient list with search, patient profile with NIBUT trend chart
- Assessment creation flow: eye + test selection → pre-capture instructions → camera capture
- Full-screen capture screen with state machine (READY → ALIGNING → ALIGNED → RECORDING → COMPLETE)
- Video upload (simple multipart POST) + async processing poller
- Results display with clinical colour-coding

### What's out of scope

- New patient creation from mobile (web-first feature)
- Reports tab (stub placeholder only)
- Real Placido ring detection (simulated 2 s auto-advance; swap point clearly marked)
- NIBUT heatmap on results (backend pipeline stub doesn't generate one yet)
- Push notifications
- Offline support / chunked upload

---

## Tech Stack

| Concern | Library |
|---|---|
| Framework | React Native 0.76 + Expo SDK 52 |
| Language | TypeScript |
| Routing | Expo Router v3 (file-based) |
| Styling | NativeWind 4 + Tailwind CSS |
| Server state | TanStack Query v5 |
| Client state | Zustand |
| Forms | React Hook Form + Zod |
| Camera | expo-camera |
| Token storage | expo-secure-store |
| File access | expo-file-system |
| Device info | expo-device |
| Dev build | expo-dev-client |
| Shared types | `../shared/types/*` via `@shared/*` tsconfig alias |

---

## Project Structure

```
mobile/
  app/
    _layout.tsx              # Root Stack + auth guard
    (auth)/
      _layout.tsx
      login.tsx
    (tabs)/
      _layout.tsx            # Bottom tab bar (Patients + Settings)
      index.tsx              # Patient list (default tab)
      settings.tsx           # Stub
    patient/
      [id].tsx               # Patient profile + assessment history
    assessment/
      select-test.tsx        # Eye + test type picker → creates Assessment
      instructions.tsx       # Per-test pre-capture instructions
      capture.tsx            # Full-screen camera (no tab bar, no status bar)
      processing.tsx         # Upload progress + analysis poller
      results.tsx            # Results display
  components/
    capture/
      AlignmentOverlay.tsx   # Circular ring overlay (state-driven)
      CaptureButton.tsx      # State-driven large round button
      StatePrompt.tsx        # Animated prompt text
      TimerDisplay.tsx       # Recording elapsed timer
    patients/
      PatientCard.tsx
      PatientList.tsx
    results/
      NIBUTResult.tsx
      MetricsGrid.tsx
    common/
      StatusBadge.tsx
      LoadingState.tsx
      EmptyState.tsx
  lib/
    api.ts                   # Authed fetch client with silent refresh
    secureTokens.ts          # expo-secure-store read/write helpers
  hooks/
    useAuth.ts
    usePatients.ts
    useAssessments.ts
    useCapture.ts            # Upload + polling logic
  store/
    auth.ts                  # Zustand: me / setMe / clear
  constants/
    colours.ts               # Clinical palette (mirrors web design tokens)
  app.json
  package.json
  tailwind.config.js
  tsconfig.json
```

---

## Configuration

### Environment

`app.json` exposes a single env var to the app via `expo-constants`:

```json
"extra": {
  "apiUrl": "https://tearflex.mydryeyeapp.co.uk/api"
}
```

`lib/api.ts` reads `Constants.expoConfig.extra.apiUrl`.

### NativeWind

NativeWind 4 requires a `tailwind.config.js` and a `babel.config.js` with the NativeWind preset. Metro config is updated to use `withNativeWind`. Global styles are imported once in the root `_layout.tsx`.

### tsconfig

Path alias `@shared/*` → `../shared/*` added under `compilerOptions.paths`, matching the web app.

---

## Auth

### Token storage

`lib/secureTokens.ts` wraps expo-secure-store:

```
ACCESS_KEY  = 'tf_access'
REFRESH_KEY = 'tf_refresh'

getTokens()   → { access, refresh }
setTokens()   → stores both
clearTokens() → deletes both
```

### API client (`lib/api.ts`)

Every request:
1. Reads access token from SecureStore
2. Attaches `Authorization: Bearer <token>`
3. On 401: calls `/auth/refresh/` with refresh token
4. On success: stores new token pair, retries original request once
5. On refresh 401: clears tokens, throws `AuthExpiredError` (caught by root layout to redirect to login)

Supports `get`, `post`, `patch`, `del`, and `postMultipart` (for video upload). `postMultipart` uses React Native's native `fetch` + `FormData` — no extra library needed; React Native's `FormData` accepts `{ uri, name, type }` objects directly.

### Auth guard

Root `app/_layout.tsx`:
- On mount, reads refresh token from SecureStore
- No token → redirect to `/(auth)/login`
- Has token → allow navigation to `/(tabs)/`
- Listens to Zustand `auth.ts` store for logout events

### Login screen

Standard username + password form with React Hook Form + Zod. On success: stores tokens, sets `me` in Zustand, navigates to `/(tabs)/`.

---

## Navigation

The `assessment/` screens sit outside `(tabs)/` in the root Stack. This means no bottom tab bar during the capture flow — intentional, gives the clinician a clean uncluttered UI.

**Route parameter chain:**

```
(tabs)/index
  → patient/[id]?patientId=X
    → assessment/select-test?patientId=X
      → assessment/instructions?assessmentId=X&testType=Y
        → assessment/capture?assessmentId=X&testType=Y
          → assessment/processing?assessmentId=X&testType=Y&videoUri=Z
            → assessment/results?captureId=W
```

`select-test.tsx` creates the Assessment via `POST /api/assessments/` before navigating forward. This ensures the Assessment exists before the capture starts.

---

## Screen Designs

### Patient list (`(tabs)/index.tsx`)

- Search bar at top (debounced 300 ms, calls `GET /api/patients/?search=...`)
- `FlatList` of `PatientCard` rows: full name, DOB, severity badge
- `usePractice()` fetches thresholds for badge colour-coding
- Tap card → `patient/[id]`
- Loading state: skeleton rows
- Empty state: "No patients found"

### Patient profile (`patient/[id].tsx`)

- Patient name + DOB + NHS number header
- NIBUT trend chart (`victory-native` + `react-native-svg` — line chart with two reference lines for normal/borderline thresholds)
- "New assessment" button → `assessment/select-test`
- List of past assessments (eye, date, status) with tap → `assessment/results?captureId=...` (for completed ones)

### Select test (`assessment/select-test.tsx`)

Two-step form:

1. **Eye:** large left/right toggle buttons (full width, coral when selected)
2. **Test type:** three large option cards (NIBUT, Fluorescein, Lipid) with brief description
3. **Start** button → creates Assessment → pushes instructions

The Assessment is created here (not in capture) so the ID is available for the instructions and capture screens.

### Pre-capture instructions (`assessment/instructions.tsx`)

Simple static screen, content varies by test type:

- **NIBUT:** "Ensure the Placido attachment is clipped on. Ask the patient to blink twice, then hold their eye open. Tap record when ready."
- **Fluorescein:** "Ensure fluorescein drops have been applied. Wait 30 seconds. Hold the blue light close. Tap record when ready."
- **Lipid:** "Position the specular light source. Ask the patient to look straight ahead. Tap record when ready."

"Continue" button → `capture`.

### Capture screen (`assessment/capture.tsx`)

Full-screen, rear camera, status bar hidden. The most important screen in the app.

**Layout (absolute positioning, z-order):**

```
┌─────────────────────────────┐
│ [×]   NIBUT Test            │  ← top bar, transparent, safe area
│                             │
│         ┌─────┐             │
│         │  ○  │             │  ← alignment circle overlay (centred)
│         └─────┘             │
│                             │
│   Hold steady... aligning   │  ← state prompt text
│                             │
│          ( ● )              │  ← capture button
└─────────────────────────────┘
```

**State machine:**

| State | Alignment ring | Prompt | Button |
|---|---|---|---|
| `READY` | Dashed, slate-400 | "Position the Placido disc over the patient's eye" | Grey, disabled |
| `ALIGNING` | Solid teal, pulsing opacity (Animated.loop 800 ms) | "Hold steady… aligning" | Grey, disabled |
| `ALIGNED` | Solid green-400 | "Aligned. Tap to start recording" | Coral, enabled |
| `RECORDING` | Solid green-400 | Test-specific prompt (see below) + elapsed timer | Red square (stop), enabled |
| `COMPLETE` | — | — | Auto-navigates to processing |

**RECORDING prompts by test type:**
- NIBUT: "Ask patient to blink twice, then hold open"
- Fluorescein: "Recording fluorescein break-up…"
- Lipid: "Recording lipid layer…"

**Simulated alignment:**
```ts
// TODO: replace with actual Placido ring detection (CV pipeline)
useEffect(() => {
  const t1 = setTimeout(() => setState('ALIGNING'), 500)
  const t2 = setTimeout(() => setState('ALIGNED'), 2500)
  return () => { clearTimeout(t1); clearTimeout(t2) }
}, [])
```

**Recording:**
- `ALIGNED → RECORDING`: call `cameraRef.current.recordAsync({ maxDuration: 25 })`
- Elapsed timer ticks every second via `setInterval`
- At 25 s or user taps stop: call `cameraRef.current.stopRecording()`
- `recordAsync` resolves with `{ uri }` → navigate to processing with `videoUri`

**Camera config:**
- `facing="back"` (rear only)
- `videoQuality="2160p"` (expo-camera falls back to highest available)
- Flash off
- `useCameraPermissions()` — if denied, show a permissions screen with a link to Settings

**Cancel button (×):** shown only in READY/ALIGNED/ALIGNING. Hidden during RECORDING to prevent accidental cancel mid-test.

**Android hardware back during RECORDING:** intercept with `useBackHandler` (from `@react-native-community/hooks`). Stop recording gracefully, discard the file, and navigate back to instructions — no dialog needed (the recording is short and data is not yet uploaded).

### Processing screen (`assessment/processing.tsx`)

Receives: `{ assessmentId, testType, videoUri }` via route params.

**Phase 1 — Upload:**
- Show "Uploading video…" + `ActivityIndicator`
- POST multipart to `/api/captures/` with `video_file`, `assessment`, `test_type`, `device_model`
- `device_model` from `expo-device` `Device.modelName`
- On success: get `captureId`, move to Phase 2

**Phase 2 — Analysis poll:**
- Show "Analysing tear film…" + `ActivityIndicator`
- TanStack Query with `refetchInterval: 2000` on `/api/captures/{captureId}/status/`
- `status === 'analysed'` → disable refetch, navigate to `results?captureId=X`
- `status === 'failed'` → show error card + "Try again" button (re-navigates to capture)

**Error handling:**
- Upload network error: "Upload failed. Check your connection." + Retry button
- Analysis failure: "Analysis failed. Please repeat the test." + Repeat button (pops to select-test)

### Results screen (`assessment/results.tsx`)

Fetches `GET /api/captures/{captureId}/` (nests the result object).

**Layout (scrollable):**

1. **NIBUT headline card** — large coloured value (e.g. "8.2s") with tinted background, severity label below. Colour driven by practice thresholds via `usePractice()` + `nibutBand()` from `../shared/lib/severity` (re-used from web).

2. **Severity badge** — same `StatusBadge` component logic as web.

3. **Metrics grid** — 2-column: NIBUT mean, fluorescein grade, lipid grade, confidence score. "Not assessed" where null.

4. **Heatmap placeholder** — grey rounded box with "Heatmap will appear here once the analysis pipeline generates one."

5. **Sticky bottom row:**
   - "Done" (teal) → `router.dismiss()` back to patient profile
   - "Repeat" (outline) → `router.replace('assessment/select-test?patientId=X')`

---

## Colour Palette (mobile)

Defined in `constants/colours.ts`, mirrors the web design tokens:

```ts
export const colours = {
  teal600: '#0E7C7B',
  teal700: '#0A5E5D',
  teal50:  '#EFFEFE',
  slate900: '#0F172A',
  slate600: '#475569',
  slate300: '#CBD5E1',
  slate50:  '#F8FAFC',
  coral500: '#F97066',
  statusNormal:   '#4ADE80',
  statusMild:     '#FBBF24',
  statusModerate: '#FB923C',
  statusSevere:   '#F87171',
}
```

NativeWind is configured with these as Tailwind custom colours so `className="text-teal-600"` works.

---

## Data Flow Summary

```
Login
  → POST /api/auth/login/
  → store access + refresh in SecureStore

Patient list
  → GET /api/patients/?search=...

Patient profile
  → GET /api/patients/{id}/
  → GET /api/patients/{id}/trend/
  → GET /api/assessments/?patient={id}

Assessment creation (select-test)
  → POST /api/assessments/  { patient, eye }
  → returns { id }

Capture + upload (processing)
  → POST /api/captures/  (multipart: video_file, assessment, test_type, device_model)
  → returns { id, status: 'processing' }

Poll
  → GET /api/captures/{id}/status/  (every 2 s)
  → when status = 'analysed': proceed to results

Results
  → GET /api/captures/{id}/  (nests result object)
```

---

## Known Issues to Fix During Implementation

From the earlier codebase analysis, two backend gaps affect the mobile app directly:

1. **`CaptureUploadView` has no practice scoping** — a clinician can POST a capture against any assessment ID. Should verify `assessment__patient__practice == request.user.clinician.practice`. Fix this before wiring the upload.

2. **`CaptureUploadView` has no explicit `permission_classes`** — relies on global default. Add `permission_classes = [permissions.IsAuthenticated]` explicitly.

Both are one-line fixes and should be addressed in the same PR as the mobile work.

---

## Out of Scope (future sprints)

- Real Placido ring detection (Sprint 3 analysis pipeline)
- NIBUT heatmap display (Sprint 3)
- Fluorescein + lipid analysis modules (Sprint 3+)
- Chunked video upload for poor connections (post-MVP)
- Push notification reminders (post-MVP)
- New patient creation from mobile (web-first; add to mobile later)
- Multi-eye assessment in one session (post-MVP)
