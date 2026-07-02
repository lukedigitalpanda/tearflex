# Topography Web Image Upload (Slice 2b) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A web clinician can create a corneal-topography scan by uploading 1–20 still images from the New-assessment stepper, watch it process, and land on the assessment page where results render — plus the backend rejects zero-still scans at the API.

**Architecture:** One backend serializer tightening. On web: a small `postMultipart` extension (repeated keys for `Blob[]`), two new hooks in `useTopography.ts` mirroring the tear-film create/poll pair, a controlled multi-image picker component, and a `TopographyUploadFlow` wired in as a third stepper `mode`. No new results screen — on `analysed` the flow navigates to the assessment detail page, which already renders `TopographyResult`.

**Tech Stack:** Django 5 / DRF (pytest, `USE_SQLITE_TESTS=1`); Next.js 14 + TanStack Query (vitest + testing-library, no msw — `vi.spyOn(api, …)` for hooks, `vi.mock` whole modules for flows).

**Spec:** `docs/superpowers/specs/2026-07-02-topography-web-upload-design.md` — read first.

## Global Constraints

- Backend commands from `/opt/tearflex/backend`: `USE_SQLITE_TESTS=1 python3 -m pytest …`. Baseline **261 passed** → **262** after Task 1.
- Web commands from `/opt/tearflex/web`: `npx vitest run` (baseline **105 passed**; Task 2 → **110**, Task 3 → **114**, Task 4 → **118**) and `npx tsc --noEmit` (must be clean; if pre-existing unrelated errors appear, STOP and report rather than fixing them).
- Topography stays OUT of `TEST_TYPES` and the shared `TestType` union — it is a parallel resource. The stepper integration is a new `mode` value only.
- Web sends NO camera-intrinsics fields (EXIF precedence on the backend covers uploads).
- Follow existing conventions exactly: tests colocated (`X.test.tsx` beside `X.tsx`), `makeWrapper()` from `@/src/test/queryWrapper` (import path per existing tests: `@/test/queryWrapper`), sr-only-input-behind-dashed-label picker style, inline error `<p className="text-sm text-red-500">`.
- MAX images client-side = 20 (mirrors backend `MAX_STILLS_PER_SCAN`).
- Where a snippet references an import whose exact path/style you must match (e.g. shared types, `Paginated`), read the target file first and extend its existing import lines rather than inventing new styles. Mirror `UploadAssessmentFlow.tsx`'s exact prop types for the new flow's props.
- No new npm/pip dependencies. One backend behaviour change only (Task 1); no migrations.
- Commit after every task with the exact message given; end every commit message with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

---

### Task 1: Backend — require ≥1 still on scan create

**Files:**
- Modify: `backend/apps/topography/serializers.py` (the `stills` field of `TopographyScanCreateSerializer`)
- Test: `backend/apps/topography/tests/test_api.py` (append)

**Interfaces:**
- Produces: `POST /api/topography/scans/` without a `stills` key (or with an empty list) → HTTP 400 with a `stills` error; ≥1 still unchanged (201). Web Task 4 relies on this as the server-side guard behind the picker's client-side ≥1 rule.

- [ ] **Step 1: Write the failing test**

Append to `backend/apps/topography/tests/test_api.py`:

```python
@pytest.mark.django_db
def test_create_scan_requires_at_least_one_still(api, clinician):
    """A zero-still scan can never analyse (the task needs an image) — reject at
    the API instead of creating a scan that burns deterministic Celery retries."""
    assessment = AssessmentFactory(patient__practice=clinician.practice)
    with patch('apps.topography.views.process_topography_scan.delay') as delay:
        resp = api.post('/api/topography/scans/', {
            'assessment': assessment.id,
        }, format='multipart')
    assert resp.status_code == 400, resp.content
    assert 'stills' in resp.data
    delay.assert_not_called()
```

- [ ] **Step 2: Run it to verify it fails**

