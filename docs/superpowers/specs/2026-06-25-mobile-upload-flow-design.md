# Mobile Capture+Upload Flow — Design Spec

**Date:** 2026-06-25
**Sub-project:** C, slice 2 (the mobile capture+upload flow that consumes the slice-1 player). Final slice of sub-project C.
**Branch:** `feat/mobile-upload-flow` (off `master`).

## Context

TearFlex's web app already has the full upload flow (sub-project D, merged): pick test → upload a video → review with the player → auto-analyse (polled) or grade manually, with captured frames persisted as stills. The mobile app is still **capture-only and auto-upload-only**: `capture.tsx` records → `processing.tsx` (uploads on mount + polls) → `results.tsx`. There is no "upload a video" path, no review step, no manual entry, no stills, and no `source` plumbing.

Slice 1 (merged) delivered the reusable `MobileVideoReviewPlayer` (`mobile/components/player/`) and the jest-expo test harness. This slice wires that player into a convergent capture+upload flow that mirrors web D, and adds the mobile-specific camera front-door.

**KEY DECISION (user): capture and upload CONVERGE.** Once a video exists (camera **or** picker), both go through the SAME review screen → SAME auto-analyse-or-manual choice → SAME processing → SAME results. Source provenance differs only via `source` (`'mobile'` vs `'upload'`); the UX after acquisition is identical.

**KEY DECISION (user): results-video parity on web.** Surfacing the stored video on the results screen (view via compact player + download/share as `.mp4`) is done on **both** mobile and web in this slice — completing the previously-parked "stored video on assessment detail" item for web.

## Goals

- A mobile "Upload a video" path (gallery picker) alongside the existing "Take a video" camera path, behind a Take/Upload front door.
- A shared **review screen** inserted into BOTH paths (the camera path stops going straight to processing), offering Auto-analyse or Enter-manually, with frame-capture → stills.
- `processing.tsx` refactored to **poll-only** with a 2-minute timeout cap + retry (capture creation moves to the review screen).
- The compact player + download on the **results** screen, on **both** mobile and web.

## Non-Goals (mirror web D)

