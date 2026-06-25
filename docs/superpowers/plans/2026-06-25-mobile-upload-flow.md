# Mobile Capture+Upload Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a convergent mobile capture+upload flow — a Take/Upload front door, gallery picker, a shared review screen (player + auto-analyse | manual + stills) on BOTH the camera and upload paths, poll-only processing with a cap, a compact player + download on results — plus the same results-video view+download on web.

**Architecture:** A new `acquire.tsx` front door after `select-test`, and a `review.tsx` orchestrator screen (mirrors web's `UploadAssessmentFlow`) that holds captured stills and owns the auto/manual decision before navigating out. `capture.tsx` re-points to `review`; `processing.tsx` becomes poll-only. New capture hooks mirror web's. The slice-1 `MobileVideoReviewPlayer` is reused (review mode on the review screen, compact on results). Web's assessment-detail page reuses its existing `VideoReviewPlayer` in compact mode.

**Tech Stack:** React Native 0.76.9 / Expo SDK 52, TypeScript (strict), expo-router, expo-image-picker, expo-video(-thumbnails) (slice 1), TanStack Query; tests via jest-expo + @testing-library/react-native (mobile) and vitest + @testing-library/react (web).

## Global Constraints

- **Mobile commands run from `/opt/tearflex/mobile`** (test `npm test -- <pattern>`, typecheck `npm run typecheck`). **Web commands run from `/opt/tearflex/web`** (test `npm run test -- <pattern>`, typecheck `npm run typecheck`). Both `tsc --noEmit` must stay clean.
- **Backend contract (sub-project A, on master):** auto `POST assessments/captures/` `{assessment, test_type, source, video_file}` → `{id, status}`; manual `POST assessments/captures/manual/` `{assessment, test_type, source, video_file, ...result}` → capture; stills `POST assessments/captures/{id}/stills/` multipart `image, timestamp_seconds, label?`; poll `GET assessments/captures/{id}/status/` → `{status, ...}`. API paths: NO leading slash, WITH trailing slash. `source`: camera→`'mobile'`, upload→`'upload'`.
- **Mobile `api.postMultipart(path, fields, file, fileField?)`** sends ONE file as RN FormData `{uri,name,type}`. It currently hardcodes the form field name `'video_file'`; Task 1 generalizes it with a `fileField` param (default `'video_file'`) so stills can send field `'image'`.
- **Styling: match the file's siblings.** App screens under `mobile/app/assessment/` use NativeWind `className` (e.g. `select-test.tsx`); some components/screens use `StyleSheet` (`processing.tsx`, the slice-1 player). New SCREENS (`acquire.tsx`, `review.tsx`) and `ManualEntry.tsx` use NativeWind `className`. When MODIFYING `processing.tsx`/`results.tsx`, follow their existing `StyleSheet`/inline approach. Teal-600 `#0E7C7B` primary, slate palette per the design system.
- **jest-expo harness drops `className`-derived styles** (the nativewind jsx-runtime is mapped away). Tests MUST assert on accessibility labels / text / behavior, NEVER on `className`-derived styles.
- **`CaptureSource`** type lives in `@shared/types/assessment` (`'mobile' | 'upload' | 'manual'`). Use it; don't redefine.
- One acquired video = one capture for the selected test type. Assessment is created once in `select-test` and reused on retry (never recreated). Stills upload is non-fatal (`Promise.allSettled`), never blocks navigation. Manual entry handles the selected test type only.

## File Structure

```
mobile/lib/api.ts                              # MODIFY: postMultipart gains fileField param
mobile/hooks/useCapture.ts                     # MODIFY: add `source` to upload
mobile/hooks/useCaptures.ts                    # NEW: useUploadManualCapture, useCreateCaptureStill, useCaptureStatus
mobile/components/assessments/ManualEntry.tsx  # NEW
mobile/app/assessment/acquire.tsx              # NEW (Take/Upload + image picker)
mobile/app/assessment/review.tsx               # NEW (orchestrator)
mobile/app/assessment/processing.tsx           # MODIFY: poll-only + cap + retry→review
mobile/app/assessment/capture.tsx              # MODIFY: replace-to-review (+ source)
mobile/app/assessment/select-test.tsx          # MODIFY: navigate to acquire
mobile/app/assessment/results.tsx              # MODIFY: compact player + Save/Share .mp4
web/src/app/(dashboard)/patients/[id]/assessments/[assessmentId]/page.tsx  # MODIFY: compact player + Download .mp4
```

---

## Task 1: Generalize `api.postMultipart` file field name

**Files:**
- Modify: `mobile/lib/api.ts` (the `postMultipart` method)
- Test: `mobile/lib/api.postMultipart.test.ts`

**Interfaces:**
- Produces: `api.postMultipart<T>(path, fields: Record<string,string>, file: {uri,name,type}, fileField?: string): Promise<T>` — appends the file under `fileField` (default `'video_file'`).

- [ ] **Step 1: Write the failing test**

Create `mobile/lib/api.postMultipart.test.ts`:
```ts
jest.mock('./secureTokens', () => ({
  getTokens: jest.fn().mockResolvedValue({ access: 'tok', refresh: 'r' }),
  setTokens: jest.fn(), clearTokens: jest.fn(),
}))
import { api } from './api'

describe('api.postMultipart fileField', () => {
  let appendSpy: jest.SpyInstance
  beforeEach(() => {
    appendSpy = jest.spyOn(FormData.prototype, 'append')
    // @ts-expect-error test stub
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 201, json: async () => ({ id: 1 }) })
  })
  afterEach(() => { appendSpy.mockRestore(); jest.restoreAllMocks() })

  it('defaults the file field to video_file', async () => {
    await api.postMultipart('assessments/captures/', { assessment: '3' }, { uri: 'file://v.mp4', name: 'v.mp4', type: 'video/mp4' })
    expect(appendSpy).toHaveBeenCalledWith('video_file', expect.anything())
  })

  it('uses the given file field name (image for stills)', async () => {
    await api.postMultipart('assessments/captures/9/stills/', { timestamp_seconds: '8.2' }, { uri: 'file://s.jpg', name: 's.jpg', type: 'image/jpeg' }, 'image')
    expect(appendSpy).toHaveBeenCalledWith('image', expect.anything())
    expect(appendSpy).toHaveBeenCalledWith('timestamp_seconds', '8.2')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- api.postMultipart`
Expected: FAIL — the second test fails (`image` never appended; field is hardcoded `video_file`).

- [ ] **Step 3: Generalize the method**

In `mobile/lib/api.ts`, change the `postMultipart` signature and the file append. Replace:
```ts
  postMultipart: async <T>(
    path: string,
    fields: Record<string, string>,
    file: { uri: string; name: string; type: string },
  ): Promise<T> => {
```
with:
```ts
  postMultipart: async <T>(
    path: string,
    fields: Record<string, string>,
    file: { uri: string; name: string; type: string },
    fileField: string = 'video_file',
  ): Promise<T> => {
```
and replace the file-append line:
```ts
    formData.append('video_file', { uri: file.uri, name: file.name, type: file.type } as unknown as Blob);
```
with:
```ts
    formData.append(fileField, { uri: file.uri, name: file.name, type: file.type } as unknown as Blob);
```

- [ ] **Step 4: Run test + typecheck**

Run: `npm test -- api.postMultipart` → PASS. Run: `npm run typecheck` → clean.

- [ ] **Step 5: Commit**

```bash
git add mobile/lib/api.ts mobile/lib/api.postMultipart.test.ts
git commit -m "feat(mobile-upload): postMultipart accepts a file field name (for stills)"
```

---

## Task 2: Capture hooks — auto + manual + stills

**Files:**
- Create: `mobile/hooks/useCaptures.ts`
- Test: `mobile/hooks/useCaptures.test.tsx`

**Interfaces:**
- Consumes: `api.postMultipart` (Task 1).
- Produces (all mutation hooks returning `{ mutateAsync }`):
  - `useUploadCapture()` → posts `assessments/captures/` with `source` (video as `video_file`) → `{ id, status }`.
  - `useUploadManualCapture()` → posts `assessments/captures/manual/` (video as `video_file`) → `{ id }`.
  - `useCreateCaptureStill()` → posts `assessments/captures/{id}/stills/` (frame as `image`) → `{ id }`.
- Note: the existing stateful `useCapture` hook is left untouched and becomes unused after Task 8 (Task 7 stops calling it). The orchestrator uses `useUploadCapture` because it returns the new capture id synchronously (the stateful hook only stores it in state). Do NOT modify `useCapture`.

- [ ] **Step 1: Write the failing test**

Create `mobile/hooks/useCaptures.test.tsx`:
```tsx
import { renderHook, waitFor } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { api } from '@/lib/api'
import { useUploadCapture, useUploadManualCapture, useCreateCaptureStill } from './useCaptures'

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

beforeEach(() => { jest.restoreAllMocks() })

it('useUploadCapture posts to the auto endpoint with source', async () => {
  const spy = jest.spyOn(api, 'postMultipart').mockResolvedValue({ id: 9, status: 'processing' } as never)
  const { result } = renderHook(() => useUploadCapture(), { wrapper })
  await result.current.mutateAsync({ assessmentId: 3, testType: 'nibut', source: 'upload', videoUri: 'file://v.mp4' })
  expect(spy).toHaveBeenCalledWith(
    'assessments/captures/',
    { assessment: '3', test_type: 'nibut', source: 'upload' },
    { uri: 'file://v.mp4', name: 'capture.mp4', type: 'video/mp4' },
  )
})

it('useUploadManualCapture posts video + source + result fields to the manual endpoint', async () => {
  const spy = jest.spyOn(api, 'postMultipart').mockResolvedValue({ id: 10 } as never)
  const { result } = renderHook(() => useUploadManualCapture(), { wrapper })
  await result.current.mutateAsync({ assessmentId: 3, testType: 'nibut', source: 'upload', videoUri: 'file://v.mp4', results: { nibut_first_breakup_seconds: 7.2 } })
  expect(spy).toHaveBeenCalledWith(
    'assessments/captures/manual/',
    { assessment: '3', test_type: 'nibut', source: 'upload', nibut_first_breakup_seconds: '7.2' },
    { uri: 'file://v.mp4', name: 'capture.mp4', type: 'video/mp4' },
  )
})

it('useCreateCaptureStill posts the frame under field image', async () => {
  const spy = jest.spyOn(api, 'postMultipart').mockResolvedValue({ id: 1 } as never)
  const { result } = renderHook(() => useCreateCaptureStill(), { wrapper })
  await result.current.mutateAsync({ captureId: 9, frameUri: 'file://s.jpg', timestampSeconds: 8.2, label: 'first_breakup' })
  expect(spy).toHaveBeenCalledWith(
    'assessments/captures/9/stills/',
    { timestamp_seconds: '8.2', label: 'first_breakup' },
    { uri: 'file://s.jpg', name: 'still.jpg', type: 'image/jpeg' },
    'image',
  )
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- useCaptures`
Expected: FAIL — cannot resolve `./useCaptures`.

- [ ] **Step 3: Write the hooks**

Create `mobile/hooks/useCaptures.ts`:
```ts
import { useMutation } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { TestType } from '@shared/types/assessment'

type Source = 'mobile' | 'upload'

interface AutoInput {
  assessmentId: number
  testType: TestType
  source: Source
  videoUri: string
}

export function useUploadCapture() {
  return useMutation({
    mutationFn: (input: AutoInput) => api.postMultipart<{ id: number; status: string }>(
      'assessments/captures/',
      { assessment: String(input.assessmentId), test_type: input.testType, source: input.source },
      { uri: input.videoUri, name: 'capture.mp4', type: 'video/mp4' },
    ),
  })
}

interface ManualInput {
  assessmentId: number
  testType: TestType
  source: Source
  videoUri: string
  results: Record<string, number>
}

export function useUploadManualCapture() {
  return useMutation({
    mutationFn: (input: ManualInput) => {
      const fields: Record<string, string> = {
        assessment: String(input.assessmentId),
        test_type: input.testType,
        source: input.source,
      }
      for (const [k, v] of Object.entries(input.results)) {
        if (v !== undefined && v !== null) fields[k] = String(v)
      }
      return api.postMultipart<{ id: number }>(
        'assessments/captures/manual/',
        fields,
        { uri: input.videoUri, name: 'capture.mp4', type: 'video/mp4' },
      )
    },
  })
}

interface StillInput {
  captureId: number
  frameUri: string
  timestampSeconds: number
  label?: string
}

export function useCreateCaptureStill() {
  return useMutation({
    mutationFn: (input: StillInput) => {
      const fields: Record<string, string> = { timestamp_seconds: String(input.timestampSeconds) }
      if (input.label) fields.label = input.label
      return api.postMultipart<{ id: number }>(
        `assessments/captures/${input.captureId}/stills/`,
        fields,
        { uri: input.frameUri, name: 'still.jpg', type: 'image/jpeg' },
        'image',
      )
    },
  })
}
```

- [ ] **Step 4: Run test + typecheck**

Run: `npm test -- useCaptures` → PASS. Run: `npm run typecheck` → clean.

- [ ] **Step 5: Commit**

```bash
git add mobile/hooks/useCaptures.ts mobile/hooks/useCaptures.test.tsx
git commit -m "feat(mobile-upload): auto/manual-capture + stills hooks"
```

---

## Task 3: `useCaptureStatus` poll hook with 2-minute cap

**Files:**
- Modify: `mobile/hooks/useCaptures.ts` (add `useCaptureStatus`)
- Test: `mobile/hooks/useCaptureStatus.test.tsx`

**Interfaces:**
- Consumes: `api.get`.
- Produces: `useCaptureStatus(captureId: number | null, timeoutMs?: number)` → TanStack query result augmented with `isTimedOut: boolean`. Polls `assessments/captures/{id}/status/` every 2000ms while status ∉ {analysed, failed}, stops at those OR after `timeoutMs` (default 120000).

- [ ] **Step 1: Write the failing test**

Create `mobile/hooks/useCaptureStatus.test.tsx`:
```tsx
import { renderHook, waitFor } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { api } from '@/lib/api'
import { useCaptureStatus } from './useCaptures'

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}
beforeEach(() => { jest.restoreAllMocks() })

it('fetches status for a captureId', async () => {
  jest.spyOn(api, 'get').mockResolvedValue({ status: 'analysed' } as never)
  const { result } = renderHook(() => useCaptureStatus(9), { wrapper })
  await waitFor(() => expect(result.current.data?.status).toBe('analysed'))
  expect(api.get).toHaveBeenCalledWith('assessments/captures/9/status/')
})

it('is disabled when captureId is null', () => {
  const spy = jest.spyOn(api, 'get').mockResolvedValue({ status: 'x' } as never)
  renderHook(() => useCaptureStatus(null), { wrapper })
  expect(spy).not.toHaveBeenCalled()
})

it('reports isTimedOut once the cap elapses while still processing', async () => {
  jest.spyOn(api, 'get').mockResolvedValue({ status: 'processing' } as never)
  const { result, rerender } = renderHook(() => useCaptureStatus(9, 50), { wrapper })
  await waitFor(() => expect(result.current.data?.status).toBe('processing'))
  await new Promise((r) => setTimeout(r, 70))
  rerender({})
  expect(result.current.isTimedOut).toBe(true)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- useCaptureStatus`
Expected: FAIL — `useCaptureStatus` is not exported.

- [ ] **Step 3: Add the hook**

Append to `mobile/hooks/useCaptures.ts`:
```ts
import { useQuery } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'

const POLL_INTERVAL_MS = 2000
const POLL_TIMEOUT_MS = 120000

interface StatusResponse { status: string }

export function useCaptureStatus(captureId: number | null, timeoutMs: number = POLL_TIMEOUT_MS) {
  const startRef = useRef<number | null>(null)
  useEffect(() => { startRef.current = captureId === null ? null : Date.now() }, [captureId])

  const query = useQuery({
    queryKey: ['capture-status', captureId],
    enabled: captureId !== null,
    queryFn: () => api.get<StatusResponse>(`assessments/captures/${captureId}/status/`),
    refetchInterval: (q) => {
      const s = q.state.data?.status
      if (s === 'analysed' || s === 'failed') return false
      if (startRef.current !== null && Date.now() - startRef.current >= timeoutMs) return false
      return POLL_INTERVAL_MS
    },
  })
  const s = query.data?.status
  const isTimedOut = s !== 'analysed' && s !== 'failed' && startRef.current !== null && Date.now() - startRef.current >= timeoutMs
  return { ...query, isTimedOut }
}
```
(Merge the `import { useMutation } ...` and new `import { useQuery }` lines as appropriate — keep one import from `@tanstack/react-query`.)

- [ ] **Step 4: Run test + typecheck**

Run: `npm test -- useCaptureStatus` → PASS. Run: `npm run typecheck` → clean.

- [ ] **Step 5: Commit**

```bash
git add mobile/hooks/useCaptures.ts mobile/hooks/useCaptureStatus.test.tsx
git commit -m "feat(mobile-upload): capture status poll hook with 2-minute cap"
```

---

## Task 4: `ManualEntry` component

**Files:**
- Create: `mobile/components/assessments/ManualEntry.tsx`
- Test: `mobile/components/assessments/ManualEntry.test.tsx`

**Interfaces:**
- Produces: `ManualEntry({ testType, onSubmit, onBack, busy }: { testType: TestType; onSubmit: (f: ManualResultFields) => void; onBack: () => void; busy?: boolean })`; `ManualResultFields = { nibut_first_breakup_seconds?: number; nibut_mean_breakup_seconds?: number; fluorescein_grade?: number; fluorescein_breakup_seconds?: number; lipid_grade?: number; lipid_thickness_nm?: number; tear_meniscus_height_mm?: number }`. nibut first break-up required; others optional. Numeric `TextInput`s.

- [ ] **Step 1: Write the failing test**

Create `mobile/components/assessments/ManualEntry.test.tsx`:
```tsx
import { render, screen, fireEvent } from '@testing-library/react-native'
import { ManualEntry } from './ManualEntry'

it('submits the entered NIBUT first break-up value', () => {
  const onSubmit = jest.fn()
  render(<ManualEntry testType="nibut" onSubmit={onSubmit} onBack={() => {}} />)
  fireEvent.changeText(screen.getByLabelText('First break-up (s)'), '7.2')
  fireEvent.press(screen.getByLabelText('Save'))
  expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ nibut_first_breakup_seconds: 7.2 }))
})

it('blocks submit and shows an error when the required field is empty', () => {
  const onSubmit = jest.fn()
  render(<ManualEntry testType="nibut" onSubmit={onSubmit} onBack={() => {}} />)
  fireEvent.press(screen.getByLabelText('Save'))
  expect(onSubmit).not.toHaveBeenCalled()
  expect(screen.getByText(/required/i)).toBeOnTheScreen()
})

it('calls onBack', () => {
  const onBack = jest.fn()
  render(<ManualEntry testType="nibut" onSubmit={() => {}} onBack={onBack} />)
  fireEvent.press(screen.getByLabelText('Back'))
  expect(onBack).toHaveBeenCalledTimes(1)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- ManualEntry`
Expected: FAIL — cannot resolve `./ManualEntry`.

- [ ] **Step 3: Write the component**

Create `mobile/components/assessments/ManualEntry.tsx`:
```tsx
import { useState } from 'react'
import { View, Text, TextInput, TouchableOpacity } from 'react-native'
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

export function ManualEntry({ testType, onSubmit, onBack, busy }: {
  testType: TestType
  onSubmit: (f: ManualResultFields) => void
  onBack: () => void
  busy?: boolean
}) {
  const [values, setValues] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const fields = FIELDS[testType]

  const submit = () => {
    const out: ManualResultFields = {}
    for (const f of fields) {
      const raw = values[f.name]
      if (raw !== undefined && raw !== '' && !Number.isNaN(Number(raw))) out[f.name] = Number(raw)
      else if (f.required) { setError(`${f.label} is required.`); return }
    }
    setError(null)
    onSubmit(out)
  }

  return (
    <View className="gap-4">
      {fields.map((f) => (
        <View key={f.name}>
          <Text className="mb-1 text-sm font-medium text-slate-700">{f.label}</Text>
          <TextInput
            accessibilityLabel={f.label}
            keyboardType="decimal-pad"
            value={values[f.name] ?? ''}
            onChangeText={(t) => setValues((p) => ({ ...p, [f.name]: t }))}
            className="rounded-md border border-slate-300 px-3 py-2 text-base"
          />
        </View>
      ))}
      {error && <Text className="text-sm text-red-500">{error}</Text>}
      <View className="flex-row gap-3">
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Back" onPress={onBack} disabled={busy}
          className="flex-1 items-center rounded-md border border-slate-300 py-3">
          <Text className="font-semibold text-slate-700">Back</Text>
        </TouchableOpacity>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Save" onPress={submit} disabled={busy}
          className="flex-1 items-center rounded-md bg-teal-600 py-3">
          <Text className="font-semibold text-white">{busy ? 'Saving…' : 'Save'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}
```

- [ ] **Step 4: Run test + typecheck**

Run: `npm test -- ManualEntry` → PASS. Run: `npm run typecheck` → clean.

- [ ] **Step 5: Commit**

```bash
git add mobile/components/assessments/ManualEntry.tsx mobile/components/assessments/ManualEntry.test.tsx
git commit -m "feat(mobile-upload): manual entry form for the selected test type"
```

---

## Task 5: `acquire.tsx` front door + gallery picker

**Files:**
- Create: `mobile/app/assessment/acquire.tsx`
- Test: `mobile/app/assessment/acquire.test.tsx`

**Interfaces:**
- Consumes: `expo-image-picker`, `expo-router`.
- Produces: a screen reading `{ assessmentId, testType }`; "Take a video" → `router.push('/assessment/instructions', {assessmentId, testType})`; "Upload a video" → `launchImageLibraryAsync({mediaTypes:['videos']})` → on non-cancelled pick `router.push('/assessment/review', {assessmentId, testType, videoUri, source:'upload'})`; on cancel, no navigation.

- [ ] **Step 1: Install expo-image-picker**

Run: `npx expo install expo-image-picker`
(If `expo install` is unavailable, `npm install expo-image-picker`. If the install fails on network, STOP and report BLOCKED.)

- [ ] **Step 2: Write the failing test**

Create `mobile/app/assessment/acquire.test.tsx`:
```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native'

const push = jest.fn()
jest.mock('expo-router', () => ({
  useRouter: () => ({ push }),
  useLocalSearchParams: () => ({ assessmentId: '55', testType: 'nibut' }),
}))
const launch = jest.fn()
jest.mock('expo-image-picker', () => ({ launchImageLibraryAsync: (...a: any[]) => launch(...a) }))

import AcquireScreen from './acquire'

beforeEach(() => { jest.clearAllMocks() })

it('Take navigates to instructions', () => {
  render(<AcquireScreen />)
  fireEvent.press(screen.getByLabelText('Take a video'))
  expect(push).toHaveBeenCalledWith(expect.objectContaining({ pathname: '/assessment/instructions' }))
})

it('Upload picks a video then navigates to review with source=upload', async () => {
  launch.mockResolvedValue({ canceled: false, assets: [{ uri: 'file://picked.mp4' }] })
  render(<AcquireScreen />)
  fireEvent.press(screen.getByLabelText('Upload a video'))
  await waitFor(() => expect(push).toHaveBeenCalledWith(expect.objectContaining({
    pathname: '/assessment/review',
    params: expect.objectContaining({ assessmentId: '55', testType: 'nibut', videoUri: 'file://picked.mp4', source: 'upload' }),
  })))
})

it('Upload cancelled does not navigate', async () => {
  launch.mockResolvedValue({ canceled: true })
  render(<AcquireScreen />)
  fireEvent.press(screen.getByLabelText('Upload a video'))
  await waitFor(() => expect(launch).toHaveBeenCalled())
  expect(push).not.toHaveBeenCalled()
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- acquire`
Expected: FAIL — cannot resolve `./acquire`.

- [ ] **Step 4: Write the screen**

Create `mobile/app/assessment/acquire.tsx`:
```tsx
import { View, Text, TouchableOpacity } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter } from 'expo-router'
import * as ImagePicker from 'expo-image-picker'

export default function AcquireScreen() {
  const router = useRouter()
  const { assessmentId, testType } = useLocalSearchParams<{ assessmentId: string; testType: string }>()

  const take = () => router.push({ pathname: '/assessment/instructions', params: { assessmentId, testType } })

  const upload = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['videos'], quality: 1 })
    if (res.canceled || !res.assets?.[0]?.uri) return
    router.push({
      pathname: '/assessment/review',
      params: { assessmentId, testType, videoUri: res.assets[0].uri, source: 'upload' },
    })
  }

  return (
    <SafeAreaView className="flex-1 bg-slate-50 px-4">
      <Text className="mt-6 mb-2 text-xl font-bold text-slate-900">Add a video</Text>
      <Text className="mb-6 text-sm text-slate-600">Record a new video with the Placido attachment, or upload an existing one.</Text>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Take a video" onPress={take} activeOpacity={0.8}
        className="mb-3 items-center rounded-xl border-2 border-teal-600 bg-teal-50 py-6">
        <Text className="text-base font-semibold text-teal-700">Take a video</Text>
      </TouchableOpacity>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Upload a video" onPress={upload} activeOpacity={0.8}
        className="items-center rounded-xl border-2 border-slate-300 bg-white py-6">
        <Text className="text-base font-semibold text-slate-700">Upload a video</Text>
      </TouchableOpacity>
    </SafeAreaView>
  )
}
```

- [ ] **Step 5: Run test + typecheck**

Run: `npm test -- acquire` → PASS. Run: `npm run typecheck` → clean.

- [ ] **Step 6: Commit**

```bash
git add mobile/package.json mobile/package-lock.json mobile/app/assessment/acquire.tsx mobile/app/assessment/acquire.test.tsx
git commit -m "feat(mobile-upload): Take/Upload front door with gallery picker"
```

---

## Task 6: `review.tsx` orchestrator screen

**Files:**
- Create: `mobile/app/assessment/review.tsx`
- Test: `mobile/app/assessment/review.test.tsx`

**Interfaces:**
- Consumes: `MobileVideoReviewPlayer` (`@/components/player/MobileVideoReviewPlayer`), `CapturedFrame` (`@/components/player/types`), `useCapture`/`useUploadManualCapture`/`useCreateCaptureStill` (Tasks 2), `ManualEntry`/`ManualResultFields` (Task 4), `api`, `expo-router`.
- Produces: a screen reading `{ assessmentId, testType, videoUri, source }`. Phase `review`: player + Auto-analyse + Enter-manually. Phase `manual`: `ManualEntry`. Auto → create capture → upload stills → `router.replace(processing, {assessmentId, captureId, testType})`. Manual → manual capture → stills → PATCH complete + report → `router.replace(results, {captureId, testType})`.

**Note:** the orchestrator uses `useUploadCapture` (defined + tested in Task 2) for the auto path because `mutateAsync` returns the new `{ id }` synchronously, which it needs to navigate to processing. The stateful `useCapture` is not used here. No new hook is added in this task — all three capture hooks already exist from Task 2.

- [ ] **Step 1: Write the failing test**

Create `mobile/app/assessment/review.test.tsx`:
```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native'

const replace = jest.fn()
jest.mock('expo-router', () => ({
  useRouter: () => ({ replace }),
  useLocalSearchParams: () => ({ assessmentId: '55', testType: 'nibut', videoUri: 'file://v.mp4', source: 'upload' }),
}))
jest.mock('@/components/player/MobileVideoReviewPlayer', () => ({
  MobileVideoReviewPlayer: () => null,
}))
const uploadAuto = jest.fn().mockResolvedValue({ id: 9, status: 'processing' })
const uploadManual = jest.fn().mockResolvedValue({ id: 10 })
const createStill = jest.fn().mockResolvedValue({ id: 1 })
jest.mock('@/hooks/useCaptures', () => ({
  useUploadCapture: () => ({ mutateAsync: uploadAuto }),
  useUploadManualCapture: () => ({ mutateAsync: uploadManual }),
  useCreateCaptureStill: () => ({ mutateAsync: createStill }),
}))
const patch = jest.fn().mockResolvedValue({})
const post = jest.fn().mockResolvedValue({})
jest.mock('@/lib/api', () => ({ api: { patch: (...a: any[]) => patch(...a), post: (...a: any[]) => post(...a) } }))

import ReviewScreen from './review'
beforeEach(() => { jest.clearAllMocks() })

it('auto path: creates capture then navigates to processing', async () => {
  render(<ReviewScreen />)
  fireEvent.press(screen.getByLabelText('Auto-analyse'))
  await waitFor(() => expect(uploadAuto).toHaveBeenCalledWith(expect.objectContaining({ assessmentId: 55, testType: 'nibut', source: 'upload', videoUri: 'file://v.mp4' })))
  await waitFor(() => expect(replace).toHaveBeenCalledWith(expect.objectContaining({
    pathname: '/assessment/processing',
    params: expect.objectContaining({ assessmentId: '55', captureId: '9', testType: 'nibut' }),
  })))
})

it('manual path: records result, patches complete, navigates to results', async () => {
  render(<ReviewScreen />)
  fireEvent.press(screen.getByLabelText('Enter manually'))
  fireEvent.changeText(screen.getByLabelText('First break-up (s)'), '7.2')
  fireEvent.press(screen.getByLabelText('Save'))
  await waitFor(() => expect(uploadManual).toHaveBeenCalledWith(expect.objectContaining({ assessmentId: 55, source: 'upload', results: expect.objectContaining({ nibut_first_breakup_seconds: 7.2 }) })))
  await waitFor(() => expect(patch).toHaveBeenCalledWith('assessments/55/', { status: 'complete' }))
  await waitFor(() => expect(replace).toHaveBeenCalledWith(expect.objectContaining({ pathname: '/assessment/results' })))
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- review`
Expected: FAIL — cannot resolve `./review`.

- [ ] **Step 3: Write the screen**

Create `mobile/app/assessment/review.tsx`:
```tsx
import { useRef, useState } from 'react'
import { View, Text, TouchableOpacity, ScrollView } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { api } from '@/lib/api'
import { MobileVideoReviewPlayer } from '@/components/player/MobileVideoReviewPlayer'
import type { CapturedFrame } from '@/components/player/types'
import { ManualEntry, type ManualResultFields } from '@/components/assessments/ManualEntry'
import { useUploadCapture, useUploadManualCapture, useCreateCaptureStill } from '@/hooks/useCaptures'
import type { TestType } from '@shared/types/assessment'

type Phase = 'review' | 'manual'

export default function ReviewScreen() {
  const router = useRouter()
  const { assessmentId, testType, videoUri, source } = useLocalSearchParams<{
    assessmentId: string; testType: string; videoUri: string; source: string
  }>()
  const uploadAuto = useUploadCapture()
  const uploadManual = useUploadManualCapture()
  const createStill = useCreateCaptureStill()

  const [phase, setPhase] = useState<Phase>('review')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const stills = useRef<CapturedFrame[]>([])

  const aId = Number(assessmentId)
  const tType = testType as TestType
  const src = (source === 'mobile' ? 'mobile' : 'upload') as 'mobile' | 'upload'

  const uploadStills = async (captureId: number) => {
    await Promise.allSettled(stills.current.map((f) =>
      createStill.mutateAsync({ captureId, frameUri: f.uri, timestampSeconds: f.timestampSeconds })))
  }

  const handleAuto = async () => {
    setBusy(true); setError(null)
    try {
      const cap = await uploadAuto.mutateAsync({ assessmentId: aId, testType: tType, source: src, videoUri })
      await uploadStills(cap.id)
      router.replace({ pathname: '/assessment/processing', params: { assessmentId, captureId: String(cap.id), testType } })
    } catch {
      setError('Upload failed. Please try again.'); setBusy(false)
    }
  }

  const handleManual = async (fields: ManualResultFields) => {
    setBusy(true); setError(null)
    try {
      const cap = await uploadManual.mutateAsync({ assessmentId: aId, testType: tType, source: src, videoUri, results: fields })
      await uploadStills(cap.id)
      await api.patch(`assessments/${assessmentId}/`, { status: 'complete' })
      api.post('reports/generate/', { assessment: aId }).catch(() => {})
      router.replace({ pathname: '/assessment/results', params: { captureId: String(cap.id), testType } })
    } catch {
      setError('Saving failed. Please try again.'); setBusy(false)
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-slate-50">
      <ScrollView className="flex-1 px-4" contentContainerClassName="gap-4 py-4">
        <MobileVideoReviewPlayer source={videoUri} mode="review" onCaptureFrame={(f) => stills.current.push(f)} />
        {error && <Text className="text-sm text-red-500">{error}</Text>}
        {phase === 'review' ? (
          <View className="flex-row gap-3">
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Enter manually" onPress={() => setPhase('manual')} disabled={busy}
              className="flex-1 items-center rounded-md border border-slate-300 py-3">
              <Text className="font-semibold text-slate-700">Enter manually</Text>
            </TouchableOpacity>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Auto-analyse" onPress={handleAuto} disabled={busy}
              className="flex-1 items-center rounded-md bg-teal-600 py-3">
              <Text className="font-semibold text-white">{busy ? 'Uploading…' : 'Auto-analyse'}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <ManualEntry testType={tType} onSubmit={handleManual} onBack={() => setPhase('review')} busy={busy} />
        )}
      </ScrollView>
    </SafeAreaView>
  )
}
```

- [ ] **Step 4: Run test + typecheck**

Run: `npm test -- review` → PASS. Run: `npm run typecheck` → clean. (If `contentContainerClassName` is unsupported by the installed NativeWind, use `contentContainerStyle={{ gap: 16, padding: 16 }}` instead.)

- [ ] **Step 5: Commit**

```bash
git add mobile/app/assessment/review.tsx mobile/app/assessment/review.test.tsx
git commit -m "feat(mobile-upload): review orchestrator (auto/manual + stills)"
```

---

## Task 7: `processing.tsx` → poll-only + cap + retry-to-review

**Files:**
- Modify: `mobile/app/assessment/processing.tsx`
- Test: `mobile/app/assessment/processing.test.tsx`

**Interfaces:**
- Consumes: `useCaptureStatus` (Task 3).
- Produces: a screen reading `{ assessmentId, captureId, testType }`. It NO LONGER uploads — it polls via `useCaptureStatus(Number(captureId))`. Analysed → `router.replace(results, {captureId, testType})`. Failed OR `isTimedOut` → error state with Try again (→ `router.back()`, returns to review) + Cancel (→ tabs). Keeps the Android back-block during polling.

- [ ] **Step 1: Write the failing test**

Create `mobile/app/assessment/processing.test.tsx`:
```tsx
import { render, screen, waitFor } from '@testing-library/react-native'

const replace = jest.fn(); const back = jest.fn()
jest.mock('expo-router', () => ({
  useRouter: () => ({ replace, back }),
  useLocalSearchParams: () => ({ assessmentId: '55', captureId: '9', testType: 'nibut' }),
}))
const useCaptureStatus = jest.fn()
jest.mock('@/hooks/useCaptures', () => ({ useCaptureStatus: (...a: any[]) => useCaptureStatus(...a) }))

import ProcessingScreen from './processing'
beforeEach(() => { jest.clearAllMocks() })

it('navigates to results when analysed', async () => {
  useCaptureStatus.mockReturnValue({ data: { status: 'analysed' }, isTimedOut: false })
  render(<ProcessingScreen />)
  await waitFor(() => expect(replace).toHaveBeenCalledWith(expect.objectContaining({
    pathname: '/assessment/results', params: expect.objectContaining({ captureId: '9' }),
  })))
})

it('shows failure on failed status', () => {
  useCaptureStatus.mockReturnValue({ data: { status: 'failed' }, isTimedOut: false })
  render(<ProcessingScreen />)
  expect(screen.getByText(/failed|try again/i)).toBeOnTheScreen()
})

it('shows failure on timeout', () => {
  useCaptureStatus.mockReturnValue({ data: { status: 'processing' }, isTimedOut: true })
  render(<ProcessingScreen />)
  expect(screen.getByText(/try again|taking longer|timed out/i)).toBeOnTheScreen()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- app/assessment/processing`
Expected: FAIL — current `processing.tsx` uploads on mount and references `videoUri`; the new params/behavior don't match.

- [ ] **Step 3: Rewrite the screen**

Replace the body of `mobile/app/assessment/processing.tsx` so it polls only. Key changes: params become `{assessmentId, captureId, testType}`; remove the `useCapture`/`upload` logic and the `videoUri` guard; use `useCaptureStatus`; treat `isTimedOut` as a failure; Try again calls `router.back()`. Concretely:

```tsx
import { useEffect } from 'react';
import { View, Text, TouchableOpacity, BackHandler, StyleSheet, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCaptureStatus } from '@/hooks/useCaptures';

export default function ProcessingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { captureId, testType } = useLocalSearchParams<{ assessmentId: string; captureId: string; testType: string }>();
  const id = captureId ? Number(captureId) : null;
  const { data, isTimedOut } = useCaptureStatus(id);
  const status = data?.status;

  // Block Android back while still processing
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => status !== 'analysed' && status !== 'failed' && !isTimedOut);
    return () => sub.remove();
  }, [status, isTimedOut]);

  useEffect(() => {
    if (status === 'analysed' && id !== null) {
      router.replace({ pathname: '/assessment/results', params: { captureId: String(id), testType: testType ?? '' } });
    }
  }, [status, id, router, testType]);

  const isError = status === 'failed' || isTimedOut;

  if (isError) {
    return (
      <View style={styles.container}>
        <StatusBar hidden />
        <View style={[styles.content, { paddingTop: insets.top, paddingBottom: insets.bottom + 24 }]}>
          <View style={styles.errorIcon}><Text style={styles.errorIconText}>✕</Text></View>
          <Text style={styles.title}>{isTimedOut ? 'Still processing' : 'Analysis failed'}</Text>
          <Text style={styles.subtitle}>
            {isTimedOut ? 'This is taking longer than expected.' : 'Something went wrong.'} Please try again.
          </Text>
          <View style={styles.buttonGroup}>
            <TouchableOpacity style={styles.retryButton} onPress={() => router.back()} activeOpacity={0.8}>
              <Text style={styles.retryButtonText}>Try again</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.cancelButton} onPress={() => router.replace('/(tabs)/')} activeOpacity={0.8}>
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar hidden />
      <View style={[styles.content, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <ActivityIndicator size="large" color="#0E7C7B" />
        <Text style={styles.title}>Analysing tear film...</Text>
        <Text style={styles.subtitle}>Running analysis...</Text>
      </View>
    </View>
  );
}
```
Keep the existing `const styles = StyleSheet.create({...})` block at the bottom of the file unchanged (reuse all the existing style keys: container, content, title, subtitle, errorIcon, errorIconText, buttonGroup, retryButton, retryButtonText, cancelButton, cancelButtonText).

- [ ] **Step 4: Run test + typecheck**

Run: `npm test -- app/assessment/processing` → PASS. Run: `npm run typecheck` → clean.

- [ ] **Step 5: Commit**

```bash
git add mobile/app/assessment/processing.tsx mobile/app/assessment/processing.test.tsx
git commit -m "feat(mobile-upload): processing is poll-only with a cap and retry"
```

---

## Task 8: Rewire `select-test` → `acquire` and `capture` → `review`

**Files:**
- Modify: `mobile/app/assessment/select-test.tsx`
- Modify: `mobile/app/assessment/capture.tsx`
- Test: `mobile/app/assessment/flow-wiring.test.tsx`

**Interfaces:**
- Produces: `select-test` navigates to `/assessment/acquire` after creating the assessment; `capture` records then `router.replace('/assessment/review', {assessmentId, testType, videoUri, source:'mobile'})`.

- [ ] **Step 1: Write the failing test**

Create `mobile/app/assessment/flow-wiring.test.tsx`:
```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native'

const push = jest.fn()
jest.mock('expo-router', () => ({
  useRouter: () => ({ push, back: jest.fn() }),
  useLocalSearchParams: () => ({ patientId: '3' }),
}))
const mutateAsync = jest.fn().mockResolvedValue({ id: 55 })
jest.mock('@/hooks/useAssessments', () => ({ useCreateAssessment: () => ({ mutateAsync, isPending: false, isError: false }) }))

import SelectTestScreen from './select-test'
beforeEach(() => { jest.clearAllMocks() })

it('select-test navigates to acquire after creating the assessment', async () => {
  render(<SelectTestScreen />)
  fireEvent.press(screen.getByText('Right Eye'))
  fireEvent.press(screen.getByText('NIBUT'))
  fireEvent.press(screen.getByText('Continue'))
  await waitFor(() => expect(push).toHaveBeenCalledWith(expect.objectContaining({
    pathname: '/assessment/acquire',
    params: expect.objectContaining({ assessmentId: '55', testType: 'nibut' }),
  })))
})
```
(The `capture.tsx` change — `replace` target → `/assessment/review` with `source:'mobile'` — is verified by reading the diff in review; a full camera-render test needs the camera mock and is covered by manual device verification. Do NOT add a brittle camera-mount test; assert the select-test wiring here.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- flow-wiring`
Expected: FAIL — `select-test` currently pushes to `/assessment/instructions`, not `/assessment/acquire`.

- [ ] **Step 3: Apply the rewiring**

In `mobile/app/assessment/select-test.tsx`, change the post-create navigation target inside `handleStart`:
```tsx
      router.push({
        pathname: '/assessment/instructions',
        params: { assessmentId: String(assessment.id), testType: selectedTest },
      });
```
→
```tsx
      router.push({
        pathname: '/assessment/acquire',
        params: { assessmentId: String(assessment.id), testType: selectedTest },
      });
```

In `mobile/app/assessment/capture.tsx`, change the post-record navigation (the `router.replace` after a successful `recordAsync`):
```tsx
        router.replace({
          pathname: '/assessment/processing',
          params: { assessmentId, testType, videoUri: video.uri },
        });
```
→
```tsx
        router.replace({
          pathname: '/assessment/review',
          params: { assessmentId, testType, videoUri: video.uri, source: 'mobile' },
        });
```

- [ ] **Step 4: Run test + full suite + typecheck**

Run: `npm test -- flow-wiring` → PASS.
Run: `npm test` → whole mobile suite green (no regressions).
Run: `npm run typecheck` → clean.

- [ ] **Step 5: Commit**

```bash
git add mobile/app/assessment/select-test.tsx mobile/app/assessment/capture.tsx mobile/app/assessment/flow-wiring.test.tsx
git commit -m "feat(mobile-upload): route select-test→acquire and capture→review"
```

---

## Task 9: Results — compact player + Save/Share .mp4 (mobile)

**Files:**
- Modify: `mobile/app/assessment/results.tsx`
- Test: `mobile/app/assessment/results.video.test.tsx`

**Interfaces:**
- Consumes: `MobileVideoReviewPlayer` (compact), `expo-file-system`, `expo-sharing`.
- Produces: when the loaded capture has a `video_file`, results renders `MobileVideoReviewPlayer source={video_file} mode="compact"` and a **Save/Share video** button that downloads `video_file` to the cache and `Sharing.shareAsync`-es it.

- [ ] **Step 1: Write the failing test**

Create `mobile/app/assessment/results.video.test.tsx`:
```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native'

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({ captureId: '9', testType: 'nibut' }),
}))
jest.mock('@/components/player/MobileVideoReviewPlayer', () => ({ MobileVideoReviewPlayer: () => null }))
jest.mock('@tanstack/react-query', () => ({
  ...jest.requireActual('@tanstack/react-query'),
  useQuery: () => ({ data: { video_file: 'https://cdn/v.mp4', result: null, test_type: 'nibut' }, isLoading: false, isError: false }),
}))
const downloadAsync = jest.fn().mockResolvedValue({ uri: 'file://cache/v.mp4' })
const shareAsync = jest.fn().mockResolvedValue(undefined)
jest.mock('expo-file-system', () => ({ cacheDirectory: 'file://cache/', downloadAsync: (...a: any[]) => downloadAsync(...a) }))
jest.mock('expo-sharing', () => ({ isAvailableAsync: async () => true, shareAsync: (...a: any[]) => shareAsync(...a) }))

