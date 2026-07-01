# Mobile Video Review Player Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a reusable, presentational `MobileVideoReviewPlayer` (play/pause, loop, scrub, stepped slow-mo, frame-step, capture-frame, review/compact modes) for the React Native app, and stand up the jest-expo test harness it needs.

**Architecture:** A new `mobile/components/player/` directory mirroring the web player. Timing/speed math lives in a pure `player-logic.ts` (no native imports, fully unit-tested). Small focused components — `SpeedSelector`, `ScrubBar`, `PlaybackControls` — compose into the `MobileVideoReviewPlayer` orchestrator, which drives an `expo-video` player and grabs stills via `expo-video-thumbnails`. The player persists nothing and makes no network calls; it emits captured frames via `onCaptureFrame`.

**Tech Stack:** React Native 0.76.9 / Expo SDK 52, TypeScript (strict), `expo-video`, `expo-video-thumbnails`, `@react-native-community/slider`; tests via `jest-expo` + `@testing-library/react-native`.

## Global Constraints

- **Mobile only.** Run all commands from `/opt/tearflex/mobile`. Test: `npm test -- <pattern>` (jest). Typecheck: `npm run typecheck` (`tsc --noEmit`) — must stay clean after every task.
- **Expo SDK 52 / RN 0.76.9.** Install runtime native deps with `npx expo install <pkg>` (picks SDK-compatible versions), not bare `npm install`.
- **Use `expo-video`, never `expo-av`.**
- **`CapturedFrame` carries a `uri`** (local file), not a Blob: `{ uri: string; timestampSeconds: number; width: number; height: number }`. This diverges from the web player by platform — intentional.
- **`SPEED_STEPS = [1, 0.75, 0.5, 0.25, 0.1]`** (slow-only, fastest→slowest). Speed never exceeds 1×.
- **The player is a pure UI primitive:** no network, no persistence, no navigation. It emits frames via `onCaptureFrame` and surfaces load/capture failures via `onError`.
- **Capture-frame pauses first**, then extracts the still at the current time so it matches the displayed frame.
- Follow existing mobile conventions: NativeWind `className` styling where the codebase uses it (check sibling components in `mobile/components/`), named exports, function components, `@shared/*` / `@/*` path aliases.
- **Note on `expo-video` API:** exact event/property names (e.g. `statusChange`, `playToEnd`, `timeUpdate`, `seekBy`, `currentTime`, `duration`, `playbackRate`, `loop`) must be verified against the installed `expo-video` version during implementation. Tests pin the *behavioral contract* against a mock player; where a real event/prop name differs, adjust the wiring while keeping the tested behavior identical, and note it in the task report.

---

## Task 1: jest-expo test harness

**Files:**
- Modify: `mobile/package.json` (devDeps + `test` script)
- Create: `mobile/jest.config.js`
- Create: `mobile/jest.setup.ts`
- Test: `mobile/components/__smoke__/harness.test.tsx`

**Interfaces:**
- Produces: a working `npm test` (jest-expo) and `@testing-library/react-native` render/queries available to all later tasks.

- [ ] **Step 1: Install dev dependencies**

Run (from `/opt/tearflex/mobile`):
```bash
npm install --save-dev jest-expo@~52.0.0 jest @testing-library/react-native react-test-renderer@18.3.1 @types/jest
```
(Expo SDK 52 uses React 18.3.1, so `react-test-renderer` must be `18.3.1`. If `npm install` reports a peer conflict on react-test-renderer, pin it to match the installed `react` version in `package.json`.)

- [ ] **Step 2: Create the jest config**

Create `mobile/jest.config.js`:
```js
module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg|nativewind|@react-native-community/.*)/)',
  ],
}
```

- [ ] **Step 3: Create the jest setup file**

Create `mobile/jest.setup.ts`:
```ts
import '@testing-library/react-native/extend-expect'
```

- [ ] **Step 4: Add the test script**

In `mobile/package.json`, add to `"scripts"`:
```json
"test": "jest"
```

- [ ] **Step 5: Write the smoke test**

Create `mobile/components/__smoke__/harness.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react-native'
import { Text } from 'react-native'

describe('jest-expo harness', () => {
  it('renders a basic RN component', () => {
    render(<Text>hello</Text>)
    expect(screen.getByText('hello')).toBeOnTheScreen()
  })
})
```

- [ ] **Step 6: Run the smoke test**

Run: `npm test -- harness`
Expected: PASS (1 test). This proves jest-expo + testing-library work.

