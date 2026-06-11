# Web Assessment Creation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a 5-step manual assessment creation flow to the web app so clinicians can enter tear film results without the mobile app.

**Architecture:** New page at `/patients/[id]/assessments/new` hosts a stepper component that collects eye selection, then optionally NIBUT/fluorescein/lipid results, then saves via a new `POST /api/assessments/captures/manual/` endpoint that creates a stub `TestCapture` + `TestResult` in one call (no video required). Assessment status is patched to `complete` after all captures are saved.

**Tech Stack:** Django REST Framework (backend), Next.js 14 App Router, React Hook Form + Zod, TanStack Query, shadcn/ui, Tailwind CSS.

---

## File Map

**Backend — modified:**
- `backend/apps/assessments/models.py` — make `video_file` optional, add `source` field
- `backend/apps/assessments/serializers.py` — add `ManualCaptureSerializer`; remove `status` from `AssessmentSerializer.read_only_fields`
- `backend/apps/assessments/views.py` — add `ManualCaptureCreateView`
- `backend/apps/assessments/urls.py` — register `captures/manual/` before `captures/<int:pk>/`

**Backend — created:**
- `backend/apps/assessments/migrations/0002_testcapture_source_video_optional.py`
- `backend/apps/assessments/tests/test_manual_capture.py`

**Frontend — modified:**
- `web/src/lib/schemas.ts` — add four step schemas + types
- `web/src/hooks/useAssessments.ts` — add `useCreateAssessment`, `useCreateManualCapture`
- `web/src/components/patients/PatientProfile.tsx` — add "New assessment" button

**Frontend — created:**
- `web/src/components/assessments/steps/StepEye.tsx`
- `web/src/components/assessments/steps/StepNibut.tsx`
- `web/src/components/assessments/steps/StepFluorescein.tsx`
- `web/src/components/assessments/steps/StepLipid.tsx`
- `web/src/components/assessments/steps/StepReview.tsx`
- `web/src/components/assessments/NewAssessmentStepper.tsx`
- `web/src/app/(dashboard)/patients/[id]/assessments/new/page.tsx`

---

## Task 1: Backend — Model Changes

**Files:**
- Modify: `backend/apps/assessments/models.py`
- Create: `backend/apps/assessments/migrations/0002_testcapture_source_video_optional.py`

- [ ] **Step 1: Edit TestCapture in models.py**

In `backend/apps/assessments/models.py`, update the `TestCapture` class. Replace:
```python
video_file = models.FileField(upload_to='captures/%Y/%m/%d/')
```
with:
```python
source = models.CharField(
    max_length=10,
    choices=[('mobile', 'Mobile'), ('manual', 'Manual')],
    default='mobile',
)
video_file = models.FileField(upload_to='captures/%Y/%m/%d/', blank=True, null=True)
```
Place `source` immediately before `video_file`.

- [ ] **Step 2: Create the migration**

```bash
docker compose -f /opt/tearflex/docker-compose.prod.yml exec backend python manage.py makemigrations assessments --name testcapture_source_video_optional
```

Expected output: `Migrations for 'assessments': apps/assessments/migrations/0002_testcapture_source_video_optional.py`

- [ ] **Step 3: Apply the migration**

```bash
docker compose -f /opt/tearflex/docker-compose.prod.yml exec backend python manage.py migrate assessments
```

Expected output: `Applying assessments.0002_testcapture_source_video_optional... OK`

- [ ] **Step 4: Commit**

```bash
git -C /opt/tearflex add backend/apps/assessments/models.py backend/apps/assessments/migrations/
git -C /opt/tearflex commit -m "feat: make TestCapture.video_file optional, add source field"
```

---

## Task 2: Backend — Manual Capture Endpoint

**Files:**
- Modify: `backend/apps/assessments/serializers.py`
- Modify: `backend/apps/assessments/views.py`
- Modify: `backend/apps/assessments/urls.py`

- [ ] **Step 1: Add ManualCaptureSerializer and update AssessmentSerializer**

In `backend/apps/assessments/serializers.py`, add this class at the bottom of the file:

```python
class ManualCaptureSerializer(serializers.Serializer):
    assessment = serializers.PrimaryKeyRelatedField(queryset=Assessment.objects.all())
    test_type = serializers.ChoiceField(choices=TestCapture.TEST_TYPE_CHOICES)
    nibut_first_breakup_seconds = serializers.FloatField(required=False, allow_null=True)
    nibut_mean_breakup_seconds = serializers.FloatField(required=False, allow_null=True)
    fluorescein_grade = serializers.IntegerField(required=False, allow_null=True)
    fluorescein_breakup_seconds = serializers.FloatField(required=False, allow_null=True)
    lipid_grade = serializers.IntegerField(required=False, allow_null=True)
    lipid_thickness_nm = serializers.FloatField(required=False, allow_null=True)
    tear_meniscus_height_mm = serializers.FloatField(required=False, allow_null=True)
```

