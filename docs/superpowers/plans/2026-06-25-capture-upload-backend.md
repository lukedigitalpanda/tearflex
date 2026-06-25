# Capture/Upload Backend (auto-or-manual + stills) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the assessments backend so a capture records its provenance (`mobile`/`upload`), the manual path can attach the reviewed video, and clinician-selected still frames are persisted as a first-class, practice-scoped resource.

**Architecture:** Django REST Framework. Extend two existing endpoints (auto upload, manual create) and add one new resource (`CaptureStill`) with a list/create endpoint. No changes to the Celery task or analysis pipeline. Every endpoint stays practice-scoped via the existing `scope_queryset` helper.

**Tech Stack:** Django 5.1, DRF, PostgreSQL (prod) / SQLite (test opt-in), pytest + pytest-django, Pillow.

## Global Constraints

- App: `backend/apps/assessments/`. Run all commands from `/opt/tearflex/backend`.
- **Test command (this host): `USE_SQLITE_TESTS=1 python3 -m pytest <path> -v`** — Postgres is not reachable here; SQLite is opt-in via that env var. The interpreter is `python3` (no `python`).
- No `pytest-mock` installed — use `unittest.mock.patch`. Patch target for the Celery call: `apps.assessments.views.process_capture.delay`.
- `TestCapture.source` choices become exactly: `('mobile','Mobile camera')`, `('upload','Uploaded file')`, `('manual','Manual entry (no video)')`. Default `'mobile'`.
- Auto endpoint `POST /api/assessments/captures/` accepts `source ∈ {mobile, upload}` only (reject `manual`), default `mobile`; `video_file` required; triggers `process_capture.delay`; sets `status='processing'`.
- Manual endpoint `POST /api/assessments/captures/manual/`: video present ⇒ `source` required and ∈ {mobile, upload}; video absent ⇒ `source` forced to `manual` (any other provided value rejected). Always `status='analysed'`, creates `TestResult`, no Celery.
- Stills endpoints `POST`/`GET /api/assessments/captures/{id}/stills/` practice-scoped via `scope_queryset(..., 'assessment__patient__practice')`; cross-practice → **404**. `timestamp_seconds` required, ≥ 0; `image` required.
- Practice-scoping helper: `from apps.accounts.scoping import scope_queryset` — signature `scope_queryset(qs, user, path, practice_id=None)`.
- Tests use `conftest.py` factories (`PatientFactory`, `AssessmentFactory`) and fixtures (`api`, `clinician`); `_isolate_media` (autouse) redirects MEDIA_ROOT to a temp dir, so file/image writes are safe.
- After any model change: `python3 manage.py makemigrations assessments` and commit the generated migration.

## File Structure

```
backend/apps/assessments/
  models.py            # MODIFY: source choices; ADD CaptureStill model
  serializers.py       # MODIFY: TestCaptureUploadSerializer (+source), ManualCaptureSerializer (+video_file,+source),
                       #         TestCaptureSerializer (+stills); ADD CaptureStillSerializer
  views.py             # MODIFY: ManualCaptureCreateView (video+source); ADD CaptureStillListCreateView
  urls.py              # MODIFY: add stills route
  migrations/          # ADD: two generated migrations (source choices; CaptureStill)
  tests/
    test_capture_views.py   # MODIFY: source-on-auto tests
    test_manual_capture.py  # MODIFY: manual-with-video tests
    test_stills.py          # ADD: CaptureStill model + stills API tests
```

---

## Task 1: `source` provenance on the auto upload path

**Files:**
- Modify: `backend/apps/assessments/models.py` (the `source` field, ~line 45-49)
- Modify: `backend/apps/assessments/serializers.py` (`TestCaptureUploadSerializer`, ~line 30-34)
- Add: a generated migration under `backend/apps/assessments/migrations/`
- Test: `backend/apps/assessments/tests/test_capture_views.py`

**Interfaces:**
- Consumes: existing `CaptureUploadView.perform_create` (calls `serializer.save()` then triggers Celery — unchanged).
- Produces: `TestCaptureUploadSerializer` now accepts a writable `source` (choices `mobile`/`upload`, default `mobile`). `TestCapture.source` choices include `upload`.

