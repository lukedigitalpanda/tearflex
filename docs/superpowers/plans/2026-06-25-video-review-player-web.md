# Video Review Player (Web) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the web (Next.js) implementation of the shared video review player — a reusable component with slow-mo, scrub bar + timestamp, frame step, loop, and capture-frame.

**Architecture:** A single client component `VideoReviewPlayer` wraps a native HTML5 `<video>` element and composes small focused sub-components (playback controls, speed slider, scrub bar, frame step). All non-trivial maths lives in pure helpers (`player-logic.ts`) that are unit-tested in isolation. The player is a pure UI primitive: it emits captured frames via a callback and never persists anything.

**Tech Stack:** React 18, Next.js 14 (App Router), TypeScript, Tailwind, `@radix-ui/react-slider`, lucide-react, vitest + @testing-library/react.

## Global Constraints

- This plan covers **web only**. The mobile player is a separate plan with the same interface.
- Component interface (props/callbacks) must match the spec contract exactly — `docs/superpowers/specs/2026-06-25-video-review-player-design.md`. Web's `CapturedFrame.image` is a `Blob` (image/jpeg).
- Speed steps are exactly `[1, 0.75, 0.5, 0.25, 0.1]` (slow-mo only, never above 1×). Default rate 1×.
- Loop defaults **on**. Default fps fallback for frame-step is **30**.
- Timestamp format: current time to 2 decimals, duration to 1 decimal, e.g. `8.20s / 25.0s`.
- Two modes: `review` (all controls) and `compact` (play/pause + scrub + timestamp + expand affordance only).
- Follow existing web conventions: named exports, `'use client'` when using hooks/events, Tailwind via `cn()` from `@/lib/utils`, lucide-react icons, Radix wrapped shadcn-style in `web/src/components/ui/`.
- Persisting captured stills is OUT OF SCOPE (later sub-projects). The player only emits frames via `onCaptureFrame`.
- Run all commands from `web/`. Test runner: `npm run test` (vitest). Typecheck: `npm run typecheck`.

## File Structure

```
web/src/components/
  ui/
    slider.tsx                 # NEW: shadcn-style Radix slider wrapper (used by SpeedSlider + ScrubBar)
  player/
    constants.ts               # NEW: SPEED_STEPS, DEFAULT_FPS
    player-logic.ts            # NEW: pure helpers (clampTime, formatSeconds, stepFrame, speedAtIndex, indexOfSpeed)
    player-logic.test.ts       # NEW
    SpeedSlider.tsx            # NEW + .test.tsx
    ScrubBar.tsx               # NEW + .test.tsx
    FrameStep.tsx              # NEW + .test.tsx
    PlaybackControls.tsx       # NEW + .test.tsx
    useVideoFrame.ts           # NEW + .test.ts (canvas snapshot -> CapturedFrame)
    VideoReviewPlayer.tsx      # NEW + .test.tsx (composition, video element wiring, modes, error state)
```

---

## Task 1: Player constants and pure logic

**Files:**
- Create: `web/src/components/player/constants.ts`
- Create: `web/src/components/player/player-logic.ts`
- Test: `web/src/components/player/player-logic.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `SPEED_STEPS: readonly number[]` = `[1, 0.75, 0.5, 0.25, 0.1]`
  - `DEFAULT_FPS: number` = `30`
  - `clampTime(t: number, duration: number): number`
  - `formatSeconds(seconds: number, decimals?: number): string` (default 2 decimals, e.g. `"8.20s"`)
  - `stepFrame(current: number, direction: 1 | -1, fps?: number, duration?: number): number`
  - `speedAtIndex(index: number): number`
  - `indexOfSpeed(speed: number): number`

- [ ] **Step 1: Write the failing test**

Create `web/src/components/player/player-logic.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { SPEED_STEPS, DEFAULT_FPS } from './constants'
import { clampTime, formatSeconds, stepFrame, speedAtIndex, indexOfSpeed } from './player-logic'

describe('constants', () => {
  it('exposes the exact slow-mo steps and default fps', () => {
    expect(SPEED_STEPS).toEqual([1, 0.75, 0.5, 0.25, 0.1])
    expect(DEFAULT_FPS).toBe(30)
  })
})

describe('clampTime', () => {
  it('clamps below 0 to 0', () => expect(clampTime(-3, 25)).toBe(0))
  it('clamps above duration to duration', () => expect(clampTime(30, 25)).toBe(25))
  it('passes values inside the range', () => expect(clampTime(8.2, 25)).toBe(8.2))
  it('treats NaN as 0', () => expect(clampTime(NaN, 25)).toBe(0))
  it('does not clamp to a non-finite duration', () => expect(clampTime(8.2, Infinity)).toBe(8.2))
})

