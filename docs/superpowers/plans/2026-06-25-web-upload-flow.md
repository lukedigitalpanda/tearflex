# Web Upload Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an "Upload a video" path to the web new-assessment flow: pick a test type, upload a video, review it with the player, then auto-analyse (async, polled) or grade it manually — with captured frames persisted as stills.

**Architecture:** A new `UploadAssessmentFlow` orchestrator, reached from an entry-mode choice after eye selection, composes small focused components (file picker, review-with-player, manual entry, processing/poll) over new capture hooks and a new `postMultipart` API method. The existing manual stepper is untouched.

**Tech Stack:** React 18, Next.js 14 (App Router), TypeScript, TanStack Query, React Hook Form + Zod, Tailwind, vitest + @testing-library/react.

## Global Constraints

- Web only. Run all commands from `/opt/tearflex/web`. Test: `npm run test -- <pattern>` (vitest). Typecheck: `npm run typecheck`.
- Backend contract (sub-project A, already on master): auto = `POST assessments/captures/` with `assessment, test_type, source, video_file` (source must be `mobile`/`upload`, video required) → `{ id, status }`; manual = `POST assessments/captures/manual/` with `assessment, test_type, source, video_file` + result fields → created capture; stills = `POST assessments/captures/{id}/stills/` multipart `image, timestamp_seconds, label?`; poll = `GET assessments/captures/{id}/status/` → `{ id, status, result? }`. Upload path always uses `source: 'upload'`.
- API paths are passed WITHOUT a leading slash and WITH the DRF trailing slash (e.g. `'assessments/captures/'`); the client strips the trailing slash for the proxy. Follow the existing `api.get/post` call style.
- `postMultipart` must NOT set a `Content-Type` header (the browser sets the multipart boundary).
- One uploaded video = one capture for the selected test type. Assessment is created once (`useCreateAssessment`) and reused on retry (never recreated).
- Stills upload happens after the capture id exists and is non-fatal on failure (never blocks navigation).
- The manual branch handles only the SELECTED test type's fields (multi-test manual entry is parked per the spec).
- Follow existing conventions: `'use client'` for components with hooks/state, named exports, Tailwind, teal-600 primary buttons, inline error text + disabled buttons for form state (the `StepReview` pattern). Player import: `import { VideoReviewPlayer } from '@/components/player/VideoReviewPlayer'`; `CapturedFrame` from `@/components/player/useVideoFrame`.

## File Structure

```
shared/types/assessment.ts                         # MODIFY: CaptureSource, CaptureStill, TestCapture(+source,+stills,video_file nullable)
web/src/lib/api.ts                                 # MODIFY: add postMultipart
web/src/test/queryWrapper.tsx                      # NEW: QueryClientProvider wrapper for hook tests
web/src/hooks/useCaptures.ts                       # NEW: useUploadCapture, useUploadManualCapture, useCreateCaptureStill, useCaptureStatus
web/src/components/assessments/
  VideoFilePicker.tsx                              # NEW
  UploadReviewStep.tsx                             # NEW
  ProcessingStep.tsx                               # NEW
  UploadManualEntry.tsx                            # NEW
  UploadAssessmentFlow.tsx                         # NEW (orchestrator)
  NewAssessmentStepper.tsx                         # MODIFY: entry-mode branch (incl. inline EntryModeChoice)
```

---

## Task 1: Foundations — shared types + `postMultipart`

**Files:**
- Modify: `shared/types/assessment.ts`
- Modify: `web/src/lib/api.ts`
- Test: `web/src/lib/api.test.ts`

**Interfaces:**
- Produces: `CaptureSource = 'mobile'|'upload'|'manual'`; `CaptureStill`; `TestCapture` gains `source`, `stills`, nullable `video_file`. `api.postMultipart<T>(path: string, fields: Record<string, string | Blob>): Promise<T>`.

- [ ] **Step 1: Write the failing test**

Append to `web/src/lib/api.test.ts`:

```ts
it('postMultipart builds FormData, posts to the proxy, and omits content-type', async () => {
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ id: 7 }), { status: 201, headers: { 'content-type': 'application/json' } })
  )
  vi.stubGlobal('fetch', fetchMock)
  const blob = new Blob(['x'], { type: 'video/mp4' })
  const data = await api.postMultipart<{ id: number }>('assessments/captures/', { assessment: '3', source: 'upload', video_file: blob })
  expect(data.id).toBe(7)
  const [url, init] = fetchMock.mock.calls[0]
  expect(url).toBe('/api/proxy/assessments/captures')
  expect(init.method).toBe('POST')
  expect(init.body).toBeInstanceOf(FormData)
  expect((init.body as FormData).get('assessment')).toBe('3')
  expect((init.body as FormData).get('video_file')).toBeInstanceOf(Blob)
  // No forced content-type (browser sets the multipart boundary)
  expect(init.headers?.['content-type']).toBeUndefined()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- api.test`
Expected: FAIL — `api.postMultipart is not a function`.

- [ ] **Step 3: Add `postMultipart` to the client**

In `web/src/lib/api.ts`, add to the exported `api` object (after `del`):

```ts
  postMultipart: <T>(path: string, fields: Record<string, string | Blob>) => {
    const form = new FormData()
    for (const [key, value] of Object.entries(fields)) form.append(key, value)
    return request<T>(path, { method: 'POST', body: form })
  },
```

- [ ] **Step 4: Update shared types**

In `shared/types/assessment.ts`, add after the `CaptureStatus` line:

```ts
export type CaptureSource = 'mobile' | 'upload' | 'manual';

export interface CaptureStill {
  id: number;
  capture: number;
  image: string;
  timestamp_seconds: number;
  label: string;
  width: number | null;
  height: number | null;
  created_at: string;
}
```

Replace the `TestCapture` interface body so it includes `source`, nullable `video_file`, and `stills`:

