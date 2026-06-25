# Web Upload Flow — Design Spec

**Date:** 2026-06-25
**Status:** Approved (pending written-spec review)
**Sub-project:** D of the "Video upload + review" feature

---

## Context

TearFlex is adding video upload + review to the new-assessment experience. Capture and
upload **converge**: once a video exists, it goes through the same review screen → the
same auto-analyse-or-manual choice → results. On the web there is no in-app camera (no
Placido attachment on desktop), so the web "acquire" step is **file upload**.

Prerequisites already merged to `master`:
- **B (web video review player)** — `web/src/components/player/VideoReviewPlayer.tsx`
  (props `source, mode, fps, initialRate, initiallyLooping, onCaptureFrame, onExpand,
  onReady, onError`) and `CapturedFrame { image: Blob; timestampSeconds: number; width:
  number; height: number }` from `web/src/components/player/useVideoFrame.ts`.
- **A (backend)** — `source` provenance (`mobile|upload|manual`); `POST /api/assessments/
  captures/` (auto) accepts `source` and **requires** `video_file`; `POST /api/assessments/
  captures/manual/` accepts optional `video_file`+`source` (coupling rule: video ⇒ source ∈
  {mobile, upload}); `CaptureStill` model + `POST/GET /api/assessments/captures/{id}/stills/`
  (unpaginated); `stills` on the capture serializer; `GET /api/assessments/captures/{id}/
  status/` poll.

### Current web new-assessment flow (before this slice)

- Entry: `web/src/app/(dashboard)/patients/[id]/assessments/new/page.tsx` mounts
  `web/src/components/assessments/NewAssessmentStepper.tsx`.
- The stepper is 5 manual steps: `StepEye → StepNibut → StepFluorescein → StepLipid →
  StepReview` (`web/src/components/assessments/steps/*`).
- `StepReview` submits: `useCreateAssessment()` (`POST /api/assessments/` `{patient, eye}`)
  → for each test type `useCreateManualCapture()` (`POST /api/assessments/captures/manual/`)
  → `PATCH /api/assessments/{id}/` status `complete` → best-effort `POST /api/reports/
  generate/` → `router.push('/patients/{id}/assessments/{assessmentId}')`.
- API client `web/src/lib/api.ts`: `api.get/post/patch/del` (JSON only) through the
  `/api/proxy` base, `credentials: 'include'`. **No multipart method.**
- Hooks `web/src/hooks/useAssessments.ts`: `useCreateAssessment`, `useCreateManualCapture`,
  `useAssessment`, `useAssessments`.
- Web is fully synchronous today — no status polling exists.
- `shared/types/assessment.ts` `TestCapture` lacks `source` and `stills`; there is no
  `CaptureStill` or shared `CapturedFrame` type.
- UI primitives in `web/src/components/ui/`: button, card, dialog, input, label, select,
  slider, badge, etc. No file-dropzone, no toast. Forms surface state via local
  `useState` + inline error text + disabled buttons (the `StepReview` pattern).

---

## Goal

Add an **Upload a video** path to the web new-assessment flow, alongside the existing
manual stepper. The clinician uploads a video for a chosen test type, reviews it with the
player (slow-mo, scrub, frame step, capture-frame), then either auto-analyses it (async,
with polling) or grades it manually. Clinician-captured frames are persisted as stills.

This slice is **web only**. The mobile flow (C) is a separate sub-project.

---

## Flow

After **eye selection**, an **entry-mode choice** appears:

```
Eye → ┌ "Enter results manually" → existing 5-step stepper (UNCHANGED)
      └ "Upload a video" → UploadAssessmentFlow:
            pick test type (default nibut)
            → pick file (video/*)
            → Review (VideoReviewPlayer, capture-frame held in memory)
            → choose:
               ┌ Auto-analyse → create capture (POST /captures/, source=upload)
               │                → upload held stills → Processing (poll status) → assessment detail
               └ Manual entry → per-test fields for the selected test type
                                → create capture (POST /captures/manual/, video+source=upload)
                                → upload held stills → mark complete + best-effort report → assessment detail
```