Also update `AssessmentSerializer.Meta` — remove `'status'` from `read_only_fields`:

```python
read_only_fields = ['id', 'assessed_at', 'updated_at', 'clinician']
```

- [ ] **Step 2: Add ManualCaptureCreateView to views.py**

Add this import at the top of `backend/apps/assessments/views.py` (after existing imports):
```python
from .serializers import (
    AssessmentSerializer, AssessmentListSerializer,
    TestCaptureSerializer, TestCaptureUploadSerializer,
    ManualCaptureSerializer,
)
from .models import Assessment, TestCapture, TestResult
```

Then add this class at the bottom of `views.py`:

```python
class ManualCaptureCreateView(generics.GenericAPIView):
    serializer_class = ManualCaptureSerializer
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        user = request.user
        data = serializer.validated_data
        assessment = data['assessment']

        if not user.is_superuser:
            try:
                practice = user.clinician.practice
            except (AttributeError, ObjectDoesNotExist):
                raise PermissionDenied()
            if assessment.patient.practice_id != practice.id:
                raise PermissionDenied()
        else:
            practice = assessment.patient.practice

        capture = TestCapture.objects.create(
            assessment=assessment,
            test_type=data['test_type'],
            source='manual',
            status='analysed',
        )

        nibut = data.get('nibut_first_breakup_seconds')
        dry_eye_severity = None
        if nibut is not None:
            normal = practice.nibut_normal_threshold
            borderline = practice.nibut_borderline_threshold
            if nibut >= normal:
                dry_eye_severity = 'normal'
            elif nibut >= borderline:
                dry_eye_severity = 'mild'
            else:
                dry_eye_severity = 'moderate'

        TestResult.objects.create(
            capture=capture,
            nibut_first_breakup_seconds=nibut,
            nibut_mean_breakup_seconds=data.get('nibut_mean_breakup_seconds'),
            fluorescein_grade=data.get('fluorescein_grade'),
            fluorescein_breakup_seconds=data.get('fluorescein_breakup_seconds'),
            lipid_grade=data.get('lipid_grade'),
            lipid_thickness_nm=data.get('lipid_thickness_nm'),
            tear_meniscus_height_mm=data.get('tear_meniscus_height_mm'),
            dry_eye_severity=dry_eye_severity,
        )

        capture_with_result = TestCapture.objects.select_related('result').get(pk=capture.pk)
        return Response(TestCaptureSerializer(capture_with_result).data, status=status.HTTP_201_CREATED)
```

Note: `TestResult` is already imported via `from .models import ...` — confirm the import line above includes it.

- [ ] **Step 3: Register the URL**

In `backend/apps/assessments/urls.py`, add the manual capture URL **before** `captures/<int:pk>/`:

```python
from django.urls import path
from . import views

urlpatterns = [
    path('', views.AssessmentListCreateView.as_view(), name='assessment-list'),
    path('<int:pk>/', views.AssessmentDetailView.as_view(), name='assessment-detail'),
    path('captures/', views.CaptureUploadView.as_view(), name='capture-upload'),
    path('captures/manual/', views.ManualCaptureCreateView.as_view(), name='manual-capture-create'),
    path('captures/<int:pk>/', views.CaptureDetailView.as_view(), name='capture-detail'),
    path('captures/<int:pk>/status/', views.capture_status, name='capture-status'),
]
```

- [ ] **Step 4: Commit**

```bash
git -C /opt/tearflex add backend/apps/assessments/serializers.py backend/apps/assessments/views.py backend/apps/assessments/urls.py
git -C /opt/tearflex commit -m "feat: add manual capture endpoint"
```

---

## Task 3: Backend — Tests

**Files:**
- Create: `backend/apps/assessments/tests/test_manual_capture.py`

- [ ] **Step 1: Write the tests**

Create `backend/apps/assessments/tests/test_manual_capture.py`:

```python
import pytest
from rest_framework.test import APIClient

from conftest import AssessmentFactory, PatientFactory


@pytest.mark.django_db
def test_manual_nibut_creates_capture_and_result(api, clinician):
    from apps.assessments.models import TestCapture, TestResult
    patient = PatientFactory(practice=clinician.practice)
    assessment = AssessmentFactory(patient=patient, clinician=clinician)

    resp = api.post('/api/assessments/captures/manual/', {
        'assessment': assessment.id,
        'test_type': 'nibut',
        'nibut_first_breakup_seconds': 7.2,
        'nibut_mean_breakup_seconds': 8.1,
    }, format='json')

    assert resp.status_code == 201
    capture = TestCapture.objects.get(pk=resp.data['id'])
    assert capture.source == 'manual'
    assert capture.status == 'analysed'
    assert not capture.video_file
    result = TestResult.objects.get(capture=capture)
    assert result.nibut_first_breakup_seconds == pytest.approx(7.2)
    assert result.nibut_mean_breakup_seconds == pytest.approx(8.1)
    assert result.dry_eye_severity == 'mild'  # 7.2 is between defaults (5–10)


@pytest.mark.django_db
def test_nibut_normal_severity(api, clinician):
    from apps.assessments.models import TestResult
    patient = PatientFactory(practice=clinician.practice)
    assessment = AssessmentFactory(patient=patient, clinician=clinician)

    resp = api.post('/api/assessments/captures/manual/', {
        'assessment': assessment.id,
        'test_type': 'nibut',
        'nibut_first_breakup_seconds': 12.0,
    }, format='json')

    assert resp.status_code == 201
    assert TestResult.objects.get(capture_id=resp.data['id']).dry_eye_severity == 'normal'


@pytest.mark.django_db
def test_nibut_moderate_severity(api, clinician):
    from apps.assessments.models import TestResult
    patient = PatientFactory(practice=clinician.practice)
    assessment = AssessmentFactory(patient=patient, clinician=clinician)

    resp = api.post('/api/assessments/captures/manual/', {
        'assessment': assessment.id,
        'test_type': 'nibut',
        'nibut_first_breakup_seconds': 3.0,
    }, format='json')

    assert resp.status_code == 201
    assert TestResult.objects.get(capture_id=resp.data['id']).dry_eye_severity == 'moderate'


@pytest.mark.django_db
def test_fluorescein_capture_no_nibut_severity(api, clinician):
    from apps.assessments.models import TestResult
    patient = PatientFactory(practice=clinician.practice)
    assessment = AssessmentFactory(patient=patient, clinician=clinician)

    resp = api.post('/api/assessments/captures/manual/', {
        'assessment': assessment.id,
        'test_type': 'fluorescein',
        'fluorescein_grade': 2,
    }, format='json')

    assert resp.status_code == 201
    assert TestResult.objects.get(capture_id=resp.data['id']).dry_eye_severity is None


@pytest.mark.django_db
def test_manual_capture_rejects_other_practice(api):
    patient = PatientFactory()  # different practice
    assessment = AssessmentFactory(patient=patient)

    resp = api.post('/api/assessments/captures/manual/', {
        'assessment': assessment.id,
        'test_type': 'nibut',
        'nibut_first_breakup_seconds': 7.2,
    }, format='json')

    assert resp.status_code == 403


@pytest.mark.django_db
def test_manual_capture_unauthenticated():
    patient = PatientFactory()
    assessment = AssessmentFactory(patient=patient)
    client = APIClient()

    resp = client.post('/api/assessments/captures/manual/', {
        'assessment': assessment.id,
        'test_type': 'nibut',
        'nibut_first_breakup_seconds': 7.2,
    }, format='json')

    assert resp.status_code == 401
```

- [ ] **Step 2: Run the tests**

```bash
docker compose -f /opt/tearflex/docker-compose.prod.yml exec backend pytest apps/assessments/tests/test_manual_capture.py -v
```

Expected: all 6 tests PASS.

- [ ] **Step 3: Commit**

```bash
git -C /opt/tearflex add backend/apps/assessments/tests/test_manual_capture.py
git -C /opt/tearflex commit -m "test: manual capture endpoint"
```

---

## Task 4: Frontend — Zod Schemas

**Files:**
- Modify: `web/src/lib/schemas.ts`

- [ ] **Step 1: Add step schemas to schemas.ts**

Append these exports to the bottom of `web/src/lib/schemas.ts`:

```typescript
// ─── Assessment creation stepper schemas ───────────────────────────────────

const optPosNum = (max = 60) =>
  z.preprocess(
    (v) => (v === '' || v == null) ? undefined : v,
    z.coerce.number().positive('Must be positive').max(max, `Max ${max} seconds`).optional(),
  )

export const eyeStepSchema = z.object({
  eye: z.enum(['left', 'right'] as const),
})
export type EyeStepData = z.infer<typeof eyeStepSchema>

export const nibutStepSchema = z.object({
  nibut_first_breakup_seconds: z.preprocess(
    (v) => (v === '' || v == null) ? undefined : v,
    z.coerce.number({ invalid_type_error: 'Required' }).positive('Must be positive').max(60, 'Max 60 seconds'),
  ),
  nibut_mean_breakup_seconds: optPosNum(),
})
export type NibutStepData = z.infer<typeof nibutStepSchema>

export const fluoresceinStepSchema = z.object({
  fluorescein_grade: z.preprocess(
    (v) => (v === '' || v == null) ? undefined : v,
    z.coerce.number().int().min(0, 'Min 0').max(5, 'Max 5').optional(),
  ),
  fluorescein_breakup_seconds: optPosNum(),
})
export type FluoresceinStepData = z.infer<typeof fluoresceinStepSchema>

export const lipidStepSchema = z.object({
  lipid_grade: z.preprocess(
    (v) => (v === '' || v == null) ? undefined : v,
    z.coerce.number().int().min(1, 'Min 1').max(5, 'Max 5').optional(),
  ),
  lipid_thickness_nm: z.preprocess(
    (v) => (v === '' || v == null) ? undefined : v,
    z.coerce.number().positive('Must be positive').optional(),
  ),
  tear_meniscus_height_mm: z.preprocess(
    (v) => (v === '' || v == null) ? undefined : v,
    z.coerce.number().positive('Must be positive').optional(),
  ),
})
export type LipidStepData = z.infer<typeof lipidStepSchema>
```