```ts
export interface TestCapture {
  id: number;
  assessment: number;
  test_type: TestType;
  source: CaptureSource;
  video_file: string | null;
  thumbnail: string;
  duration_seconds: number | null;
  status: CaptureStatus;
  captured_at: string;
  result: TestResult | null;
  stills: CaptureStill[];
}
```

- [ ] **Step 5: Run test + typecheck**

Run: `npm run test -- api.test` → PASS.
Run: `npm run typecheck` → no errors (the `TestCapture` change is additive; existing consumers read a subset of fields).

- [ ] **Step 6: Commit**

```bash
git add shared/types/assessment.ts web/src/lib/api.ts web/src/lib/api.test.ts
git commit -m "feat(web-upload): shared capture types + multipart api client method"
```

---

## Task 2: Capture creation hooks

**Files:**
- Create: `web/src/test/queryWrapper.tsx`
- Create: `web/src/hooks/useCaptures.ts`
- Test: `web/src/hooks/useCaptures.test.tsx`

**Interfaces:**
- Consumes: `api.postMultipart` (Task 1).
- Produces:
  - `useUploadCapture()` → mutation; `mutate/mutateAsync({ assessment: number; test_type: string; video_file: Blob })` → `Promise<{ id: number; status: string }>` via `postMultipart('assessments/captures/', { assessment, test_type, source: 'upload', video_file })`.
  - `useUploadManualCapture()` → mutation; `mutateAsync({ assessment, test_type, video_file, ...result })` → `Promise<TestCapture>` via `postMultipart('assessments/captures/manual/', {...})`.
  - `useCreateCaptureStill()` → mutation; `mutateAsync({ captureId: number; image: Blob; timestamp_seconds: number; label?: string })` via `postMultipart('assessments/captures/{captureId}/stills/', {...})`.
  - `renderHookWithClient(hook)` test helper.

- [ ] **Step 1: Write the query wrapper helper**

Create `web/src/test/queryWrapper.tsx`:

```tsx
import { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

export function makeWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
}
```

- [ ] **Step 2: Write the failing test**

Create `web/src/hooks/useCaptures.test.tsx`:

```tsx
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { makeWrapper } from '@/test/queryWrapper'
import { api } from '@/lib/api'
import { useUploadCapture, useUploadManualCapture, useCreateCaptureStill } from './useCaptures'

beforeEach(() => { vi.restoreAllMocks() })

describe('capture hooks', () => {
  it('useUploadCapture posts to the auto endpoint with source=upload', async () => {
    const spy = vi.spyOn(api, 'postMultipart').mockResolvedValue({ id: 9, status: 'processing' })
    const { result } = renderHook(() => useUploadCapture(), { wrapper: makeWrapper() })
    const blob = new Blob(['x'], { type: 'video/mp4' })
    await result.current.mutateAsync({ assessment: 3, test_type: 'nibut', video_file: blob })
    expect(spy).toHaveBeenCalledWith('assessments/captures/', { assessment: '3', test_type: 'nibut', source: 'upload', video_file: blob })
  })

  it('useUploadManualCapture posts video + source + result fields to the manual endpoint', async () => {
    const spy = vi.spyOn(api, 'postMultipart').mockResolvedValue({ id: 10 })
    const { result } = renderHook(() => useUploadManualCapture(), { wrapper: makeWrapper() })
    const blob = new Blob(['x'], { type: 'video/mp4' })
    await result.current.mutateAsync({ assessment: 3, test_type: 'nibut', video_file: blob, nibut_first_breakup_seconds: 7.2 })
    expect(spy).toHaveBeenCalledWith('assessments/captures/manual/', { assessment: '3', test_type: 'nibut', source: 'upload', video_file: blob, nibut_first_breakup_seconds: '7.2' })
  })

  it('useCreateCaptureStill posts the frame to the capture stills endpoint', async () => {
    const spy = vi.spyOn(api, 'postMultipart').mockResolvedValue({ id: 1 })
    const { result } = renderHook(() => useCreateCaptureStill(), { wrapper: makeWrapper() })
    const img = new Blob(['x'], { type: 'image/jpeg' })
    await result.current.mutateAsync({ captureId: 9, image: img, timestamp_seconds: 8.2, label: 'first_breakup' })
    expect(spy).toHaveBeenCalledWith('assessments/captures/9/stills/', { image: img, timestamp_seconds: '8.2', label: 'first_breakup' })
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm run test -- useCaptures`
Expected: FAIL — cannot resolve `./useCaptures`.

- [ ] **Step 4: Write the hooks**

Create `web/src/hooks/useCaptures.ts`:

```ts
'use client'
import { useMutation } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { TestCapture } from '@shared/types/assessment'

interface UploadCaptureInput {
  assessment: number
  test_type: string
  video_file: Blob
}

export function useUploadCapture() {
  return useMutation({
    mutationFn: (input: UploadCaptureInput) =>
      api.postMultipart<{ id: number; status: string }>('assessments/captures/', {
        assessment: String(input.assessment),
        test_type: input.test_type,
        source: 'upload',
        video_file: input.video_file,
      }),
  })
}

interface UploadManualInput {
  assessment: number
  test_type: string
  video_file: Blob
  nibut_first_breakup_seconds?: number
  nibut_mean_breakup_seconds?: number
  fluorescein_grade?: number
  fluorescein_breakup_seconds?: number
  lipid_grade?: number
  lipid_thickness_nm?: number
  tear_meniscus_height_mm?: number
}

export function useUploadManualCapture() {
  return useMutation({
    mutationFn: (input: UploadManualInput) => {
      const { assessment, test_type, video_file, ...results } = input
      const fields: Record<string, string | Blob> = {
        assessment: String(assessment),
        test_type,
        source: 'upload',
        video_file,
      }
      for (const [k, v] of Object.entries(results)) {
        if (v !== undefined && v !== null) fields[k] = String(v)
      }
      return api.postMultipart<TestCapture>('assessments/captures/manual/', fields)
    },
  })
}

interface CreateStillInput {
  captureId: number
  image: Blob
  timestamp_seconds: number
  label?: string
}

export function useCreateCaptureStill() {
  return useMutation({
    mutationFn: (input: CreateStillInput) => {
      const fields: Record<string, string | Blob> = {
        image: input.image,
        timestamp_seconds: String(input.timestamp_seconds),
      }
      if (input.label) fields.label = input.label
      return api.postMultipart<{ id: number }>(`assessments/captures/${input.captureId}/stills/`, fields)
    },
  })
}
```