Run: `USE_SQLITE_TESTS=1 python3 -m pytest apps/topography/tests/test_api.py::test_create_scan_requires_at_least_one_still -v`
Expected: FAIL — currently returns 201 (stills is `required=False, default=list`).

- [ ] **Step 3: Implement**

In `backend/apps/topography/serializers.py`, change

```python
    stills = serializers.ListField(
        child=serializers.ImageField(), write_only=True, required=False, default=list,
        max_length=MAX_STILLS_PER_SCAN,
    )
```

to

```python
    # Required with at least one image: the analysis task selects the sharpest
    # still, so a scan without any can only ever fail (previously it burned
    # deterministic Celery retries before doing so).
    stills = serializers.ListField(
        child=serializers.ImageField(), write_only=True, min_length=1,
        max_length=MAX_STILLS_PER_SCAN,
    )
```

(Dropping `required=False, default=list` makes the field required; `min_length=1` guards a programmatic empty list.) `views.py`'s `data.pop('stills', [])` needs no change.

- [ ] **Step 4: Run the test to verify it passes**

Run: `USE_SQLITE_TESTS=1 python3 -m pytest apps/topography/tests/test_api.py -v`
Expected: all pass (every existing create test already posts ≥1 still).

- [ ] **Step 5: Run the full backend suite**

Run: `USE_SQLITE_TESTS=1 python3 -m pytest -q`
Expected: **262 passed**.

- [ ] **Step 6: Commit**

```bash
git add backend/apps/topography/serializers.py backend/apps/topography/tests/test_api.py
git commit -m "feat(topography): require at least one still on scan create

A zero-still scan deterministically fails in the analysis task after
burning Celery retries; reject it at the API instead. Mobile always sends
5 stills and the web picker enforces >=1 client-side.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Web plumbing — multipart arrays, create + status hooks, type drift

**Files:**
- Modify: `web/src/lib/api.ts` (`postMultipart` value type), `web/src/hooks/useTopography.ts` (two new hooks), `shared/types/topography.ts` (drift fix)
- Test: `web/src/lib/api.test.ts` (append), `web/src/hooks/useTopography.test.tsx` (append or create beside the hook, matching colocation)

**Interfaces:**
- Consumes: existing `api.request` internals (untouched); `useCaptureStatus` in `web/src/hooks/useCaptures.ts:79-109` as the verbatim pattern for the status hook.
- Produces: `api.postMultipart(path, fields: Record<string, string | Blob | Blob[]>)`; `useCreateTopographyScan()` mutation taking `{assessment: number; stills: File[]}` returning the created `TopographyScan`; `useTopographyScanStatus(scanId: number | null, timeoutMs?: number)` returning `{...query, isTimedOut}` with `data?: {id, status, result?}`. Task 4 consumes both hooks.

- [ ] **Step 1: Write the failing tests**

Append to `web/src/lib/api.test.ts` (mirror the file's existing fetch-mocking scaffolding exactly — read it first; the assertions below are the contract):

```ts
it('postMultipart appends array values as repeated form keys', async () => {
  // arrange fetch mock per this file's existing pattern, capturing the RequestInit
  const a = new Blob(['a']); const b = new Blob(['b'])
  await api.postMultipart('topography/scans/', { assessment: '5', stills: [a, b] })
  const body = /* the captured RequestInit */.body as FormData
  expect(body.getAll('stills')).toHaveLength(2)
  expect(body.get('assessment')).toBe('5')
})
```

In the topography hooks test file (create `web/src/hooks/useTopography.test.tsx` if none exists; if one exists, append), with imports mirroring `useCaptureStatus.test.tsx` (`renderHook`, `waitFor`, `makeWrapper`, `vi.spyOn(api, …)`):

```ts
describe('useCreateTopographyScan', () => {
  it('posts multipart with assessment and repeated stills', async () => {
    const spy = vi.spyOn(api, 'postMultipart').mockResolvedValue({ id: 7, status: 'processing' })
    const { result } = renderHook(() => useCreateTopographyScan(), { wrapper: makeWrapper() })
    const f = new File(['x'], 'a.jpg', { type: 'image/jpeg' })
    await result.current.mutateAsync({ assessment: 5, stills: [f] })
    expect(spy).toHaveBeenCalledWith('topography/scans/', { assessment: '5', stills: [f] })
  })
})