One uploaded video = **one capture** for the selected test type (mirrors mobile's
per-test model). The assessment is created once up front (`POST /assessments/` with
`{patient, eye}`); both submit paths reuse that `assessmentId` (retry never recreates it).

---

## Components & files

### Shared types — `shared/types/assessment.ts` (modify)

Add/align with backend A:

```ts
export type CaptureSource = 'mobile' | 'upload' | 'manual';

export interface CaptureStill {
  id: number;
  capture: number;
  image: string;            // URL
  timestamp_seconds: number;
  label: string;
  width: number | null;
  height: number | null;
  created_at: string;
}

// TestCapture: add `source: CaptureSource`, make `video_file: string | null`,
// add `stills: CaptureStill[]`.
```

`CapturedFrame` already lives in `web/src/components/player/useVideoFrame.ts`; the upload
flow imports it from there (no need to move it to shared for this slice).

### API client — `web/src/lib/api.ts` (modify)

Add one method (the only real gap):

```ts
// Posts multipart/form-data through the same /api/proxy base, credentials included.
// Does NOT set Content-Type (the browser sets the boundary). Returns parsed JSON as T.
postMultipart<T>(path: string, fields: Record<string, string | Blob>, ): Promise<T>
```

Signature: `postMultipart<T>(path: string, fields: Record<string, string | Blob>): Promise<T>`
— callers pass scalar fields as strings and files/blobs as `Blob`/`File` values; the
method builds a `FormData`, appends each entry, and POSTs. Error handling mirrors the
existing `ApiError` path.

### Hooks — `web/src/hooks/useCaptures.ts` (new) + `useAssessments.ts` (reuse)

- `useUploadCapture()` — `postMultipart('assessments/captures/', { assessment, test_type,
  source: 'upload', video_file })` → returns `{ id: number; status: string }`.
- `useUploadManualCapture()` — `postMultipart('assessments/captures/manual/', {
  assessment, test_type, source: 'upload', video_file, ...resultFields })` → returns the
  created `TestCapture`.
- `useCreateCaptureStill()` — `postMultipart('assessments/captures/{id}/stills/', { image,
  timestamp_seconds, label? })`.
- `useCaptureStatus(captureId, { enabled })` — TanStack Query poll of `GET /api/assessments/
  captures/{id}/status/` with `refetchInterval` ~2000ms, stopping when `status` is
  `analysed` or `failed`.

(The existing `useCreateAssessment` is reused for the assessment row.)

### UI — `web/src/components/assessments/` (new + one modify)

- `EntryModeChoice.tsx` — two cards/buttons ("Upload a video" / "Enter results manually");
  calls `onChoose('upload' | 'manual')`.
- `UploadAssessmentFlow.tsx` — orchestrator owning the upload sub-flow state machine
  (`pick-test → pick-file → review → (auto: processing) → done`), the in-memory
  `CapturedFrame[]`, and the `assessmentId`. Receives `patientId`, `eye`.
- `VideoFilePicker.tsx` — native `<input type="file" accept="video/*">` styled as a
  dropzone-ish button; validates the file is a video; exposes the chosen `File` + an
  object URL; shows filename + size.
- `UploadReviewStep.tsx` — renders `VideoReviewPlayer` on the file's object URL;
  accumulates `onCaptureFrame` into the flow's stills list; presents the **Auto-analyse**
  and **Enter manually** actions.
- `UploadManualEntry.tsx` — the manual result fields for the **selected** test type
  (reusing the existing per-test field components/validation where possible); submits via
  `useUploadManualCapture`.
- `ProcessingStep.tsx` — shown on the auto path; drives `useCaptureStatus`, shows a
  "Processing…" state, advances to the assessment detail on `analysed`, shows a failure
  state on `failed`.
- `NewAssessmentStepper.tsx` (modify) — after `StepEye`, branch on the entry mode: manual
  → existing steps; upload → `UploadAssessmentFlow`.

---

## Data flow (submit paths)

1. **Assessment** created once: `useCreateAssessment({ patient, eye })` → `assessmentId`.
2. **Auto path:** `useUploadCapture({ assessment: assessmentId, test_type, video_file })`
   → `{ id, status: 'processing' }` → POST each held still to `/captures/{id}/stills/`
   → `ProcessingStep` polls status → on `analysed` navigate to the assessment detail.
