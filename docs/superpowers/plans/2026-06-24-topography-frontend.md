# Corneal Topography — Frontend (Slice 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the client surfaces of the topography walking skeleton — shared TS types/constants, a web results view under the assessment detail page, and a mobile vision-camera capture → upload → poll → results flow — so a clinician can capture a topography scan on a dev build and both web and mobile show the axial map + SimK/astigmatism, every value badged research-use / uncalibrated.

**Architecture:** Topography is a **distinct modality**, not a `TestType`. It reuses the existing `Assessment` session but has its own `apps/topography` API (`/api/topography/scans/…`) and its own `TopographyScan`/`TopographyResult` shapes. The frontend therefore gets dedicated `shared/types/topography.ts` + `shared/constants/topography.ts`, a dedicated web `TopographyResult` component + `useTopography` hook wired into the assessment detail page, and dedicated mobile screens (`topography-capture` / `topography-processing` / `topography-results`) using `react-native-vision-camera` on a development build. Existing NIBUT/tear-film code is untouched except for two additive entry points (select-test card, instructions branch).

**Tech Stack:** Web — Next.js 14 App Router, Tailwind, shadcn/ui, TanStack Query, Vitest + Testing Library. Mobile — React Native 0.76 / Expo SDK 52, Expo Router, NativeWind, TanStack Query, `react-native-vision-camera` v4 on `expo-dev-client`. Backend touch — Django 5 + DRF, pytest.

## Global Constraints

- **Topography is NOT a `TestType`.** Do **not** add `'topography'` to the shared `TestType` union or `TestCapture.test_type`. It produces a `TopographyScan` via `/api/topography/`. (Spec key decision 5 & capture-flow step 1.)
- **Every displayed value is badged research-use / uncalibrated.** Both web and mobile results MUST show the banner text from `RESEARCH_USE_DISCLAIMER`, plus `algorithm_version` + `calibration_state` for provenance. (Spec honesty model.)
- **No keratoconus signal of any kind** is surfaced in slice 1. Do not display irregularity, I-S asymmetry, tangential map, or any suspicion flag — those fields do not exist in slice-1 output.
- Keratometric index `n = 1.3375`; `NOMINAL_DIOPTRE_SCALE` is an explicit placeholder — absolute dioptres are not metrically valid. K-values are labelled "(assumed scale)".
- Backend API: base `/api/topography/`; `POST scans/`, `GET scans/{id}/`, `GET scans/{id}/status/`, plus the list filter added in Task 2. Result field names are exact: `ring_overlay`, `axial_map`, `sim_k_flat`, `sim_k_steep`, `sim_k_axis`, `central_k`, `astigmatism_magnitude`, `astigmatism_axis`, `confidence`, `algorithm_version`, `calibration_state`, `analysed_at`.
- **Mobile camera** moves to `react-native-vision-camera` on a dev build for this modality; `expo-camera` stays for NIBUT capture (the two coexist this slice).
- Result/overlay images are absolute URLs from the backend — render with a plain `<img>` (web) / RN `<Image source={{ uri }}>` (mobile), mirroring `TearFilmHeatmap`.
- **Test gates per surface:**
  - Web + shared: `cd /opt/tearflex/web && npm run test` (Vitest, `*.test.ts(x)` colocated) and `npm run typecheck`.
  - Backend (Task 2 only): `cd /opt/tearflex/backend && pytest`.
  - Mobile: **no RN test runner exists** — the automated gate is `cd /opt/tearflex/mobile && npm run typecheck` (`tsc --noEmit`), plus the per-task manual verification checklist. Do not invent a mobile test framework.
- All `git` commands run from `/opt/tearflex`. The branch is `feat/corneal-topography` (already checked out).
- This plan depends on the backend plan (`docs/superpowers/plans/2026-06-18-topography-backend.md`) being implemented first — Task 2 modifies files it creates.

---

## File Structure

**New — shared:**
- `shared/types/topography.ts` — `CalibrationState`, `TopographyScanStatus`, `TopographyResult`, `TopographyStill`, `TopographyScan`
- `shared/constants/topography.ts` — `KERATOMETRIC_INDEX`, `NOMINAL_DIOPTRE_SCALE`, `RESEARCH_USE_DISCLAIMER`, `DIOPTRE_COLOUR_STOPS`

**New — web:**
- `web/src/lib/topography.ts` + `web/src/lib/topography.test.ts` — display helpers (colour/format/labels)
- `web/src/components/topography/TopographyResult.tsx` + `.test.tsx` — results component
- `web/src/components/topography/TopographyImage.tsx` — map/overlay image with fallback
- `web/src/hooks/useTopography.ts` — `useTopographyScans(assessmentId)`

**Modified — web:**
- `web/src/app/(dashboard)/patients/[id]/assessments/[assessmentId]/page.tsx` — render topography scans

**Modified — backend (Task 2):**
- `backend/apps/topography/views.py` — list-by-assessment on the scans endpoint
- `backend/apps/topography/urls.py` — view rename
- `backend/apps/topography/tests/test_api.py` — list + scoping tests

**New — mobile:**
- `mobile/hooks/useTopographyUpload.ts` — upload + phase state
- `mobile/app/assessment/topography-capture.tsx` — vision-camera capture
- `mobile/app/assessment/topography-processing.tsx` — upload + status poll
- `mobile/app/assessment/topography-results.tsx` — results view

**Modified — mobile:**
- `mobile/package.json` — add `react-native-vision-camera`
- `mobile/app.json` — vision-camera config plugin
- `mobile/app/_layout.tsx` — register the three new routes
- `mobile/lib/api.ts` — `postTopographyScan` multi-file helper
- `mobile/app/assessment/select-test.tsx` — topography modality card
- `mobile/app/assessment/instructions.tsx` — topography instructions + branch nav

---

### Task 1: Shared types, constants & web display helpers

**Files:**
- Create: `shared/types/topography.ts`, `shared/constants/topography.ts`, `web/src/lib/topography.ts`
- Test: `web/src/lib/topography.test.ts`

**Interfaces:**
- Produces (types): `CalibrationState = 'uncalibrated'|'default'|'calibrated'`; `TopographyScanStatus = 'uploaded'|'processing'|'analysed'|'failed'`; `TopographyResult`, `TopographyStill`, `TopographyScan` (field names match the backend serializers exactly).
- Produces (constants): `KERATOMETRIC_INDEX: number`, `NOMINAL_DIOPTRE_SCALE: number`, `RESEARCH_USE_DISCLAIMER: string`, `DIOPTRE_COLOUR_STOPS: {dioptre:number;colour:string}[]`.
- Produces (web lib): `dioptreColour(d): string`, `formatDioptre(d): string`, `formatAxis(deg): string`, `calibrationLabel(state): string`, re-exported `RESEARCH_USE_DISCLAIMER`.