describe('useTopographyScanStatus', () => {
  it('fetches the scan status when a scanId is given', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({ id: 7, status: 'analysed' })
    const { result } = renderHook(() => useTopographyScanStatus(7), { wrapper: makeWrapper() })
    await waitFor(() => expect(result.current.data?.status).toBe('analysed'))
    expect(api.get).toHaveBeenCalledWith('topography/scans/7/status/')
  })

  it('is disabled when scanId is null', () => {
    const spy = vi.spyOn(api, 'get')
    renderHook(() => useTopographyScanStatus(null), { wrapper: makeWrapper() })
    expect(spy).not.toHaveBeenCalled()
  })

  it('reports isTimedOut=true after timeoutMs elapses while still processing', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({ id: 7, status: 'processing' })
    const { result, rerender } = renderHook(() => useTopographyScanStatus(7, 50), { wrapper: makeWrapper() })
    await waitFor(() => expect(result.current.data?.status).toBe('processing'))
    await new Promise((r) => setTimeout(r, 70))
    rerender()
    await waitFor(() => expect(result.current.isTimedOut).toBe(true))
  })
})
```

- [ ] **Step 2: Run to verify failures**

Run from `/opt/tearflex/web`: `npx vitest run src/lib/api.test.ts src/hooks/useTopography.test.tsx`
Expected: the api test fails on `getAll('stills')` length (current code appends the array once, coercing it) or type error; hook tests fail with `useCreateTopographyScan is not a function` / `useTopographyScanStatus is not a function` (not exported yet).

- [ ] **Step 3: Implement**

`web/src/lib/api.ts` — replace `postMultipart` with:

```ts
  postMultipart: <T>(path: string, fields: Record<string, string | Blob | Blob[]>) => {
    const form = new FormData()
    for (const [key, value] of Object.entries(fields)) {
      if (Array.isArray(value)) for (const item of value) form.append(key, item)
      else form.append(key, value)
    }
    return request<T>(path, { method: 'POST', body: form })
  },
```

`shared/types/topography.ts` — in `TopographyScan`, after `app_version: string;` add:

```ts
  camera_focal_px: number | null;
  capture_width_px: number | null;
  capture_height_px: number | null;
```

`web/src/hooks/useTopography.ts` — extend imports (add `useMutation` from `@tanstack/react-query`, `useEffect, useRef` from `react`, and the `TopographyScan`, `TopographyScanStatus`, `TopographyResult` types via the file's existing type-import style), then append:

```ts
export function useCreateTopographyScan() {
  return useMutation({
    mutationFn: (params: { assessment: number; stills: File[] }) =>
      api.postMultipart<TopographyScan>('topography/scans/', {
        assessment: String(params.assessment),
        stills: params.stills,
      }),
  })
}

const POLL_INTERVAL_MS = 2000
const POLL_TIMEOUT_MS = 120000

interface TopographyScanStatusResponse {
  id: number
  status: TopographyScanStatus
  result?: TopographyResult
}