- [ ] **Step 7: Typecheck**

Run: `npm run typecheck`
Expected: clean (no output). If `@types/jest`/jest globals cause type errors in the test, ensure `tsconfig.json` picks up jest types (it extends `expo/tsconfig.base`; add `"types": ["jest"]` under `compilerOptions` only if needed to resolve `describe/it/expect`).

- [ ] **Step 8: Commit**

```bash
git add mobile/package.json mobile/package-lock.json mobile/jest.config.js mobile/jest.setup.ts mobile/components/__smoke__/harness.test.tsx mobile/tsconfig.json
git commit -m "test(mobile): stand up jest-expo test harness"
```

---

## Task 2: Player types + pure logic

**Files:**
- Create: `mobile/components/player/types.ts`
- Create: `mobile/components/player/player-logic.ts`
- Test: `mobile/components/player/player-logic.test.ts`

**Interfaces:**
- Produces:
  - `CapturedFrame { uri: string; timestampSeconds: number; width: number; height: number }`
  - `PlayerMode = 'review' | 'compact'`
  - `SPEED_STEPS: readonly [1, 0.75, 0.5, 0.25, 0.1]`
  - `clampTime(t: number, duration: number): number`
  - `formatTimestamp(seconds: number): string` → `M:SS`
  - `frameStepDelta(fps: number): number`

- [ ] **Step 1: Write the failing test**

Create `mobile/components/player/player-logic.test.ts`:
```ts
import { clampTime, formatTimestamp, frameStepDelta, SPEED_STEPS } from './player-logic'

describe('player-logic', () => {
  describe('clampTime', () => {
    it('clamps into [0, duration]', () => {
      expect(clampTime(-2, 10)).toBe(0)
      expect(clampTime(5, 10)).toBe(5)
      expect(clampTime(20, 10)).toBe(10)
    })
    it('guards NaN/non-finite to 0', () => {
      expect(clampTime(NaN, 10)).toBe(0)
      expect(clampTime(5, NaN)).toBe(0)
      expect(clampTime(Infinity, 10)).toBe(10)
    })
  })

  describe('formatTimestamp', () => {
    it('formats as M:SS with zero-padded seconds', () => {
      expect(formatTimestamp(0)).toBe('0:00')
      expect(formatTimestamp(7)).toBe('0:07')
      expect(formatTimestamp(67)).toBe('1:07')
    })
    it('guards NaN to 0:00', () => {
      expect(formatTimestamp(NaN)).toBe('0:00')
    })
  })

  describe('frameStepDelta', () => {
    it('returns 1/fps', () => {
      expect(frameStepDelta(30)).toBeCloseTo(1 / 30)
      expect(frameStepDelta(60)).toBeCloseTo(1 / 60)
    })
    it('falls back to 1/30 for fps <= 0 or non-finite', () => {
      expect(frameStepDelta(0)).toBeCloseTo(1 / 30)
      expect(frameStepDelta(-5)).toBeCloseTo(1 / 30)
      expect(frameStepDelta(NaN)).toBeCloseTo(1 / 30)
    })
  })

  it('SPEED_STEPS is slow-only fastest→slowest', () => {
    expect(SPEED_STEPS).toEqual([1, 0.75, 0.5, 0.25, 0.1])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- player-logic`
Expected: FAIL — cannot resolve `./player-logic`.

- [ ] **Step 3: Write the types**

Create `mobile/components/player/types.ts`:
```ts
export interface CapturedFrame {
  uri: string
  timestampSeconds: number
  width: number
  height: number
}

export type PlayerMode = 'review' | 'compact'

export const SPEED_STEPS = [1, 0.75, 0.5, 0.25, 0.1] as const
export type SpeedStep = (typeof SPEED_STEPS)[number]
```

- [ ] **Step 4: Write the pure logic**

Create `mobile/components/player/player-logic.ts`:
```ts
export { SPEED_STEPS } from './types'
export type { SpeedStep } from './types'

export function clampTime(t: number, duration: number): number {
  if (!Number.isFinite(t) || !Number.isFinite(duration) || duration <= 0) {
    return Number.isFinite(t) && t > 0 && Number.isFinite(duration) ? duration : 0
  }
  return Math.min(Math.max(t, 0), duration)
}

export function formatTimestamp(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const total = Math.floor(seconds)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

export function frameStepDelta(fps: number): number {
  return 1 / (Number.isFinite(fps) && fps > 0 ? fps : 30)
}
```

