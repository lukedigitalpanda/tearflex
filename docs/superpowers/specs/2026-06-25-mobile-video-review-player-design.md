# Mobile Video Review Player — Design Spec

**Date:** 2026-06-25
**Sub-project:** C, slice 1 (the mobile half of player "B"). The mobile capture+upload **flow** that consumes this player is a separate, later spec (slice 2).
**Branch:** `feat/mobile-video-player` (off `master`).

## Context

TearFlex's web app already has a shared video review player (`web/src/components/player/VideoReviewPlayer.tsx`, merged to master) used in the web upload flow. The mobile app (React Native + Expo SDK 52, RN 0.76.9) has **no video player, no media review step, and no test runner** — it is capture-only and auto-uploads immediately (`capture.tsx → processing.tsx → results.tsx`, no review).

This spec covers building the **mobile equivalent of the review player** as a standalone, reusable, presentational component, plus standing up the mobile test harness (jest-expo) that the player's TDD requires. The player is **not** wired into any screen in this slice; the next slice inserts it into the capture and upload paths.

The player mirrors the web player's user-driven requirements: stepped slow-mo (1×→0.75→0.5→0.25→0.1, slow-only), scrub bar + timestamp, prev/next frame-step, play/pause + play-again, loop (default on), a capture-frame button that emits the current frame as a still, and review/compact modes.

## Goals