export function useTopographyScanStatus(scanId: number | null, timeoutMs: number = POLL_TIMEOUT_MS) {
  const startRef = useRef<number | null>(null)
  useEffect(() => {
    startRef.current = scanId === null ? null : Date.now()
  }, [scanId])

  const query = useQuery({
    queryKey: ['topography-scan-status', scanId],
    enabled: scanId !== null,
    queryFn: () => api.get<TopographyScanStatusResponse>(`topography/scans/${scanId}/status/`),
    refetchInterval: (query) => {
      const status = query.state.data?.status
      if (status === 'analysed' || status === 'failed') return false
      if (startRef.current !== null && Date.now() - startRef.current >= timeoutMs) return false
      return POLL_INTERVAL_MS
    },
  })

  const status = query.data?.status
  const isTimedOut =
    status !== 'analysed' && status !== 'failed' &&
    startRef.current !== null && Date.now() - startRef.current >= timeoutMs

  return { ...query, isTimedOut }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/api.test.ts src/hooks/useTopography.test.tsx`
Expected: all pass.

- [ ] **Step 5: Full web suite + typecheck**

Run: `npx vitest run` → **110 passed**. Then `npx tsc --noEmit` → clean.

- [ ] **Step 6: Commit**

```bash
git add web/src/lib/api.ts web/src/lib/api.test.ts web/src/hooks/useTopography.ts web/src/hooks/useTopography.test.tsx shared/types/topography.ts
git commit -m "feat(web): topography scan create + status-poll hooks

postMultipart accepts Blob[] as repeated form keys (DRF ListField shape);
useCreateTopographyScan posts assessment + stills; useTopographyScanStatus
mirrors the tear-film capture poll (2s interval, 120s wall-clock timeout).
Shared TopographyScan type gains the intrinsics fields the backend already
serves.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: `TopographyImagePicker` component

**Files:**
- Create: `web/src/components/assessments/TopographyImagePicker.tsx`
- Test: `web/src/components/assessments/TopographyImagePicker.test.tsx`

**Interfaces:**
- Produces: `TopographyImagePicker({ files, onChange }: { files: File[]; onChange: (files: File[]) => void })` — controlled; parent owns the file list (Task 4 retains it across retry).

- [ ] **Step 1: Write the failing tests**

Create `web/src/components/assessments/TopographyImagePicker.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeAll } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TopographyImagePicker } from './TopographyImagePicker'

beforeAll(() => {
  // jsdom lacks object-URL support; previews only need stable unique strings
  let n = 0
  Object.assign(URL, {
    createObjectURL: vi.fn(() => `blob:mock-${n++}`),
    revokeObjectURL: vi.fn(),
  })
})

const img = (name: string) => new File(['x'], name, { type: 'image/jpeg' })

describe('TopographyImagePicker', () => {
  it('adds picked images via onChange', async () => {
    const onChange = vi.fn()
    render(<TopographyImagePicker files={[]} onChange={onChange} />)
    await userEvent.upload(screen.getByLabelText(/choose topography images/i), [img('a.jpg'), img('b.jpg')])
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange.mock.calls[0][0].map((f: File) => f.name)).toEqual(['a.jpg', 'b.jpg'])
  })

  it('rejects non-image files with an inline error and no onChange', async () => {
    const onChange = vi.fn()
    render(<TopographyImagePicker files={[]} onChange={onChange} />)
    const bad = new File(['x'], 'clip.mp4', { type: 'video/mp4' })
    await userEvent.upload(screen.getByLabelText(/choose topography images/i), [bad], { applyAccept: false })
    expect(await screen.findByText(/image files only/i)).toBeInTheDocument()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('enforces the 20-image cap', async () => {
    const onChange = vi.fn()
    const existing = Array.from({ length: 19 }, (_, i) => img(`e${i}.jpg`))
    render(<TopographyImagePicker files={existing} onChange={onChange} />)
    await userEvent.upload(screen.getByLabelText(/add more images/i), [img('x.jpg'), img('y.jpg')])
    expect(await screen.findByText(/at most 20 images/i)).toBeInTheDocument()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('removes an image', async () => {
    const onChange = vi.fn()
    render(<TopographyImagePicker files={[img('a.jpg'), img('b.jpg')]} onChange={onChange} />)
    await userEvent.click(screen.getByRole('button', { name: /remove a\.jpg/i }))
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange.mock.calls[0][0].map((f: File) => f.name)).toEqual(['b.jpg'])
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/components/assessments/TopographyImagePicker.test.tsx`
Expected: fails to resolve `./TopographyImagePicker` (module does not exist).

- [ ] **Step 3: Implement**

Create `web/src/components/assessments/TopographyImagePicker.tsx`:

```tsx
'use client'
import { useEffect, useMemo, useState } from 'react'

const MAX_IMAGES = 20 // mirrors backend MAX_STILLS_PER_SCAN

export function TopographyImagePicker({
  files,
  onChange,
}: {
  files: File[]
  onChange: (files: File[]) => void
}) {
  const [error, setError] = useState<string | null>(null)
  const previews = useMemo(
    () => files.map((file) => ({ file, url: URL.createObjectURL(file) })),
    [files],
  )
  useEffect(
    () => () => {
      previews.forEach((p) => URL.revokeObjectURL(p.url))
    },
    [previews],
  )

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files ?? [])
    e.target.value = ''
    if (!picked.length) return
    if (picked.some((f) => !f.type.startsWith('image/'))) {
      setError('Please choose image files only.')
      return
    }
    const next = [...files, ...picked]
    if (next.length > MAX_IMAGES) {
      setError(`Choose at most ${MAX_IMAGES} images.`)
      return
    }
    setError(null)
    onChange(next)
  }

  const removeAt = (index: number) => onChange(files.filter((_, i) => i !== index))

  return (
    <div className="space-y-3">
      <label
        htmlFor="topography-images"
        className="block cursor-pointer rounded-lg border-2 border-dashed border-border px-6 py-10 text-center text-sm font-medium hover:border-teal-300"
      >
        {files.length ? 'Add more images' : 'Choose topography images to upload'}
        <input
          id="topography-images"
          type="file"
          accept="image/*"
          multiple
          className="sr-only"
          onChange={handleChange}
        />
      </label>
      <p className="text-xs text-muted-foreground">
        Upload photos taken through the Placido attachment — 1 to {MAX_IMAGES}; the
        sharpest is analysed.
      </p>
      {previews.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {previews.map((p, i) => (
            <li key={p.url} className="relative">
              <img src={p.url} alt={p.file.name} className="h-16 w-16 rounded-md object-cover" />
              <button
                type="button"
                aria-label={`Remove ${p.file.name}`}
                onClick={() => removeAt(i)}
                className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-slate-900/80 text-[10px] text-white"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="text-sm text-red-500">{error}</p>}
    </div>
  )
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/components/assessments/TopographyImagePicker.test.tsx`
Expected: 4 passed.

- [ ] **Step 5: Full web suite + typecheck**

Run: `npx vitest run` → **114 passed**. Then `npx tsc --noEmit` → clean.

- [ ] **Step 6: Commit**

```bash
git add web/src/components/assessments/TopographyImagePicker.tsx web/src/components/assessments/TopographyImagePicker.test.tsx
git commit -m "feat(web): topography multi-image picker

Controlled picker mirroring VideoFilePicker conventions: sr-only input
behind a dashed label, image/* filtering, 20-image cap (backend
MAX_STILLS_PER_SCAN), thumbnail strip with per-image remove, object URLs
revoked on change/unmount.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: `TopographyUploadFlow` + stepper wiring

**Files:**
- Create: `web/src/components/assessments/TopographyUploadFlow.tsx`
- Modify: `web/src/components/assessments/NewAssessmentStepper.tsx` (mode union + third choice button + render branch)
- Test: `web/src/components/assessments/TopographyUploadFlow.test.tsx` (create), `web/src/components/assessments/NewAssessmentStepper.test.tsx` (append if it exists; create a minimal one if not)

**Interfaces:**
- Consumes: Task 2's hooks; Task 3's picker; `useCreateAssessment` (`mutateAsync({patient, eye}) → {id}`); `next/navigation` `useRouter().push`. Mirror `UploadAssessmentFlow.tsx`'s exact prop types for `{ patientId, eye }`.
- Produces: `TopographyUploadFlow({ patientId, eye })`; stepper `mode` union gains `'topography'`.

- [ ] **Step 1: Write the failing tests**

Create `web/src/components/assessments/TopographyUploadFlow.test.tsx` (mirror `UploadAssessmentFlow.test.tsx`'s scaffolding — `vi.mock` of `next/navigation`, `@/hooks/useAssessments`, `@/hooks/useTopography`; stub `URL.createObjectURL`/`revokeObjectURL` as in Task 3's test):

```tsx
const push = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))