- [ ] **Step 1: Write the shared types**

`shared/types/topography.ts`:
```ts
export type CalibrationState = 'uncalibrated' | 'default' | 'calibrated';
export type TopographyScanStatus = 'uploaded' | 'processing' | 'analysed' | 'failed';

export interface TopographyResult {
  id: number;
  ring_overlay: string | null;
  axial_map: string | null;
  sim_k_flat: number | null;
  sim_k_steep: number | null;
  sim_k_axis: number | null;
  central_k: number | null;
  astigmatism_magnitude: number | null;
  astigmatism_axis: number | null;
  confidence: number | null;
  algorithm_version: string;
  calibration_state: CalibrationState | '';
  analysed_at: string;
}

export interface TopographyStill {
  id: number;
  image: string;
  index: number;
  sharpness_score: number | null;
  is_selected: boolean;
}

export interface TopographyScan {
  id: number;
  assessment: number;
  video_file: string | null;
  device_model: string;
  phone_model_id: string;
  app_version: string;
  calibration_state: CalibrationState;
  status: TopographyScanStatus;
  captured_at: string;
  stills: TopographyStill[];
  result: TopographyResult | null;
}
```

- [ ] **Step 2: Write the shared constants**

`shared/constants/topography.ts`:
```ts
// Keratometric refractive index used to convert corneal radius to power.
export const KERATOMETRIC_INDEX = 1.3375;

// Placeholder pixel-radius -> dioptre scale. Subsystem A (calibration) replaces
// this; absolute dioptre values are NOT metrically valid in slice 1.
export const NOMINAL_DIOPTRE_SCALE = 4300.0;

export const RESEARCH_USE_DISCLAIMER =
  'Research use only — values are uncalibrated and not for diagnosis.';

// Dioptre colour stops for the axial-map legend (cool = flat, warm = steep).
export const DIOPTRE_COLOUR_STOPS: { dioptre: number; colour: string }[] = [
  { dioptre: 38, colour: '#2563EB' },
  { dioptre: 41, colour: '#22D3EE' },
  { dioptre: 43, colour: '#4ADE80' },
  { dioptre: 45, colour: '#FBBF24' },
  { dioptre: 48, colour: '#F87171' },
];
```

- [ ] **Step 3: Write the failing web display-helper test**

`web/src/lib/topography.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { dioptreColour, formatDioptre, formatAxis, calibrationLabel } from './topography'

describe('topography display helpers', () => {
  it('maps low dioptres to a cool colour and high to warm', () => {
    expect(dioptreColour(38)).toBe('#2563EB')
    expect(dioptreColour(48)).toBe('#F87171')
  })
  it('returns a neutral colour for null', () => {
    expect(dioptreColour(null)).toBe('#CBD5E1')
  })
  it('formats dioptres and axis, with a dash for null', () => {
    expect(formatDioptre(43.25)).toBe('43.25 D')
    expect(formatDioptre(null)).toBe('—')
    expect(formatAxis(90)).toBe('90°')
  })
  it('labels calibration state, defaulting to Uncalibrated', () => {
    expect(calibrationLabel('uncalibrated')).toBe('Uncalibrated')
    expect(calibrationLabel('')).toBe('Uncalibrated')
  })
})
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `cd /opt/tearflex/web && npx vitest run src/lib/topography.test.ts`
Expected: FAIL — cannot resolve `./topography`.

- [ ] **Step 5: Write the web display helpers**

`web/src/lib/topography.ts`:
```ts
import { DIOPTRE_COLOUR_STOPS, RESEARCH_USE_DISCLAIMER } from '@shared/constants/topography'
import type { CalibrationState } from '@shared/types/topography'

export { RESEARCH_USE_DISCLAIMER }

const CALIBRATION_LABELS: Record<CalibrationState, string> = {
  uncalibrated: 'Uncalibrated',
  default: 'Default profile',
  calibrated: 'Calibrated',
}

export function calibrationLabel(state: CalibrationState | '' | null | undefined): string {
  if (state && state in CALIBRATION_LABELS) return CALIBRATION_LABELS[state as CalibrationState]
  return 'Uncalibrated'
}

export function dioptreColour(d: number | null | undefined): string {
  if (d == null) return '#CBD5E1'
  const stops = DIOPTRE_COLOUR_STOPS
  if (d <= stops[0].dioptre) return stops[0].colour
  if (d >= stops[stops.length - 1].dioptre) return stops[stops.length - 1].colour
  for (let i = 0; i < stops.length - 1; i++) {
    if (d >= stops[i].dioptre && d < stops[i + 1].dioptre) return stops[i].colour
  }
  return stops[stops.length - 1].colour
}

export function formatDioptre(d: number | null | undefined): string {
  return d != null ? `${d.toFixed(2)} D` : '—'
}

