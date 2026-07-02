# Topography Web Image Upload (Slice 2b) — Design

**Date:** 2026-07-02
**Branch:** `feat/topography-web-upload` (off master `3b88238`)
**Status:** Design — awaiting user review.
**Context:** parity principle ([[project-platform-parity]]): every test = take-or-upload on mobile, upload-only on web, results visible everywhere. 2a (EXIF focal) + the optics-downgrade hardening are merged, so web-uploaded images are calibrated-capable (via their own EXIF) and wrong/absent metadata degrades honestly.

## Goal

A clinician on the web app can create a corneal-topography scan by uploading 1–5+ still
images (taken through the Placido attachment), watch it process, and land on the
results — closing the "topography is mobile-only" gap. Backend API already accepts
everything needed; this is a web-frontend slice plus one backend validation tightening.

## User flow

`New assessment` stepper, unchanged step 0 (Eye). At the existing
"how do you want to record?" choice (currently *Upload a video* / *Enter results
manually*), a third option appears: **"Corneal topography (upload images)"** →
`mode='topography'` renders the new `TopographyUploadFlow`:

1. **pick-images** — multi-image picker (helper text: *"Upload photos taken through
   the Placido attachment — 1 to 20; the sharpest is analysed"*). Thumbnail strip with
   per-image remove. `Upload & analyse` button (disabled until ≥1 image).
2. On submit: create the assessment lazily (`{patient, eye}`, once, reused on retry —
   same pattern as `UploadAssessmentFlow.ensureAssessment`), then
   `POST topography/scans/` multipart (`assessment` + repeated `stills`), →
   **processing** — poll `topography/scans/{id}/status/` (existing endpoint; same
   `{id, status[, result]}` shape and `analysed`/`failed` terminals as tear-film),
   with the existing 2s/120s poll/timeout pattern and failed→retry / timed-out UI.
3. On `analysed` → `router.push('/patients/{id}/assessments/{assessmentId}')` — **no
   in-flow results screen**; the assessment detail page already renders
   `<TopographyResult>` for every scan. Identical termination to the tear-film flow.

Topography is **not** added to `TEST_TYPES` / the shared `TestType` union — it stays a
parallel resource (`TopographyScan` ≠ `TestCapture`), consistent with the
walking-skeleton decision. The stepper's `mode` union gains `'topography'`.

## Components & plumbing (web)

- **`api.postMultipart` extension:** value type widens to
  `string | Blob | Blob[]` — an array appends the same key once per item (DRF
  `ListField` expects repeated `stills` keys). Existing callers unchanged.
- **`useCreateTopographyScan()`** (new, in `hooks/useTopography.ts`): mutation posting
  `{assessment, stills: File[]}` → returns the created scan (endpoint returns the full
  read shape incl. `id`, `status='processing'`).
- **`useTopographyScanStatus(scanId, timeoutMs?)`** (new): near-verbatim copy of
  `useCaptureStatus` (TanStack `refetchInterval` fn, 2 s interval, 120 s wall-clock
  `isTimedOut`) pointed at `topography/scans/{id}/status/`.
- **`TopographyImagePicker`** (new component): mirrors `VideoFilePicker` conventions —
  sr-only `<input type="file" accept="image/*" multiple>` behind the dashed-border
  label, client-side per-file `image/*` check with the same inline-error style, cap at
  20 files (mirrors backend `MAX_STILLS_PER_SCAN`), thumbnail strip
  (`URL.createObjectURL`, revoked on unmount/remove) with per-image remove.
- **`TopographyUploadFlow`** (new component, sibling of `UploadAssessmentFlow`):
  phases `pick-images` → `processing`; lazy assessment creation; failed/timed-out
  states mirror `ProcessingStep`'s UI (reuse `ProcessingStep`? No — it is bound to
  `useCaptureStatus`/captureId; a thin `TopographyProcessingStep` twin binds the new
  status hook. Same copy, same retry affordance).
- **`NewAssessmentStepper`**: `mode` union `'choose' | 'manual' | 'upload' | 'topography'`;
  third choice button; renders `TopographyUploadFlow` for the new mode.
- **Shared-type drift fix (ride-along):** `shared/types/topography.ts` `TopographyScan`
  gains the `camera_focal_px` / `capture_width_px` / `capture_height_px` fields the
  backend has served since migrations 0002/0003 (nullable numbers). Web sends none of
  them — EXIF precedence makes a bare `stills` POST calibration-capable.

## Backend tightening (one change)

`TopographyScanCreateSerializer.stills` becomes **required with `min_length=1`**
(drop `required=False, default=list`). Today a zero-still POST validates, then the
Celery task deterministically fails through 3×30 s retries ("No readable stills") —
the exact deterministic-retry trap the hardening spec left for 2b. Mobile always sends
5 stills; every existing API test posts ≥1 still; ORM-created test scans are
unaffected. Client-side the picker independently enforces ≥1 before enabling submit.

## Error handling

- Create-POST failure → inline error on the pick-images phase, files retained,
  resubmit allowed (assessment reused via the lazy ref).
- `status='failed'` → "Analysis failed" + *Try again* returning to pick-images
  (files retained; a NEW scan is created on resubmit — scans are cheap rows and the
  failed one remains for audit, mirroring tear-film retry semantics).
- Poll timeout (>120 s) → "taking longer than expected" + same retry affordance.
- Honesty: results render whatever `calibration_state` the backend produced —
  EXIF-less browser uploads simply arrive `uncalibrated` (research-use badge shows,
  nothing else changes).

## Test plan

Backend (`USE_SQLITE_TESTS=1`, baseline 261): serializer/API — zero-still POST → 400
(new); ≥1-still POST still 201 (existing tests already cover; keep green).

Web (vitest, baseline 105, patterns copied from `useCaptureStatus.test.tsx` /
`UploadAssessmentFlow.test.tsx` — `vi.spyOn(api, …)` for hooks, `vi.mock` whole hook
modules + `next/navigation` for flows, `makeWrapper()`exactly as existing):
- `postMultipart` appends a `Blob[]` as repeated keys (unit, FormData inspection).
- `useCreateTopographyScan` posts to `topography/scans/` with repeated stills.
- `useTopographyScanStatus`: fetches; disabled on null; stops on `analysed`/`failed`;
  `isTimedOut` via tiny real `timeoutMs` (no fake timers) — mirror of the capture test.
- `TopographyImagePicker`: accepts images, rejects non-image with inline error,
  enforces the 20 cap, remove works.
- `TopographyUploadFlow`: picks images → creates assessment `{patient, eye}` → posts
  scan → navigates to the assessment page on `analysed`; failed shows retry.
- `NewAssessmentStepper`: third choice renders the topography flow.

## Out of scope (YAGNI)

Drag-and-drop (no prior art in web; click-to-browse matches `VideoFilePicker`); EXIF
client-side preview/validation; camera intrinsics fields from web; mobile changes
(2c: take-or-upload parity, declared intrinsics, NIBUT heatmap render, orientation
contract doc + rotated-still test); converting the remaining deterministic Celery
retries (unreadable stills at task level); clinician-visible downgrade/retake cue.