- [ ] **Step 2: Run typecheck**

```bash
cd /opt/tearflex/web && npm run typecheck 2>&1 | tail -5
```

Expected: `Found 0 errors.` (or only pre-existing errors).

- [ ] **Step 3: Commit**

```bash
git -C /opt/tearflex add web/src/lib/schemas.ts
git -C /opt/tearflex commit -m "feat: add assessment stepper Zod schemas"
```

---

## Task 5: Frontend — Hooks

**Files:**
- Modify: `web/src/hooks/useAssessments.ts`

- [ ] **Step 1: Add mutations to useAssessments.ts**

Add these imports to the top of `web/src/hooks/useAssessments.ts` (add `useMutation` and `useQueryClient` if not already imported):

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
```

Then append these two functions to the bottom of the file:

```typescript
export function useCreateAssessment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { patient: number; eye: string }) =>
      api.post<Assessment>('assessments/', data),
    onSuccess: (_, variables) =>
      qc.invalidateQueries({ queryKey: ['assessments', { patient: variables.patient }] }),
  })
}

interface ManualCaptureInput {
  assessment: number
  test_type: string
  nibut_first_breakup_seconds?: number
  nibut_mean_breakup_seconds?: number
  fluorescein_grade?: number
  fluorescein_breakup_seconds?: number
  lipid_grade?: number
  lipid_thickness_nm?: number
  tear_meniscus_height_mm?: number
}

export function useCreateManualCapture() {
  return useMutation({
    mutationFn: (data: ManualCaptureInput) =>
      api.post('assessments/captures/manual/', data),
  })
}
```

- [ ] **Step 2: Run typecheck**

```bash
cd /opt/tearflex/web && npm run typecheck 2>&1 | tail -5
```

Expected: `Found 0 errors.`

- [ ] **Step 3: Commit**

```bash
git -C /opt/tearflex add web/src/hooks/useAssessments.ts
git -C /opt/tearflex commit -m "feat: add useCreateAssessment and useCreateManualCapture hooks"
```

---

## Task 6: Frontend — Step Components

**Files:**
- Create: `web/src/components/assessments/steps/StepEye.tsx`
- Create: `web/src/components/assessments/steps/StepNibut.tsx`
- Create: `web/src/components/assessments/steps/StepFluorescein.tsx`
- Create: `web/src/components/assessments/steps/StepLipid.tsx`

- [ ] **Step 1: Create StepEye.tsx**

Create `web/src/components/assessments/steps/StepEye.tsx`:

```tsx
'use client'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Button } from '@/components/ui/button'
import { eyeStepSchema, type EyeStepData } from '@/lib/schemas'

interface Props {
  defaultValues?: EyeStepData | null
  onNext: (data: EyeStepData) => void
}

export function StepEye({ defaultValues, onNext }: Props) {
  const { handleSubmit, setValue, watch, formState: { errors } } = useForm<EyeStepData>({
    resolver: zodResolver(eyeStepSchema),
    defaultValues: defaultValues ?? undefined,
  })
  const eye = watch('eye')

  return (
    <form onSubmit={handleSubmit(onNext)} className="space-y-6">
      <div>
        <p className="mb-3 text-sm font-medium">Which eye is being assessed?</p>
        <div className="flex gap-3">
          {(['left', 'right'] as const).map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => setValue('eye', e, { shouldValidate: true })}
              className={`flex-1 rounded-lg border-2 px-6 py-5 text-sm font-semibold capitalize transition-colors ${
                eye === e
                  ? 'border-teal-600 bg-teal-50 text-teal-700'
                  : 'border-border bg-background hover:border-teal-300'
              }`}
            >
              {e} eye
            </button>
          ))}
        </div>
        {errors.eye && <p className="mt-1 text-xs text-red-500">{errors.eye.message}</p>}
      </div>
      <Button type="submit" className="w-full bg-teal-600 hover:bg-teal-700">Continue</Button>
    </form>
  )
}
```

- [ ] **Step 2: Create StepNibut.tsx**

Create `web/src/components/assessments/steps/StepNibut.tsx`:

```tsx
'use client'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { nibutStepSchema, nibutBand, type NibutStepData, type NibutThresholds } from '@/lib/schemas'
import { usePractice } from '@/hooks/usePractice'