- [ ] **Step 5: Run test + typecheck**

Run: `npm run test -- useCaptures` → PASS. Run: `npm run typecheck` → clean.

- [ ] **Step 6: Commit**

```bash
git add web/src/test/queryWrapper.tsx web/src/hooks/useCaptures.ts web/src/hooks/useCaptures.test.tsx
git commit -m "feat(web-upload): capture upload + manual + stills hooks"
```

---

## Task 3: Capture status poll hook

**Files:**
- Modify: `web/src/hooks/useCaptures.ts` (add `useCaptureStatus`)
- Test: `web/src/hooks/useCaptureStatus.test.tsx`

**Interfaces:**
- Consumes: `api.get`.
- Produces: `useCaptureStatus(captureId: number | null)` → query returning `{ id: number; status: string; result?: unknown }`; `enabled` only when `captureId` is set; `refetchInterval` 2000ms while status is `processing`/`uploaded`, and `false` once `analysed` or `failed`.

- [ ] **Step 1: Write the failing test**

Create `web/src/hooks/useCaptureStatus.test.tsx`:

```tsx
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { makeWrapper } from '@/test/queryWrapper'
import { api } from '@/lib/api'
import { useCaptureStatus } from './useCaptures'

beforeEach(() => { vi.restoreAllMocks() })

describe('useCaptureStatus', () => {
  it('fetches the capture status when a captureId is given', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({ id: 9, status: 'analysed' })
    const { result } = renderHook(() => useCaptureStatus(9), { wrapper: makeWrapper() })
    await waitFor(() => expect(result.current.data?.status).toBe('analysed'))
    expect(api.get).toHaveBeenCalledWith('assessments/captures/9/status/')
  })

  it('is disabled when captureId is null', () => {
    const spy = vi.spyOn(api, 'get').mockResolvedValue({ id: 0, status: 'x' })
    renderHook(() => useCaptureStatus(null), { wrapper: makeWrapper() })
    expect(spy).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- useCaptureStatus`
Expected: FAIL — `useCaptureStatus` is not exported.

- [ ] **Step 3: Add the hook**

Append to `web/src/hooks/useCaptures.ts`:

```ts
import { useQuery } from '@tanstack/react-query'

interface CaptureStatusResponse {
  id: number
  status: string
  result?: unknown
}

export function useCaptureStatus(captureId: number | null) {
  return useQuery({
    queryKey: ['capture-status', captureId],
    enabled: captureId !== null,
    queryFn: () => api.get<CaptureStatusResponse>(`assessments/captures/${captureId}/status/`),
    refetchInterval: (query) => {
      const status = query.state.data?.status
      return status === 'analysed' || status === 'failed' ? false : 2000
    },
  })
}
```

(Update the existing `import { useMutation } from '@tanstack/react-query'` line to `import { useMutation, useQuery } from '@tanstack/react-query'` and remove the duplicate import if added separately.)

- [ ] **Step 4: Run test + typecheck**

Run: `npm run test -- useCaptureStatus` → PASS. Run: `npm run typecheck` → clean.

- [ ] **Step 5: Commit**

```bash
git add web/src/hooks/useCaptures.ts web/src/hooks/useCaptureStatus.test.tsx
git commit -m "feat(web-upload): capture status poll hook"
```

---

## Task 4: VideoFilePicker

**Files:**
- Create: `web/src/components/assessments/VideoFilePicker.tsx`
- Test: `web/src/components/assessments/VideoFilePicker.test.tsx`

**Interfaces:**
- Produces: `VideoFilePicker({ onFile }: { onFile: (file: File) => void })`. A labelled file input (`accept="video/*"`); on a video selection calls `onFile(file)` and shows the name + size; a non-video selection shows an inline error and does not call `onFile`.

- [ ] **Step 1: Write the failing test**

Create `web/src/components/assessments/VideoFilePicker.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { VideoFilePicker } from './VideoFilePicker'

function pick(input: HTMLElement, file: File) {
  Object.defineProperty(input, 'files', { value: [file], configurable: true })
  fireEvent.change(input)
}

describe('VideoFilePicker', () => {
  it('calls onFile and shows the filename for a video', () => {
    const onFile = vi.fn()
    render(<VideoFilePicker onFile={onFile} />)
    const input = screen.getByLabelText(/choose a video/i)
    pick(input, new File(['x'], 'tearfilm.mp4', { type: 'video/mp4' }))
    expect(onFile).toHaveBeenCalledOnce()
    expect(screen.getByText(/tearfilm.mp4/)).toBeInTheDocument()
  })

  it('rejects a non-video file with an inline error', () => {
    const onFile = vi.fn()
    render(<VideoFilePicker onFile={onFile} />)
    const input = screen.getByLabelText(/choose a video/i)
    pick(input, new File(['x'], 'notes.pdf', { type: 'application/pdf' }))
    expect(onFile).not.toHaveBeenCalled()
    expect(screen.getByText(/please choose a video file/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- VideoFilePicker`
Expected: FAIL — cannot resolve `./VideoFilePicker`.

- [ ] **Step 3: Write the component**

Create `web/src/components/assessments/VideoFilePicker.tsx`:

```tsx
'use client'
import { useState } from 'react'

function formatSize(bytes: number): string {
  const mb = bytes / (1024 * 1024)
  return `${mb.toFixed(1)} MB`
}

export function VideoFilePicker({ onFile }: { onFile: (file: File) => void }) {
  const [chosen, setChosen] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('video/')) {
      setError('Please choose a video file.')
      setChosen(null)
      return
    }
    setError(null)
    setChosen(file)
    onFile(file)
  }

  return (
    <div className="space-y-3">
      <label htmlFor="video-file" className="block cursor-pointer rounded-lg border-2 border-dashed border-border px-6 py-10 text-center text-sm font-medium hover:border-teal-300">
        Choose a video to upload
        <input id="video-file" type="file" accept="video/*" className="sr-only" onChange={handleChange} />
      </label>
      {chosen && (
        <p className="text-sm text-muted-foreground">
          {chosen.name} <span className="tabular-nums">({formatSize(chosen.size)})</span>
        </p>
      )}
      {error && <p className="text-sm text-red-500">{error}</p>}
    </div>
  )
}
```

- [ ] **Step 4: Run test + typecheck**

Run: `npm run test -- VideoFilePicker` → PASS. Run: `npm run typecheck` → clean.

- [ ] **Step 5: Commit**

```bash
git add web/src/components/assessments/VideoFilePicker.tsx web/src/components/assessments/VideoFilePicker.test.tsx
git commit -m "feat(web-upload): video file picker"
```

---

## Task 5: UploadReviewStep

**Files:**
- Create: `web/src/components/assessments/UploadReviewStep.tsx`
- Test: `web/src/components/assessments/UploadReviewStep.test.tsx`

**Interfaces:**
- Consumes: `VideoReviewPlayer` (`@/components/player/VideoReviewPlayer`), `CapturedFrame` (`@/components/player/useVideoFrame`).
- Produces: `UploadReviewStep({ src, onCaptureFrame, onAuto, onManual, busy, error }: { src: string; onCaptureFrame: (f: CapturedFrame) => void; onAuto: () => void; onManual: () => void; busy?: boolean; error?: string | null })`. Renders the player (review mode) wired to `onCaptureFrame`, plus an "Auto-analyse" button (→ `onAuto`) and an "Enter manually" button (→ `onManual`), both disabled when `busy`.

- [ ] **Step 1: Write the failing test**

Create `web/src/components/assessments/UploadReviewStep.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { UploadReviewStep } from './UploadReviewStep'

vi.mock('@/components/player/VideoReviewPlayer', () => ({
  VideoReviewPlayer: ({ source }: { source: string }) => <div data-testid="player">{source}</div>,
}))

describe('UploadReviewStep', () => {
  it('renders the player on the given source', () => {
    render(<UploadReviewStep src="blob:abc" onCaptureFrame={vi.fn()} onAuto={vi.fn()} onManual={vi.fn()} />)
    expect(screen.getByTestId('player')).toHaveTextContent('blob:abc')
  })

  it('wires the auto and manual actions', async () => {
    const onAuto = vi.fn(); const onManual = vi.fn()
    render(<UploadReviewStep src="blob:abc" onCaptureFrame={vi.fn()} onAuto={onAuto} onManual={onManual} />)
    await userEvent.click(screen.getByRole('button', { name: /auto-analyse/i }))
    await userEvent.click(screen.getByRole('button', { name: /enter manually/i }))
    expect(onAuto).toHaveBeenCalledOnce()
    expect(onManual).toHaveBeenCalledOnce()
  })

  it('disables actions when busy', () => {
    render(<UploadReviewStep src="blob:abc" onCaptureFrame={vi.fn()} onAuto={vi.fn()} onManual={vi.fn()} busy />)
    expect(screen.getByRole('button', { name: /auto-analyse/i })).toBeDisabled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- UploadReviewStep`
Expected: FAIL — cannot resolve `./UploadReviewStep`.

- [ ] **Step 3: Write the component**

Create `web/src/components/assessments/UploadReviewStep.tsx`:

```tsx
'use client'
import { Button } from '@/components/ui/button'
import { VideoReviewPlayer } from '@/components/player/VideoReviewPlayer'
import type { CapturedFrame } from '@/components/player/useVideoFrame'

interface Props {
  src: string
  onCaptureFrame: (f: CapturedFrame) => void
  onAuto: () => void
  onManual: () => void
  busy?: boolean
  error?: string | null
}

export function UploadReviewStep({ src, onCaptureFrame, onAuto, onManual, busy, error }: Props) {
  return (
    <div className="space-y-4">
      <VideoReviewPlayer source={src} mode="review" onCaptureFrame={onCaptureFrame} />
      {error && <p className="text-sm text-red-500">{error}</p>}
      <div className="flex gap-3">
        <Button type="button" variant="outline" className="flex-1" onClick={onManual} disabled={busy}>
          Enter manually
        </Button>
        <Button type="button" className="flex-1 bg-teal-600 hover:bg-teal-700" onClick={onAuto} disabled={busy}>
          {busy ? 'Uploading…' : 'Auto-analyse'}
        </Button>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run test + typecheck**

Run: `npm run test -- UploadReviewStep` → PASS. Run: `npm run typecheck` → clean.

- [ ] **Step 5: Commit**

```bash
git add web/src/components/assessments/UploadReviewStep.tsx web/src/components/assessments/UploadReviewStep.test.tsx
git commit -m "feat(web-upload): review step wrapping the video player"
```

---

## Task 6: ProcessingStep

**Files:**
- Create: `web/src/components/assessments/ProcessingStep.tsx`
- Test: `web/src/components/assessments/ProcessingStep.test.tsx`

**Interfaces:**
- Consumes: `useCaptureStatus` (Task 3).
- Produces: `ProcessingStep({ captureId, onAnalysed }: { captureId: number; onAnalysed: () => void })`. Shows a "Processing…" state; calls `onAnalysed()` once status becomes `analysed`; shows a failure message when status is `failed`.

- [ ] **Step 1: Write the failing test**

Create `web/src/components/assessments/ProcessingStep.test.tsx`:

```tsx
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import * as hooks from '@/hooks/useCaptures'
import { ProcessingStep } from './ProcessingStep'

beforeEach(() => { vi.restoreAllMocks() })

