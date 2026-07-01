# Video Review Player — Design Spec

**Date:** 2026-06-25
**Status:** Approved (pending written-spec review)
**Sub-project:** B of the "Video upload + review" feature

---

## Context

TearFlex is adding the ability to **upload** a tear-film video (not just capture it
in-app) when starting a new assessment, on **both mobile and web**. Uploaded video is
auto-analysed by the existing NIBUT pipeline by default, but the clinician can also
review the footage and enter results manually.

That larger feature was decomposed into four sub-projects:

- **A. Backend** — uploaded-video captures with auto-or-manual analysis (`source='upload'`).
- **B. Shared video review player** ← *this spec*.
- **C. Mobile upload flow** — Take/Upload branch, review screen, manual entry, results.
- **D. Web upload flow** — upload option, multipart client, review screen, results.

Build order: **B → A → C → D**. This spec covers **B only**.

### Why the player is built first

It is the most visible and highest-risk piece, it is fully demoable on its own (just
needs a video file), and both client flows (C, D) depend on it. Building it first
de-risks the rest.

---

## Goal

A single, reusable **video review player** with a shared interface and two platform
implementations:

- **Mobile** — React Native, using `expo-video` for playback.
- **Web** — HTML5 `<video>` element.

The player lets a clinician inspect tear-film footage closely enough to (a) verify an
automatic analysis or (b) find the breakup moment and enter results manually, and to
**snapshot the exact frame** that matters as a still image.

It is a **pure UI primitive**: it plays a video and emits events. It does not upload,
persist, or know about assessments. Persistence of captured stills is wired up later in
sub-projects A/C/D.

---

## Display modes

The player renders in one of two modes, set by a `mode` prop:

| Mode | Where used | Controls shown |
|------|------------|----------------|
| `review` | Post-upload/capture review screen (C, D) | All controls |
| `compact` | Results screen (C, D) — shrunk, persistent | Play/pause, scrub bar, timestamp, expand-to-review |

`compact` is a smaller-footprint variant so the video stays available on the results
screen without dominating it. It omits the advanced controls (slow-mo, frame step,
capture-frame, loop toggle) to stay uncluttered; an **expand** affordance switches it
to `review`.

---

## Controls (review mode)

All controls operate on the same underlying playback state.

1. **Play / Pause** — toggles playback.
2. **Play-again when paused or ended** — when the video is paused or has reached the
   end, the primary button offers to play again from the current position (or from the
   start if ended). Replay must always be one tap away; the player never dead-ends.
3. **Loop toggle** — when on, playback restarts automatically at end and continues
   indefinitely. Default **on** (the clinician is assessing a short clip repeatedly).
4. **Slow-motion speed slider (stepped)** — sets playback rate, snapping to preset
   steps: **1× → 0.75× → 0.5× → 0.25× → 0.1×**. Default 1×. The current rate is shown
   as a label (e.g. "0.25×"). Speed never goes above 1× (slow-mo only, per requirement).
5. **Scrub bar + timestamp** — a draggable progress bar with a current-time / duration
   readout to two decimal places (e.g. `8.20s / 25.0s`). Dragging seeks. This is what
   lets the clinician read off the breakup second for manual NIBUT entry.
6. **Frame step** — previous-frame / next-frame buttons (◀▮▶). Steps by one frame using
   the video's frame rate (`1 / fps`; default to 30fps if fps unknown). Pauses on step.
   Lets the clinician land on an exact frame.
7. **Capture-frame button** — extracts the frame currently displayed as a still image
   and emits it via `onCaptureFrame` (see Interface). Used to save the diagnostically
   meaningful frame (e.g. first breakup) as a still. The emitted payload includes the
   frame's **timestamp**, which for NIBUT equals the breakup second and can pre-fill
   manual entry downstream.

---

## Component interface (shared contract)

Both platform implementations expose the same props and callbacks. Exact types live in
shared types where practical.

```ts
type PlayerMode = 'review' | 'compact';

interface CapturedFrame {
  // Web: a Blob (image/jpeg). Mobile: a local file URI string.
  // Typed as a platform-appropriate union; consumers receive whatever their platform produces.
  image: Blob | string;
  timestampSeconds: number;   // playback position the frame was taken at
  width: number;
  height: number;
}

interface VideoReviewPlayerProps {
  source: string;             // local URI (mobile) or object/remote URL (web)
  mode?: PlayerMode;          // default 'review'
  fps?: number;               // for frame-step granularity; default 30
  initialRate?: number;       // default 1
  initiallyLooping?: boolean; // default true

  onCaptureFrame?: (frame: CapturedFrame) => void; // capture-frame button
  onExpand?: () => void;      // compact mode -> request switch to review
  onReady?: (meta: { durationSeconds: number; width: number; height: number }) => void;
  onError?: (error: Error) => void;
}
```