const createAssessment = vi.fn().mockResolvedValue({ id: 55 })
vi.mock('@/hooks/useAssessments', () => ({
  useCreateAssessment: () => ({ mutateAsync: createAssessment }),
}))

const createScan = vi.fn().mockResolvedValue({ id: 9, status: 'processing' })
let scanStatus: { data?: { id: number; status: string }; isTimedOut: boolean } = {
  data: { id: 9, status: 'analysed' },
  isTimedOut: false,
}
vi.mock('@/hooks/useTopography', () => ({
  useCreateTopographyScan: () => ({ mutateAsync: createScan }),
  useTopographyScanStatus: () => scanStatus,
}))
```

Tests:
1. **happy path**: render `<TopographyUploadFlow patientId={3} eye="right" />` with `makeWrapper()`; upload two images via the picker input; the submit button (`/upload 2 images & analyse/i`) becomes enabled; click it → `await waitFor` `createAssessment` called with `{ patient: 3, eye: 'right' }`, `createScan` called with `{ assessment: 55, stills: [expect.any(File), expect.any(File)] }`, and `push` called with `'/patients/3/assessments/55'`.
2. **submit disabled with no images**: button disabled on first render.
3. **failed → retry returns to picker with files retained**: set `scanStatus = { data: { id: 9, status: 'failed' }, isTimedOut: false }` for this test; drive to processing (upload 1 image, click submit, waitFor `createScan`); assert `/analysis failed/i` visible; click `/try again/i`; assert the picker is visible again AND the previously chosen thumbnail (`img` with `alt` `a.jpg`) is still rendered; assert `push` not called.

For `NewAssessmentStepper`: if `NewAssessmentStepper.test.tsx` exists, append; otherwise create it with `vi.mock` for `./UploadAssessmentFlow`, `./TopographyUploadFlow` (each → `<div data-testid="…-flow"/>`), and the step components as needed. One test:
4. **topography mode**: render stepper, complete the Eye step (drive `StepEye` per existing test patterns — if driving it is heavy, mock `./steps/StepEye` to a button that calls `onNext({ eye: 'right' })`), click `/corneal topography/i`, assert `data-testid="topography-flow"` rendered.

- [ ] **Step 2: Run to verify failures**

Run: `npx vitest run src/components/assessments/TopographyUploadFlow.test.tsx src/components/assessments/NewAssessmentStepper.test.tsx`
Expected: module-resolution failure for `./TopographyUploadFlow`; stepper test fails (no topography button).

- [ ] **Step 3: Implement**

Create `web/src/components/assessments/TopographyUploadFlow.tsx`:

```tsx
'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useCreateAssessment } from '@/hooks/useAssessments'
import { useCreateTopographyScan, useTopographyScanStatus } from '@/hooks/useTopography'
import { TopographyImagePicker } from './TopographyImagePicker'