describe('formatSeconds', () => {
  it('formats current time to 2 decimals by default', () => expect(formatSeconds(8.2)).toBe('8.20s'))
  it('formats duration to 1 decimal when asked', () => expect(formatSeconds(25, 1)).toBe('25.0s'))
  it('guards NaN to zero', () => expect(formatSeconds(NaN)).toBe('0.00s'))
  it('guards negatives to zero', () => expect(formatSeconds(-4, 1)).toBe('0.0s'))
})

describe('stepFrame', () => {
  it('advances one frame at 30fps', () => expect(stepFrame(1, 1, 30, 25)).toBeCloseTo(1 + 1 / 30, 5))
  it('retreats one frame at 30fps', () => expect(stepFrame(1, -1, 30, 25)).toBeCloseTo(1 - 1 / 30, 5))
  it('falls back to 30fps when fps is 0/unknown', () => expect(stepFrame(1, 1, 0, 25)).toBeCloseTo(1 + 1 / 30, 5))
  it('clamps at the end', () => expect(stepFrame(25, 1, 30, 25)).toBe(25))
  it('clamps at the start', () => expect(stepFrame(0, -1, 30, 25)).toBe(0))
})

describe('speed index mapping', () => {
  it('maps index to speed', () => {
    expect(speedAtIndex(0)).toBe(1)
    expect(speedAtIndex(4)).toBe(0.1)
  })
  it('rounds and clamps out-of-range indices', () => {
    expect(speedAtIndex(-2)).toBe(1)
    expect(speedAtIndex(99)).toBe(0.1)
    expect(speedAtIndex(1.4)).toBe(0.75)
  })
  it('maps speed back to index', () => {
    expect(indexOfSpeed(1)).toBe(0)
    expect(indexOfSpeed(0.1)).toBe(4)
  })
  it('returns index 0 for an unknown speed', () => expect(indexOfSpeed(0.42)).toBe(0))
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- player-logic`
Expected: FAIL — cannot resolve `./constants` / `./player-logic`.

- [ ] **Step 3: Write minimal implementation**

Create `web/src/components/player/constants.ts`:

```ts
export const SPEED_STEPS = [1, 0.75, 0.5, 0.25, 0.1] as const
export const DEFAULT_FPS = 30
```

Create `web/src/components/player/player-logic.ts`:

```ts
import { SPEED_STEPS, DEFAULT_FPS } from './constants'

export function clampTime(t: number, duration: number): number {
  if (!Number.isFinite(t) || t < 0) return 0
  if (Number.isFinite(duration) && t > duration) return duration
  return t
}

export function formatSeconds(seconds: number, decimals = 2): string {
  const s = Number.isFinite(seconds) && seconds > 0 ? seconds : 0
  return `${s.toFixed(decimals)}s`
}

export function stepFrame(current: number, direction: 1 | -1, fps = DEFAULT_FPS, duration = Infinity): number {
  const safeFps = fps > 0 ? fps : DEFAULT_FPS
  return clampTime(current + direction * (1 / safeFps), duration)
}

export function speedAtIndex(index: number): number {
  const i = Math.min(SPEED_STEPS.length - 1, Math.max(0, Math.round(index)))
  return SPEED_STEPS[i]
}

export function indexOfSpeed(speed: number): number {
  const i = (SPEED_STEPS as readonly number[]).indexOf(speed)
  return i === -1 ? 0 : i
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- player-logic`
Expected: PASS (all cases green).

- [ ] **Step 5: Typecheck and commit**

Run: `npm run typecheck`
Expected: no errors.

```bash
git add web/src/components/player/constants.ts web/src/components/player/player-logic.ts web/src/components/player/player-logic.test.ts
git commit -m "feat(player-web): pure logic + constants for video review player"
```

---

## Task 2: Radix slider wrapper (shadcn-style)

**Files:**
- Modify: `web/package.json` (add `@radix-ui/react-slider`)
- Create: `web/src/components/ui/slider.tsx`
- Test: `web/src/components/ui/slider.test.tsx`

**Interfaces:**
- Consumes: `cn` from `@/lib/utils`.
- Produces: `Slider` — a forwardRef wrapper over `@radix-ui/react-slider` Root, accepting all Radix Root props (`min`, `max`, `step`, `value`, `onValueChange`, `aria-label`, `className`). Renders role `slider` on the thumb.

- [ ] **Step 1: Install the dependency**

Run: `npm install @radix-ui/react-slider`
Expected: package added to `web/package.json` dependencies; lockfile updated.

- [ ] **Step 2: Write the failing test**

Create `web/src/components/ui/slider.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Slider } from './slider'

describe('Slider', () => {
  it('renders a slider thumb with the provided aria-label', () => {
    render(<Slider aria-label="Test slider" min={0} max={4} step={1} value={[2]} />)
    expect(screen.getByRole('slider', { name: 'Test slider' })).toBeInTheDocument()
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm run test -- ui/slider`
Expected: FAIL — cannot resolve `./slider`.

- [ ] **Step 4: Write minimal implementation**

Create `web/src/components/ui/slider.tsx`:

```tsx
'use client'

import * as React from 'react'
import * as SliderPrimitive from '@radix-ui/react-slider'
import { cn } from '@/lib/utils'

const Slider = React.forwardRef<
  React.ElementRef<typeof SliderPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root>
>(({ className, ...props }, ref) => (
  <SliderPrimitive.Root
    ref={ref}
    className={cn('relative flex w-full touch-none select-none items-center', className)}
    {...props}
  >
    <SliderPrimitive.Track className="relative h-1.5 w-full grow overflow-hidden rounded-full bg-slate-200">
      <SliderPrimitive.Range className="absolute h-full bg-teal-600" />
    </SliderPrimitive.Track>
    <SliderPrimitive.Thumb className="block h-4 w-4 rounded-full border border-teal-600 bg-white shadow focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 disabled:pointer-events-none disabled:opacity-50" />
  </SliderPrimitive.Root>
))
Slider.displayName = SliderPrimitive.Root.displayName

export { Slider }
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run test -- ui/slider`
Expected: PASS.

- [ ] **Step 6: Typecheck and commit**

Run: `npm run typecheck`
Expected: no errors.

```bash
git add web/package.json web/package-lock.json web/src/components/ui/slider.tsx web/src/components/ui/slider.test.tsx
git commit -m "feat(player-web): add Radix slider wrapper"
```

---

## Task 3: SpeedSlider component

**Files:**
- Create: `web/src/components/player/SpeedSlider.tsx`
- Test: `web/src/components/player/SpeedSlider.test.tsx`

**Interfaces:**
- Consumes: `Slider` from `@/components/ui/slider`; `SPEED_STEPS` from `./constants`; `speedAtIndex`, `indexOfSpeed` from `./player-logic`.
- Produces: `SpeedSlider({ speed, onSpeedChange })` where `speed: number`, `onSpeedChange: (s: number) => void`. Renders a slider (aria-label "Playback speed") and a `{speed}×` label.

- [ ] **Step 1: Write the failing test**

Create `web/src/components/player/SpeedSlider.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SpeedSlider } from './SpeedSlider'

describe('SpeedSlider', () => {
  it('renders the current speed label', () => {
    render(<SpeedSlider speed={0.25} onSpeedChange={vi.fn()} />)
    expect(screen.getByText('0.25×')).toBeInTheDocument()
  })

  it('exposes a labelled speed slider positioned at the current speed index', () => {
    render(<SpeedSlider speed={0.5} onSpeedChange={vi.fn()} />)
    const slider = screen.getByRole('slider', { name: 'Playback speed' })
    // 0.5 is index 2 in SPEED_STEPS
    expect(slider).toHaveAttribute('aria-valuenow', '2')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- SpeedSlider`
Expected: FAIL — cannot resolve `./SpeedSlider`.

- [ ] **Step 3: Write minimal implementation**

Create `web/src/components/player/SpeedSlider.tsx`:

```tsx
'use client'

import { Slider } from '@/components/ui/slider'
import { SPEED_STEPS } from './constants'
import { speedAtIndex, indexOfSpeed } from './player-logic'

export function SpeedSlider({
  speed,
  onSpeedChange,
}: {
  speed: number
  onSpeedChange: (s: number) => void
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground">Speed</span>
      <Slider
        aria-label="Playback speed"
        min={0}
        max={SPEED_STEPS.length - 1}
        step={1}
        value={[indexOfSpeed(speed)]}
        onValueChange={(v) => onSpeedChange(speedAtIndex(v[0]))}
        className="w-28"
      />
      <span className="w-12 text-right text-xs font-medium tabular-nums">{speed}×</span>
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- SpeedSlider`
Expected: PASS.

- [ ] **Step 5: Typecheck and commit**

Run: `npm run typecheck`
Expected: no errors.

```bash
git add web/src/components/player/SpeedSlider.tsx web/src/components/player/SpeedSlider.test.tsx
git commit -m "feat(player-web): stepped slow-mo speed slider"
```

---

## Task 4: ScrubBar component

**Files:**
- Create: `web/src/components/player/ScrubBar.tsx`
- Test: `web/src/components/player/ScrubBar.test.tsx`

**Interfaces:**
- Consumes: `Slider` from `@/components/ui/slider`; `formatSeconds`, `clampTime` from `./player-logic`.
- Produces: `ScrubBar({ current, duration, onSeek })` where `current: number`, `duration: number`, `onSeek: (t: number) => void`. Renders a seek slider (aria-label "Seek") and a `8.20s / 25.0s` timestamp.

- [ ] **Step 1: Write the failing test**

Create `web/src/components/player/ScrubBar.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ScrubBar } from './ScrubBar'

describe('ScrubBar', () => {
  it('renders the current time (2dp) over duration (1dp)', () => {
    render(<ScrubBar current={8.2} duration={25} onSeek={vi.fn()} />)
    expect(screen.getByText('8.20s / 25.0s')).toBeInTheDocument()
  })

  it('renders a labelled seek slider', () => {
    render(<ScrubBar current={8.2} duration={25} onSeek={vi.fn()} />)
    expect(screen.getByRole('slider', { name: 'Seek' })).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- ScrubBar`
Expected: FAIL — cannot resolve `./ScrubBar`.

- [ ] **Step 3: Write minimal implementation**

Create `web/src/components/player/ScrubBar.tsx`:

```tsx
'use client'

import { Slider } from '@/components/ui/slider'
import { clampTime, formatSeconds } from './player-logic'

export function ScrubBar({
  current,
  duration,
  onSeek,
}: {
  current: number
  duration: number
  onSeek: (t: number) => void
}) {
  const max = Number.isFinite(duration) && duration > 0 ? duration : 0
  return (
    <div className="flex items-center gap-3">
      <Slider
        aria-label="Seek"
        min={0}
        max={max}
        step={0.01}
        value={[clampTime(current, max)]}
        onValueChange={(v) => onSeek(clampTime(v[0], max))}
        className="flex-1"
      />
      <span className="whitespace-nowrap text-xs tabular-nums text-muted-foreground">
        {formatSeconds(current, 2)} / {formatSeconds(duration, 1)}
      </span>
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- ScrubBar`
Expected: PASS.

- [ ] **Step 5: Typecheck and commit**

Run: `npm run typecheck`
Expected: no errors.

```bash
git add web/src/components/player/ScrubBar.tsx web/src/components/player/ScrubBar.test.tsx
git commit -m "feat(player-web): scrub bar with timestamp readout"
```

---

## Task 5: FrameStep component

**Files:**
- Create: `web/src/components/player/FrameStep.tsx`
- Test: `web/src/components/player/FrameStep.test.tsx`

**Interfaces:**
- Consumes: `ChevronLeft`, `ChevronRight` from `lucide-react`; `stepFrame` from `./player-logic`.
- Produces: `FrameStep({ current, fps, duration, onSeek })`. Two buttons: "Previous frame" and "Next frame", each calls `onSeek` with the stepped time.

- [ ] **Step 1: Write the failing test**

Create `web/src/components/player/FrameStep.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FrameStep } from './FrameStep'

describe('FrameStep', () => {
  it('steps forward one frame on next', async () => {
    const onSeek = vi.fn()
    render(<FrameStep current={1} fps={30} duration={25} onSeek={onSeek} />)
    await userEvent.click(screen.getByRole('button', { name: 'Next frame' }))
    expect(onSeek).toHaveBeenCalledTimes(1)
    expect(onSeek.mock.calls[0][0]).toBeCloseTo(1 + 1 / 30, 5)
  })

  it('steps back one frame on previous', async () => {
    const onSeek = vi.fn()
    render(<FrameStep current={1} fps={30} duration={25} onSeek={onSeek} />)
    await userEvent.click(screen.getByRole('button', { name: 'Previous frame' }))
    expect(onSeek.mock.calls[0][0]).toBeCloseTo(1 - 1 / 30, 5)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- FrameStep`
Expected: FAIL — cannot resolve `./FrameStep`.

- [ ] **Step 3: Write minimal implementation**

Create `web/src/components/player/FrameStep.tsx`:

```tsx
'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'
import { stepFrame } from './player-logic'

export function FrameStep({
  current,
  fps,
  duration,
  onSeek,
}: {
  current: number
  fps: number
  duration: number
  onSeek: (t: number) => void
}) {
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        aria-label="Previous frame"
        onClick={() => onSeek(stepFrame(current, -1, fps, duration))}
        className="rounded p-1 hover:bg-slate-100"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
      <button
        type="button"
        aria-label="Next frame"
        onClick={() => onSeek(stepFrame(current, 1, fps, duration))}
        className="rounded p-1 hover:bg-slate-100"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- FrameStep`
Expected: PASS.

- [ ] **Step 5: Typecheck and commit**

Run: `npm run typecheck`
Expected: no errors.

```bash
git add web/src/components/player/FrameStep.tsx web/src/components/player/FrameStep.test.tsx
git commit -m "feat(player-web): prev/next frame stepping"
```

---

## Task 6: PlaybackControls component

**Files:**
- Create: `web/src/components/player/PlaybackControls.tsx`
- Test: `web/src/components/player/PlaybackControls.test.tsx`

**Interfaces:**
- Consumes: `Play`, `Pause`, `RotateCcw`, `Repeat` from `lucide-react`.
- Produces: `PlaybackControls({ playing, ended, looping, onPlayPause, onReplay, onToggleLoop })`. Shows a "Play again" button when `ended`, otherwise a Play/Pause toggle; plus a loop toggle reflecting `looping` via `aria-pressed`.

- [ ] **Step 1: Write the failing test**

Create `web/src/components/player/PlaybackControls.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PlaybackControls } from './PlaybackControls'

const base = {
  playing: false,
  ended: false,
  looping: true,
  onPlayPause: vi.fn(),
  onReplay: vi.fn(),
  onToggleLoop: vi.fn(),
}

describe('PlaybackControls', () => {
  it('shows Play when paused and not ended', () => {
    render(<PlaybackControls {...base} />)
    expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument()
  })

  it('shows Pause when playing', () => {
    render(<PlaybackControls {...base} playing />)
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument()
  })

  it('shows Play again when ended and calls onReplay', async () => {
    const onReplay = vi.fn()
    render(<PlaybackControls {...base} ended onReplay={onReplay} />)
    const btn = screen.getByRole('button', { name: 'Play again' })
    await userEvent.click(btn)
    expect(onReplay).toHaveBeenCalledOnce()
  })

  it('reflects loop state with aria-pressed and toggles it', async () => {
    const onToggleLoop = vi.fn()
    render(<PlaybackControls {...base} looping onToggleLoop={onToggleLoop} />)
    const loop = screen.getByRole('button', { name: 'Toggle loop' })
    expect(loop).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(loop)
    expect(onToggleLoop).toHaveBeenCalledOnce()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- PlaybackControls`
Expected: FAIL — cannot resolve `./PlaybackControls`.

- [ ] **Step 3: Write minimal implementation**

Create `web/src/components/player/PlaybackControls.tsx`:

```tsx
'use client'

import { Play, Pause, RotateCcw, Repeat } from 'lucide-react'

export function PlaybackControls({
  playing,
  ended,
  looping,
  onPlayPause,
  onReplay,
  onToggleLoop,
}: {
  playing: boolean
  ended: boolean
  looping: boolean
  onPlayPause: () => void
  onReplay: () => void
  onToggleLoop: () => void
}) {
  return (
    <div className="flex items-center gap-2">
      {ended ? (
        <button type="button" aria-label="Play again" onClick={onReplay} className="rounded p-1 hover:bg-slate-100">
          <RotateCcw className="h-5 w-5" />
        </button>
      ) : (
        <button
          type="button"
          aria-label={playing ? 'Pause' : 'Play'}
          onClick={onPlayPause}
          className="rounded p-1 hover:bg-slate-100"
        >
          {playing ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
        </button>
      )}
      <button
        type="button"
        aria-label="Toggle loop"
        aria-pressed={looping}
        onClick={onToggleLoop}
        className={looping ? 'rounded p-1 text-teal-600' : 'rounded p-1 text-slate-400'}
      >
        <Repeat className="h-5 w-5" />
      </button>
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- PlaybackControls`
Expected: PASS.

- [ ] **Step 5: Typecheck and commit**

Run: `npm run typecheck`
Expected: no errors.

```bash
git add web/src/components/player/PlaybackControls.tsx web/src/components/player/PlaybackControls.test.tsx
git commit -m "feat(player-web): play/pause/replay + loop controls"
```

---

## Task 7: useVideoFrame hook (canvas snapshot)

**Files:**
- Create: `web/src/components/player/useVideoFrame.ts`
- Test: `web/src/components/player/useVideoFrame.test.ts`

**Interfaces:**
- Consumes: `useCallback` from `react`.
- Produces:
  - `interface CapturedFrame { image: Blob; timestampSeconds: number; width: number; height: number }`
  - `useVideoFrame(videoRef: React.RefObject<HTMLVideoElement>): () => Promise<CapturedFrame | null>` — draws the current frame to an offscreen canvas at native resolution and returns a JPEG blob plus the current timestamp. Returns `null` if the ref/context is unavailable.

- [ ] **Step 1: Write the failing test**

Create `web/src/components/player/useVideoFrame.test.ts`:

```ts
import { describe, expect, it, vi, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useVideoFrame } from './useVideoFrame'

afterEach(() => vi.restoreAllMocks())

function makeVideo(): HTMLVideoElement {
  return { videoWidth: 3840, videoHeight: 2160, currentTime: 8.2 } as unknown as HTMLVideoElement
}

describe('useVideoFrame', () => {
  it('returns null when the ref is empty', async () => {
    const { result } = renderHook(() => useVideoFrame({ current: null }))
    await expect(result.current()).resolves.toBeNull()
  })

  it('captures the current frame as a jpeg blob with native dimensions and timestamp', async () => {
    const fakeBlob = new Blob(['x'], { type: 'image/jpeg' })
    const ctx = { drawImage: vi.fn() }
    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => ctx),
      toBlob: (cb: (b: Blob | null) => void) => cb(fakeBlob),
    }
    vi.spyOn(document, 'createElement').mockReturnValue(canvas as unknown as HTMLCanvasElement)

    const video = makeVideo()
    const { result } = renderHook(() => useVideoFrame({ current: video }))
    const frame = await result.current()

    expect(canvas.width).toBe(3840)
    expect(canvas.height).toBe(2160)
    expect(ctx.drawImage).toHaveBeenCalledWith(video, 0, 0, 3840, 2160)
    expect(frame).toEqual({ image: fakeBlob, timestampSeconds: 8.2, width: 3840, height: 2160 })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- useVideoFrame`
Expected: FAIL — cannot resolve `./useVideoFrame`.

- [ ] **Step 3: Write minimal implementation**

Create `web/src/components/player/useVideoFrame.ts`:

```ts
import { useCallback } from 'react'
import type { RefObject } from 'react'

export interface CapturedFrame {
  image: Blob
  timestampSeconds: number
  width: number
  height: number
}

export function useVideoFrame(videoRef: RefObject<HTMLVideoElement>) {
  return useCallback(async (): Promise<CapturedFrame | null> => {
    const video = videoRef.current
    if (!video) return null

    const width = video.videoWidth
    const height = video.videoHeight
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height

    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(video, 0, 0, width, height)

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', 0.92),
    )
    if (!blob) return null

    return { image: blob, timestampSeconds: video.currentTime, width, height }
  }, [videoRef])
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- useVideoFrame`
Expected: PASS.

- [ ] **Step 5: Typecheck and commit**

Run: `npm run typecheck`
Expected: no errors.

```bash
git add web/src/components/player/useVideoFrame.ts web/src/components/player/useVideoFrame.test.ts
git commit -m "feat(player-web): canvas frame-capture hook"
```

---

## Task 8: VideoReviewPlayer composition

**Files:**
- Create: `web/src/components/player/VideoReviewPlayer.tsx`
- Test: `web/src/components/player/VideoReviewPlayer.test.tsx`

**Interfaces:**
- Consumes: `PlaybackControls`, `SpeedSlider`, `ScrubBar`, `FrameStep`, `useVideoFrame` (+ `CapturedFrame` type), `DEFAULT_FPS`, lucide icons `Camera`/`Maximize2`, `cn`.
- Produces:
  - `interface VideoReviewPlayerProps { source: string; mode?: 'review' | 'compact'; fps?: number; initialRate?: number; initiallyLooping?: boolean; onCaptureFrame?: (frame: CapturedFrame) => void; onExpand?: () => void; onReady?: (meta: { durationSeconds: number; width: number; height: number }) => void; onError?: (error: Error) => void }`
  - `VideoReviewPlayer(props: VideoReviewPlayerProps)` — composes the sub-components around a native `<video>`.

**Notes on jsdom:** jsdom does not implement `HTMLMediaElement.prototype.play/pause`. The test stubs them. `duration`/`videoWidth`/`videoHeight` are stubbed per-test via `Object.defineProperty` before firing `loadedMetadata`.

- [ ] **Step 1: Write the failing test**

Create `web/src/components/player/VideoReviewPlayer.test.tsx`:

```tsx
import { describe, expect, it, vi, beforeAll } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { VideoReviewPlayer } from './VideoReviewPlayer'

// jsdom lacks media playback methods.
beforeAll(() => {
  window.HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined)
  window.HTMLMediaElement.prototype.pause = vi.fn()
})

// Mock the capture hook so we don't exercise canvas here.
const fakeFrame = { image: new Blob(['x'], { type: 'image/jpeg' }), timestampSeconds: 8.2, width: 3840, height: 2160 }
vi.mock('./useVideoFrame', () => ({
  useVideoFrame: () => vi.fn().mockResolvedValue(fakeFrame),
}))

function getVideo(): HTMLVideoElement {
  // The video is the only media element rendered.
  return document.querySelector('video') as HTMLVideoElement
}

describe('VideoReviewPlayer', () => {
  it('renders a video element pointing at the source', () => {
    render(<VideoReviewPlayer source="blob:abc" />)
    expect(getVideo()).toHaveAttribute('src', 'blob:abc')
  })

  it('review mode shows capture-frame and speed controls', () => {
    render(<VideoReviewPlayer source="blob:abc" mode="review" />)
    expect(screen.getByRole('button', { name: 'Capture frame' })).toBeInTheDocument()
    expect(screen.getByRole('slider', { name: 'Playback speed' })).toBeInTheDocument()
  })

  it('compact mode hides advanced controls and shows expand', () => {
    const onExpand = vi.fn()
    render(<VideoReviewPlayer source="blob:abc" mode="compact" onExpand={onExpand} />)
    expect(screen.queryByRole('button', { name: 'Capture frame' })).not.toBeInTheDocument()
    expect(screen.queryByRole('slider', { name: 'Playback speed' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Expand' })).toBeInTheDocument()
  })

  it('fires onReady with metadata on loadedMetadata', () => {
    const onReady = vi.fn()
    render(<VideoReviewPlayer source="blob:abc" onReady={onReady} />)
    const video = getVideo()
    Object.defineProperty(video, 'duration', { configurable: true, value: 25 })
    Object.defineProperty(video, 'videoWidth', { configurable: true, value: 3840 })
    Object.defineProperty(video, 'videoHeight', { configurable: true, value: 2160 })
    fireEvent.loadedMetadata(video)
    expect(onReady).toHaveBeenCalledWith({ durationSeconds: 25, width: 3840, height: 2160 })
  })

  it('emits a captured frame when capture-frame is clicked', async () => {
    const onCaptureFrame = vi.fn()
    render(<VideoReviewPlayer source="blob:abc" onCaptureFrame={onCaptureFrame} />)
    await userEvent.click(screen.getByRole('button', { name: 'Capture frame' }))
    expect(onCaptureFrame).toHaveBeenCalledWith(fakeFrame)
  })

  it('shows an error state and calls onError when the video errors', () => {
    const onError = vi.fn()
    render(<VideoReviewPlayer source="bad" onError={onError} />)
    fireEvent.error(getVideo())
    expect(screen.getByRole('alert')).toHaveTextContent(/couldn.t load this video/i)
    expect(onError).toHaveBeenCalledOnce()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- VideoReviewPlayer`
Expected: FAIL — cannot resolve `./VideoReviewPlayer`.

- [ ] **Step 3: Write minimal implementation**

Create `web/src/components/player/VideoReviewPlayer.tsx`:

```tsx
'use client'

import * as React from 'react'
import { Camera, Maximize2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { PlaybackControls } from './PlaybackControls'
import { SpeedSlider } from './SpeedSlider'
import { ScrubBar } from './ScrubBar'
import { FrameStep } from './FrameStep'
import { useVideoFrame, type CapturedFrame } from './useVideoFrame'
import { DEFAULT_FPS } from './constants'

export interface VideoReviewPlayerProps {
  source: string
  mode?: 'review' | 'compact'
  fps?: number
  initialRate?: number
  initiallyLooping?: boolean
  onCaptureFrame?: (frame: CapturedFrame) => void
  onExpand?: () => void
  onReady?: (meta: { durationSeconds: number; width: number; height: number }) => void
  onError?: (error: Error) => void
}

export function VideoReviewPlayer({
  source,
  mode = 'review',
  fps = DEFAULT_FPS,
  initialRate = 1,
  initiallyLooping = true,
  onCaptureFrame,
  onExpand,
  onReady,
  onError,
}: VideoReviewPlayerProps) {
  const videoRef = React.useRef<HTMLVideoElement>(null)
  const [playing, setPlaying] = React.useState(false)
  const [ended, setEnded] = React.useState(false)
  const [looping, setLooping] = React.useState(initiallyLooping)
  const [speed, setSpeed] = React.useState(initialRate)
  const [current, setCurrent] = React.useState(0)
  const [duration, setDuration] = React.useState(0)
  const [errored, setErrored] = React.useState(false)
  const captureFrame = useVideoFrame(videoRef)

  React.useEffect(() => {
    if (videoRef.current) videoRef.current.playbackRate = speed
  }, [speed])

  const handlePlayPause = () => {
    const v = videoRef.current
    if (!v) return
    if (v.paused) void v.play()
    else v.pause()
  }

  const handleReplay = () => {
    const v = videoRef.current
    if (!v) return
    v.currentTime = 0
    setEnded(false)
    void v.play()
  }

  const seek = (t: number) => {
    const v = videoRef.current
    if (!v) return
    v.currentTime = t
    setCurrent(t)
    if (ended && t < duration) setEnded(false)
  }

  const handleCapture = async () => {
    if (!onCaptureFrame) return
    try {
      const frame = await captureFrame()
      if (frame) onCaptureFrame(frame)
    } catch {
      // non-fatal; ignore
    }
  }

  if (errored) {
    return (
      <div role="alert" className="rounded-md bg-slate-50 p-6 text-sm text-slate-600">
        Couldn’t load this video
      </div>
    )
  }

  return (
    <div className={cn('flex flex-col gap-2', mode === 'compact' ? 'max-w-xs' : 'w-full')}>
      <video
        ref={videoRef}
        src={source}
        loop={looping}
        playsInline
        className="w-full rounded-md bg-black"
        onLoadedMetadata={(e) => {
          const v = e.currentTarget
          v.playbackRate = speed
          setDuration(v.duration)
          onReady?.({ durationSeconds: v.duration, width: v.videoWidth, height: v.videoHeight })
        }}
        onTimeUpdate={(e) => setCurrent(e.currentTarget.currentTime)}
        onPlay={() => {
          setPlaying(true)
          setEnded(false)
        }}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          if (!looping) {
            setPlaying(false)
            setEnded(true)
          }
        }}
        onError={() => {
          setErrored(true)
          onError?.(new Error('video load error'))
        }}
      />

      <ScrubBar current={current} duration={duration} onSeek={seek} />

      <div className="flex items-center justify-between gap-2">
        <PlaybackControls
          playing={playing}
          ended={ended}
          looping={looping}
          onPlayPause={handlePlayPause}
          onReplay={handleReplay}
          onToggleLoop={() => setLooping((l) => !l)}
        />

        {mode === 'review' ? (
          <div className="flex items-center gap-3">
            <FrameStep current={current} fps={fps} duration={duration} onSeek={seek} />
            <SpeedSlider speed={speed} onSpeedChange={setSpeed} />
            <button
              type="button"
              aria-label="Capture frame"
              onClick={handleCapture}
              className="rounded p-1 hover:bg-slate-100"
            >
              <Camera className="h-5 w-5" />
            </button>
          </div>
        ) : (
          <button type="button" aria-label="Expand" onClick={onExpand} className="rounded p-1 hover:bg-slate-100">
            <Maximize2 className="h-5 w-5" />
          </button>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- VideoReviewPlayer`
Expected: PASS (all six cases).

- [ ] **Step 5: Run the full suite + typecheck**

Run: `npm run test` then `npm run typecheck`
Expected: whole suite green, no type errors.

- [ ] **Step 6: Commit**

```bash
git add web/src/components/player/VideoReviewPlayer.tsx web/src/components/player/VideoReviewPlayer.test.tsx
git commit -m "feat(player-web): VideoReviewPlayer composition with review/compact modes"
```

---

## Manual / demo verification (after Task 8)

Not automated; do once the component exists. Mount `VideoReviewPlayer` on a scratch page with a real ~25s clip and confirm:
- Slow-mo slider snaps 1× → 0.1× and playback visibly slows.
- Scrub + timestamp track playback; dragging seeks; readout shows `current(2dp) / duration(1dp)`.
- Frame step nudges by one frame and pauses.
- Loop restarts automatically; turning it off lets the video end and surfaces "Play again".
- Capture-frame fires `onCaptureFrame` with a JPEG blob whose `timestampSeconds` matches the displayed time.
- `compact` mode shows the shrunk player with an Expand affordance and hides advanced controls.

---

## Self-Review (completed by plan author)

**Spec coverage:**
- review/compact modes → Task 8. ✓
- play/pause/replay → Task 6. ✓
- loop (default on) → Task 6 + Task 8 state. ✓
- stepped slow-mo `[1,0.75,0.5,0.25,0.1]` → Task 1 (logic) + Task 3 (UI). ✓
- scrub bar + timestamp `8.20s / 25.0s` → Task 1 (format) + Task 4 (UI). ✓
- frame step → Task 1 (math) + Task 5 (UI). ✓
- capture-frame emits `CapturedFrame` via callback → Task 7 (hook) + Task 8 (wiring). ✓
- deps to add (`@radix-ui/react-slider`) → Task 2. ✓
- error/snapshot-failure handling → Task 8 (error state + swallow) . ✓
- file layout matches spec (adapted to `web/src/components`). ✓
- Out of scope (persistence, filmstrip, webcam) → not implemented. ✓

**Placeholder scan:** none — every step has concrete code/commands.

**Type consistency:** `CapturedFrame` (image: Blob, timestampSeconds, width, height) defined in Task 7, consumed unchanged in Task 8. `onSeek`, `onSpeedChange`, `speed`, `current`, `duration`, `fps` signatures consistent across Tasks 3–8. `speedAtIndex`/`indexOfSpeed`/`stepFrame`/`formatSeconds`/`clampTime` names match between Task 1 and consumers.