- A reusable `MobileVideoReviewPlayer` component: a **pure UI primitive** that emits captured frames via an `onCaptureFrame` callback and **persists nothing** (mirrors the web player's contract).
- Stand up a mobile test harness (jest-expo + @testing-library/react-native) so this and future mobile work is TDD-able. Today the only check is `tsc --noEmit`.
- Feature parity with the web player's control set, adapted to touch.

## Non-Goals (out of scope for this slice)

- Wiring the player into `capture.tsx` / `results.tsx` / any upload flow (that is slice 2 — the mobile capture+upload flow).
- The media file picker, manual-entry, stills **upload**, `source` plumbing, or backend calls (all slice 2).
- Filmstrip navigation (deferred, YAGNI — matches web).
- Remote-URL video support — the player assumes a **local file uri** (camera output or a picked file); thumbnail capture requires a local source.

## Decisions (from brainstorming)

1. **Sequence:** mobile player first (this spec), then the C flow (next spec). The flow depends on this player.
2. **Playback library:** `expo-video` (the current SDK 52 recommended API; supports `playbackRate`, seeking, looping) — not the legacy `expo-av`.
3. **Capture-frame:** `expo-video-thumbnails` — grab the frame at the current paused time directly from the source video → a high-res image **file**. This matches the web rationale that a source-resolution frame is already high-res, and avoids screen-resolution/overlay artifacts. Consequently the mobile `CapturedFrame` carries a **`uri`** (not a `Blob` as on web); the contract diverges by platform intentionally.
4. **Speed control UI:** segmented speed **buttons** (pills), not a draggable slider — precise touch targets and trivially testable. Same 5 stepped values as web. The **timeline scrub bar** remains a draggable slider.
5. **Capture-frame pauses first** so the still matches the frame the clinician is viewing.

## Architecture

A small set of focused units under a new `mobile/components/player/` directory, mirroring the web player's structure. The timing/speed math is split into a pure module with no React Native imports so it is fully unit-testable in isolation.

```
mobile/components/player/
  types.ts                      # CapturedFrame, PlayerMode, SPEED_STEPS
  player-logic.ts               # PURE: clampTime, formatTimestamp, nextSpeed/prevSpeed, frameStepDelta(fps)
  player-logic.test.ts          # pure unit tests (jest)
  MobileVideoReviewPlayer.tsx   # orchestrator: useVideoPlayer + VideoView + composed controls
  MobileVideoReviewPlayer.test.tsx
  SpeedSelector.tsx             # segmented speed pills (1×·0.75×·0.5×·0.25×·0.1×)
  SpeedSelector.test.tsx
  ScrubBar.tsx                  # draggable position slider + "M:SS / M:SS" timestamp
  ScrubBar.test.tsx
  PlaybackControls.tsx          # play/pause · loop toggle · prev/next frame-step · capture-frame
  PlaybackControls.test.tsx
mobile/jest.config.js           # jest-expo preset (harness, built first)
mobile/jest.setup.ts            # testing-library + native-module mocks
```

### Types (`types.ts`)

```ts
export interface CapturedFrame {
  uri: string;             // local file uri of the extracted still
  timestampSeconds: number;
  width: number;
  height: number;
}

export type PlayerMode = 'review' | 'compact';

// Slow-only, ordered fastest→slowest, matching web.
export const SPEED_STEPS = [1, 0.75, 0.5, 0.25, 0.1] as const;
```

### Pure logic (`player-logic.ts`)

No RN/expo imports. Functions:
- `clampTime(t: number, duration: number): number` — clamp into `[0, duration]`, guard NaN/Infinity.
- `formatTimestamp(seconds: number): string` — `M:SS` (e.g. `1:07`); guards NaN → `0:00`.
- `frameStepDelta(fps: number): number` — `1 / (fps > 0 ? fps : 30)`.
- Speed helpers as needed for the segmented selector (the selector can also just map `SPEED_STEPS` directly; keep logic minimal — YAGNI).

### Component API (`MobileVideoReviewPlayer.tsx`)

```ts
MobileVideoReviewPlayer({
  source: string,                 // local file uri
  mode?: 'review' | 'compact',    // default 'review'
  fps?: number,                   // frame-step granularity; default 30
  initialRate?: number,           // default 1
  initiallyLooping?: boolean,     // default true
  onCaptureFrame: (f: CapturedFrame) => void,
  onReady?: (meta: { durationSeconds: number; width: number; height: number }) => void,
  onError?: () => void,
  onExpand?: () => void,          // compact mode only
})
```

**Playback mechanics (expo-video):** create the player with `useVideoPlayer(source, p => { p.loop = initiallyLooping; p.playbackRate = initialRate })`; render with `<VideoView player={player} />`. Control wiring:

| Control | Action |
|---|---|
| play / pause | `player.play()` / `player.pause()` |
| play-again | when ended, seek to 0 then `player.play()` (no dead-end) |
| loop toggle | `player.loop = !player.loop` (default on) |
| scrub | `player.currentTime = clampTime(t, duration)` |
| frame-step prev/next | `player.seekBy(∓ frameStepDelta(fps))` |
| speed | `player.playbackRate = step` (segmented buttons; slow-only ≤ 1×) |
| timestamp | `formatTimestamp(currentTime) + ' / ' + formatTimestamp(duration)` |
| onReady | fired from the player's metadata/status event with duration + `videoWidth/Height` (dimensions) |

**Capture-frame:** `player.pause()`, read `current = player.currentTime`, `const { uri, width, height } = await VideoThumbnails.getThumbnailAsync(source, { time: current * 1000 })`, then `onCaptureFrame({ uri, timestampSeconds: current, width, height })`. Wrap in try/catch → on failure call `onError()` (non-fatal; the player never crashes and remains usable).

**Modes:** `review` renders the full control set (scrub + speed + frame-step + loop + capture-frame). `compact` renders a shrunk video with minimal controls and an **Expand** button (`onExpand`), hiding capture-frame and the speed selector — matching the web player's compact mode.

## Data Flow

The player owns only transient playback state (current time, playing, speed, looping, ended, error). It **persists nothing** and makes **no network calls**. Captured frames are handed to the parent via `onCaptureFrame`; the parent (slice 2's flow) holds them in memory and uploads them as stills. This is identical to the web player's role as a pure primitive.

## Error Handling

- **Video load/playback error:** expo-video's status/error event → render a brief error state (e.g. "Couldn't load this video") and call `onError()` once. The player does not throw.
- **Thumbnail capture failure:** caught; call `onError()`; the player stays interactive (the clinician can retry or continue). Never blocks or crashes.
- **Degenerate metadata:** `duration` of 0/NaN before metadata loads → scrub/timestamp guard via `clampTime`/`formatTimestamp` (mirrors the web fix where the scrub bar must not render an invalid position before metadata).

## Testing Strategy

**Harness (built first, as task 1):** add `jest-expo` preset + `@testing-library/react-native` + `jest` (dev deps), a `jest.config.js` (preset `jest-expo`, `transformIgnorePatterns` for expo/RN, setup file), `jest.setup.ts` (testing-library matchers + mocks for `expo-video` and `expo-video-thumbnails`), and a `"test"` script. A trivial smoke test proves the harness runs before any player code.

**Native module mocks:** `expo-video` (`useVideoPlayer` returns a mock player object whose methods — play/pause/seekBy/currentTime/playbackRate/loop — are jest spies; `VideoView` is a stub) and `expo-video-thumbnails` (`getThumbnailAsync` resolves a fixed `{ uri, width, height }`).

**What is tested:**
- `player-logic.ts` — fully unit-tested (clampTime bounds/NaN, formatTimestamp formatting/NaN, frameStepDelta incl. fps≤0 fallback).
- `SpeedSelector` — renders 5 pills, active highlighted, tapping a pill calls `onChange` with that step.
- `ScrubBar` — renders timestamp from current/duration; dragging calls `onSeek` with a clamped value; does not render an invalid position when duration is 0.
- `PlaybackControls` — play/pause/loop/frame-step/capture-frame buttons call their handlers; review vs compact show the correct control subsets.
- `MobileVideoReviewPlayer` — wires controls to the mock player (play→player.play, frame-step→seekBy, speed→playbackRate, scrub→currentTime); capture-frame pauses, calls `getThumbnailAsync`, and emits a `CapturedFrame`; `onReady` fires with metadata; error event renders the error state and calls `onError`; compact mode hides capture-frame/speed and shows Expand.

Tests assert real behavior against the mocked native player (not implementation internals). Mirrors the web player's test breakdown.

## Dependencies Summary

- Runtime: `expo-video`, `expo-video-thumbnails`, `@react-native-community/slider`.
- Dev: `jest-expo`, `jest`, `@testing-library/react-native` (+ `@types/jest` / `jest` types as needed).
- Existing `tsc --noEmit` typecheck remains and must stay clean.

## Success Criteria

- `npm run test` (new jest-expo harness) runs and all player tests pass.
- `npm run typecheck` clean.
- `MobileVideoReviewPlayer` renders and its controls drive an expo-video player; capture-frame emits a `CapturedFrame { uri, timestampSeconds, width, height }`; review/compact modes expose the right controls.
- No screen wiring, no network, no persistence introduced (verified by the player remaining a standalone primitive).