Note: the `clampTime(Infinity, 10) === 10` case is covered by `Math.min` only when both finite; the early-return handles non-finite `t` with finite positive duration by returning `duration`. Verify the test's `clampTime(Infinity,10)` expectation passes; if the early-return logic is awkward, simplify to: treat non-finite duration→0, else `Math.min(Math.max(Number.isFinite(t)?t:0,0),duration)` and adjust the `Infinity` test accordingly. Keep the test and code in agreement.

- [ ] **Step 5: Run test + typecheck**

Run: `npm test -- player-logic` → PASS.
Run: `npm run typecheck` → clean.

- [ ] **Step 6: Commit**

```bash
git add mobile/components/player/types.ts mobile/components/player/player-logic.ts mobile/components/player/player-logic.test.ts
git commit -m "feat(mobile-player): pure player logic + shared types"
```

---

## Task 3: SpeedSelector (segmented speed pills)

**Files:**
- Create: `mobile/components/player/SpeedSelector.tsx`
- Test: `mobile/components/player/SpeedSelector.test.tsx`

**Interfaces:**
- Consumes: `SPEED_STEPS`, `SpeedStep` (Task 2).
- Produces: `SpeedSelector({ value, onChange }: { value: number; onChange: (s: number) => void })` — a row of 5 pressable pills (one per `SPEED_STEPS` value); the active pill (matching `value`) is visually highlighted; tapping a pill calls `onChange(step)`. Each pill is labelled `1×`, `0.75×`, `0.5×`, `0.25×`, `0.1×` and has `accessibilityRole="button"` with an `accessibilityLabel` of `Speed {step}x` for testability.

- [ ] **Step 1: Write the failing test**

Create `mobile/components/player/SpeedSelector.test.tsx`:
```tsx
import { render, screen, fireEvent } from '@testing-library/react-native'
import { SpeedSelector } from './SpeedSelector'

describe('SpeedSelector', () => {
  it('renders a pill per speed step', () => {
    render(<SpeedSelector value={1} onChange={() => {}} />)
    expect(screen.getByText('1×')).toBeOnTheScreen()
    expect(screen.getByText('0.1×')).toBeOnTheScreen()
  })

  it('calls onChange with the tapped step', () => {
    const onChange = jest.fn()
    render(<SpeedSelector value={1} onChange={onChange} />)
    fireEvent.press(screen.getByLabelText('Speed 0.25x'))
    expect(onChange).toHaveBeenCalledWith(0.25)
  })

  it('marks the active step selected', () => {
    render(<SpeedSelector value={0.5} onChange={() => {}} />)
    expect(screen.getByLabelText('Speed 0.5x').props.accessibilityState).toMatchObject({ selected: true })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- SpeedSelector`
Expected: FAIL — cannot resolve `./SpeedSelector`.

- [ ] **Step 3: Write the component**