- Manual entry handles the **selected test type only** (multi-test manual entry parked).
- No chunked upload, no client-side size cap (only the picker's `video` filter).
- No pure-manual (no-video) path on mobile — manual entry always has a video (from the review screen).
- No frame-capture on the results compact player (compact mode hides it).
- No filmstrip navigation.

## Decisions (from brainstorming)

1. **Scope:** full convergent flow in one spec (both paths) + web results-video parity.
2. **Video picker:** `expo-image-picker` (`launchImageLibraryAsync`, `mediaTypes: ['videos']`) — gallery videos return a local file uri usable by the player and upload directly.
3. **Front door:** a new `acquire.tsx` screen AFTER `select-test` (test+eye+assessment already chosen). "Take" → existing `instructions` → `capture`; "Upload" → picker → `review`.
4. **Review orchestrator:** a single `review.tsx` screen owns phases `review | manual`, holds the captured stills in memory, and performs capture-creation + stills-upload for both auto and manual before navigating out (mirrors web's `UploadAssessmentFlow`). Manual entry is **inline** on this screen, not a separate screen, so stills stay in one component's memory.
5. **Results video:** view (compact player) **+ download/share `.mp4`** on both platforms.

## Architecture — screen flow

```
select-test.tsx ──(pick test+eye, create assessment)──► acquire.tsx  [NEW]
                                                          │  "Take a video"  |  "Upload a video"
                                              ┌───────────┘                  └──────────────┐
                                     instructions.tsx                      expo-image-picker (modal)
                                              │                                              │ (pick → local uri)
                                       capture.tsx ──records──┐                ┌─────────────┘
                                       (REPLACE target flips) ▼                ▼
                                                       review.tsx  [NEW orchestrator]
                                              params: { assessmentId, testType, videoUri, source }
                                              ├─ MobileVideoReviewPlayer (review mode)  — holds CapturedFrame[]
                                              ├─ Auto-analyse  → create capture(source) → upload stills → processing.tsx
                                              └─ Enter manually → inline form → manual capture(+results) → upload stills
                                                                  → PATCH complete + report → results.tsx
                                                              │                                    │
                                                    processing.tsx [REFACTOR: poll-only + 2min cap]
                                                              │ (analysed)
                                                              ▼
                                                       results.tsx [+ compact player + Save/Share .mp4]
```

The camera path change is minimal and safe: `capture.tsx`'s post-record `router.replace` target flips from `processing` to `review` (adding `source: 'mobile'`). The recording logic on the critical capture screen is untouched.

## File structure

```
mobile/
  app/assessment/
    acquire.tsx                     # NEW — Take/Upload front door
    review.tsx                      # NEW — orchestrator (review|manual phases, stills, auto/manual)
    capture.tsx                     # MODIFY — replace-to-review (+ source:'mobile')
    processing.tsx                  # MODIFY — poll-only + 2min cap + retry→review
    results.tsx                     # MODIFY — compact player + Save/Share .mp4
    select-test.tsx                 # MODIFY — navigate to acquire (not instructions) after create
  components/assessments/
    ManualEntry.tsx                 # NEW — RN numeric form per test type (mirrors web UploadManualEntry)
  hooks/
    useCapture.ts                   # MODIFY — add `source` to upload
    useCaptures.ts                  # NEW — useUploadManualCapture, useCreateCaptureStill, useCaptureStatus(cap)
  lib/types.ts / @shared adoption   # use CaptureSource from @shared/types/assessment
web/
  src/app/(dashboard)/patients/[id]/assessments/[assessmentId]/page.tsx   # MODIFY — compact VideoReviewPlayer + Download .mp4
```

## Components & responsibilities

- **`acquire.tsx`** — receives `{ assessmentId, testType, eye }`. Two buttons. "Take" → `router.push(instructions, {assessmentId, testType})`. "Upload" → `launchImageLibraryAsync({mediaTypes:['videos']})`; on a non-cancelled pick → `router.push(review, {assessmentId, testType, videoUri: asset.uri, source:'upload'})`; on cancel, stay.
- **`review.tsx`** — orchestrator. Renders `MobileVideoReviewPlayer source={videoUri} mode="review" onCaptureFrame={f => stills.push(f)}`. Phase `review`: Auto-analyse + Enter-manually buttons (disabled while `busy`). Phase `manual`: `ManualEntry` for `testType` with Back→review. Owns `handleAuto`/`handleManualSubmit` per the data-flow section. Inline error text; non-fatal stills.
- **`ManualEntry.tsx`** — `ManualEntry({ testType, onSubmit, onBack, busy })`. Numeric `TextInput`s per test type: `nibut` → first break-up (required) + mean (optional); `fluorescein` → Oxford grade + break-up time; `lipid` → Guillon grade + thickness + tear meniscus. Emits a `ManualResultFields` object (numeric subset). Matches web's field set.
- **`processing.tsx`** — `{ assessmentId, captureId, testType }`. `useCaptureStatus(Number(captureId))` (poll-only, 2-min cap). Analysed → `results`. Failed/timeout → error state with Try again (→ `router.back()` to review) + Cancel (→ tabs). Keeps the existing Android back-block during polling.
- **`results.tsx`** — adds a compact `MobileVideoReviewPlayer source={capture.video_file} mode="compact"` (playback only) and a **Save/Share .mp4** action: download `capture.video_file` to a local file via `expo-file-system`, then `Sharing.shareAsync` (the exact pattern already used for the PDF in this file).

## Hooks & data flow (mobile)

Backend contract (sub-project A, on master): auto `POST assessments/captures/` `{assessment, test_type, source, video_file}` → `{id, status}`; manual `POST assessments/captures/manual/` `{assessment, test_type, source, video_file, ...result}` → capture; stills `POST assessments/captures/{id}/stills/` multipart `image, timestamp_seconds, label?`; poll `GET assessments/captures/{id}/status/` → `{status, ...}`. Source: camera→`'mobile'`, upload→`'upload'`.

Mobile `api.postMultipart<T>(path, fields, file)` sends `file` as `{uri, name, type}` (RN FormData). The video/image is the `file` arg; the rest are string `fields`.

- **`useCapture` (modify):** add `source: CaptureSource` to `upload({assessmentId, testType, videoUri, source})`; include `source` in the POST fields. Keep `device_model`.
- **`useUploadManualCapture` (new):** `mutateAsync({assessment, test_type, source, videoUri, ...results})` → `postMultipart('assessments/captures/manual/', {assessment, test_type, source, ...stringifiedResults}, {uri: videoUri, name, type:'video/mp4'})`.
- **`useCreateCaptureStill` (new):** `mutateAsync({captureId, frameUri, timestampSeconds, label?})` → `postMultipart('assessments/captures/{captureId}/stills/', {timestamp_seconds, label?}, {uri: frameUri, name, type:'image/jpeg'})`.
- **`useCaptureStatus(captureId)` (new):** TanStack `useQuery` polling `captures/{id}/status/` every 2s while status ∉ {analysed, failed}, stopping at those OR after a 2-min cap (track start via a ref); exposes `isTimedOut`. (Mirrors web's `useCaptureStatus`.)

**`review.tsx` flow:**
- `handleAuto`: `setBusy` → `useCapture.upload({assessment, test_type, source, videoUri})` → `uploadStills(captureId)` (`Promise.allSettled` over held frames) → `router.replace(processing, {assessmentId, captureId, testType})`. On throw → inline error, `setBusy(false)`.
- `handleManualSubmit(fields)`: `useUploadManualCapture(...)` → `uploadStills(capture.id)` → `api.patch('assessments/{assessmentId}/', {status:'complete'})` → fire-and-forget `api.post('reports/generate/', {assessment})` → `router.replace(results, {captureId, testType})`. On throw → inline error.

Assessment is created once in `select-test` (unchanged), passed by param, reused on any retry.

## Web parity (results video)

`web/src/app/(dashboard)/patients/[id]/assessments/[assessmentId]/page.tsx` already loads the assessment with its captures (each `TestCapture` has `video_file`). Add, per capture that has a `video_file`, a card containing:
- `VideoReviewPlayer` (`@/components/player/VideoReviewPlayer`) in `mode="compact"` on `source={capture.video_file}` (playback only; compact hides capture-frame).
- A **Download .mp4** button — a link to `capture.video_file` with the `download` attribute (the file is already a stored URL; no backend change).

No new web dependencies; reuses the merged player.

## Error handling

- **Picker cancelled:** no navigation; stay on `acquire`.
- **Upload / manual-create failure:** inline error on `review`, `busy` cleared, action retryable (assessment reused).
- **Poll failed / timed out:** `processing` error state — Try again (→ `review`) / Cancel (→ tabs).
- **Stills upload failure:** non-fatal (`Promise.allSettled`); never blocks navigation.
- **Results player load error:** the player's own error state; the Save/Share action surfaces a failure toast/alert but does not crash.

## Testing strategy

- **Mobile (jest-expo):** `review` orchestrator (auto path: create→stills→navigate; manual path: create→stills→patch→report→navigate; error paths; busy lockout) with `expo-image-picker`, `MobileVideoReviewPlayer`, `expo-router`, and `api` mocked; `ManualEntry` (per-test fields, required validation, submit/back); the new hooks (`useUploadManualCapture`, `useCreateCaptureStill`, `useCaptureStatus` cap) against a mocked `api`; `acquire` (Take navigates; Upload picks → navigates; cancel stays). Assert against accessibility labels / behavior (not className styles — harness shim).
- **Web (vitest):** a focused test that the assessment-detail page renders the compact `VideoReviewPlayer` for a capture with a `video_file` and exposes a download link to that URL.
- Existing suites stay green (mobile 25, web 98).

## Dependencies

- Mobile: add `expo-image-picker` (via `npx expo install`). `expo-file-system` + `expo-sharing` already present (used for PDF).
- Web: none.

## Success Criteria

- Mobile: from a new assessment, both **Take** and **Upload** reach the shared review screen; Auto-analyse uploads (with correct `source`) + held stills, then polls (capped) to results; Enter-manually records the selected test's result with the video attached and lands on results; the results screen plays the stored video and can save/share it as `.mp4`.
- Web: the assessment-detail page plays the stored video (compact) and downloads it as `.mp4`.
- `npm test` (mobile jest-expo) and `npm run test` (web vitest) green; both `tsc --noEmit` clean.
- The camera path now routes through `review` (not straight to processing); `processing` no longer uploads.