3. **Manual path:** `useUploadManualCapture({ assessment, test_type, video_file,
   ...resultFields })` → created capture (`status: 'analysed'`) → POST held stills →
   `PATCH /assessments/{id}/` `complete` + best-effort report → navigate to detail.
4. **Stills:** during review, `onCaptureFrame(frame)` pushes into the flow's
   `CapturedFrame[]`. After the capture id exists, each frame is POSTed as multipart
   (`image` = `frame.image` Blob, `timestamp_seconds` = `frame.timestampSeconds`,
   optional `label`). Still-upload failures are non-fatal.

---

## Error handling

- **File picker:** `accept="video/*"`; a non-video selection shows an inline message and
  is not accepted; the chosen file's name + size are shown.
- **Upload failure (network/4xx):** inline error on the review step; stay put; allow
  retry. The assessment already exists — retry reuses `assessmentId`, never recreates it.
- **Poll:** on `status === 'failed'`, show a failure state with a retry affordance. Cap
  polling (e.g. stop after ~2 minutes) to avoid an infinite loop, surfacing a timeout
  message.
- **Stills upload failure:** non-blocking notice; never blocks navigation to results.
- **Player load error:** `VideoReviewPlayer` already renders an inline "Couldn't load this
  video" via `onError`.

---

## Testing (vitest + @testing-library/react; mock `api`/fetch)

- `api.postMultipart` builds a `FormData` with the right entries and POSTs to the right
  path without forcing `Content-Type`.
- `useUploadCapture` / `useUploadManualCapture` / `useCreateCaptureStill` /
  `useCaptureStatus` call the correct paths with the correct bodies; the status hook stops
  polling on `analysed`/`failed`.
- `EntryModeChoice` renders both options and invokes `onChoose` correctly.
- `VideoFilePicker` accepts a video file and rejects a non-video.
- `UploadReviewStep` renders the player, accumulates captured frames, and the auto/manual
  actions trigger the right submit.
- After capture creation, held stills are POSTed (one call per frame).
- `ProcessingStep` advances on `analysed` and shows failure on `failed`.
- `UploadManualEntry` submits video + `source='upload'` + the selected test type's result
  fields.

---

## Out of scope (YAGNI / later)

- **Multi-test manual entry in the upload branch — PARKED (revisit later).** Ideally the
  manual branch after an upload could capture all three test types' results in one go
  (like the manual stepper does). For this slice the manual branch handles only the
  **selected** test type's fields (one video = one capture). Expanding it to all test
  types is a deliberate future enhancement, deferred to keep this slice tractable.
- **Video playback + MP4 download on the assessment detail page — PARKED (revisit after
  this slice).** The uploaded/captured video is already stored (`capture.video_file`).
  A follow-up should surface it on the assessment detail view — viewable (player) and
  downloadable as an `.mp4`, in its own card beneath the results / alongside the PDF
  report card. Deferred so this slice stays focused on the upload/review flow itself.
- Chunked / resumable upload and hard client-side size caps — a plain `video/*` filter
  only. (Large-file robustness is a later concern.)
- Webcam capture on web — excluded from the whole feature (no Placido attachment on
  desktop).
- A thumbnail filmstrip / stills gallery UI — the capture-frame button persists stills;
  browsing them is a later concern. (The assessment detail already renders results.)
- Mobile flow (C) — separate sub-project.
- Any backend change — A is complete and unchanged here.

---

## Self-review notes

- Placeholders: none.
- Consistency: upload (auto) → `POST /captures/` (requires video, triggers Celery, poll);
  manual → `POST /captures/manual/` (video+source, immediate result) — matches backend A's
  contract and the coupling rule (video ⇒ source ∈ {mobile, upload}; here always
  `upload`). Assessment created once and reused on both paths and on retry.
- Scope: one cohesive user flow (web upload). Sizeable (~8–10 tasks) but single-flow; kept
  in one spec. Manual stepper untouched.
- Ambiguity resolved: one video = one capture for the selected test type; the manual
  branch shows only that test type's fields; stills upload after the capture id exists and
  are non-fatal on failure.