export function formatAxis(deg: number | null | undefined): string {
  return deg != null ? `${Math.round(deg)}°` : '—'
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `cd /opt/tearflex/web && npx vitest run src/lib/topography.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 7: Commit**

```bash
cd /opt/tearflex && git add shared/types/topography.ts shared/constants/topography.ts web/src/lib/topography.ts web/src/lib/topography.test.ts && \
git commit -m "feat(topography): shared types/constants and web display helpers"
```

---

### Task 2: Backend — list topography scans by assessment

The web assessment-detail page needs to discover a session's topography scans; the backend slice only exposes create/detail/status. Make the `scans/` endpoint also list, filtered by `?assessment=`, practice-scoped.

**Files:**
- Modify: `backend/apps/topography/views.py`, `backend/apps/topography/urls.py`
- Test: `backend/apps/topography/tests/test_api.py` (add two tests)

**Interfaces:**
- Consumes: `TopographyScan` model, `apps.accounts.scoping.scope_queryset` (existing), serializers from the backend plan.
- Produces: `GET /api/topography/scans/?assessment={id}` → paginated `TopographyScan` list, scoped via `assessment__patient__practice`. POST behaviour unchanged.

- [ ] **Step 1: Write the failing tests**

Append to `backend/apps/topography/tests/test_api.py`:
```python
@pytest.mark.django_db
def test_list_scans_filtered_by_assessment(api, clinician):
    a1 = AssessmentFactory(patient__practice=clinician.practice)
    a2 = AssessmentFactory(patient__practice=clinician.practice)
    s1 = TopographyScan.objects.create(assessment=a1, status='analysed')
    TopographyScan.objects.create(assessment=a2, status='analysed')
    resp = api.get(f'/api/topography/scans/?assessment={a1.id}')
    assert resp.status_code == 200
    ids = [row['id'] for row in resp.data['results']]
    assert ids == [s1.id]


@pytest.mark.django_db
def test_list_scans_scoped_to_practice(api):
    other = AssessmentFactory()
    TopographyScan.objects.create(assessment=other, status='analysed')
    resp = api.get(f'/api/topography/scans/?assessment={other.id}')
    assert resp.status_code == 200
    assert resp.data['results'] == []
```
(The `api` and `clinician` fixtures and the `TopographyScan` / `AssessmentFactory` imports are already present in this file from the backend plan's Task 10.)

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd /opt/tearflex/backend && pytest apps/topography/tests/test_api.py -v -k list_scans`
Expected: FAIL — `GET scans/` returns 405 (CreateAPIView has no list handler).

- [ ] **Step 3: Make the scans view list + create**

In `backend/apps/topography/views.py`, replace the `TopographyScanCreateView` class with a list-create view (the `create()` body is unchanged from the backend plan; only the base class, name, and the added `get_serializer_class` / `get_queryset` differ):
```python
class TopographyScanListCreateView(generics.ListCreateAPIView):
    permission_classes = [permissions.IsAuthenticated]

    def get_serializer_class(self):
        if self.request.method == 'POST':
            return TopographyScanCreateSerializer
        return TopographyScanSerializer

    def get_queryset(self):
        qs = scope_queryset(
            TopographyScan.objects.select_related('result').prefetch_related('stills'),
            self.request.user, 'assessment__patient__practice',
        )
        assessment_id = self.request.query_params.get('assessment')
        if assessment_id:
            qs = qs.filter(assessment_id=assessment_id)
        return qs

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)
        stills = data.pop('stills', [])
        _require_assessment_access(request.user, data['assessment'])

        scan = TopographyScan.objects.create(**data)
        for i, img in enumerate(stills):
            TopographyStill.objects.create(scan=scan, image=img, index=i)

        task = process_topography_scan.delay(scan.id)
        scan.celery_task_id = task.id
        scan.status = 'processing'
        scan.save(update_fields=['celery_task_id', 'status', 'updated_at'])
        return Response(TopographyScanSerializer(scan).data, status=status.HTTP_201_CREATED)
```

- [ ] **Step 4: Update the route import**

In `backend/apps/topography/urls.py`, swap the create-view import and the `scans/` route:
```python
from django.urls import path
from .views import TopographyScanListCreateView, TopographyScanDetailView, topography_scan_status

urlpatterns = [
    path('scans/', TopographyScanListCreateView.as_view(), name='topography-scan-list-create'),
    path('scans/<int:pk>/', TopographyScanDetailView.as_view(), name='topography-scan-detail'),
    path('scans/<int:pk>/status/', topography_scan_status, name='topography-scan-status'),
]
```

- [ ] **Step 5: Run the topography API tests to verify they pass**

Run: `cd /opt/tearflex/backend && pytest apps/topography/tests/test_api.py -v`
Expected: PASS (the original 4 create/status/scoping tests plus the 2 new list tests).

- [ ] **Step 6: Commit**

```bash
cd /opt/tearflex && git add backend/apps/topography/views.py backend/apps/topography/urls.py backend/apps/topography/tests/test_api.py && \
git commit -m "feat(topography): list scans by assessment (practice-scoped)"
```

---

### Task 3: Web — TopographyResult component

**Files:**
- Create: `web/src/components/topography/TopographyResult.tsx`, `web/src/components/topography/TopographyImage.tsx`
- Test: `web/src/components/topography/TopographyResult.test.tsx`

**Interfaces:**
- Consumes: `web/src/lib/topography.ts` (Task 1), `@/components/ui/card`, `TopographyResult` type.
- Produces: `<TopographyResult result={TopographyResultData} />` and `<TopographyImage url alt />` (mirrors `TearFilmHeatmap`).

- [ ] **Step 1: Write the image helper**

`web/src/components/topography/TopographyImage.tsx`:
```tsx
export function TopographyImage({ url, alt }: { url: string | null | undefined; alt: string }) {
  if (!url) {
    return (
      <div className="flex h-48 items-center justify-center rounded-lg bg-muted text-sm text-muted-foreground">
        Not available
      </div>
    )
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt={alt} className="w-full rounded-lg" />
}
```

- [ ] **Step 2: Write the failing component test**

`web/src/components/topography/TopographyResult.test.tsx`:
```tsx
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TopographyResult } from './TopographyResult'

const result = {
  id: 1, ring_overlay: null, axial_map: null,
  sim_k_flat: 42.1, sim_k_steep: 44.3, sim_k_axis: 90,
  central_k: 43.2, astigmatism_magnitude: 2.2, astigmatism_axis: 90,
  confidence: 0.82, algorithm_version: 'topo-v0.1',
  calibration_state: 'uncalibrated' as const, analysed_at: '2026-06-24T10:00:00Z',
}

describe('TopographyResult', () => {
  it('shows the central K headline and SimK steep value', () => {
    render(<TopographyResult result={result as never} />)
    expect(screen.getByText('43.20 D')).toBeInTheDocument()
    expect(screen.getByText('44.30 D')).toBeInTheDocument()
  })
  it('always shows the research-use disclaimer and calibration provenance', () => {
    render(<TopographyResult result={result as never} />)
    expect(screen.getByText(/research use only/i)).toBeInTheDocument()
    expect(screen.getByText(/Uncalibrated/)).toBeInTheDocument()
    expect(screen.getByText(/topo-v0\.1/)).toBeInTheDocument()
  })
})
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd /opt/tearflex/web && npx vitest run src/components/topography/TopographyResult.test.tsx`
Expected: FAIL — cannot resolve `./TopographyResult`.

- [ ] **Step 4: Write the component**

`web/src/components/topography/TopographyResult.tsx`:
```tsx
import { Card } from '@/components/ui/card'
import { TopographyImage } from './TopographyImage'
import {
  calibrationLabel, dioptreColour, formatAxis, formatDioptre, RESEARCH_USE_DISCLAIMER,
} from '@/lib/topography'
import type { TopographyResult as TopographyResultData } from '@shared/types/topography'

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs uppercase text-muted-foreground">{label}</div>
      <div className="font-medium tabular-nums">{value}</div>
    </div>
  )
}

export function TopographyResult({ result }: { result: TopographyResultData }) {
  const colour = dioptreColour(result.central_k)
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900">
        {RESEARCH_USE_DISCLAIMER}
      </div>

      <Card className="p-6" style={{ backgroundColor: `${colour}18` }}>
        <div className="text-xs uppercase text-muted-foreground">Central K (assumed scale)</div>
        <div className="text-5xl font-bold tabular-nums" style={{ color: colour }}>
          {formatDioptre(result.central_k)}
        </div>
      </Card>

      <Card className="grid grid-cols-2 gap-4 p-5 sm:grid-cols-3">
        <Metric label="SimK flat" value={formatDioptre(result.sim_k_flat)} />
        <Metric label="SimK steep" value={formatDioptre(result.sim_k_steep)} />
        <Metric label="Steep axis" value={formatAxis(result.sim_k_axis)} />
        <Metric label="Astigmatism" value={formatDioptre(result.astigmatism_magnitude)} />
        <Metric label="Astig. axis" value={formatAxis(result.astigmatism_axis)} />
        <Metric
          label="Confidence"
          value={result.confidence != null ? `${Math.round(result.confidence * 100)}%` : '—'}
        />
      </Card>

      <Card className="grid gap-4 p-5 sm:grid-cols-2">
        <div>
          <h3 className="mb-3 font-semibold">Axial curvature map</h3>
          <TopographyImage url={result.axial_map} alt="Axial curvature map" />
        </div>
        <div>
          <h3 className="mb-3 font-semibold">Detected rings</h3>
          <TopographyImage url={result.ring_overlay} alt="Detected Placido rings" />
        </div>
      </Card>

      <p className="text-xs text-muted-foreground">
        Algorithm {result.algorithm_version || '—'} · {calibrationLabel(result.calibration_state)}
      </p>
    </div>
  )
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd /opt/tearflex/web && npx vitest run src/components/topography/TopographyResult.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
cd /opt/tearflex && git add web/src/components/topography && \
git commit -m "feat(topography): web results component with research-use badging"
```

---

### Task 4: Web — hook + assessment-detail wiring

**Files:**
- Create: `web/src/hooks/useTopography.ts`
- Modify: `web/src/app/(dashboard)/patients/[id]/assessments/[assessmentId]/page.tsx`

**Interfaces:**
- Consumes: `api.get` (existing), `Paginated`, `TopographyScan`, `TopographyResult` component (Task 3).
- Produces: `useTopographyScans(assessmentId: number | undefined)` → `UseQueryResult<Paginated<TopographyScan>>`.

- [ ] **Step 1: Write the hook**

`web/src/hooks/useTopography.ts`:
```ts
'use client'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { Paginated } from '@shared/types/api'
import type { TopographyScan } from '@shared/types/topography'

export function useTopographyScans(assessmentId: number | undefined) {
  return useQuery({
    queryKey: ['topography-scans', assessmentId],
    queryFn: () => api.get<Paginated<TopographyScan>>(`topography/scans/?assessment=${assessmentId}`),
    enabled: !!assessmentId,
  })
}
```

- [ ] **Step 2: Wire topography scans into the assessment detail page**

In `web/src/app/(dashboard)/patients/[id]/assessments/[assessmentId]/page.tsx`:

Add imports near the existing ones:
```tsx
import { useTopographyScans } from '@/hooks/useTopography'
import { TopographyResult } from '@/components/topography/TopographyResult'
import type { TopographyScan } from '@shared/types/topography'
```

After the `const { data: reportsData } = useReports(assessment?.patient)` line, add:
```tsx
  const { data: topographyData } = useTopographyScans(assessment?.id)
```
(`assessment?.id` is `undefined` until loaded, so the hook stays disabled — matching the existing `useReports(assessment?.patient)` pattern. The `if (isLoading || !assessment) return <LoadingState />` guard remains immediately below the hooks.)

Then, immediately before the closing `</div>` of the outer container (after the `assessment.captures` block), add the topography section:
```tsx
      {(topographyData?.results ?? []).map((scan: TopographyScan) => (
        <div key={`topo-${scan.id}`} className="space-y-2">
          <h2 className="text-sm font-semibold text-muted-foreground">CORNEAL TOPOGRAPHY</h2>
          {scan.result
            ? <TopographyResult result={scan.result} />
            : <EmptyState title="Topography scan not yet analysed" />}
        </div>
      ))}
```
(`EmptyState` is already imported in this file.)

- [ ] **Step 3: Typecheck and run the full web test suite**

Run: `cd /opt/tearflex/web && npm run typecheck && npm run test`
Expected: typecheck clean; all Vitest suites pass (existing + Tasks 1 & 3).

- [ ] **Step 4: Manual verification**

With backend + web running and an analysed topography scan in the DB (or after exercising the mobile flow), open the patient's assessment detail page. Confirm a "CORNEAL TOPOGRAPHY" section renders the axial map, ring overlay, K-values, and the amber research-use banner.

- [ ] **Step 5: Commit**

```bash
cd /opt/tearflex && git add web/src/hooks/useTopography.ts "web/src/app/(dashboard)/patients/[id]/assessments/[assessmentId]/page.tsx" && \
git commit -m "feat(topography): show topography scans on the web assessment detail page"
```

---

### Task 5: Mobile — vision-camera setup & route registration

**Files:**
- Modify: `mobile/package.json`, `mobile/app.json`, `mobile/app/_layout.tsx`

**Interfaces:**
- Produces: `react-native-vision-camera` installed + config-plugin registered; three new Expo Router screens registered: `assessment/topography-capture`, `assessment/topography-processing`, `assessment/topography-results`.

- [ ] **Step 1: Install the dependency**

Run: `cd /opt/tearflex/mobile && npm install react-native-vision-camera@^4.6.0`
Expected: `react-native-vision-camera` added to `dependencies` in `mobile/package.json`. (`expo-dev-client` is already present.)

- [ ] **Step 2: Register the config plugin**

In `mobile/app.json`, add the vision-camera entry to the `expo.plugins` array (keep the existing `expo-camera`, `expo-router`, `expo-secure-store` entries — both camera libraries coexist this slice):
```json
    "plugins": [
      [
        "expo-camera",
        {
          "cameraPermission": "TearFlex needs camera access to record tear film videos."
        }
      ],
      [
        "react-native-vision-camera",
        {
          "cameraPermissionText": "TearFlex needs camera access to capture corneal topography scans."
        }
      ],
      "expo-router",
      "expo-secure-store"
    ],
```

- [ ] **Step 3: Register the new routes**

In `mobile/app/_layout.tsx`, add three `Stack.Screen` entries after `<Stack.Screen name="assessment/results" />`:
```tsx
          <Stack.Screen name="assessment/topography-capture" />
          <Stack.Screen name="assessment/topography-processing" />
          <Stack.Screen name="assessment/topography-results" />
```

- [ ] **Step 4: Generate the native dev build projects**

Run: `cd /opt/tearflex/mobile && npx expo prebuild`
Expected: native `ios/` and `android/` projects generated/updated with the vision-camera native module. (If `prebuild` cannot run in this environment, record that it is required before the capture screen can be exercised on-device — it does not block the remaining typecheck-gated tasks.)

- [ ] **Step 5: Typecheck**

Run: `cd /opt/tearflex/mobile && npm run typecheck`
Expected: PASS (no usages added yet; this confirms the dependency types resolve).

- [ ] **Step 6: Commit**

```bash
cd /opt/tearflex && git add mobile/package.json mobile/package-lock.json mobile/app.json mobile/app/_layout.tsx && \
git commit -m "feat(topography): add vision-camera dev-build setup and register routes"
```

---

### Task 6: Mobile — multi-file upload helper & upload hook

The existing `api.postMultipart` hardcodes a single `video_file` field. Topography uploads `assessment` + optional video + a repeated `stills` field, so it needs a dedicated helper.

**Files:**
- Modify: `mobile/lib/api.ts`
- Create: `mobile/hooks/useTopographyUpload.ts`

**Interfaces:**
- Produces (api): `api.postTopographyScan<T>(fields: Record<string,string>, video: {uri;name;type}|null, stills: {uri;name;type}[]): Promise<T>` — POSTs multipart to `topography/scans/`, appends each still under the repeated key `stills` and the video under `video_file`.
- Produces (hook): `useTopographyUpload()` → `{ phase: 'idle'|'uploading'|'polling'|'done'|'error', scanId: number|null, error: string|null, upload(params): Promise<void> }` where `params = { assessmentId: number; videoUri: string | null; stillUris: string[] }`.

- [ ] **Step 1: Add the multipart helper**

In `mobile/lib/api.ts`, add a `postTopographyScan` method to the exported `api` object (after `postMultipart`):
```ts
  postTopographyScan: async <T>(
    fields: Record<string, string>,
    video: { uri: string; name: string; type: string } | null,
    stills: { uri: string; name: string; type: string }[],
  ): Promise<T> => {
    const { access } = await getTokens();
    const formData = new FormData();
    Object.entries(fields).forEach(([key, val]) => formData.append(key, val));
    if (video) {
      formData.append('video_file', { uri: video.uri, name: video.name, type: video.type } as unknown as Blob);
    }
    // DRF ListField reads repeated form keys; append each still under "stills".
    stills.forEach((s) => {
      formData.append('stills', { uri: s.uri, name: s.name, type: s.type } as unknown as Blob);
    });

    const res = await fetch(`${API_BASE}/topography/scans/`, {
      method: 'POST',
      headers: access ? { Authorization: `Bearer ${access}` } : {},
      body: formData,
      // Do NOT set Content-Type — fetch sets it automatically with the boundary
    });

    if (res.status === 401) {
      await clearTokens();
      throw new AuthExpiredError('Session expired');
    }
    if (!res.ok) {
      const body = await res.json().catch(() => ({})) as { detail?: string };
      throw new ApiError(res.status, body.detail ?? `Upload failed (${res.status})`);
    }
    return res.json() as Promise<T>;
  },
```

- [ ] **Step 2: Write the upload hook**

`mobile/hooks/useTopographyUpload.ts`:
```ts
import { useState, useCallback } from 'react';
import * as Device from 'expo-device';
import { api, AuthExpiredError } from '@/lib/api';

export type TopographyPhase = 'idle' | 'uploading' | 'polling' | 'done' | 'error';

export function useTopographyUpload() {
  const [phase, setPhase] = useState<TopographyPhase>('idle');
  const [scanId, setScanId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const upload = useCallback(async function upload(params: {
    assessmentId: number;
    videoUri: string | null;
    stillUris: string[];
  }) {
    setPhase('uploading');
    setError(null);
    try {
      const result = await api.postTopographyScan<{ id: number; status: string }>(
        {
          assessment: String(params.assessmentId),
          device_model: Device.modelName ?? '',
          phone_model_id: Device.modelId ?? '',
        },
        params.videoUri ? { uri: params.videoUri, name: 'topography.mp4', type: 'video/mp4' } : null,
        params.stillUris.map((uri, i) => ({ uri, name: `still_${i}.jpg`, type: 'image/jpeg' })),
      );
      setScanId(result.id);
      setPhase('polling');
    } catch (e) {
      if (e instanceof AuthExpiredError) throw e;
      setError(e instanceof Error ? e.message : 'Upload failed. Check your connection.');
      setPhase('error');
    }
  }, []);

  return { phase, scanId, error, upload };
}
```

- [ ] **Step 3: Typecheck**

Run: `cd /opt/tearflex/mobile && npm run typecheck`
Expected: PASS. (`Device.modelId` and `Device.modelName` are both string|null on `expo-device`.)

- [ ] **Step 4: Commit**

```bash
cd /opt/tearflex && git add mobile/lib/api.ts mobile/hooks/useTopographyUpload.ts && \
git commit -m "feat(topography): mobile multi-file scan upload helper and hook"
```

---

### Task 7: Mobile — capture entry (select-test card, instructions, capture screen)

**Files:**
- Create: `mobile/app/assessment/topography-capture.tsx`
- Modify: `mobile/app/assessment/select-test.tsx`, `mobile/app/assessment/instructions.tsx`

**Interfaces:**
- Consumes: `useCreateAssessment` (existing), `react-native-vision-camera`, Expo Router.
- Produces: a Topography modality card on select-test that creates the `Assessment` then routes to `/assessment/instructions` with `testType='topography'`; an instructions branch that routes topography to `/assessment/topography-capture`; the capture screen which records a short video + still burst and navigates to `/assessment/topography-processing` with `{ assessmentId, videoUri, stillUris }` (`stillUris` is a JSON-encoded `string[]`).

- [ ] **Step 1: Add the topography modality card to select-test**

In `mobile/app/assessment/select-test.tsx`:

Change the selection state to allow the topography literal:
```tsx
  const [selectedTest, setSelectedTest] = useState<TestType | 'topography' | null>(null);
```

In `handleStart`, branch the navigation after the assessment is created (replace the existing single `router.push`):
```tsx
      router.push({
        pathname: '/assessment/instructions',
        params: { assessmentId: String(assessment.id), testType: selectedTest },
      });
```
This line is unchanged — `selectedTest` now may be `'topography'`, which the instructions screen handles in Step 2. No other change to `handleStart` is needed.

Add a topography card directly after the `{TEST_TYPES.map(...)}` block (it is visually separate, labelled research):
```tsx
        <TouchableOpacity
          className={`rounded-xl p-4 mb-3 border-2 ${
            selectedTest === 'topography'
              ? 'border-teal-600 bg-teal-50'
              : 'border-slate-300 bg-white'
          }`}
          onPress={() => setSelectedTest('topography')}
          activeOpacity={0.8}
        >
          <Text className={`font-semibold text-base mb-0.5 ${
            selectedTest === 'topography' ? 'text-teal-700' : 'text-slate-900'
          }`}>
            Corneal Topography
          </Text>
          <Text className="text-sm text-slate-600">
            Curvature map & SimK from Placido ring shape · research use
          </Text>
        </TouchableOpacity>
```

- [ ] **Step 2: Add topography instructions and branch navigation**

In `mobile/app/assessment/instructions.tsx`:

Widen the instructions map and param types to include topography, and add the topography entry:
```tsx
const INSTRUCTIONS: Record<TestType | 'topography', { title: string; steps: string[] }> = {
```
Add this entry inside the `INSTRUCTIONS` object (e.g. after `lipid`):
```tsx
  topography: {
    title: 'Corneal Topography Capture',
    steps: [
      'Ensure the Placido disc attachment is firmly clipped onto the rear camera.',
      'Ask the patient to look directly at the central dot and open the eye wide.',
      'Hold the phone steady so the rings are sharp and centred on the cornea.',
      'Tap capture — a short video and a burst of still photos are taken together.',
      'Keep still for the one to two seconds of capture.',
    ],
  },
```
Update the `useLocalSearchParams` generic and the safe-type fallback:
```tsx
  const { assessmentId, testType } = useLocalSearchParams<{
    assessmentId: string;
    testType: TestType | 'topography';
  }>();
  const router = useRouter();
  const safeType = testType in INSTRUCTIONS ? testType : ('nibut' as TestType);
  const instructions = INSTRUCTIONS[safeType];
```
Replace the "I'm ready" `onPress` navigation so topography routes to its own capture screen:
```tsx
          onPress={() =>
            router.push(
              safeType === 'topography'
                ? { pathname: '/assessment/topography-capture', params: { assessmentId } }
                : { pathname: '/assessment/capture', params: { assessmentId, testType } },
            )
          }
```

- [ ] **Step 3: Write the capture screen**

`mobile/app/assessment/topography-capture.tsx`:
```tsx
import { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { Camera, useCameraDevice, useCameraPermission } from 'react-native-vision-camera';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const STILL_BURST_COUNT = 5;
const VIDEO_MAX_MS = 1800;

function withFileScheme(path: string): string {
  return path.startsWith('file://') ? path : `file://${path}`;
}