import ResultsScreen from './results'
beforeEach(() => { jest.clearAllMocks() })

it('downloads then shares the stored video', async () => {
  render(<ResultsScreen />)
  fireEvent.press(screen.getByLabelText('Save or share video'))
  await waitFor(() => expect(downloadAsync).toHaveBeenCalledWith('https://cdn/v.mp4', expect.stringContaining('file://cache/')))
  await waitFor(() => expect(shareAsync).toHaveBeenCalledWith('file://cache/v.mp4', expect.anything()))
})
```
(If `results.tsx`'s existing data hook is not `useQuery` directly — adapt the mock to whatever it uses; the existing file fetches the capture detail via `useQuery` per the current code. Mock to return an object including `video_file`.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- results.video`
Expected: FAIL — there is no "Save or share video" control yet.

- [ ] **Step 3: Add the compact player + share action**

In `mobile/app/assessment/results.tsx`: import `MobileVideoReviewPlayer` and add, where the capture/result is rendered (guarded by `capture.video_file`), the compact player and a share button. Add near the other imports:
```tsx
import { MobileVideoReviewPlayer } from '@/components/player/MobileVideoReviewPlayer';
```
Add a handler (mirroring the existing PDF share — reuse the same `FileSystem`/`Sharing` already imported):
```tsx
  async function handleShareVideo(videoUrl: string) {
    const localUri = (FileSystem.cacheDirectory ?? '') + 'capture_video.mp4';
    await FileSystem.downloadAsync(videoUrl, localUri);
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(localUri, { mimeType: 'video/mp4', dialogTitle: 'Save or share video' });
    }
  }
```
And in the rendered output, where the capture detail is shown, add (use the data object's field name as it exists in the file — `data.video_file`):
```tsx
        {data?.video_file ? (
          <View style={{ gap: 12 }}>
            <MobileVideoReviewPlayer source={data.video_file} mode="compact" onCaptureFrame={() => {}} />
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Save or share video"
              onPress={() => handleShareVideo(data.video_file)} activeOpacity={0.8}
              style={{ alignItems: 'center', backgroundColor: '#0E7C7B', paddingVertical: 12, borderRadius: 10 }}>
              <Text style={{ color: '#FFFFFF', fontWeight: '600' }}>Save / share video (.mp4)</Text>
            </TouchableOpacity>
          </View>
        ) : null}
```
(`MobileVideoReviewPlayer`'s `onCaptureFrame` is required by its type; pass a no-op — compact mode hides the capture button so it never fires. Match `results.tsx`'s existing styling approach: it uses inline/StyleSheet, not className — use inline `style` as shown. If `results.tsx` defines a local `CaptureResult`/detail type, extend it with `video_file: string | null` so `data.video_file` typechecks.)

- [ ] **Step 4: Run test + typecheck**

Run: `npm test -- results.video` → PASS. Run: `npm run typecheck` → clean.

- [ ] **Step 5: Commit**

```bash
git add mobile/app/assessment/results.tsx mobile/app/assessment/results.video.test.tsx
git commit -m "feat(mobile-upload): compact player + save/share video on results"
```

---

## Task 10: Web parity — compact player + Download .mp4 on assessment detail

**Files:**
- Modify: `web/src/app/(dashboard)/patients/[id]/assessments/[assessmentId]/page.tsx`
- Test: `web/src/app/(dashboard)/patients/[id]/assessments/[assessmentId]/page.video.test.tsx`

**Run from `/opt/tearflex/web`.**

**Interfaces:**
- Consumes: `VideoReviewPlayer` (`@/components/player/VideoReviewPlayer`, `source`+`mode`, `onCaptureFrame` optional).
- Produces: per capture with a `video_file`, a card with the compact player and a Download .mp4 link to `capture.video_file`.

- [ ] **Step 1: Write the failing test**

Create `web/src/app/(dashboard)/patients/[id]/assessments/[assessmentId]/page.video.test.tsx`:
```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('@/hooks/useAssessments', () => ({ useAssessment: () => ({ data: {
  id: 55, patient: 3, patient_name: 'A B', eye: 'right', assessed_at: '2026-06-25T00:00:00Z',
  captures: [{ id: 9, test_type: 'nibut', video_file: 'https://cdn/v.mp4', result: null }],
}, isLoading: false }) }))
vi.mock('@/hooks/usePractice', () => ({ usePractice: () => ({ data: {} }) }))
vi.mock('@/hooks/useReports', () => ({ useReports: () => ({ data: { results: [] } }), downloadReportUrl: () => '' }))
vi.mock('@/components/player/VideoReviewPlayer', () => ({ VideoReviewPlayer: ({ source }: { source: string }) => <div data-testid="player">{source}</div> }))

import AssessmentDetailPage from './page'

describe('assessment detail video', () => {
  it('renders the compact player and a download link for a capture with a video', () => {
    render(<AssessmentDetailPage params={{ assessmentId: '55' }} />)
    expect(screen.getByTestId('player')).toHaveTextContent('https://cdn/v.mp4')
    const link = screen.getByRole('link', { name: /download .mp4/i })
    expect(link).toHaveAttribute('href', 'https://cdn/v.mp4')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- page.video`
Expected: FAIL — no player / download link on the page.

- [ ] **Step 3: Add the player + download to the page**

In `web/src/app/(dashboard)/patients/[id]/assessments/[assessmentId]/page.tsx`, add the import:
```tsx
import { VideoReviewPlayer } from '@/components/player/VideoReviewPlayer'
```
Inside the captures `.map((c) => ...)`, after the result/empty block, add a video card when `c.video_file` exists:
```tsx
              {c.video_file && (
                <div className="space-y-2 rounded-lg border border-border p-3">
                  <VideoReviewPlayer source={c.video_file} mode="compact" />
                  <a href={c.video_file} download
                    className="inline-flex text-sm font-medium text-teal-600 hover:underline">
                    Download .mp4
                  </a>
                </div>
              )}
```
(The captures map currently returns a single `<div>` per capture — place the video card inside that same `<div>`, after the result/empty block.)

- [ ] **Step 4: Run test + typecheck**

Run: `npm run test -- page.video` → PASS. Run: `npm run typecheck` → clean (`TestCapture.video_file` is `string | null` from sub-project D — the `&& c.video_file` guard narrows it).

- [ ] **Step 5: Commit**

```bash
git add "web/src/app/(dashboard)/patients/[id]/assessments/[assessmentId]/page.tsx" "web/src/app/(dashboard)/patients/[id]/assessments/[assessmentId]/page.video.test.tsx"
git commit -m "feat(web): view + download stored video on the assessment detail page"
```

---

## Manual / device verification (after Task 10)

Not automated. **Mobile (device/simulator):** new assessment → pick eye+test → **acquire**: "Take" walks instructions→capture→**review** (the inserted review screen) → Auto-analyse → processing → results; "Upload" picks a gallery clip → review → both Auto-analyse and Enter-manually land on results. On review, slow-mo/scrub/frame-step work and **Capture frame** adds stills (verify they attach to the capture). On results, the compact player plays the stored video and **Save/share** exports the `.mp4`. **Web:** open an assessment with an uploaded capture → the detail page plays the video (compact) and **Download .mp4** saves it.

---

## Self-Review (completed by plan author)

**Spec coverage:**
- Take/Upload front door + gallery picker → Task 5. ✓
- Shared review screen on both paths (camera path inserted) → Task 6 (orchestrator) + Task 8 (capture→review rewire). ✓
- Auto-analyse (create capture + stills + poll) → Tasks 2/6/7. ✓ Manual entry (selected test + video + complete + report) → Tasks 4/6. ✓
- `source` provenance (mobile/upload) → Tasks 2/6/8. ✓
- Stills (frame field `image`, non-fatal) → Tasks 1/2/6. ✓
- Processing poll-only + 2-min cap + retry → Tasks 3/7. ✓
- Results compact player + Save/Share .mp4 (mobile) → Task 9. ✓
- Web parity: compact player + Download .mp4 → Task 10. ✓
- jest-expo styling caveat (assert labels/behavior, not className) honored in every test. ✓
- Out of scope honored: manual = selected test only; no chunked upload/size cap; no pure-manual path; no frame-capture on results compact. ✓

**Placeholder scan:** none — every step has concrete code/commands. The two adaptation notes (`contentContainerClassName` fallback; matching `results.tsx`'s existing data-hook/type) are explicit, bounded instructions, not deferred work.

**Type consistency:** `CapturedFrame {uri,timestampSeconds,width,height}` (slice 1) consumed in Tasks 6/9. `ManualResultFields` defined Task 4, consumed Task 6. `useUploadCapture/useUploadManualCapture/useCreateCaptureStill` (all three) defined + unit-tested in Task 2, consumed Task 6. `useCaptureStatus(captureId, timeoutMs?)`+`isTimedOut` defined Task 3, consumed Task 7. `api.postMultipart(...,fileField?)` defined Task 1, used Tasks 2. `source: 'mobile'|'upload'` consistent. Navigation params (`assessmentId, captureId, testType, videoUri, source`) consistent across acquire→review→processing→results.

**Note for execution:** mobile implementers work in jest-expo against expo-router/native-module mocks — use a standard/capable model (sonnet). Tasks 1, 5, 6 install or touch native modules / many files; Task 6 is the integration crux. Subagents run in isolated worktrees — ensure each rebases on the latest branch tip before committing (a prior slice hit a stale-base clobber).