### Frame snapshot mechanics

- **Web** — draw the `<video>` element to an offscreen `<canvas>` at the video's natural
  resolution, then `canvas.toBlob(..., 'image/jpeg')`. Synchronous to the current
  displayed frame, so the snapshot matches what the clinician sees.
- **Mobile** — use `expo-video-thumbnails` `getThumbnailAsync(source, { time })` at the
  current playback position to produce a local file URI. (expo-video does not expose a
  direct canvas grab; thumbnail-at-time is the supported path.)

Both produce a still at the video's native resolution (4K captures → 4K stills).

---

## Dependencies to add

**Mobile** (`mobile/package.json`):
- `expo-video` — playback with `playbackRate`, position control, looping.
- `@react-native-community/slider` — the stepped speed slider.
- `expo-video-thumbnails` — frame-at-time snapshot for capture-frame.

**Web** (`web/package.json`):
- `@radix-ui/react-slider` — the stepped speed slider (matches existing Radix usage).
- No new video library — native `<video>` + `<canvas>` cover playback and snapshot.

---

## File layout

**Mobile** (`mobile/components/`):
```
components/
  player/
    VideoReviewPlayer.tsx      # main component (mode-aware)
    PlaybackControls.tsx       # play/pause/replay/loop
    SpeedSlider.tsx            # stepped slow-mo slider
    ScrubBar.tsx               # progress + timestamp + drag-seek
    FrameStep.tsx              # prev/next frame
    useVideoFrame.ts           # capture-frame via expo-video-thumbnails
    constants.ts               # SPEED_STEPS, defaults
```

**Web** (`web/src/components/`):
```
components/
  player/
    VideoReviewPlayer.tsx
    PlaybackControls.tsx
    SpeedSlider.tsx            # @radix-ui/react-slider, stepped
    ScrubBar.tsx
    FrameStep.tsx
    useVideoFrame.ts           # canvas toBlob snapshot
    constants.ts               # SPEED_STEPS, defaults (shared values mirror mobile)
```

`SPEED_STEPS = [1, 0.75, 0.5, 0.25, 0.1]` defined once per platform (values identical).

---

## Error handling

- **Unsupported / corrupt source** — `onError` fires; the player shows an inline error
  state ("Couldn't load this video") instead of crashing. No controls are interactive.
- **Snapshot failure** — capture-frame catches errors, surfaces a non-fatal toast/inline
  message, and does not emit `onCaptureFrame`. Playback continues unaffected.
- **Unknown fps** — frame-step falls back to 30fps stepping; documented, not an error.
- **Seek past end / before start** — clamped to `[0, duration]`.

---

## Testing

The player is a pure primitive, so it is testable in isolation with a fixture video.

**Mobile** (component tests):
- Renders in `review` and `compact` modes with the correct control sets.
- Speed slider snaps to each `SPEED_STEPS` value and updates the rate label.
- Play → pause → replay path always leaves a usable play affordance (never dead-ends).
- Loop toggle changes looping state.
- Frame-step advances/retreats by `1/fps` and pauses.
- Capture-frame invokes `onCaptureFrame` with a payload carrying the current timestamp.
- `onError` fires on a bad source.

**Web** (component tests, jsdom + mocked `<video>`):
- Same matrix as mobile.
- `useVideoFrame` draws to canvas and returns a JPEG blob with correct dimensions
  (canvas mocked).

Manual/demo verification: load a real ~25s 4K clip, exercise slow-mo, scrub to a known
second, frame-step, and capture a frame — confirm the saved still matches the displayed
frame and timestamp.

---

## Out of scope for B (handled later)

- Persisting captured stills against an assessment (backend model/endpoint) — **A**.
- The Take-vs-Upload branch, file picker, manual-entry form — **C/D**.
- A thumbnail **filmstrip** for navigation — deliberately deferred (YAGNI). The scrub
  bar + frame step cover navigation; revisit only if navigation proves clunky.
- Webcam capture on web — out of the whole feature (no Placido attachment on desktop).

---

## Open questions

None blocking. Filmstrip explicitly deferred. Snapshot persistence intentionally
deferred to A/C/D, with the player emitting frames via callback so the contract is ready.