- [ ] **Step 1: Write the failing tests**

Append to `backend/apps/assessments/tests/test_capture_views.py`:

```python
from unittest.mock import patch
from django.core.files.uploadedfile import SimpleUploadedFile


def _video():
    return SimpleUploadedFile('capture.mp4', b'fake-bytes', content_type='video/mp4')


@pytest.mark.django_db
def test_upload_with_source_upload_persists_and_triggers_analysis(api, clinician):
    patient = PatientFactory(practice=clinician.practice)
    assessment = AssessmentFactory(patient=patient, clinician=clinician)
    from apps.assessments.models import TestCapture
    with patch('apps.assessments.views.process_capture.delay') as mock_delay:
        mock_delay.return_value.id = 'task-1'
        resp = api.post('/api/assessments/captures/', {
            'assessment': assessment.id, 'test_type': 'nibut',
            'video_file': _video(), 'source': 'upload',
        }, format='multipart')
    assert resp.status_code == 201
    capture = TestCapture.objects.get(pk=resp.data['id'])
    assert capture.source == 'upload'
    assert capture.status == 'processing'
    mock_delay.assert_called_once_with(capture.id)


@pytest.mark.django_db
def test_upload_without_source_defaults_to_mobile(api, clinician):
    patient = PatientFactory(practice=clinician.practice)
    assessment = AssessmentFactory(patient=patient, clinician=clinician)
    from apps.assessments.models import TestCapture
    with patch('apps.assessments.views.process_capture.delay') as mock_delay:
        mock_delay.return_value.id = 'task-2'
        resp = api.post('/api/assessments/captures/', {
            'assessment': assessment.id, 'test_type': 'nibut', 'video_file': _video(),
        }, format='multipart')
    assert resp.status_code == 201
    capture = TestCapture.objects.get(pk=resp.data['id'])
    assert capture.source == 'mobile'


@pytest.mark.django_db
def test_upload_with_source_manual_is_rejected(api, clinician):
    patient = PatientFactory(practice=clinician.practice)
    assessment = AssessmentFactory(patient=patient, clinician=clinician)
    resp = api.post('/api/assessments/captures/', {
        'assessment': assessment.id, 'test_type': 'nibut',
        'video_file': _video(), 'source': 'manual',
    }, format='multipart')
    assert resp.status_code == 400
```