export default function TopographyCaptureScreen() {
  const { assessmentId } = useLocalSearchParams<{ assessmentId: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const device = useCameraDevice('back');
  const { hasPermission, requestPermission } = useCameraPermission();
  const camera = useRef<Camera>(null);
  const [capturing, setCapturing] = useState(false);

  useEffect(() => {
    if (!hasPermission) requestPermission();
  }, [hasPermission, requestPermission]);

  async function handleCapture() {
    if (!camera.current || capturing) return;
    setCapturing(true);
    const stillUris: string[] = [];
    try {
      camera.current.startRecording({
        onRecordingFinished: (video) => {
          router.replace({
            pathname: '/assessment/topography-processing',
            params: {
              assessmentId: assessmentId ?? '',
              videoUri: withFileScheme(video.path),
              stillUris: JSON.stringify(stillUris),
            },
          });
        },
        onRecordingError: () => setCapturing(false),
      });
      for (let i = 0; i < STILL_BURST_COUNT; i++) {
        const photo = await camera.current.takePhoto();
        stillUris.push(withFileScheme(photo.path));
      }
      setTimeout(() => camera.current?.stopRecording(), VIDEO_MAX_MS);
    } catch {
      setCapturing(false);
    }
  }

  if (!hasPermission || !device) {
    return (
      <View style={styles.centred}>
        <StatusBar hidden />
        <Text style={styles.message}>
          {!hasPermission ? 'Camera permission is required.' : 'No rear camera available.'}
        </Text>
        <TouchableOpacity style={styles.cancel} onPress={() => router.back()}>
          <Text style={styles.cancelText}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar hidden />
      <Camera
        ref={camera}
        style={StyleSheet.absoluteFill}
        device={device}
        isActive
        photo
        video
      />
      <View style={[styles.overlay, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <Text style={styles.cancelX}>✕</Text>
        </TouchableOpacity>
        <Text style={styles.label}>Corneal Topography</Text>
        <View style={{ width: 24 }} />
      </View>
      <View style={styles.ring} pointerEvents="none" />
      <View style={[styles.bottom, { paddingBottom: insets.bottom + 24 }]}>
        <Text style={styles.prompt}>
          {capturing ? 'Hold steady — capturing…' : 'Centre the rings, then tap to capture'}
        </Text>
        <TouchableOpacity
          style={[styles.shutter, capturing && styles.shutterBusy]}
          onPress={handleCapture}
          disabled={capturing}
          activeOpacity={0.8}
        >
          {capturing ? <ActivityIndicator color="#FFFFFF" /> : <View style={styles.shutterInner} />}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000000' },
  centred: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0F172A', gap: 16, paddingHorizontal: 32 },
  message: { color: '#FFFFFF', fontSize: 16, textAlign: 'center' },
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20 },
  cancelX: { color: '#FFFFFF', fontSize: 22, fontWeight: '600' },
  label: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  ring: { position: 'absolute', alignSelf: 'center', top: '30%', width: 260, height: 260, borderRadius: 130, borderWidth: 3, borderColor: 'rgba(255,255,255,0.7)' },
  bottom: { position: 'absolute', bottom: 0, left: 0, right: 0, alignItems: 'center', gap: 20 },
  prompt: { color: '#FFFFFF', fontSize: 15, textAlign: 'center', paddingHorizontal: 24 },
  shutter: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#F97066', alignItems: 'center', justifyContent: 'center' },
  shutterBusy: { backgroundColor: '#475569' },
  shutterInner: { width: 64, height: 64, borderRadius: 32, borderWidth: 3, borderColor: '#FFFFFF' },
  cancel: { paddingVertical: 12, paddingHorizontal: 24, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)' },
  cancelText: { color: '#FFFFFF', fontSize: 15, fontWeight: '500' },
});
```

- [ ] **Step 4: Typecheck**

Run: `cd /opt/tearflex/mobile && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Manual verification (on a dev build)**

On a device running the dev build: open a patient → New Assessment → pick an eye → select "Corneal Topography" → Continue → read instructions → "I'm ready" opens the vision-camera screen → tap capture → confirm it records ~1.8s + a still burst and navigates to processing. (Requires Task 5's `expo prebuild`.)

- [ ] **Step 6: Commit**

```bash
cd /opt/tearflex && git add mobile/app/assessment/topography-capture.tsx mobile/app/assessment/select-test.tsx mobile/app/assessment/instructions.tsx && \
git commit -m "feat(topography): mobile capture entry, instructions and vision-camera screen"
```

---

### Task 8: Mobile — processing screen (upload + status poll)

**Files:**
- Create: `mobile/app/assessment/topography-processing.tsx`

**Interfaces:**
- Consumes: `useTopographyUpload` (Task 6), `api.get` for `topography/scans/{id}/status/`, Expo Router params `{ assessmentId, videoUri, stillUris }` (`stillUris` JSON-encoded).
- Produces: on `status === 'analysed'`, navigates to `/assessment/topography-results` with `{ scanId }`.

- [ ] **Step 1: Write the processing screen**

`mobile/app/assessment/topography-processing.tsx`:
```tsx
import { useEffect } from 'react';
import { View, Text, TouchableOpacity, BackHandler, StyleSheet, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTopographyUpload, type TopographyPhase } from '@/hooks/useTopographyUpload';
import { api, AuthExpiredError } from '@/lib/api';
import { useAuthStore } from '@/store/auth';

type ScanStatusResponse = { status: string };

function parseStillUris(raw: string | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((u): u is string => typeof u === 'string') : [];
  } catch {
    return [];
  }
}

export default function TopographyProcessingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { assessmentId, videoUri, stillUris } = useLocalSearchParams<{
    assessmentId: string;
    videoUri: string;
    stillUris: string;
  }>();

  const { phase, scanId, error, upload } = useTopographyUpload();

  useEffect(() => {
    if (!assessmentId) { router.replace('/(tabs)/'); return; }
    const stills = parseStillUris(stillUris);
    if (stills.length === 0 && !videoUri) { router.replace('/(tabs)/'); return; }
    upload({ assessmentId: Number(assessmentId), videoUri: videoUri ?? null, stillUris: stills })
      .catch((e: unknown) => {
        if (e instanceof AuthExpiredError) useAuthStore.getState().clear();
      });
  }, [assessmentId, videoUri, stillUris, upload, router]);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () =>
      phase === 'uploading' || phase === 'polling');
    return () => sub.remove();
  }, [phase]);

  const { data: statusData } = useQuery<ScanStatusResponse>({
    queryKey: ['topography-scan-status', scanId],
    queryFn: () => {
      if (scanId === null) throw new Error('scanId is null');
      return api.get<ScanStatusResponse>(`topography/scans/${scanId}/status/`);
    },
    enabled: phase === 'polling' && scanId !== null,
    refetchInterval: (query) => {
      const s = query.state.data?.status;
      if (s === 'analysed' || s === 'failed') return false;
      return 2000;
    },
  });

  useEffect(() => {
    if (statusData?.status === 'analysed' && scanId !== null) {
      router.replace({
        pathname: '/assessment/topography-results',
        params: { scanId: String(scanId) },
      });
    }
  }, [statusData?.status, scanId, router]);

  const isError = phase === 'error' || statusData?.status === 'failed';

  const phaseSubtitles: Record<TopographyPhase, string> = {
    idle: 'Preparing…',
    uploading: 'Uploading scan…',
    polling: 'Reconstructing corneal shape…',
    done: 'Done',
    error: '',
  };

  if (isError) {
    return (
      <View style={styles.container}>
        <StatusBar hidden />
        <View style={[styles.content, { paddingTop: insets.top, paddingBottom: insets.bottom + 24 }]}>
          <View style={styles.errorIcon}><Text style={styles.errorIconText}>✕</Text></View>
          <Text style={styles.title}>Reconstruction failed</Text>
          <Text style={styles.subtitle}>{error ?? 'Something went wrong. Please try again.'}</Text>
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
        <Text style={styles.title}>Analysing corneal shape…</Text>
        <Text style={styles.subtitle}>{phaseSubtitles[phase]}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F172A' },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 16 },
  title: { color: '#FFFFFF', fontSize: 18, fontWeight: '600', textAlign: 'center', marginTop: 8 },
  subtitle: { color: '#94A3B8', fontSize: 14, textAlign: 'center' },
  errorIcon: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#F87171', alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  errorIconText: { color: '#FFFFFF', fontSize: 24, fontWeight: '700' },
  buttonGroup: { alignSelf: 'stretch', gap: 12, marginTop: 16 },
  retryButton: { backgroundColor: '#0E7C7B', paddingVertical: 14, borderRadius: 10, alignItems: 'center' },
  retryButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  cancelButton: { paddingVertical: 14, borderRadius: 10, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' },
  cancelButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '500' },
});
```

- [ ] **Step 2: Typecheck**

Run: `cd /opt/tearflex/mobile && npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Manual verification**

After a capture, confirm the screen uploads, shows "Reconstructing corneal shape…", polls every 2s, and routes to results when the backend marks the scan `analysed`. Confirm a failed scan shows the error card.

- [ ] **Step 4: Commit**

```bash
cd /opt/tearflex && git add mobile/app/assessment/topography-processing.tsx && \
git commit -m "feat(topography): mobile processing screen with upload and status polling"
```

---

### Task 9: Mobile — results screen

**Files:**
- Create: `mobile/app/assessment/topography-results.tsx`

**Interfaces:**
- Consumes: `api.get` for `topography/scans/{id}/`, `TopographyScan` type, shared `RESEARCH_USE_DISCLAIMER`.
- Produces: the topography results view — research banner, central K headline, SimK/astigmatism metrics, axial map + ring overlay images, provenance line.

- [ ] **Step 1: Write the results screen**

`mobile/app/assessment/topography-results.tsx`:
```tsx
import { View, Text, ScrollView, Image, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { RESEARCH_USE_DISCLAIMER } from '@shared/constants/topography';
import type { TopographyScan } from '@shared/types/topography';

function fmtD(d: number | null): string {
  return d != null ? `${d.toFixed(2)} D` : '—';
}
function fmtAxis(a: number | null): string {
  return a != null ? `${Math.round(a)}°` : '—';
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View className="w-1/2 mb-4">
      <Text className="text-xs uppercase text-slate-500">{label}</Text>
      <Text className="text-base font-semibold text-slate-900 tabular-nums">{value}</Text>
    </View>
  );
}

function TopoImage({ uri, label }: { uri: string | null; label: string }) {
  return (
    <View className="mb-4">
      <Text className="font-semibold text-slate-900 mb-2">{label}</Text>
      {uri
        ? <Image source={{ uri }} className="w-full h-64 rounded-lg" resizeMode="contain" />
        : (
          <View className="w-full h-48 rounded-lg bg-slate-200 items-center justify-center">
            <Text className="text-slate-500 text-sm">Not available</Text>
          </View>
        )}
    </View>
  );
}

export default function TopographyResultsScreen() {
  const { scanId } = useLocalSearchParams<{ scanId: string }>();
  const router = useRouter();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['topography-scan', scanId],
    queryFn: () => api.get<TopographyScan>(`topography/scans/${scanId}/`),
    enabled: !!scanId,
    staleTime: 60_000,
  });

  if (isLoading) {
    return (
      <SafeAreaView className="flex-1 bg-slate-50 items-center justify-center">
        <ActivityIndicator size="large" color="#0E7C7B" />
      </SafeAreaView>
    );
  }

  const result = data?.result ?? null;

  return (
    <SafeAreaView className="flex-1 bg-slate-50">
      <ScrollView className="flex-1 px-4" showsVerticalScrollIndicator={false}>
        <Text className="text-xl font-bold text-slate-900 pt-4 mb-4">Corneal Topography</Text>

        <View className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 mb-4">
          <Text className="text-sm font-medium text-amber-900">{RESEARCH_USE_DISCLAIMER}</Text>
        </View>

        {isError || !result ? (
          <Text className="text-slate-600 text-base">Result not available.</Text>
        ) : (
          <>
            <View className="rounded-xl bg-white p-5 mb-4">
              <Text className="text-xs uppercase text-slate-500">Central K (assumed scale)</Text>
              <Text className="text-5xl font-bold text-teal-700 tabular-nums">{fmtD(result.central_k)}</Text>
            </View>

            <View className="rounded-xl bg-white p-5 mb-4 flex-row flex-wrap">
              <Metric label="SimK flat" value={fmtD(result.sim_k_flat)} />
              <Metric label="SimK steep" value={fmtD(result.sim_k_steep)} />
              <Metric label="Steep axis" value={fmtAxis(result.sim_k_axis)} />
              <Metric label="Astigmatism" value={fmtD(result.astigmatism_magnitude)} />
              <Metric label="Astig. axis" value={fmtAxis(result.astigmatism_axis)} />
              <Metric label="Confidence" value={result.confidence != null ? `${Math.round(result.confidence * 100)}%` : '—'} />
            </View>

            <View className="rounded-xl bg-white p-5 mb-4">
              <TopoImage uri={result.axial_map} label="Axial curvature map" />
              <TopoImage uri={result.ring_overlay} label="Detected rings" />
            </View>

            <Text className="text-xs text-slate-500 mb-4">
              Algorithm {result.algorithm_version || '—'} · {result.calibration_state || 'uncalibrated'}
            </Text>
          </>
        )}

        <TouchableOpacity
          className="bg-teal-600 rounded-xl py-4 items-center mt-2 mb-8"
          onPress={() => router.replace('/(tabs)/')}
          activeOpacity={0.8}
        >
          <Text className="text-white font-semibold text-base">Done</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `cd /opt/tearflex/mobile && npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Manual verification (end-to-end)**

On the dev build, complete a full topography capture. Confirm the results screen shows the amber research banner, central K headline, SimK/astigmatism metrics, the axial map and ring overlay images, the provenance line (`topo-v0.1 · uncalibrated`), and that "Done" returns to the dashboard. Then confirm the same scan appears on the web assessment detail page (Task 4).

- [ ] **Step 4: Commit**

```bash
cd /opt/tearflex && git add mobile/app/assessment/topography-results.tsx && \
git commit -m "feat(topography): mobile results screen with research-use badging"
```

---

## Self-Review

**Spec coverage (frontend slice of the spec):**
- Shared `topography.ts` types + constants (`TopographyScan`/`Still`/`Result`, `CalibrationState`) → Task 1. ✓
- Capture flow step 1 — Topography as a selectable modality, distinct from `TestType`, creating the `Assessment` first → Task 7 (select-test card + instructions branch). ✓
- Capture flow steps 2–4 — topography instructions, vision-camera simultaneous video + still burst, multipart upload to `POST /api/topography/scans/` → Tasks 6, 7. ✓
- Capture flow step 5 — processing screen polling `GET scans/{id}/status/` → Task 8. ✓
- Capture flow step 6 + mobile results — `topography-results.tsx` with axial map, ring overlay, K-values, research-use banner → Task 9. ✓
- Web results — `TopographyResult.tsx`, `useTopography.ts`, shown under assessment detail, with research-use banner + `algorithm_version`/`calibration_state` provenance → Tasks 3, 4. ✓
- Setup — vision-camera + config plugin + `expo-dev-client` + prebuild; routes registered → Task 5. ✓
- Honesty model — `RESEARCH_USE_DISCLAIMER` on both surfaces, "(assumed scale)" K-values, provenance line; **no keratoconus/irregularity/I-S fields rendered** → Tasks 1, 3, 9. ✓
- Backend gap closed so web can discover scans by assessment (not in the spec's endpoint list, required by "shown under the assessment detail") → Task 2. ✓

**Deliberate deviations from the spec (documented):**
- The spec lists "Modified: `processing.tsx` (poll topography status)". Instead a **dedicated** `topography-processing.tsx` is added (Task 8). The existing `processing.tsx` is tightly coupled to the single-`video_file` capture upload and guards `testType ∈ {nibut, fluorescein, lipid}`; a parallel screen keeps both flows simple — consistent with the spec's own principle of not polluting the tear-film path (key decision 5 / "keeping the tear-film type system clean"). The tear-film `processing.tsx` is left unchanged.

**Placeholder scan:** No TBD/TODO. Every code step contains complete code; every web/backend test step has real assertions; every mobile task has a typecheck gate + concrete manual checklist (mobile has no RN test runner — see Global Constraints). ✓

**Type consistency:**
- `TopographyResult`/`TopographyScan`/`TopographyStill` field names (Task 1) match the backend serializer fields exactly (`ring_overlay`, `axial_map`, `sim_k_flat`, `sim_k_steep`, `sim_k_axis`, `central_k`, `astigmatism_magnitude`, `astigmatism_axis`, `confidence`, `algorithm_version`, `calibration_state`, `analysed_at`; scan: `id`, `assessment`, `video_file`, `device_model`, `phone_model_id`, `app_version`, `calibration_state`, `status`, `captured_at`, `stills`, `result`).
- `api.postTopographyScan(fields, video, stills)` (Task 6) is called with exactly that arity from `useTopographyUpload` (Task 6); `useTopographyUpload().upload({ assessmentId, videoUri, stillUris })` matches the call in `topography-processing.tsx` (Task 8).
- Capture → processing params (`assessmentId`, `videoUri`, `stillUris` as JSON string) produced in Task 7 match the `useLocalSearchParams` reads + `parseStillUris` in Task 8. Processing → results param (`scanId`) produced in Task 8 matches the read in Task 9.
- `useTopographyScans(assessmentId)` returns `Paginated<TopographyScan>` (Task 4) and the page reads `topographyData?.results` (Task 4) — matches DRF's paginated list from Task 2.
- Web `dioptreColour`/`formatDioptre`/`formatAxis`/`calibrationLabel` signatures (Task 1) match their call sites in `TopographyResult.tsx` (Task 3). ✓