interface Props {
  defaultValues?: NibutStepData | null
  onNext: (data: NibutStepData | null) => void
  onBack: () => void
}

export function StepNibut({ defaultValues, onNext, onBack }: Props) {
  const { data: practice } = usePractice()
  const thresholds: NibutThresholds = {
    normal: practice?.nibut_normal_threshold ?? 10,
    borderline: practice?.nibut_borderline_threshold ?? 5,
  }

  const { register, handleSubmit, watch, formState: { errors } } = useForm<NibutStepData>({
    resolver: zodResolver(nibutStepSchema),
    defaultValues: defaultValues ?? undefined,
  })

  const rawFirst = watch('nibut_first_breakup_seconds')
  const band = nibutBand(Number(rawFirst) || null, thresholds)

  return (
    <form onSubmit={handleSubmit((d) => onNext(d))} className="space-y-5">
      <div>
        <Label htmlFor="nibut-first">First break-up time (seconds)</Label>
        <Input
          id="nibut-first"
          type="number"
          step="0.1"
          min="0"
          max="60"
          placeholder="e.g. 7.5"
          {...register('nibut_first_breakup_seconds')}
        />
        {errors.nibut_first_breakup_seconds
          ? <p className="mt-1 text-xs text-red-500">{errors.nibut_first_breakup_seconds.message}</p>
          : rawFirst
            ? <p className="mt-1 text-xs font-medium" style={{ color: band.color }}>{band.label}</p>
            : null}
      </div>
      <div>
        <Label htmlFor="nibut-mean">Mean break-up time (seconds, optional)</Label>
        <Input
          id="nibut-mean"
          type="number"
          step="0.1"
          min="0"
          max="60"
          placeholder="e.g. 9.0"
          {...register('nibut_mean_breakup_seconds')}
        />
        {errors.nibut_mean_breakup_seconds && (
          <p className="mt-1 text-xs text-red-500">{errors.nibut_mean_breakup_seconds.message}</p>
        )}
      </div>
      <div className="flex gap-3 pt-2">
        <Button type="button" variant="outline" onClick={onBack} className="flex-1">Back</Button>
        <Button type="button" variant="outline" onClick={() => onNext(null)} className="flex-1">Skip</Button>
        <Button type="submit" className="flex-1 bg-teal-600 hover:bg-teal-700">Continue</Button>
      </div>
    </form>
  )
}
```

- [ ] **Step 3: Create StepFluorescein.tsx**

Create `web/src/components/assessments/steps/StepFluorescein.tsx`:

```tsx
'use client'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { fluoresceinStepSchema, type FluoresceinStepData } from '@/lib/schemas'

const OXFORD_LABELS = ['Absent', 'Minimal', 'Mild', 'Moderate', 'Marked', 'Severe'] as const

interface Props {
  defaultValues?: FluoresceinStepData | null
  onNext: (data: FluoresceinStepData | null) => void
  onBack: () => void
}