(`PatientFactory`, `AssessmentFactory` are already imported at the top of this file.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `USE_SQLITE_TESTS=1 python3 -m pytest apps/assessments/tests/test_capture_views.py -v`
Expected: the three new tests FAIL — `source='upload'` not persisted (still `mobile`), and `source='manual'` is currently accepted (201, not 400).

- [ ] **Step 3: Add `upload` to the model's source choices**

In `backend/apps/assessments/models.py`, replace the `source` field definition:

```python
    source = models.CharField(
        max_length=10,
        choices=[
            ('mobile', 'Mobile camera'),
            ('upload', 'Uploaded file'),
            ('manual', 'Manual entry (no video)'),
        ],
        default='mobile',
    )
```

- [ ] **Step 4: Add the writable `source` field to the upload serializer**

In `backend/apps/assessments/serializers.py`, replace `TestCaptureUploadSerializer`:

```python
class TestCaptureUploadSerializer(serializers.ModelSerializer):
    """Serializer for video upload endpoint (auto-analysis path)."""
    source = serializers.ChoiceField(
        choices=[('mobile', 'Mobile camera'), ('upload', 'Uploaded file')],
        required=False, default='mobile',
    )

    class Meta:
        model = TestCapture
        fields = ['id', 'assessment', 'test_type', 'video_file', 'device_model', 'source']
```

The explicit `ChoiceField` restricts input to `mobile`/`upload`; `manual` yields a 400. `serializer.save()` in the unchanged `CaptureUploadView.perform_create` persists `source`.

- [ ] **Step 5: Generate the migration**

Run: `USE_SQLITE_TESTS=1 python3 manage.py makemigrations assessments`
Expected: a new migration (AlterField on `testcapture.source`) is created. Note its filename.

- [ ] **Step 6: Run tests to verify they pass**

Run: `USE_SQLITE_TESTS=1 python3 -m pytest apps/assessments/tests/test_capture_views.py -v`
Expected: all tests PASS (new + the 4 pre-existing).

- [ ] **Step 7: Commit**

```bash
git add apps/assessments/models.py apps/assessments/serializers.py apps/assessments/migrations/ apps/assessments/tests/test_capture_views.py
git commit -m "feat(captures): record video provenance via source on the auto upload path"
```

---

## Task 2: Manual path attaches the reviewed video

**Files:**
- Modify: `backend/apps/assessments/serializers.py` (`ManualCaptureSerializer`, ~line 51-67)
- Modify: `backend/apps/assessments/views.py` (`ManualCaptureCreateView.post`, ~line 92-98)
- Test: `backend/apps/assessments/tests/test_manual_capture.py`

**Interfaces:**
- Consumes: `TestCapture`, `TestResult` models; `scope_queryset`; the existing severity computation in the view.
- Produces: `ManualCaptureSerializer` now accepts optional `video_file` and `source`, and resolves `validated_data['source']` (to `manual` when no video). The view persists both onto the created `TestCapture`.

- [ ] **Step 1: Write the failing tests**

Append to `backend/apps/assessments/tests/test_manual_capture.py`:

```python
from unittest.mock import patch
from django.core.files.uploadedfile import SimpleUploadedFile


def _video():
    return SimpleUploadedFile('capture.mp4', b'fake-bytes', content_type='video/mp4')


@pytest.mark.django_db
def test_manual_with_video_attaches_and_skips_analysis(api, clinician):
    from apps.assessments.models import TestCapture, TestResult
    patient = PatientFactory(practice=clinician.practice)
    assessment = AssessmentFactory(patient=patient, clinician=clinician)
    with patch('apps.assessments.views.process_capture.delay') as mock_delay:
        resp = api.post('/api/assessments/captures/manual/', {
            'assessment': assessment.id, 'test_type': 'nibut',
            'nibut_first_breakup_seconds': 7.2,
            'video_file': _video(), 'source': 'upload',
        }, format='multipart')
    assert resp.status_code == 201
    capture = TestCapture.objects.get(pk=resp.data['id'])
    assert capture.source == 'upload'
    assert bool(capture.video_file) is True
    assert capture.status == 'analysed'
    mock_delay.assert_not_called()
    assert TestResult.objects.filter(capture=capture).exists()


@pytest.mark.django_db
def test_manual_with_video_missing_source_is_rejected(api, clinician):
    patient = PatientFactory(practice=clinician.practice)
    assessment = AssessmentFactory(patient=patient, clinician=clinician)
    resp = api.post('/api/assessments/captures/manual/', {
        'assessment': assessment.id, 'test_type': 'nibut',
        'nibut_first_breakup_seconds': 7.2, 'video_file': _video(),
    }, format='multipart')
    assert resp.status_code == 400
    assert 'source' in resp.data


@pytest.mark.django_db
def test_manual_source_upload_without_video_is_rejected(api, clinician):
    patient = PatientFactory(practice=clinician.practice)
    assessment = AssessmentFactory(patient=patient, clinician=clinician)
    resp = api.post('/api/assessments/captures/manual/', {
        'assessment': assessment.id, 'test_type': 'nibut',
        'nibut_first_breakup_seconds': 7.2, 'source': 'upload',
    }, format='json')
    assert resp.status_code == 400
    assert 'source' in resp.data
```

(`PatientFactory`, `AssessmentFactory` are imported at the top of this file.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `USE_SQLITE_TESTS=1 python3 -m pytest apps/assessments/tests/test_manual_capture.py -v`
Expected: the three new tests FAIL (serializer has no `video_file`/`source` fields; video isn't attached; coupling rules not enforced).

- [ ] **Step 3: Extend the manual serializer**

In `backend/apps/assessments/serializers.py`, replace `ManualCaptureSerializer`:

```python
class ManualCaptureSerializer(serializers.Serializer):
    assessment = serializers.PrimaryKeyRelatedField(queryset=Assessment.objects.all())
    test_type = serializers.ChoiceField(choices=TestCapture.TEST_TYPE_CHOICES)
    video_file = serializers.FileField(required=False, allow_null=True)
    source = serializers.ChoiceField(
        choices=[
            ('mobile', 'Mobile camera'),
            ('upload', 'Uploaded file'),
            ('manual', 'Manual entry (no video)'),
        ],
        required=False, allow_null=True,
    )
    nibut_first_breakup_seconds = serializers.FloatField(required=False, allow_null=True)
    nibut_mean_breakup_seconds = serializers.FloatField(required=False, allow_null=True)
    fluorescein_grade = serializers.IntegerField(required=False, allow_null=True)
    fluorescein_breakup_seconds = serializers.FloatField(required=False, allow_null=True)
    lipid_grade = serializers.IntegerField(required=False, allow_null=True)
    lipid_thickness_nm = serializers.FloatField(required=False, allow_null=True)
    tear_meniscus_height_mm = serializers.FloatField(required=False, allow_null=True)

    def validate(self, data):
        if data.get('test_type') == 'nibut' and data.get('nibut_first_breakup_seconds') is None:
            raise serializers.ValidationError(
                {'nibut_first_breakup_seconds': 'This field is required for NIBUT tests.'}
            )
        video = data.get('video_file')
        source = data.get('source')
        if video is not None:
            if source not in ('mobile', 'upload'):
                raise serializers.ValidationError(
                    {'source': "When a video is attached, source must be 'mobile' or 'upload'."}
                )
        else:
            if source is not None and source != 'manual':
                raise serializers.ValidationError(
                    {'source': "Without a video, source must be 'manual' or omitted."}
                )
            data['source'] = 'manual'
        return data
```

- [ ] **Step 4: Persist video + source in the view**

In `backend/apps/assessments/views.py`, inside `ManualCaptureCreateView.post`, replace the `TestCapture.objects.create(...)` call:

```python
            capture = TestCapture.objects.create(
                assessment=assessment,
                test_type=data['test_type'],
                source=data['source'],
                video_file=data.get('video_file'),
                status='analysed',
            )
```

(`data['source']` is always set by the serializer's `validate`: `manual` when no video, otherwise the provided `mobile`/`upload`.)

- [ ] **Step 5: Run tests to verify they pass**

Run: `USE_SQLITE_TESTS=1 python3 -m pytest apps/assessments/tests/test_manual_capture.py -v`
Expected: all tests PASS — including the pre-existing no-video tests (which still resolve `source='manual'`, `video_file` empty).

- [ ] **Step 6: Commit**

```bash
git add apps/assessments/serializers.py apps/assessments/views.py apps/assessments/tests/test_manual_capture.py
git commit -m "feat(captures): manual path attaches the reviewed video with provenance"
```

---

## Task 3: `CaptureStill` model

**Files:**
- Modify: `backend/apps/assessments/models.py` (add `CaptureStill` after `TestResult`)
- Add: a generated migration under `backend/apps/assessments/migrations/`
- Test: `backend/apps/assessments/tests/test_stills.py` (new)

**Interfaces:**
- Consumes: `TestCapture` model.
- Produces: `CaptureStill` model with `capture` (FK, `related_name='stills'`), `image`, `timestamp_seconds`, `label`, `width`, `height`, `created_at`; `Meta.ordering = ['timestamp_seconds']`.

- [ ] **Step 1: Write the failing tests**

Create `backend/apps/assessments/tests/test_stills.py`:

```python
import pytest

from conftest import AssessmentFactory


@pytest.mark.django_db
def test_capture_still_orders_by_timestamp():
    from apps.assessments.models import CaptureStill, TestCapture
    assessment = AssessmentFactory()
    capture = TestCapture.objects.create(assessment=assessment, test_type='nibut')
    later = CaptureStill.objects.create(capture=capture, image='stills/b.jpg', timestamp_seconds=8.2)
    earlier = CaptureStill.objects.create(capture=capture, image='stills/a.jpg', timestamp_seconds=2.0)
    assert list(capture.stills.all()) == [earlier, later]


@pytest.mark.django_db
def test_capture_still_str():
    from apps.assessments.models import CaptureStill, TestCapture
    assessment = AssessmentFactory()
    capture = TestCapture.objects.create(assessment=assessment, test_type='nibut')
    still = CaptureStill.objects.create(capture=capture, image='stills/a.jpg', timestamp_seconds=8.2)
    assert str(still).startswith('Still @ 8.20s')
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `USE_SQLITE_TESTS=1 python3 -m pytest apps/assessments/tests/test_stills.py -v`
Expected: FAIL — `cannot import name 'CaptureStill'`.

- [ ] **Step 3: Add the model**

In `backend/apps/assessments/models.py`, append after the `TestResult` class:

```python
class CaptureStill(models.Model):
    """A clinician-selected still frame extracted from a capture's video."""
    capture = models.ForeignKey(
        TestCapture, on_delete=models.CASCADE, related_name='stills',
    )
    image = models.ImageField(upload_to='stills/%Y/%m/%d/')
    timestamp_seconds = models.FloatField()
    label = models.CharField(max_length=50, blank=True)
    width = models.IntegerField(null=True, blank=True)
    height = models.IntegerField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['timestamp_seconds']

    def __str__(self):
        return f'Still @ {self.timestamp_seconds:.2f}s of {self.capture}'
```

- [ ] **Step 4: Generate the migration**

Run: `USE_SQLITE_TESTS=1 python3 manage.py makemigrations assessments`
Expected: a new migration (CreateModel `CaptureStill`) is created. Note its filename.

- [ ] **Step 5: Run tests to verify they pass**

Run: `USE_SQLITE_TESTS=1 python3 -m pytest apps/assessments/tests/test_stills.py -v`
Expected: both tests PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/assessments/models.py apps/assessments/migrations/ apps/assessments/tests/test_stills.py
git commit -m "feat(captures): add CaptureStill model for clinician-selected frames"
```

---

## Task 4: Stills serializer, endpoints, and capture serialization

**Files:**
- Modify: `backend/apps/assessments/serializers.py` (add `CaptureStillSerializer`; add `stills` to `TestCaptureSerializer`)
- Modify: `backend/apps/assessments/views.py` (add `CaptureStillListCreateView`)
- Modify: `backend/apps/assessments/urls.py` (add stills route)
- Test: `backend/apps/assessments/tests/test_stills.py` (extend)

**Interfaces:**
- Consumes: `CaptureStill`, `TestCapture` models; `scope_queryset`; `get_object_or_404`.
- Produces: `CaptureStillSerializer`; `CaptureStillListCreateView` at `captures/<int:pk>/stills/`; `TestCaptureSerializer.stills` (read-only list).

- [ ] **Step 1: Write the failing tests**

Append to `backend/apps/assessments/tests/test_stills.py`:

```python
import io
from PIL import Image
from django.core.files.uploadedfile import SimpleUploadedFile

from conftest import PatientFactory


def _image_upload(name='frame.png'):
    buf = io.BytesIO()
    Image.new('RGB', (4, 4), 'white').save(buf, format='PNG')
    return SimpleUploadedFile(name, buf.getvalue(), content_type='image/png')


def _capture_in(clinician):
    patient = PatientFactory(practice=clinician.practice)
    assessment = AssessmentFactory(patient=patient, clinician=clinician)
    from apps.assessments.models import TestCapture
    return TestCapture.objects.create(assessment=assessment, test_type='nibut')


@pytest.mark.django_db
def test_post_still_creates_row(api, clinician):
    from apps.assessments.models import CaptureStill
    capture = _capture_in(clinician)
    resp = api.post(f'/api/assessments/captures/{capture.id}/stills/', {
        'image': _image_upload(), 'timestamp_seconds': 8.2, 'label': 'first_breakup',
    }, format='multipart')
    assert resp.status_code == 201
    still = CaptureStill.objects.get(pk=resp.data['id'])
    assert still.capture == capture
    assert still.timestamp_seconds == pytest.approx(8.2)
    assert still.label == 'first_breakup'


@pytest.mark.django_db
def test_list_stills_ordered_by_timestamp(api, clinician):
    from apps.assessments.models import CaptureStill
    capture = _capture_in(clinician)
    CaptureStill.objects.create(capture=capture, image='stills/b.jpg', timestamp_seconds=8.2)
    CaptureStill.objects.create(capture=capture, image='stills/a.jpg', timestamp_seconds=2.0)
    resp = api.get(f'/api/assessments/captures/{capture.id}/stills/')
    assert resp.status_code == 200
    stamps = [s['timestamp_seconds'] for s in resp.data]
    assert stamps == [2.0, 8.2]


@pytest.mark.django_db
def test_post_still_requires_image(api, clinician):
    capture = _capture_in(clinician)
    resp = api.post(f'/api/assessments/captures/{capture.id}/stills/', {
        'timestamp_seconds': 1.0,
    }, format='multipart')
    assert resp.status_code == 400


@pytest.mark.django_db
def test_post_still_requires_timestamp(api, clinician):
    capture = _capture_in(clinician)
    resp = api.post(f'/api/assessments/captures/{capture.id}/stills/', {
        'image': _image_upload(),
    }, format='multipart')
    assert resp.status_code == 400


@pytest.mark.django_db
def test_post_still_rejects_negative_timestamp(api, clinician):
    capture = _capture_in(clinician)
    resp = api.post(f'/api/assessments/captures/{capture.id}/stills/', {
        'image': _image_upload(), 'timestamp_seconds': -1.0,
    }, format='multipart')
    assert resp.status_code == 400


@pytest.mark.django_db
def test_stills_cross_practice_is_404(api, clinician):
    from apps.assessments.models import TestCapture
    other_assessment = AssessmentFactory()  # different practice
    other_capture = TestCapture.objects.create(assessment=other_assessment, test_type='nibut')
    get_resp = api.get(f'/api/assessments/captures/{other_capture.id}/stills/')
    assert get_resp.status_code == 404
    post_resp = api.post(f'/api/assessments/captures/{other_capture.id}/stills/', {
        'image': _image_upload(), 'timestamp_seconds': 1.0,
    }, format='multipart')
    assert post_resp.status_code == 404


@pytest.mark.django_db
def test_stills_appear_in_capture_serializer(api, clinician):
    from apps.assessments.models import CaptureStill
    capture = _capture_in(clinician)
    CaptureStill.objects.create(capture=capture, image='stills/a.jpg', timestamp_seconds=3.0, label='x')
    resp = api.get(f'/api/assessments/captures/{capture.id}/')
    assert resp.status_code == 200
    assert len(resp.data['stills']) == 1
    assert resp.data['stills'][0]['label'] == 'x'
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `USE_SQLITE_TESTS=1 python3 -m pytest apps/assessments/tests/test_stills.py -v`
Expected: the new tests FAIL (404 route missing / no `stills` key) — the two Task 3 model tests still pass.

- [ ] **Step 3: Add the stills serializer and surface stills on the capture**

In `backend/apps/assessments/serializers.py`, add `CaptureStillSerializer` immediately after `TestResultSerializer` (it must be defined before `TestCaptureSerializer`):

```python
class CaptureStillSerializer(serializers.ModelSerializer):
    timestamp_seconds = serializers.FloatField(min_value=0)

    class Meta:
        model = CaptureStill
        fields = ['id', 'capture', 'image', 'timestamp_seconds', 'label', 'width', 'height', 'created_at']
        read_only_fields = ['id', 'capture', 'created_at']
```

Update the import at the top of the file:

```python
from .models import Assessment, TestCapture, TestResult, CaptureStill
```

Then add `stills` to `TestCaptureSerializer` — the `result` line and `fields` list:

```python
class TestCaptureSerializer(serializers.ModelSerializer):
    result = TestResultSerializer(read_only=True)
    stills = CaptureStillSerializer(many=True, read_only=True)

    class Meta:
        model = TestCapture
        fields = [
            'id', 'assessment', 'test_type', 'source', 'video_file', 'thumbnail',
            'duration_seconds', 'resolution_width', 'resolution_height',
            'fps', 'device_model', 'status', 'captured_at', 'result', 'stills',
        ]
        read_only_fields = ['id', 'status', 'captured_at', 'thumbnail', 'source']
```

- [ ] **Step 4: Add the stills view**

In `backend/apps/assessments/views.py`, add the import at the top:

```python
from django.shortcuts import get_object_or_404
```

Update the models/serializers imports to include the new names:

```python
from .models import Assessment, TestCapture, TestResult, CaptureStill
from .serializers import (
    AssessmentSerializer, AssessmentListSerializer,
    TestCaptureSerializer, TestCaptureUploadSerializer,
    ManualCaptureSerializer, CaptureStillSerializer,
)
```

Then add the view (e.g. after `CaptureDetailView`):

```python
class CaptureStillListCreateView(generics.ListCreateAPIView):
    """List or attach clinician-selected still frames for a capture."""
    serializer_class = CaptureStillSerializer
    permission_classes = [permissions.IsAuthenticated]

    def _get_capture(self):
        qs = scope_queryset(
            TestCapture.objects.all(), self.request.user, 'assessment__patient__practice',
        )
        return get_object_or_404(qs, pk=self.kwargs['pk'])

    def get_queryset(self):
        return CaptureStill.objects.filter(capture=self._get_capture())

    def perform_create(self, serializer):
        serializer.save(capture=self._get_capture())
```

- [ ] **Step 5: Add the URL**

In `backend/apps/assessments/urls.py`, add inside `urlpatterns` (after the `capture-status` line):

```python
    path('captures/<int:pk>/stills/', views.CaptureStillListCreateView.as_view(), name='capture-stills'),
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `USE_SQLITE_TESTS=1 python3 -m pytest apps/assessments/tests/test_stills.py -v`
Expected: all stills tests PASS (model + API).

- [ ] **Step 7: Run the full assessments suite + migration check**

Run: `USE_SQLITE_TESTS=1 python3 -m pytest apps/assessments/ -v`
Expected: whole assessments suite green (no regressions).

Run: `USE_SQLITE_TESTS=1 python3 manage.py makemigrations assessments --check --dry-run`
Expected: `No changes detected` (all model changes already captured in migrations).

- [ ] **Step 8: Commit**

```bash
git add apps/assessments/serializers.py apps/assessments/views.py apps/assessments/urls.py apps/assessments/tests/test_stills.py
git commit -m "feat(captures): practice-scoped stills endpoints + stills in capture payload"
```

---

## Self-Review (completed by plan author)

**Spec coverage:**
- §1 `source` provenance (add `upload`) → Task 1 (model choices). ✓
- §2 auto path accepts `source` (mobile/upload, default mobile, reject manual) → Task 1 (serializer + tests). ✓
- §3 manual path optional video + source coupling rule → Task 2. ✓
- §4 `CaptureStill` model (fields, FK related_name='stills', ordering) → Task 3. ✓
- §5 stills endpoints POST/GET, practice-scoped, 404 cross-practice, validation (image required, timestamp ≥ 0) → Task 4. ✓
- §6 stills in `TestCaptureSerializer` → Task 4. ✓
- Error-handling table (manual+source rules, stills validation, cross-practice 404) → Tasks 2 & 4 tests. ✓
- Out-of-scope (no Celery/pipeline change, no client UI) → respected; `process_capture` only mocked, never modified. ✓

**Placeholder scan:** none — every step carries concrete code/commands. Migration filenames are generated (not placeholders); steps instruct generation and a `--check` verification.

**Type consistency:** `source` choices identical across model (Task 1), upload serializer (Task 1, mobile/upload subset), and manual serializer (Task 2, full set). `CaptureStill` field names (`capture`, `image`, `timestamp_seconds`, `label`, `width`, `height`, `created_at`) defined in Task 3 and used unchanged in Task 4's serializer/tests. `related_name='stills'` (Task 3) matches `stills` usage in `TestCaptureSerializer` and the list view (Task 4). View helper `_get_capture` used by both `get_queryset` and `perform_create`. Patch target `apps.assessments.views.process_capture.delay` consistent across Tasks 1 & 2.