describe('ProcessingStep', () => {
  it('calls onAnalysed when status becomes analysed', async () => {
    vi.spyOn(hooks, 'useCaptureStatus').mockReturnValue({ data: { id: 9, status: 'analysed' } } as never)
    const onAnalysed = vi.fn()
    render(<ProcessingStep captureId={9} onAnalysed={onAnalysed} />)
    await waitFor(() => expect(onAnalysed).toHaveBeenCalledOnce())
  })

  it('shows a failure message when status is failed', () => {
    vi.spyOn(hooks, 'useCaptureStatus').mockReturnValue({ data: { id: 9, status: 'failed' } } as never)
    render(<ProcessingStep captureId={9} onAnalysed={vi.fn()} />)
    expect(screen.getByText(/analysis failed/i)).toBeInTheDocument()
  })

  it('shows processing while pending', () => {
    vi.spyOn(hooks, 'useCaptureStatus').mockReturnValue({ data: { id: 9, status: 'processing' } } as never)
    render(<ProcessingStep captureId={9} onAnalysed={vi.fn()} />)
    expect(screen.getByText(/processing/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- ProcessingStep`
Expected: FAIL — cannot resolve `./ProcessingStep`.

- [ ] **Step 3: Write the component**

Create `web/src/components/assessments/ProcessingStep.tsx`:

```tsx
'use client'
import { useEffect } from 'react'
import { useCaptureStatus } from '@/hooks/useCaptures'

export function ProcessingStep({ captureId, onAnalysed }: { captureId: number; onAnalysed: () => void }) {
  const { data } = useCaptureStatus(captureId)
  const status = data?.status

  useEffect(() => {
    if (status === 'analysed') onAnalysed()
  }, [status, onAnalysed])

  if (status === 'failed') {
    return <p className="py-10 text-center text-sm text-red-500">Analysis failed. Please try again.</p>
  }

  return (
    <div className="py-10 text-center">
      <p className="text-sm font-medium">Processing…</p>
      <p className="mt-1 text-xs text-muted-foreground">Analysing the video. This can take a moment.</p>
    </div>
  )
}
```

- [ ] **Step 4: Run test + typecheck**

Run: `npm run test -- ProcessingStep` → PASS. Run: `npm run typecheck` → clean.

- [ ] **Step 5: Commit**

```bash
git add web/src/components/assessments/ProcessingStep.tsx web/src/components/assessments/ProcessingStep.test.tsx
git commit -m "feat(web-upload): processing/poll step"
```

---

## Task 7: UploadManualEntry

**Files:**
- Create: `web/src/components/assessments/UploadManualEntry.tsx`
- Test: `web/src/components/assessments/UploadManualEntry.test.tsx`

**Interfaces:**
- Produces: `UploadManualEntry({ testType, onSubmit, onBack, busy }: { testType: TestType; onSubmit: (fields: ManualResultFields) => void; onBack: () => void; busy?: boolean })`. For `nibut`: two numeric inputs (first break-up required, mean optional). For `fluorescein`/`lipid`: the relevant numeric inputs. Calls `onSubmit` with the entered numeric fields. `ManualResultFields` is the result-field subset (no assessment/test_type).
- Type `ManualResultFields = { nibut_first_breakup_seconds?: number; nibut_mean_breakup_seconds?: number; fluorescein_grade?: number; fluorescein_breakup_seconds?: number; lipid_grade?: number; lipid_thickness_nm?: number; tear_meniscus_height_mm?: number }`.

- [ ] **Step 1: Write the failing test**

Create `web/src/components/assessments/UploadManualEntry.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { UploadManualEntry } from './UploadManualEntry'

describe('UploadManualEntry', () => {
  it('submits the entered NIBUT first break-up time', async () => {
    const onSubmit = vi.fn()
    render(<UploadManualEntry testType="nibut" onSubmit={onSubmit} onBack={vi.fn()} />)
    await userEvent.type(screen.getByLabelText(/first break-up/i), '7.2')
    await userEvent.click(screen.getByRole('button', { name: /save/i }))
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ nibut_first_breakup_seconds: 7.2 }))
  })

  it('calls onBack', async () => {
    const onBack = vi.fn()
    render(<UploadManualEntry testType="nibut" onSubmit={vi.fn()} onBack={onBack} />)
    await userEvent.click(screen.getByRole('button', { name: /back/i }))
    expect(onBack).toHaveBeenCalledOnce()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- UploadManualEntry`
Expected: FAIL — cannot resolve `./UploadManualEntry`.

- [ ] **Step 3: Write the component**

Create `web/src/components/assessments/UploadManualEntry.tsx`:

```tsx
'use client'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import type { TestType } from '@shared/types/assessment'

export interface ManualResultFields {
  nibut_first_breakup_seconds?: number
  nibut_mean_breakup_seconds?: number
  fluorescein_grade?: number
  fluorescein_breakup_seconds?: number
  lipid_grade?: number
  lipid_thickness_nm?: number
  tear_meniscus_height_mm?: number
}

const FIELDS: Record<TestType, { name: keyof ManualResultFields; label: string; required?: boolean }[]> = {
  nibut: [
    { name: 'nibut_first_breakup_seconds', label: 'First break-up (s)', required: true },
    { name: 'nibut_mean_breakup_seconds', label: 'Mean break-up (s)' },
  ],
  fluorescein: [
    { name: 'fluorescein_grade', label: 'Oxford grade (0–5)' },
    { name: 'fluorescein_breakup_seconds', label: 'Break-up time (s)' },
  ],
  lipid: [
    { name: 'lipid_grade', label: 'Guillon grade (1–5)' },
    { name: 'lipid_thickness_nm', label: 'Thickness (nm)' },
    { name: 'tear_meniscus_height_mm', label: 'Tear meniscus (mm)' },
  ],
}

export function UploadManualEntry({ testType, onSubmit, onBack, busy }: {
  testType: TestType
  onSubmit: (fields: ManualResultFields) => void
  onBack: () => void
  busy?: boolean
}) {
  const [values, setValues] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const fields = FIELDS[testType]

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const out: ManualResultFields = {}
    for (const f of fields) {
      const raw = values[f.name]
      if (raw !== undefined && raw !== '') out[f.name] = Number(raw)
      else if (f.required) { setError(`${f.label} is required.`); return }
    }
    setError(null)
    onSubmit(out)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {fields.map((f) => (
        <div key={f.name}>
          <label htmlFor={f.name} className="mb-1 block text-sm font-medium">{f.label}</label>
          <input
            id={f.name}
            type="number"
            step="any"
            className="w-full rounded-md border border-border px-3 py-2 text-sm"
            value={values[f.name] ?? ''}
            onChange={(e) => setValues((p) => ({ ...p, [f.name]: e.target.value }))}
          />
        </div>
      ))}
      {error && <p className="text-sm text-red-500">{error}</p>}
      <div className="flex gap-3">
        <Button type="button" variant="outline" className="flex-1" onClick={onBack} disabled={busy}>Back</Button>
        <Button type="submit" className="flex-1 bg-teal-600 hover:bg-teal-700" disabled={busy}>
          {busy ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </form>
  )
}
```

- [ ] **Step 4: Run test + typecheck**

Run: `npm run test -- UploadManualEntry` → PASS. Run: `npm run typecheck` → clean.

- [ ] **Step 5: Commit**

```bash
git add web/src/components/assessments/UploadManualEntry.tsx web/src/components/assessments/UploadManualEntry.test.tsx
git commit -m "feat(web-upload): manual entry for the selected test type"
```

---

## Task 8: UploadAssessmentFlow orchestrator

**Files:**
- Create: `web/src/components/assessments/UploadAssessmentFlow.tsx`
- Test: `web/src/components/assessments/UploadAssessmentFlow.test.tsx`

**Interfaces:**
- Consumes: `useCreateAssessment` (`@/hooks/useAssessments`), `useUploadCapture`/`useUploadManualCapture`/`useCreateCaptureStill` (`@/hooks/useCaptures`), `VideoFilePicker`, `UploadReviewStep`, `UploadManualEntry`, `ProcessingStep`, `CapturedFrame`, `next/navigation` `useRouter`, `api` (for the complete-patch + report on the manual path).
- Produces: `UploadAssessmentFlow({ patientId, eye }: { patientId: number; eye: string })`. Internal phases: `pick-test → pick-file → review → manual | processing`. Creates the assessment once (cached), creates the capture (auto or manual), uploads held stills, and navigates to `/patients/{patientId}/assessments/{assessmentId}` (auto path navigates after `analysed`).

**Note on `URL.createObjectURL`:** jsdom does not implement it. The test stubs `URL.createObjectURL`/`revokeObjectURL`.

- [ ] **Step 1: Write the failing test**

Create `web/src/components/assessments/UploadAssessmentFlow.test.tsx`:

```tsx
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { makeWrapper } from '@/test/queryWrapper'

const push = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))

const createAssessment = vi.fn().mockResolvedValue({ id: 55 })
const uploadCapture = vi.fn().mockResolvedValue({ id: 9, status: 'processing' })
const uploadManual = vi.fn().mockResolvedValue({ id: 10 })
const createStill = vi.fn().mockResolvedValue({ id: 1 })
vi.mock('@/hooks/useAssessments', () => ({ useCreateAssessment: () => ({ mutateAsync: createAssessment }) }))
vi.mock('@/hooks/useCaptures', () => ({
  useUploadCapture: () => ({ mutateAsync: uploadCapture }),
  useUploadManualCapture: () => ({ mutateAsync: uploadManual }),
  useCreateCaptureStill: () => ({ mutateAsync: createStill }),
  useCaptureStatus: () => ({ data: { id: 9, status: 'analysed' } }),
}))
vi.mock('@/components/player/VideoReviewPlayer', () => ({
  VideoReviewPlayer: () => <div data-testid="player" />,
}))

import { UploadAssessmentFlow } from './UploadAssessmentFlow'

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('URL', { createObjectURL: () => 'blob:x', revokeObjectURL: () => {} })
})

function selectFile() {
  const input = screen.getByLabelText(/choose a video/i)
  Object.defineProperty(input, 'files', { value: [new File(['x'], 'v.mp4', { type: 'video/mp4' })], configurable: true })
  input.dispatchEvent(new Event('change', { bubbles: true }))
}

describe('UploadAssessmentFlow', () => {
  it('auto path: creates assessment + capture then navigates after analysed', async () => {
    render(<UploadAssessmentFlow patientId={3} eye="right" />, { wrapper: makeWrapper() })
    // pick-test default nibut → continue
    await userEvent.click(screen.getByRole('button', { name: /continue/i }))
    selectFile()
    await userEvent.click(await screen.findByRole('button', { name: /auto-analyse/i }))
    await waitFor(() => expect(createAssessment).toHaveBeenCalledWith({ patient: 3, eye: 'right' }))
    await waitFor(() => expect(uploadCapture).toHaveBeenCalledWith(expect.objectContaining({ assessment: 55, test_type: 'nibut' })))
    await waitFor(() => expect(push).toHaveBeenCalledWith('/patients/3/assessments/55'))
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- UploadAssessmentFlow`
Expected: FAIL — cannot resolve `./UploadAssessmentFlow`.

- [ ] **Step 3: Write the orchestrator**

Create `web/src/components/assessments/UploadAssessmentFlow.tsx`:

```tsx
'use client'
import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { api } from '@/lib/api'
import { useCreateAssessment } from '@/hooks/useAssessments'
import { useUploadCapture, useUploadManualCapture, useCreateCaptureStill } from '@/hooks/useCaptures'
import { VideoFilePicker } from './VideoFilePicker'
import { UploadReviewStep } from './UploadReviewStep'
import { ProcessingStep } from './ProcessingStep'
import { UploadManualEntry, type ManualResultFields } from './UploadManualEntry'
import type { CapturedFrame } from '@/components/player/useVideoFrame'
import type { TestType } from '@shared/types/assessment'

type Phase = 'pick-test' | 'pick-file' | 'review' | 'manual' | 'processing'
const TEST_TYPES: { value: TestType; label: string }[] = [
  { value: 'nibut', label: 'NIBUT' },
  { value: 'fluorescein', label: 'Fluorescein' },
  { value: 'lipid', label: 'Lipid layer' },
]

export function UploadAssessmentFlow({ patientId, eye }: { patientId: number; eye: string }) {
  const router = useRouter()
  const createAssessment = useCreateAssessment()
  const uploadCapture = useUploadCapture()
  const uploadManual = useUploadManualCapture()
  const createStill = useCreateCaptureStill()

  const [phase, setPhase] = useState<Phase>('pick-test')
  const [testType, setTestType] = useState<TestType>('nibut')
  const [src, setSrc] = useState<string>('')
  const [captureId, setCaptureId] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<File | null>(null)
  const stillsRef = useRef<CapturedFrame[]>([])
  const assessmentIdRef = useRef<number | null>(null)

  const ensureAssessment = async (): Promise<number> => {
    if (assessmentIdRef.current !== null) return assessmentIdRef.current
    const a = await createAssessment.mutateAsync({ patient: patientId, eye })
    assessmentIdRef.current = a.id
    return a.id
  }

  const uploadStills = async (id: number) => {
    await Promise.allSettled(stillsRef.current.map((f) =>
      createStill.mutateAsync({ captureId: id, image: f.image, timestamp_seconds: f.timestampSeconds })))
  }

  const detail = (id: number) => `/patients/${patientId}/assessments/${id}`

  const handleAuto = async () => {
    setBusy(true); setError(null)
    try {
      const assessment = await ensureAssessment()
      const capture = await uploadCapture.mutateAsync({ assessment, test_type: testType, video_file: fileRef.current! })
      setCaptureId(capture.id)
      await uploadStills(capture.id)
      setPhase('processing')
    } catch {
      setError('Upload failed. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  const handleManualSubmit = async (fields: ManualResultFields) => {
    setBusy(true); setError(null)
    try {
      const assessment = await ensureAssessment()
      const capture = await uploadManual.mutateAsync({ assessment, test_type: testType, video_file: fileRef.current!, ...fields })
      await uploadStills(capture.id)
      await api.patch(`assessments/${assessment}/`, { status: 'complete' })
      api.post('reports/generate/', { assessment }).catch(() => {})
      router.push(detail(assessment))
    } catch {
      setError('Saving failed. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  if (phase === 'pick-test') {
    return (
      <div className="space-y-5">
        <p className="text-sm font-medium">Which test is this video for?</p>
        <div className="flex gap-3">
          {TEST_TYPES.map((t) => (
            <button key={t.value} type="button" onClick={() => setTestType(t.value)}
              className={`flex-1 rounded-lg border-2 px-4 py-4 text-sm font-semibold transition-colors ${
                testType === t.value ? 'border-teal-600 bg-teal-50 text-teal-700' : 'border-border hover:border-teal-300'}`}>
              {t.label}
            </button>
          ))}
        </div>
        <Button type="button" className="w-full bg-teal-600 hover:bg-teal-700" onClick={() => setPhase('pick-file')}>Continue</Button>
      </div>
    )
  }

  if (phase === 'pick-file') {
    return <VideoFilePicker onFile={(file) => { fileRef.current = file; setSrc(URL.createObjectURL(file)); setPhase('review') }} />
  }

  if (phase === 'review') {
    return (
      <UploadReviewStep
        src={src}
        onCaptureFrame={(f) => stillsRef.current.push(f)}
        onAuto={handleAuto}
        onManual={() => setPhase('manual')}
        busy={busy}
        error={error}
      />
    )
  }

  if (phase === 'manual') {
    return <UploadManualEntry testType={testType} onSubmit={handleManualSubmit} onBack={() => setPhase('review')} busy={busy} />
  }

  // processing
  return <ProcessingStep captureId={captureId!} onAnalysed={() => router.push(detail(assessmentIdRef.current!))} />
}
```

- [ ] **Step 4: Run test + typecheck**

Run: `npm run test -- UploadAssessmentFlow` → PASS. Run: `npm run typecheck` → clean.

- [ ] **Step 5: Commit**

```bash
git add web/src/components/assessments/UploadAssessmentFlow.tsx web/src/components/assessments/UploadAssessmentFlow.test.tsx
git commit -m "feat(web-upload): upload assessment flow orchestrator"
```

---

## Task 9: Wire the entry-mode branch into the stepper

**Files:**
- Modify: `web/src/components/assessments/NewAssessmentStepper.tsx`
- Test: `web/src/components/assessments/NewAssessmentStepper.test.tsx`

**Interfaces:**
- Consumes: `UploadAssessmentFlow` (Task 8); the existing steps.
- Produces: after `StepEye`, an entry-mode choice ("Upload a video" / "Enter results manually"); manual → existing steps; upload → `UploadAssessmentFlow` with the chosen `eye`.

- [ ] **Step 1: Write the failing test**

Create `web/src/components/assessments/NewAssessmentStepper.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { makeWrapper } from '@/test/queryWrapper'

vi.mock('./UploadAssessmentFlow', () => ({ UploadAssessmentFlow: () => <div data-testid="upload-flow" /> }))

import { NewAssessmentStepper } from './NewAssessmentStepper'

describe('NewAssessmentStepper entry mode', () => {
  it('after eye, choosing Upload shows the upload flow', async () => {
    render(<NewAssessmentStepper patientId={3} />, { wrapper: makeWrapper() })
    // StepEye: choose right eye then continue
    await userEvent.click(screen.getByRole('button', { name: /right eye/i }))
    await userEvent.click(screen.getByRole('button', { name: /continue/i }))
    // Entry-mode choice appears
    await userEvent.click(screen.getByRole('button', { name: /upload a video/i }))
    expect(screen.getByTestId('upload-flow')).toBeInTheDocument()
  })

  it('after eye, choosing Manual shows the NIBUT step', async () => {
    render(<NewAssessmentStepper patientId={3} />, { wrapper: makeWrapper() })
    await userEvent.click(screen.getByRole('button', { name: /right eye/i }))
    await userEvent.click(screen.getByRole('button', { name: /continue/i }))
    await userEvent.click(screen.getByRole('button', { name: /enter results manually/i }))
    expect(screen.getByText(/first break-up/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- NewAssessmentStepper`
Expected: FAIL — no entry-mode choice exists yet (the upload button isn't found).

- [ ] **Step 3: Modify the stepper**

In `web/src/components/assessments/NewAssessmentStepper.tsx`, add the import and a mode state, and render the entry-mode choice / upload flow. Apply these changes:

Add imports near the top:

```tsx
import { UploadAssessmentFlow } from './UploadAssessmentFlow'
```

Add a mode state alongside the existing `useState`s:

```tsx
  const [mode, setMode] = useState<'choose' | 'manual' | 'upload'>('choose')
```

Replace the eye step's `onNext` so it stops at the mode choice instead of jumping to NIBUT, and add the mode-choice + upload branches. Specifically, replace the block from `{step === 0 && (` through the end of the `{step === 1 && (` … existing steps with this structure (keep steps 1–4 exactly as they are; only the eye `onNext` and the new branches change):

```tsx
      {step === 0 && (
        <StepEye
          defaultValues={data.eye}
          onNext={(d) => { setData((p) => ({ ...p, eye: d })); setStep(1); setMode('choose') }}
        />
      )}

      {step === 1 && mode === 'choose' && data.eye && (
        <div className="space-y-4">
          <p className="text-sm font-medium">How do you want to record this assessment?</p>
          <div className="flex gap-3">
            <button type="button" onClick={() => setMode('upload')}
              className="flex-1 rounded-lg border-2 border-border px-4 py-6 text-sm font-semibold hover:border-teal-300">
              Upload a video
            </button>
            <button type="button" onClick={() => setMode('manual')}
              className="flex-1 rounded-lg border-2 border-border px-4 py-6 text-sm font-semibold hover:border-teal-300">
              Enter results manually
            </button>
          </div>
          <button type="button" onClick={() => setStep(0)} className="text-xs text-muted-foreground underline">Back</button>
        </div>
      )}

      {step === 1 && mode === 'upload' && data.eye && (
        <UploadAssessmentFlow patientId={patientId} eye={data.eye.eye} />
      )}

      {step === 1 && mode === 'manual' && (
        <StepNibut
          defaultValues={data.nibut}
          onNext={(d) => { setData((p) => ({ ...p, nibut: d })); setStep(2) }}
          onBack={() => { setMode('choose') }}
        />
      )}
```

Leave steps 2, 3, 4 unchanged. (The progress indicator may show all five labels; that is acceptable — the manual path still walks NIBUT→Review, and the upload path replaces the body. No further change required for this slice.)

- [ ] **Step 4: Run test + full suite + typecheck**

Run: `npm run test -- NewAssessmentStepper` → PASS.
Run: `npm run test` → whole web suite green (no regressions).
Run: `npm run typecheck` → clean.

- [ ] **Step 5: Commit**

```bash
git add web/src/components/assessments/NewAssessmentStepper.tsx web/src/components/assessments/NewAssessmentStepper.test.tsx
git commit -m "feat(web-upload): entry-mode branch (upload vs manual) in the stepper"
```

---

## Manual / demo verification (after Task 9)

Not automated. Run the web app, start a new assessment, pick an eye, choose **Upload a video**, pick a real ~25s clip, and confirm: the player renders and slow-mo/scrub/frame-step work; **Auto-analyse** uploads and shows Processing then lands on the assessment detail when analysis completes; **Enter manually** records the NIBUT value with the video attached; captured frames appear as stills on the capture. Confirm the **Enter results manually** mode still walks the original NIBUT→Review stepper unchanged.

---

## Self-Review (completed by plan author)

**Spec coverage:**
- Entry-mode choice after eye → Task 9. ✓
- `UploadAssessmentFlow` (pick-test → file → review → auto/manual) → Task 8. ✓
- `postMultipart` → Task 1. ✓ Shared types (source/stills/CaptureStill) → Task 1. ✓
- Hooks: upload/manual/stills → Task 2; status poll → Task 3. ✓
- VideoFilePicker (video/* validation) → Task 4. ✓ UploadReviewStep (player + auto/manual) → Task 5. ✓ ProcessingStep (poll, analysed/failed) → Task 6. ✓ UploadManualEntry (selected test type) → Task 7. ✓
- Data flow: assessment once + reused; auto → capture → stills → poll → navigate; manual → capture(video) → stills → complete+report → navigate → Task 8. ✓
- Stills captured during review, uploaded after capture id exists, non-fatal (Promise.allSettled) → Task 8. ✓
- Error handling: file-picker reject (Task 4), upload/save error inline (Tasks 5/8), poll failure (Task 6), player onError (player B). ✓
- Out of scope honored: no chunked upload/size cap (only `video/*`); manual branch = selected test type only; no filmstrip; no backend change. ✓

**Placeholder scan:** none — every step has concrete code/commands.

**Type consistency:** `postMultipart(path, fields: Record<string,string|Blob>)` defined in Task 1, used in Tasks 2/8. Hook input shapes (`{assessment, test_type, video_file}`, `{captureId, image, timestamp_seconds, label?}`) defined in Task 2, consumed in Task 8. `ManualResultFields` defined in Task 7, consumed in Task 8. `CapturedFrame` (`image`, `timestampSeconds`) used consistently (Tasks 5/8). `useCaptureStatus(captureId)` defined Task 3, consumed Tasks 6/8. Navigation path `/patients/{patientId}/assessments/{id}` consistent with `StepReview`.
