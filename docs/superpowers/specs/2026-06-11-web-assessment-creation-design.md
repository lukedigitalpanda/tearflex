# Web Assessment Creation — Design Spec
_Date: 2026-06-11_

## Goal

Allow clinicians to create assessments and enter results manually from the web app, unblocking web-side testing of results display, trend charts, and report generation without requiring the mobile app.

This is a production-quality feature, not a stopgap.

---

## Route & Entry Point

- New page: `/patients/[id]/assessments/new`
- Entry: "New Assessment" button added to the Assessments section of `PatientProfile`
- On success: redirect to `/patients/[id]/assessments/[newId]`

---

## Stepper Flow (5 steps)

Linear stepper with back navigation always available. Steps 2–4 are optional — if skipped entirely, no capture/result record is created for that test type.

### Step 1 — Eye
- Eye selector: **Left** / **Right** (large toggle buttons, required)
- No other fields

### Step 2 — NIBUT
- First break-up time (seconds, 1 decimal place, **required** if step not skipped)
- Mean break-up time (seconds, 1 decimal place, optional)
- Live threshold feedback shown while typing: normal ≥10s (green), borderline 5–9.9s (amber), concern <5s (red)

### Step 3 — Fluorescein
- Grade: 0–5 Oxford scale, segmented control with label (e.g. "2 — Mild"), optional
- Break-up time (seconds, optional)

### Step 4 — Lipid Layer
- Grade: 1–5 Guillon scale, segmented control with label, optional
- Thickness nm (optional)
- Tear meniscus height mm (optional)

### Step 5 — Review & Save
- Summary card showing all entered values
- NIBUT result colour-coded by severity band
- "Save assessment" button — executes API calls then redirects
- Back navigation available to correct any step

---

## Backend Changes

### Model changes (`assessments/models.py`)

**TestCapture:**
- `video_file`: change from required `FileField` to optional (`blank=True, null=True`)
- Add `source` field: `CharField(max_length=10, choices=[('mobile','Mobile'),('manual','Manual')], default='mobile')`

### New endpoint

`POST /api/assessments/captures/manual/`

Request body:
```json
{
  "assessment": 1,
  "test_type": "nibut",
  "nibut_first_breakup_seconds": 7.2,
  "nibut_mean_breakup_seconds": 8.1,
  "fluorescein_grade": null,
  "fluorescein_breakup_seconds": null,
  "lipid_grade": null,
  "lipid_thickness_nm": null,
  "tear_meniscus_height_mm": null,
  "dry_eye_severity": null
}
```

Behaviour:
1. Creates a `TestCapture` with `source='manual'`, `status='analysed'`, no video file
2. Creates a `TestResult` with the provided values
3. Sets `dry_eye_severity` automatically from `nibut_first_breakup_seconds` using the practice's `nibut_normal_threshold` and `nibut_borderline_threshold` fields: ≥ normal → `'normal'`; ≥ borderline → `'mild'`; < borderline → `'moderate'`. If NIBUT was not entered, `dry_eye_severity` is left null.
4. Returns the created capture with nested result

Practice-scoping: same rules as existing capture upload — clinician must belong to the same practice as the patient.

### Migration required
- `0002_testcapture_source_video_optional.py`

---

## Frontend

### New files
- `web/src/app/(dashboard)/patients/[id]/assessments/new/page.tsx` — page shell
- `web/src/components/assessments/NewAssessmentStepper.tsx` — stepper orchestrator
- `web/src/components/assessments/steps/StepEye.tsx`
- `web/src/components/assessments/steps/StepNibut.tsx`
- `web/src/components/assessments/steps/StepFluorescein.tsx`
- `web/src/components/assessments/steps/StepLipid.tsx`
- `web/src/components/assessments/steps/StepReview.tsx`

### Modified files
- `web/src/components/patients/PatientProfile.tsx` — add "New Assessment" button
- `web/src/hooks/useAssessments.ts` — add `useCreateAssessment` and `useCreateManualCapture` mutations

### State management
Stepper state held in `NewAssessmentStepper` via `useState` — no Zustand store needed (page-local). React Hook Form + Zod per step. Step data accumulated in a top-level object passed down to each step.

### Zod schemas (additions to `web/src/lib/schemas.ts`)
- `eyeStepSchema`
- `nibutStepSchema`
- `fluoresceinStepSchema`
- `lipidStepSchema`

### Save sequence (Step 5)
1. `POST /api/assessments/` → get `assessmentId`
2. For each completed step (NIBUT / fluorescein / lipid): `POST /api/assessments/captures/manual/`
3. On all success: `router.push(/patients/[id]/assessments/[assessmentId])`
4. On any failure: show error toast, remain on review step, allow retry

---

## Downstream — no changes needed

- `ResultsDisplay` — reads `TestResult`, works as-is
- `TrendChart` — reads `/api/patients/[id]/trend/`, works as-is
- `GenerateReportButton` / reports — reads assessment + captures, works as-is

---

## Out of scope

- Date/time override for assessment (defaults to `auto_now_add`, can be added later)
- Assessment-level notes (clinicians use the patient notes section)
- Video upload from web