export function StepFluorescein({ defaultValues, onNext, onBack }: Props) {
  const { register, handleSubmit, setValue, watch, formState: { errors } } = useForm<FluoresceinStepData>({
    resolver: zodResolver(fluoresceinStepSchema),
    defaultValues: defaultValues ?? undefined,
  })
  const grade = watch('fluorescein_grade')

  return (
    <form onSubmit={handleSubmit((d) => onNext(d))} className="space-y-5">
      <div>
        <Label>Grade — Oxford scale (0–5, optional)</Label>
        <div className="mt-2 flex flex-wrap gap-2">
          {OXFORD_LABELS.map((label, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setValue('fluorescein_grade', grade === i ? undefined : i, { shouldValidate: true })}
              className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
                grade === i
                  ? 'border-teal-600 bg-teal-50 text-teal-700'
                  : 'border-border hover:border-teal-300'
              }`}
            >
              {i} — {label}
            </button>
          ))}
        </div>
        {errors.fluorescein_grade && (
          <p className="mt-1 text-xs text-red-500">{errors.fluorescein_grade.message}</p>
        )}
      </div>
      <div>
        <Label htmlFor="fluor-but">Break-up time (seconds, optional)</Label>
        <Input
          id="fluor-but"
          type="number"
          step="0.1"
          min="0"
          max="60"
          placeholder="e.g. 6.0"
          {...register('fluorescein_breakup_seconds')}
        />
        {errors.fluorescein_breakup_seconds && (
          <p className="mt-1 text-xs text-red-500">{errors.fluorescein_breakup_seconds.message}</p>
        )}
      </div>
      <div className="flex gap-3 pt-2">
        <Button type="button" variant="outline" onClick={onBack} className="flex-1">Back</Button>
        <Button type="button" variant="outline" onClick={() => onNext(null)} className="flex-1">Skip</Button>
        <Button type="submit" className="flex-1 bg-teal-600 hover:bg-teal-700">Continue</Button>
      </div>
    </form>
  )
}
```

- [ ] **Step 4: Create StepLipid.tsx**

Create `web/src/components/assessments/steps/StepLipid.tsx`:

```tsx
'use client'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { lipidStepSchema, type LipidStepData } from '@/lib/schemas'

const GUILLON_LABELS = [
  'Open meshwork (~15nm)',
  'Closed meshwork (~30nm)',
  'Wave / flow (~60nm)',
  'Amorphous (~80nm)',
  'Coloured fringes (>90nm)',
] as const

interface Props {
  defaultValues?: LipidStepData | null
  onNext: (data: LipidStepData | null) => void
  onBack: () => void
}

export function StepLipid({ defaultValues, onNext, onBack }: Props) {
  const { register, handleSubmit, setValue, watch, formState: { errors } } = useForm<LipidStepData>({
    resolver: zodResolver(lipidStepSchema),
    defaultValues: defaultValues ?? undefined,
  })
  const grade = watch('lipid_grade')

  return (
    <form onSubmit={handleSubmit((d) => onNext(d))} className="space-y-5">
      <div>
        <Label>Grade — Guillon scale (1–5, optional)</Label>
        <div className="mt-2 flex flex-col gap-1.5">
          {GUILLON_LABELS.map((label, i) => {
            const val = i + 1
            return (
              <button
                key={val}
                type="button"
                onClick={() => setValue('lipid_grade', grade === val ? undefined : val, { shouldValidate: true })}
                className={`rounded-md border px-3 py-2 text-left text-xs font-medium transition-colors ${
                  grade === val
                    ? 'border-teal-600 bg-teal-50 text-teal-700'
                    : 'border-border hover:border-teal-300'
                }`}
              >
                {val} — {label}
              </button>
            )
          })}
        </div>
        {errors.lipid_grade && (
          <p className="mt-1 text-xs text-red-500">{errors.lipid_grade.message}</p>
        )}
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="lipid-thick">Thickness (nm, optional)</Label>
          <Input
            id="lipid-thick"
            type="number"
            step="1"
            min="0"
            placeholder="e.g. 60"
            {...register('lipid_thickness_nm')}
          />
          {errors.lipid_thickness_nm && (
            <p className="mt-1 text-xs text-red-500">{errors.lipid_thickness_nm.message}</p>
          )}
        </div>
        <div>
          <Label htmlFor="lipid-tmh">Tear meniscus (mm, optional)</Label>
          <Input
            id="lipid-tmh"
            type="number"
            step="0.01"
            min="0"
            placeholder="e.g. 0.25"
            {...register('tear_meniscus_height_mm')}
          />
          {errors.tear_meniscus_height_mm && (
            <p className="mt-1 text-xs text-red-500">{errors.tear_meniscus_height_mm.message}</p>
          )}
        </div>
      </div>
      <div className="flex gap-3 pt-2">
        <Button type="button" variant="outline" onClick={onBack} className="flex-1">Back</Button>
        <Button type="button" variant="outline" onClick={() => onNext(null)} className="flex-1">Skip</Button>
        <Button type="submit" className="flex-1 bg-teal-600 hover:bg-teal-700">Continue</Button>
      </div>
    </form>
  )
}
```

- [ ] **Step 5: Run typecheck**

```bash
cd /opt/tearflex/web && npm run typecheck 2>&1 | tail -5
```

Expected: `Found 0 errors.`

- [ ] **Step 6: Commit**

```bash
git -C /opt/tearflex add web/src/components/assessments/steps/
git -C /opt/tearflex commit -m "feat: add Eye, NIBUT, Fluorescein, Lipid step components"
```

---

## Task 7: Frontend — StepReview + Stepper Orchestrator

**Files:**
- Create: `web/src/components/assessments/steps/StepReview.tsx`
- Create: `web/src/components/assessments/NewAssessmentStepper.tsx`

- [ ] **Step 1: Create StepReview.tsx**

Create `web/src/components/assessments/steps/StepReview.tsx`:

```tsx
'use client'
import type { ReactNode } from 'react'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useCreateAssessment, useCreateManualCapture } from '@/hooks/useAssessments'
import { nibutBand, type EyeStepData, type NibutStepData, type FluoresceinStepData, type LipidStepData, type NibutThresholds } from '@/lib/schemas'
import { usePractice } from '@/hooks/usePractice'
import { api } from '@/lib/api'

interface Props {
  patientId: number
  stepData: {
    eye: EyeStepData
    nibut: NibutStepData | null
    fluorescein: FluoresceinStepData | null
    lipid: LipidStepData | null
  }
  onBack: () => void
}

export function StepReview({ patientId, stepData, onBack }: Props) {
  const router = useRouter()
  const { data: practice } = usePractice()
  const thresholds: NibutThresholds = {
    normal: practice?.nibut_normal_threshold ?? 10,
    borderline: practice?.nibut_borderline_threshold ?? 5,
  }
  const createAssessment = useCreateAssessment()
  const createCapture = useCreateManualCapture()
  const [error, setError] = useState<string | null>(null)
  const isSaving = createAssessment.isPending || createCapture.isPending

  const handleSave = async () => {
    setError(null)
    try {
      const assessment = await createAssessment.mutateAsync({ patient: patientId, eye: stepData.eye.eye })

      const captureJobs = []
      if (stepData.nibut) {
        captureJobs.push(createCapture.mutateAsync({
          assessment: assessment.id,
          test_type: 'nibut',
          nibut_first_breakup_seconds: stepData.nibut.nibut_first_breakup_seconds,
          nibut_mean_breakup_seconds: stepData.nibut.nibut_mean_breakup_seconds ?? undefined,
        }))
      }
      if (stepData.fluorescein) {
        captureJobs.push(createCapture.mutateAsync({
          assessment: assessment.id,
          test_type: 'fluorescein',
          fluorescein_grade: stepData.fluorescein.fluorescein_grade ?? undefined,
          fluorescein_breakup_seconds: stepData.fluorescein.fluorescein_breakup_seconds ?? undefined,
        }))
      }
      if (stepData.lipid) {
        captureJobs.push(createCapture.mutateAsync({
          assessment: assessment.id,
          test_type: 'lipid',
          lipid_grade: stepData.lipid.lipid_grade ?? undefined,
          lipid_thickness_nm: stepData.lipid.lipid_thickness_nm ?? undefined,
          tear_meniscus_height_mm: stepData.lipid.tear_meniscus_height_mm ?? undefined,
        }))
      }
      await Promise.all(captureJobs)
      await api.patch(`assessments/${assessment.id}/`, { status: 'complete' })
      router.push(`/patients/${patientId}/assessments/${assessment.id}`)
    } catch {
      setError('Something went wrong saving the assessment. Please try again.')
    }
  }

  const nibut = stepData.nibut
  const band = nibutBand(nibut?.nibut_first_breakup_seconds ?? null, thresholds)

  return (
    <div className="space-y-5">
      <Card className="divide-y divide-border p-0 overflow-hidden">
        <Row label="Eye" value={<span className="capitalize">{stepData.eye.eye} eye</span>} />
        <Row
          label="NIBUT — first break-up"
          value={
            nibut
              ? <span className="tabular-nums font-medium" style={{ color: band.color }}>{nibut.nibut_first_breakup_seconds}s — {band.label}</span>
              : <Skipped />
          }
        />
        {nibut?.nibut_mean_breakup_seconds != null && (
          <Row label="NIBUT — mean" value={<span className="tabular-nums">{nibut.nibut_mean_breakup_seconds}s</span>} />
        )}
        <Row
          label="Fluorescein grade"
          value={stepData.fluorescein?.fluorescein_grade != null
            ? <span>{stepData.fluorescein.fluorescein_grade}</span>
            : <Skipped />}
        />
        <Row
          label="Lipid grade"
          value={stepData.lipid?.lipid_grade != null
            ? <span>{stepData.lipid.lipid_grade}</span>
            : <Skipped />}
        />
      </Card>
      {error && <p className="text-sm text-red-500">{error}</p>}
      <div className="flex gap-3 pt-2">
        <Button type="button" variant="outline" onClick={onBack} className="flex-1" disabled={isSaving}>
          Back
        </Button>
        <Button type="button" onClick={handleSave} className="flex-1 bg-teal-600 hover:bg-teal-700" disabled={isSaving}>
          {isSaving ? 'Saving…' : 'Save assessment'}
        </Button>
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between px-5 py-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      {value}
    </div>
  )
}

function Skipped() {
  return <span className="text-xs text-muted-foreground">Skipped</span>
}
```

- [ ] **Step 2: Create NewAssessmentStepper.tsx**

Create `web/src/components/assessments/NewAssessmentStepper.tsx`:

```tsx
'use client'
import { useState } from 'react'
import { StepEye } from './steps/StepEye'
import { StepNibut } from './steps/StepNibut'
import { StepFluorescein } from './steps/StepFluorescein'
import { StepLipid } from './steps/StepLipid'
import { StepReview } from './steps/StepReview'
import type { EyeStepData, NibutStepData, FluoresceinStepData, LipidStepData } from '@/lib/schemas'

const STEP_LABELS = ['Eye', 'NIBUT', 'Fluorescein', 'Lipid', 'Review'] as const

interface StepData {
  eye: EyeStepData | null
  nibut: NibutStepData | null
  fluorescein: FluoresceinStepData | null
  lipid: LipidStepData | null
}

export function NewAssessmentStepper({ patientId }: { patientId: number }) {
  const [step, setStep] = useState(0)
  const [data, setData] = useState<StepData>({ eye: null, nibut: null, fluorescein: null, lipid: null })

  return (
    <div className="mx-auto max-w-lg space-y-8">
      {/* Progress indicator */}
      <div className="flex items-start gap-1">
        {STEP_LABELS.map((label, i) => (
          <div key={i} className="flex flex-1 flex-col items-center gap-1.5">
            <div className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition-colors ${
              i < step
                ? 'bg-teal-600 text-white'
                : i === step
                  ? 'bg-teal-600 text-white ring-2 ring-teal-200 ring-offset-1'
                  : 'bg-muted text-muted-foreground'
            }`}>
              {i < step ? '✓' : i + 1}
            </div>
            <span className={`text-[10px] font-medium leading-tight text-center ${
              i === step ? 'text-teal-600' : 'text-muted-foreground'
            }`}>{label}</span>
          </div>
        ))}
      </div>

      {/* Active step */}
      {step === 0 && (
        <StepEye
          defaultValues={data.eye}
          onNext={(d) => { setData((p) => ({ ...p, eye: d })); setStep(1) }}
        />
      )}
      {step === 1 && (
        <StepNibut
          defaultValues={data.nibut}
          onNext={(d) => { setData((p) => ({ ...p, nibut: d })); setStep(2) }}
          onBack={() => setStep(0)}
        />
      )}
      {step === 2 && (
        <StepFluorescein
          defaultValues={data.fluorescein}
          onNext={(d) => { setData((p) => ({ ...p, fluorescein: d })); setStep(3) }}
          onBack={() => setStep(1)}
        />
      )}
      {step === 3 && (
        <StepLipid
          defaultValues={data.lipid}
          onNext={(d) => { setData((p) => ({ ...p, lipid: d })); setStep(4) }}
          onBack={() => setStep(2)}
        />
      )}
      {step === 4 && data.eye && (
        <StepReview
          patientId={patientId}
          stepData={{ ...data, eye: data.eye }}
          onBack={() => setStep(3)}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 3: Run typecheck**

```bash
cd /opt/tearflex/web && npm run typecheck 2>&1 | tail -5
```

Expected: `Found 0 errors.`

- [ ] **Step 4: Commit**

```bash
git -C /opt/tearflex add web/src/components/assessments/
git -C /opt/tearflex commit -m "feat: add StepReview and NewAssessmentStepper"
```

---

## Task 8: Frontend — Page Shell + Entry Point

**Files:**
- Create: `web/src/app/(dashboard)/patients/[id]/assessments/new/page.tsx`
- Modify: `web/src/components/patients/PatientProfile.tsx`

- [ ] **Step 1: Create the new assessment page**

Create `web/src/app/(dashboard)/patients/[id]/assessments/new/page.tsx`:

```tsx
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { NewAssessmentStepper } from '@/components/assessments/NewAssessmentStepper'

export default function NewAssessmentPage({ params }: { params: { id: string } }) {
  const patientId = Number(params.id)
  return (
    <div className="space-y-6">
      <Link
        href={`/patients/${patientId}`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" />
        Back to patient
      </Link>
      <h1 className="text-xl font-bold">New Assessment</h1>
      <NewAssessmentStepper patientId={patientId} />
    </div>
  )
}
```

- [ ] **Step 2: Add "New assessment" button to PatientProfile**

In `web/src/components/patients/PatientProfile.tsx`:

1. Add `Button` import:
```tsx
import { Button } from '@/components/ui/button'
```

2. Replace the Assessments card header from:
```tsx
<h2 className="mb-3 font-semibold">Assessments</h2>
```
to:
```tsx
<div className="mb-3 flex items-center justify-between">
  <h2 className="font-semibold">Assessments</h2>
  <Button asChild size="sm" className="bg-teal-600 hover:bg-teal-700">
    <Link href={`/patients/${id}/assessments/new`}>New assessment</Link>
  </Button>
</div>
```

- [ ] **Step 3: Run typecheck**

```bash
cd /opt/tearflex/web && npm run typecheck 2>&1 | tail -5
```

Expected: `Found 0 errors.`

- [ ] **Step 4: Rebuild the web container**

```bash
docker compose -f /opt/tearflex/docker-compose.prod.yml up -d --build web
```

Wait ~60 seconds, then open `https://tearflex.mydryeyeapp.co.uk` and:
- Navigate to any patient profile
- Confirm "New assessment" button appears in the Assessments section
- Click it — confirm the stepper loads at `/patients/{id}/assessments/new`
- Complete a full flow (select eye, enter NIBUT, skip fluorescein and lipid, review + save)
- Confirm redirect to the assessment detail page with the NIBUT result displayed

- [ ] **Step 5: Commit**

```bash
git -C /opt/tearflex add web/src/app/ web/src/components/patients/PatientProfile.tsx
git -C /opt/tearflex commit -m "feat: new assessment page and patient profile entry point"
```