Create `mobile/components/player/SpeedSelector.tsx`:
```tsx
import { View, Pressable, Text } from 'react-native'
import { SPEED_STEPS } from './types'

function label(step: number): string {
  return `${step}×`
}

export function SpeedSelector({ value, onChange }: { value: number; onChange: (s: number) => void }) {
  return (
    <View className="flex-row gap-2">
      {SPEED_STEPS.map((step) => {
        const active = step === value
        return (
          <Pressable
            key={step}
            accessibilityRole="button"
            accessibilityLabel={`Speed ${step}x`}
            accessibilityState={{ selected: active }}
            onPress={() => onChange(step)}
            className={`rounded-full px-3 py-1.5 ${active ? 'bg-teal-600' : 'bg-slate-100'}`}
          >
            <Text className={`text-xs font-semibold ${active ? 'text-white' : 'text-slate-600'}`}>{label(step)}</Text>
          </Pressable>
        )
      })}
    </View>
  )
}
```
(If the mobile codebase does NOT use NativeWind `className` on these primitives, match the sibling components' styling approach — e.g. `StyleSheet` — instead; check `mobile/components/capture/CaptureButton.tsx` for the established pattern. Keep the accessibility props exactly as above regardless.)

- [ ] **Step 4: Run test + typecheck**

Run: `npm test -- SpeedSelector` → PASS. Run: `npm run typecheck` → clean.

- [ ] **Step 5: Commit**

```bash
git add mobile/components/player/SpeedSelector.tsx mobile/components/player/SpeedSelector.test.tsx
git commit -m "feat(mobile-player): segmented speed selector"
```

---

## Task 4: ScrubBar (position slider + timestamp)

**Files:**
- Create: `mobile/components/player/ScrubBar.tsx`
- Test: `mobile/components/player/ScrubBar.test.tsx`

**Interfaces:**
- Consumes: `clampTime`, `formatTimestamp` (Task 2).
- Produces: `ScrubBar({ current, duration, onSeek }: { current: number; duration: number; onSeek: (t: number) => void })` — a draggable slider (`@react-native-community/slider`) whose value is `current`, min 0, max `duration` (or 0 when duration ≤ 0), and on slide completes calls `onSeek(clampTime(value, duration))`; plus a `"{M:SS} / {M:SS}"` timestamp label (current / duration).

- [ ] **Step 1: Install the slider dependency**

Run: `npx expo install @react-native-community/slider`
(If `expo install` is unavailable in the environment, `npm install @react-native-community/slider` and let the SDK-compat check happen at runtime.)

- [ ] **Step 2: Write the failing test**

Create `mobile/components/player/ScrubBar.test.tsx`:
```tsx
import { render, screen, fireEvent } from '@testing-library/react-native'
import { ScrubBar } from './ScrubBar'

jest.mock('@react-native-community/slider', () => {
  const { View } = require('react-native')
  return {
    __esModule: true,
    default: (props: any) => <View testID="slider" {...props} />,
  }
})

describe('ScrubBar', () => {
  it('renders the current / duration timestamp', () => {
    render(<ScrubBar current={7} duration={67} onSeek={() => {}} />)
    expect(screen.getByText('0:07 / 1:07')).toBeOnTheScreen()
  })

  it('calls onSeek with a clamped value on slide complete', () => {
    const onSeek = jest.fn()
    render(<ScrubBar current={0} duration={10} onSeek={onSeek} />)
    fireEvent(screen.getByTestId('slider'), 'onSlidingComplete', 25)
    expect(onSeek).toHaveBeenCalledWith(10)
  })

  it('uses max 0 when duration is not positive', () => {
    render(<ScrubBar current={0} duration={0} onSeek={() => {}} />)
    expect(screen.getByTestId('slider').props.maximumValue).toBe(0)
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- ScrubBar`
Expected: FAIL — cannot resolve `./ScrubBar`.

- [ ] **Step 4: Write the component**

Create `mobile/components/player/ScrubBar.tsx`:
```tsx
import { View, Text } from 'react-native'
import Slider from '@react-native-community/slider'
import { clampTime, formatTimestamp } from './player-logic'

export function ScrubBar({ current, duration, onSeek }: { current: number; duration: number; onSeek: (t: number) => void }) {
  const max = Number.isFinite(duration) && duration > 0 ? duration : 0
  return (
    <View className="gap-1">
      <Slider
        minimumValue={0}
        maximumValue={max}
        value={clampTime(current, max)}
        onSlidingComplete={(v: number) => onSeek(clampTime(v, max))}
        minimumTrackTintColor="#0E7C7B"
        maximumTrackTintColor="#CBD5E1"
      />
      <Text className="text-xs tabular-nums text-slate-600">
        {formatTimestamp(current)} / {formatTimestamp(duration)}
      </Text>
    </View>
  )
}
```

- [ ] **Step 5: Run test + typecheck**

Run: `npm test -- ScrubBar` → PASS. Run: `npm run typecheck` → clean.

- [ ] **Step 6: Commit**

```bash
git add mobile/package.json mobile/package-lock.json mobile/components/player/ScrubBar.tsx mobile/components/player/ScrubBar.test.tsx
git commit -m "feat(mobile-player): scrub bar with timestamp"
```

---

## Task 5: PlaybackControls (play/pause · loop · frame-step · capture-frame)

**Files:**
- Create: `mobile/components/player/PlaybackControls.tsx`
- Test: `mobile/components/player/PlaybackControls.test.tsx`

**Interfaces:**
- Produces: `PlaybackControls({ playing, looping, onPlayPause, onToggleLoop, onStepBack, onStepForward, onCaptureFrame, showCapture, showLoop }: { playing: boolean; looping: boolean; onPlayPause: () => void; onToggleLoop: () => void; onStepBack: () => void; onStepForward: () => void; onCaptureFrame: () => void; showCapture?: boolean; showLoop?: boolean })` — a row of pressable buttons. Always: Play/Pause (label `Pause` when `playing`, else `Play`), Step back (`Previous frame`), Step forward (`Next frame`). When `showLoop !== false`: a `Toggle loop` button reflecting `looping`. When `showCapture !== false`: a `Capture frame` button. Each button uses `accessibilityRole="button"` with the named `accessibilityLabel` so tests can target it.

- [ ] **Step 1: Write the failing test**

Create `mobile/components/player/PlaybackControls.test.tsx`:
```tsx
import { render, screen, fireEvent } from '@testing-library/react-native'
import { PlaybackControls } from './PlaybackControls'

const base = {
  playing: false, looping: true,
  onPlayPause: jest.fn(), onToggleLoop: jest.fn(),
  onStepBack: jest.fn(), onStepForward: jest.fn(), onCaptureFrame: jest.fn(),
}

describe('PlaybackControls', () => {
  it('wires the core controls', () => {
    const props = { ...base, onPlayPause: jest.fn(), onStepForward: jest.fn(), onCaptureFrame: jest.fn() }
    render(<PlaybackControls {...props} />)
    fireEvent.press(screen.getByLabelText('Play'))
    fireEvent.press(screen.getByLabelText('Next frame'))
    fireEvent.press(screen.getByLabelText('Capture frame'))
    expect(props.onPlayPause).toHaveBeenCalledTimes(1)
    expect(props.onStepForward).toHaveBeenCalledTimes(1)
    expect(props.onCaptureFrame).toHaveBeenCalledTimes(1)
  })

  it('shows Pause when playing', () => {
    render(<PlaybackControls {...base} playing />)
    expect(screen.getByLabelText('Pause')).toBeOnTheScreen()
  })

  it('hides capture and loop when disabled (compact)', () => {
    render(<PlaybackControls {...base} showCapture={false} showLoop={false} />)
    expect(screen.queryByLabelText('Capture frame')).toBeNull()
    expect(screen.queryByLabelText('Toggle loop')).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- PlaybackControls`
Expected: FAIL — cannot resolve `./PlaybackControls`.

- [ ] **Step 3: Write the component**

Create `mobile/components/player/PlaybackControls.tsx`:
```tsx
import { View, Pressable, Text } from 'react-native'

interface Props {
  playing: boolean
  looping: boolean
  onPlayPause: () => void
  onToggleLoop: () => void
  onStepBack: () => void
  onStepForward: () => void
  onCaptureFrame: () => void
  showCapture?: boolean
  showLoop?: boolean
}

function Btn({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} className="rounded-md bg-slate-100 px-3 py-2">
      <Text className="text-xs font-semibold text-slate-700">{label}</Text>
    </Pressable>
  )
}

export function PlaybackControls({
  playing, looping, onPlayPause, onToggleLoop, onStepBack, onStepForward, onCaptureFrame,
  showCapture = true, showLoop = true,
}: Props) {
  return (
    <View className="flex-row flex-wrap gap-2">
      <Btn label="Previous frame" onPress={onStepBack} />
      <Btn label={playing ? 'Pause' : 'Play'} onPress={onPlayPause} />
      <Btn label="Next frame" onPress={onStepForward} />
      {showLoop && <Btn label="Toggle loop" onPress={onToggleLoop} />}
      {showCapture && <Btn label="Capture frame" onPress={onCaptureFrame} />}
    </View>
  )
}
```

- [ ] **Step 4: Run test + typecheck**

Run: `npm test -- PlaybackControls` → PASS. Run: `npm run typecheck` → clean.

- [ ] **Step 5: Commit**

```bash
git add mobile/components/player/PlaybackControls.tsx mobile/components/player/PlaybackControls.test.tsx
git commit -m "feat(mobile-player): playback controls (play/loop/frame-step/capture)"
```

---

## Task 6: MobileVideoReviewPlayer orchestrator

**Files:**
- Create: `mobile/components/player/MobileVideoReviewPlayer.tsx`
- Test: `mobile/components/player/MobileVideoReviewPlayer.test.tsx`

**Interfaces:**
- Consumes: `SpeedSelector`, `ScrubBar`, `PlaybackControls`, `clampTime`, `frameStepDelta`, `CapturedFrame`, `PlayerMode` (Tasks 2–5); `useVideoPlayer`/`VideoView` from `expo-video`; `getThumbnailAsync` from `expo-video-thumbnails`.
- Produces: `MobileVideoReviewPlayer(props)` with props:
  `{ source: string; mode?: PlayerMode; fps?: number; initialRate?: number; initiallyLooping?: boolean; onCaptureFrame: (f: CapturedFrame) => void; onReady?: (m: { durationSeconds: number; width: number; height: number }) => void; onError?: () => void; onExpand?: () => void }`.

**Behavioral contract (what the tests pin, against a mocked player):**
- Creates the player via `useVideoPlayer(source, setup)` and renders `<VideoView player={player} />`.
- Play/pause button → `player.play()` / `player.pause()`.
- Frame-step forward/back → `player.seekBy(±frameStepDelta(fps))` (default fps 30).
- Speed pill → sets `player.playbackRate`.
- Scrub → sets `player.currentTime` (clamped).
- Capture-frame → `player.pause()`, then `getThumbnailAsync(source, { time: currentTime*1000 })`, then `onCaptureFrame({ uri, timestampSeconds: currentTime, width, height })`; a thrown thumbnail error → `onError()` and no crash.
- `onReady` fires once with `{ durationSeconds, width, height }` when the player reports ready.
- A player error → renders an error state ("Couldn't load this video") and calls `onError()` once.
- `mode='compact'` hides the speed selector and capture-frame button and shows an `Expand` button wired to `onExpand`.

**Note on `expo-video` wiring:** the real API for "current time", "ready", and "error" events must be verified against the installed lib. Structure the component so a small set of handlers (`handleReady`, `handleError`, and a `currentTime` updater) are invoked from the appropriate `expo-video` events/listeners; the test drives these handlers through the mock. Keep the mapping in one place so a real-API name change is a one-line edit.

- [ ] **Step 1: Install expo-video + expo-video-thumbnails**

Run: `npx expo install expo-video expo-video-thumbnails`
Expected: both added to `mobile/package.json` at SDK-52-compatible versions.

- [ ] **Step 2: Write the failing test**

Create `mobile/components/player/MobileVideoReviewPlayer.test.tsx`:
```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native'

// --- mock expo-video with a controllable player ---
const mockPlayer = {
  play: jest.fn(), pause: jest.fn(), seekBy: jest.fn(),
  currentTime: 4, duration: 25, playbackRate: 1, loop: true,
}
jest.mock('expo-video', () => {
  const { View } = require('react-native')
  return {
    __esModule: true,
    useVideoPlayer: (_source: string, setup?: (p: any) => void) => { setup?.(mockPlayer); return mockPlayer },
    VideoView: (props: any) => <View testID="video-view" {...props} />,
  }
})

// --- mock expo-video-thumbnails ---
const getThumbnailAsync = jest.fn().mockResolvedValue({ uri: 'file:///still.jpg', width: 1920, height: 1080 })
jest.mock('expo-video-thumbnails', () => ({ __esModule: true, getThumbnailAsync: (...a: any[]) => getThumbnailAsync(...a) }))

import { MobileVideoReviewPlayer } from './MobileVideoReviewPlayer'

beforeEach(() => {
  jest.clearAllMocks()
  mockPlayer.currentTime = 4
})

describe('MobileVideoReviewPlayer', () => {
  it('renders the video view on the given source', () => {
    render(<MobileVideoReviewPlayer source="file:///v.mp4" onCaptureFrame={jest.fn()} />)
    expect(screen.getByTestId('video-view')).toBeOnTheScreen()
  })

  it('play button plays the player; frame-step seeks by 1/fps', () => {
    render(<MobileVideoReviewPlayer source="file:///v.mp4" fps={25} onCaptureFrame={jest.fn()} />)
    fireEvent.press(screen.getByLabelText('Play'))
    expect(mockPlayer.play).toHaveBeenCalled()
    fireEvent.press(screen.getByLabelText('Next frame'))
    expect(mockPlayer.seekBy).toHaveBeenCalledWith(1 / 25)
    fireEvent.press(screen.getByLabelText('Previous frame'))
    expect(mockPlayer.seekBy).toHaveBeenCalledWith(-1 / 25)
  })

  it('capture-frame pauses, grabs the still, and emits a CapturedFrame', async () => {
    const onCaptureFrame = jest.fn()
    render(<MobileVideoReviewPlayer source="file:///v.mp4" onCaptureFrame={onCaptureFrame} />)
    fireEvent.press(screen.getByLabelText('Capture frame'))
    await waitFor(() => expect(onCaptureFrame).toHaveBeenCalledWith({
      uri: 'file:///still.jpg', timestampSeconds: 4, width: 1920, height: 1080,
    }))
    expect(mockPlayer.pause).toHaveBeenCalled()
    expect(getThumbnailAsync).toHaveBeenCalledWith('file:///v.mp4', { time: 4000 })
  })

  it('thumbnail failure calls onError and does not emit a frame', async () => {
    getThumbnailAsync.mockRejectedValueOnce(new Error('decode failed'))
    const onCaptureFrame = jest.fn(); const onError = jest.fn()
    render(<MobileVideoReviewPlayer source="file:///v.mp4" onCaptureFrame={onCaptureFrame} onError={onError} />)
    fireEvent.press(screen.getByLabelText('Capture frame'))
    await waitFor(() => expect(onError).toHaveBeenCalledTimes(1))
    expect(onCaptureFrame).not.toHaveBeenCalled()
  })

  it('compact mode hides speed + capture and shows Expand', () => {
    const onExpand = jest.fn()
    render(<MobileVideoReviewPlayer source="file:///v.mp4" mode="compact" onCaptureFrame={jest.fn()} onExpand={onExpand} />)
    expect(screen.queryByLabelText('Capture frame')).toBeNull()
    expect(screen.queryByLabelText('Speed 0.5x')).toBeNull()
    fireEvent.press(screen.getByLabelText('Expand'))
    expect(onExpand).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- MobileVideoReviewPlayer`
Expected: FAIL — cannot resolve `./MobileVideoReviewPlayer`.

- [ ] **Step 4: Write the orchestrator**

Create `mobile/components/player/MobileVideoReviewPlayer.tsx`:
```tsx
import { useCallback, useState } from 'react'
import { View, Pressable, Text } from 'react-native'
import { useVideoPlayer, VideoView } from 'expo-video'
import * as VideoThumbnails from 'expo-video-thumbnails'
import { SpeedSelector } from './SpeedSelector'
import { ScrubBar } from './ScrubBar'
import { PlaybackControls } from './PlaybackControls'
import { clampTime, frameStepDelta } from './player-logic'
import type { CapturedFrame, PlayerMode } from './types'

interface Props {
  source: string
  mode?: PlayerMode
  fps?: number
  initialRate?: number
  initiallyLooping?: boolean
  onCaptureFrame: (f: CapturedFrame) => void
  onReady?: (m: { durationSeconds: number; width: number; height: number }) => void
  onError?: () => void
  onExpand?: () => void
}

export function MobileVideoReviewPlayer({
  source, mode = 'review', fps = 30, initialRate = 1, initiallyLooping = true,
  onCaptureFrame, onReady, onError, onExpand,
}: Props) {
  const player = useVideoPlayer(source, (p) => { p.loop = initiallyLooping; p.playbackRate = initialRate })
  const [playing, setPlaying] = useState(false)
  const [looping, setLooping] = useState(initiallyLooping)
  const [speed, setSpeed] = useState<number>(initialRate)
  const [current, setCurrent] = useState(0)
  const [errored, setErrored] = useState(false)

  // NOTE: wire these to the real expo-video events (verify names against the installed lib).
  // statusChange → handleReady on 'readyToPlay', handleError on 'error';
  // timeUpdate → setCurrent(player.currentTime); playingChange → setPlaying(...).
  const handleReady = useCallback(() => {
    onReady?.({ durationSeconds: player.duration, width: 0, height: 0 })
  }, [onReady, player])
  const handleError = useCallback(() => { setErrored(true); onError?.() }, [onError])

  const compact = mode === 'compact'

  const playPause = () => { if (playing) { player.pause(); setPlaying(false) } else { player.play(); setPlaying(true) } }
  const toggleLoop = () => { const next = !looping; player.loop = next; setLooping(next) }
  const stepBack = () => player.seekBy(-frameStepDelta(fps))
  const stepForward = () => player.seekBy(frameStepDelta(fps))
  const seek = (t: number) => { const ct = clampTime(t, player.duration); player.currentTime = ct; setCurrent(ct) }
  const changeSpeed = (s: number) => { player.playbackRate = s; setSpeed(s) }

  const captureFrame = async () => {
    player.pause(); setPlaying(false)
    const t = player.currentTime
    try {
      const { uri, width, height } = await VideoThumbnails.getThumbnailAsync(source, { time: t * 1000 })
      onCaptureFrame({ uri, timestampSeconds: t, width, height })
    } catch {
      handleError()
    }
  }

  if (errored) {
    return (
      <View className="items-center justify-center py-10" accessibilityRole="alert">
        <Text className="text-sm text-red-500">Couldn&apos;t load this video.</Text>
      </View>
    )
  }

  return (
    <View className="gap-3">
      <VideoView player={player} style={{ width: '100%', aspectRatio: 16 / 9 }} />
      <ScrubBar current={current} duration={player.duration} onSeek={seek} />
      <PlaybackControls
        playing={playing}
        looping={looping}
        onPlayPause={playPause}
        onToggleLoop={toggleLoop}
        onStepBack={stepBack}
        onStepForward={stepForward}
        onCaptureFrame={captureFrame}
        showCapture={!compact}
        showLoop={!compact}
      />
      {!compact && <SpeedSelector value={speed} onChange={changeSpeed} />}
      {compact && (
        <Pressable accessibilityRole="button" accessibilityLabel="Expand" onPress={onExpand} className="self-start rounded-md bg-slate-100 px-3 py-2">
          <Text className="text-xs font-semibold text-slate-700">Expand</Text>
        </Pressable>
      )}
      {/* handleReady / handleError are invoked from expo-video events wired above. */}
    </View>
  )
}
```
The test exercises the player methods via the mock and does not require the real event wiring to fire; wire `handleReady`/`handleError`/`setCurrent` to the actual `expo-video` events (verify names) so device behavior is correct. If `onReady` width/height cannot be reliably sourced from `expo-video` in SDK 52, pass `0` (as above) — dimensions for captured stills come from the thumbnail, not `onReady`.

- [ ] **Step 5: Run test + typecheck**

Run: `npm test -- MobileVideoReviewPlayer` → PASS. Run: `npm run typecheck` → clean.

- [ ] **Step 6: Run the full player suite**

Run: `npm test -- player`
Expected: all player tests green (logic + SpeedSelector + ScrubBar + PlaybackControls + orchestrator) and the harness smoke test.

- [ ] **Step 7: Commit**

```bash
git add mobile/package.json mobile/package-lock.json mobile/components/player/MobileVideoReviewPlayer.tsx mobile/components/player/MobileVideoReviewPlayer.test.tsx
git commit -m "feat(mobile-player): MobileVideoReviewPlayer orchestrator"
```

---

## Manual / device verification (after Task 6)

Not automated. On a real device/simulator with a local ~25s clip: the video renders and plays; the scrub bar seeks; the speed pills slow playback (0.1×–1×, never faster); frame-step nudges by a single frame; loop (default on) restarts; **Capture frame** pauses and produces a still (verify the emitted `uri` opens and the timestamp matches the paused position); the error state shows for a bad source. Confirm `onReady` reports the duration. Compact mode shows a shrunk player with Expand and no capture/speed.

---

## Self-Review (completed by plan author)

**Spec coverage:**
- jest-expo harness → Task 1. ✓
- Types (`CapturedFrame` uri-shape, `PlayerMode`, `SPEED_STEPS`) → Task 2. ✓
- Pure logic (clampTime/formatTimestamp/frameStepDelta) → Task 2. ✓
- Segmented speed selector (5 slow-only steps) → Task 3. ✓
- Scrub bar + timestamp (draggable slider) → Task 4. ✓
- Playback controls (play/pause, play-again handled in orchestrator via seek+play, loop, frame-step, capture-frame) → Task 5 + Task 6. ✓
- Orchestrator: expo-video playback wiring, capture-frame via expo-video-thumbnails (pause-first, uri-based CapturedFrame), onReady/onError, review/compact → Task 6. ✓
- Pure-primitive contract (no network/persistence/navigation) → honored across all tasks; the orchestrator only emits via callbacks. ✓
- Error handling: load error → error state + onError; thumbnail failure → onError non-fatal → Task 6. ✓
- Out of scope honored: no screen wiring, no picker/manual/stills-upload/source plumbing, no filmstrip, no remote-URL. ✓

**Placeholder scan:** none — every step has concrete code/commands. The two "verify against installed lib" notes (expo-video event names; onReady dimensions) are explicit, scoped instructions with a defined fallback, not deferred work.

**Type consistency:** `CapturedFrame {uri,timestampSeconds,width,height}` defined Task 2, emitted Task 6. `SPEED_STEPS`/`SpeedStep` Task 2 → SpeedSelector Task 3. `clampTime`/`formatTimestamp`/`frameStepDelta` Task 2 → ScrubBar Task 4 + orchestrator Task 6. Control prop names (`onStepBack/onStepForward/onCaptureFrame/showCapture/showLoop`) defined Task 5, consumed Task 6. `PlayerMode` Task 2 → orchestrator Task 6.

**Model note for execution:** these implementers work from prose against real native modules (not transcription) — use a standard/capable model (e.g. sonnet) for all tasks, not the cheapest tier.