type Phase = 'pick-images' | 'processing'

export function TopographyUploadFlow({ patientId, eye }: { patientId: number; eye: 'left' | 'right' }) {
  const router = useRouter()
  const [phase, setPhase] = useState<Phase>('pick-images')
  const [files, setFiles] = useState<File[]>([])
  const [scanId, setScanId] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Assessment created lazily, once — reused across retries.
  const assessmentIdRef = useRef<number | null>(null)
  const createAssessment = useCreateAssessment()
  const createScan = useCreateTopographyScan()
  const { data: statusData, isTimedOut } = useTopographyScanStatus(scanId)

  const status = statusData?.status
  useEffect(() => {
    if (status === 'analysed' && assessmentIdRef.current !== null) {
      router.push(`/patients/${patientId}/assessments/${assessmentIdRef.current}`)
    }
  }, [status, patientId, router])

  const ensureAssessment = async () => {
    if (assessmentIdRef.current !== null) return assessmentIdRef.current
    const assessment = await createAssessment.mutateAsync({ patient: patientId, eye })
    assessmentIdRef.current = assessment.id
    return assessment.id
  }

  const handleSubmit = async () => {
    setBusy(true)
    setError(null)
    try {
      const assessment = await ensureAssessment()
      const scan = await createScan.mutateAsync({ assessment, stills: files })
      setScanId(scan.id)
      setPhase('processing')
    } catch {
      setError('Upload failed. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  // A retry creates a NEW scan (the failed one remains for audit), with the
  // same files retained client-side.
  const handleRetry = () => {
    setScanId(null)
    setPhase('pick-images')
  }

  if (phase === 'processing') {
    if (status === 'failed') {
      return (
        <div className="space-y-3 text-center">
          <p className="text-sm font-medium text-red-500">Analysis failed.</p>
          <button type="button" onClick={handleRetry} className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700">
            Try again
          </button>
        </div>
      )
    }
    if (isTimedOut) {
      return (
        <div className="space-y-3 text-center">
          <p className="text-sm text-muted-foreground">This is taking longer than expected.</p>
          <button type="button" onClick={handleRetry} className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700">
            Try again
          </button>
        </div>
      )
    }
    return <p className="py-10 text-center text-sm text-muted-foreground">Processing topography scan…</p>
  }

  return (
    <div className="space-y-4">
      <TopographyImagePicker files={files} onChange={setFiles} />
      {error && <p className="text-sm text-red-500">{error}</p>}
      <button
        type="button"
        disabled={!files.length || busy}
        onClick={handleSubmit}
        className="w-full rounded-lg bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50"
      >
        {busy
          ? 'Uploading…'
          : files.length
            ? `Upload ${files.length} image${files.length === 1 ? '' : 's'} & analyse`
            : 'Upload & analyse'}
      </button>
    </div>
  )
}
```

Modify `web/src/components/assessments/NewAssessmentStepper.tsx`:
- Import: `import { TopographyUploadFlow } from './TopographyUploadFlow'`
- Mode union: `useState<'choose' | 'manual' | 'upload' | 'topography'>('choose')`
- In the `mode === 'choose'` block, inside the `<div className="flex gap-3">`, add a third button after "Enter results manually":

```tsx
            <button type="button" onClick={() => setMode('topography')}
              className="flex-1 rounded-lg border-2 border-border px-4 py-6 text-sm font-semibold hover:border-teal-300">
              Corneal topography (upload images)
            </button>
```

- After the `mode === 'upload'` render branch, add:

```tsx
      {step === 1 && mode === 'topography' && data.eye && (
        <TopographyUploadFlow patientId={patientId} eye={data.eye.eye} />
      )}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/components/assessments/TopographyUploadFlow.test.tsx src/components/assessments/NewAssessmentStepper.test.tsx`
Expected: all pass (3 flow + 1 stepper).

- [ ] **Step 5: Full web suite + typecheck + full backend suite (regression)**

Run from `/opt/tearflex/web`: `npx vitest run` → **118 passed**; `npx tsc --noEmit` → clean.
Run from `/opt/tearflex/backend`: `USE_SQLITE_TESTS=1 python3 -m pytest -q` → **262 passed**.

- [ ] **Step 6: Commit**

```bash
git add web/src/components/assessments/TopographyUploadFlow.tsx web/src/components/assessments/TopographyUploadFlow.test.tsx web/src/components/assessments/NewAssessmentStepper.tsx web/src/components/assessments/NewAssessmentStepper.test.tsx
git commit -m "feat(web): topography image-upload flow in the assessment stepper

Third stepper mode 'Corneal topography (upload images)': controlled picker
-> lazy assessment create -> multipart scan create -> status poll -> the
assessment detail page renders results (no new results screen). Failed and
timed-out states offer retry with files retained; a retry creates a new
scan and the failed one remains for audit.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```
