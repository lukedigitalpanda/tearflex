# Calibration Foundation — Structural Slice (DeviceCalibration backbone) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the standalone persistence backbone for subsystem A — a new `apps/calibration` Django app with a `DeviceCalibration` model (flexible JSON fields so the deferred calibration maths can't force schema churn) and a practice-scoped API — so per-device+attachment calibrations can be stored, listed, and retrieved.

**Architecture:** New `apps/calibration` app, independent of the analysis modules (which live on unmerged branches). `DeviceCalibration` stores camera intrinsics / attachment geometry / the reference-solve result as JSON, keyed by practice + phone_model_id + attachment, with version tracking. Practice-scoped DRF API reusing `apps.accounts.scoping`. No analysis maths, no mobile capture, no module seam-wiring (all deferred per the design spec).

**Tech Stack:** Django 5 + DRF, pytest. No new dependencies.

## Global Constraints

- Per the design spec (`docs/superpowers/specs/2026-06-24-calibration-foundation-design.md`): this is the **structural** slice only — **no calibration maths, no mobile capture, no module seam-wiring.**
- The math-dependent fields (`camera_intrinsics`, `attachment_geometry`, `solve_result`) are **JSONField** so the deferred maths can evolve without a migration.
- `calibration_version` defaults to `'calib-v0.1'`.
- Practice-scoping on every endpoint via the device's `practice`, reusing `apps.accounts.scoping` (`accessible_practice_ids`, `scope_queryset`) — a clinician only sees their practice's calibrations.
- Tests are pure Django/DRF (`@pytest.mark.django_db` where needed); run `pytest` from `/opt/tearflex/backend`; all `git` from `/opt/tearflex`.
- **Scoped commits only** — `git add <explicit paths>`, never `git add .` (untracked `mobile/ios/` and `mobile/android/` dirs present).
- Branch: `feat/calibration-foundation` (already checked out, off master). `apps.accounts.scoping` and the `api`/`clinician`/`practice` pytest fixtures exist on master.

---

## File Structure

**New — `backend/apps/calibration/`:**
- `__init__.py`, `apps.py` — app config
- `models.py` — `DeviceCalibration`
- `migrations/__init__.py`, `migrations/0001_initial.py` (generated)
- `serializers.py` — create / detail serializers
- `views.py` — create / list-by-device / detail views
- `urls.py` — routes under `/api/calibration/`
- `tests/__init__.py`, `tests/test_models.py`, `tests/test_api.py`

**Modified:**
- `backend/tearflex/settings/base.py` — add `'apps.calibration'` to `INSTALLED_APPS`
- `backend/tearflex/urls.py` — mount `api/calibration/`

---

### Task 1: `DeviceCalibration` model, app scaffold & migration

**Files:**
- Create: `backend/apps/calibration/__init__.py`, `apps.py`, `models.py`, `migrations/__init__.py`, `tests/__init__.py`
- Modify: `backend/tearflex/settings/base.py`
- Test: `backend/apps/calibration/tests/test_models.py`

**Interfaces:**
- Produces: `DeviceCalibration(practice FK, phone_model_id, device_model, attachment_id, method, camera_intrinsics JSON, attachment_geometry JSON, solve_result JSON, calibration_version='calib-v0.1', is_active=True, created_at)`.

- [ ] **Step 1: Create the app package**

`backend/apps/calibration/__init__.py`: empty.
`backend/apps/calibration/apps.py`:
```python
from django.apps import AppConfig


class CalibrationConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.calibration'
```
`backend/apps/calibration/migrations/__init__.py`: empty.
`backend/apps/calibration/tests/__init__.py`: empty.

- [ ] **Step 2: Write the model**

`backend/apps/calibration/models.py`:
```python
from django.db import models


class DeviceCalibration(models.Model):
    """A stored calibration for one phone-model + Placido attachment combination.

    The maths-dependent payloads are JSON so the (deferred) calibration algorithm can
    evolve without a schema migration. See the subsystem-A design spec.
    """
    METHOD_CHOICES = [
        ('default_profile', 'Default profile'),     # per-model nominal (no per-unit reference)
        ('reference_object', 'Reference-object'),    # per-unit, known-size reference solve
    ]

    practice = models.ForeignKey('accounts.Practice', on_delete=models.CASCADE,
                                 related_name='device_calibrations')
    phone_model_id = models.CharField(max_length=100)            # "iphone16,2" — the calibration key
    device_model = models.CharField(max_length=100, blank=True)  # "iPhone 16 Pro"
    attachment_id = models.CharField(max_length=100, blank=True) # which Placido attachment
    method = models.CharField(max_length=20, choices=METHOD_CHOICES, default='reference_object')

    camera_intrinsics = models.JSONField(default=dict, blank=True)     # focal, sensor, distortion
    attachment_geometry = models.JSONField(default=dict, blank=True)   # ring radii, disc-lens offset
    solve_result = models.JSONField(default=dict, blank=True)          # fitted system constant(s)

    calibration_version = models.CharField(max_length=20, default='calib-v0.1')
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f'Calibration {self.pk} for {self.phone_model_id} ({self.method})'
```

- [ ] **Step 3: Register the app**

In `backend/tearflex/settings/base.py`, add `'apps.calibration',` to `INSTALLED_APPS` (next to the other `apps.*` entries).

- [ ] **Step 4: Write the failing test**

`backend/apps/calibration/tests/test_models.py`:
```python
import pytest
from apps.calibration.models import DeviceCalibration


@pytest.mark.django_db
def test_device_calibration_defaults(practice):
    cal = DeviceCalibration.objects.create(practice=practice, phone_model_id='iphone16,2')
    assert cal.method == 'reference_object'
    assert cal.calibration_version == 'calib-v0.1'
    assert cal.is_active is True
    assert cal.camera_intrinsics == {}
    assert cal.practice_id == practice.id


@pytest.mark.django_db
def test_device_calibration_stores_json_payloads(practice):
    cal = DeviceCalibration.objects.create(
        practice=practice, phone_model_id='iphone16,2',
        attachment_geometry={'ring_radii_mm': [1.0, 2.0], 'disc_lens_offset_mm': 8.0},
        solve_result={'scale_constant': 1234.5},
    )
    cal.refresh_from_db()
    assert cal.attachment_geometry['disc_lens_offset_mm'] == 8.0
    assert cal.solve_result['scale_constant'] == 1234.5
```
(The `practice` pytest fixture already exists in `backend/conftest.py`.)

- [ ] **Step 5: Generate the migration and run the tests**

Run: `cd /opt/tearflex/backend && python3 manage.py makemigrations calibration`
Expected: creates `apps/calibration/migrations/0001_initial.py`.
Run: `cd /opt/tearflex/backend && python3 -m pytest apps/calibration/tests/test_models.py -v`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
cd /opt/tearflex && git add backend/apps/calibration backend/tearflex/settings/base.py && \
git commit -m "feat(calibration): DeviceCalibration model and app scaffold"
```

---

### Task 2: Practice-scoped API (serializer, views, routes)

**Files:**
- Create: `backend/apps/calibration/serializers.py`, `views.py`, `urls.py`
- Modify: `backend/tearflex/urls.py`
- Test: `backend/apps/calibration/tests/test_api.py`

**Interfaces:**
- Consumes: `DeviceCalibration` (Task 1), `apps.accounts.scoping.accessible_practice_ids` / `scope_queryset`.
- Produces: `POST /api/calibration/devices/` (create, practice forced to the caller's), `GET /api/calibration/devices/?phone_model_id=` (list, scoped), `GET /api/calibration/devices/{id}/` (detail, scoped).

- [ ] **Step 1: Write the serializers**

`backend/apps/calibration/serializers.py`:
```python
from rest_framework import serializers
from .models import DeviceCalibration


class DeviceCalibrationSerializer(serializers.ModelSerializer):
    class Meta:
        model = DeviceCalibration
        fields = [
            'id', 'phone_model_id', 'device_model', 'attachment_id', 'method',
            'camera_intrinsics', 'attachment_geometry', 'solve_result',
            'calibration_version', 'is_active', 'created_at',
        ]
        read_only_fields = ['calibration_version', 'created_at']
```

- [ ] **Step 2: Write the views**

`backend/apps/calibration/views.py`:
```python
from rest_framework import generics, permissions
from rest_framework.exceptions import PermissionDenied
from apps.accounts.scoping import accessible_practice_ids, scope_queryset
from .models import DeviceCalibration
from .serializers import DeviceCalibrationSerializer


def _caller_practice(user):
    """The practice to attach a new calibration to: the clinician's own practice."""
    clinician = getattr(user, 'clinician', None)
    if clinician is None:
        raise PermissionDenied('No practice for this user.')
    return clinician.practice


class DeviceCalibrationListCreateView(generics.ListCreateAPIView):
    serializer_class = DeviceCalibrationSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        qs = scope_queryset(DeviceCalibration.objects.all(), self.request.user, 'practice')
        phone_model_id = self.request.query_params.get('phone_model_id')
        if phone_model_id:
            qs = qs.filter(phone_model_id=phone_model_id)
        return qs

    def perform_create(self, serializer):
        serializer.save(practice=_caller_practice(self.request.user))


class DeviceCalibrationDetailView(generics.RetrieveAPIView):
    serializer_class = DeviceCalibrationSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return scope_queryset(DeviceCalibration.objects.all(), self.request.user, 'practice')
```
(Note: `scope_queryset(..., 'practice')` filters on the model's own `practice` FK — `DeviceCalibration.practice` is the practice directly, so the path is just `'practice'`.)

- [ ] **Step 3: Write the routes and mount them**

`backend/apps/calibration/urls.py`:
```python
from django.urls import path
from .views import DeviceCalibrationListCreateView, DeviceCalibrationDetailView

urlpatterns = [
    path('devices/', DeviceCalibrationListCreateView.as_view(), name='calibration-device-list-create'),
    path('devices/<int:pk>/', DeviceCalibrationDetailView.as_view(), name='calibration-device-detail'),
]
```
In `backend/tearflex/urls.py`, add alongside the other `api/...` includes:
```python
    path('api/calibration/', include('apps.calibration.urls')),
```

- [ ] **Step 4: Write the failing test**

`backend/apps/calibration/tests/test_api.py`:
```python
import pytest
from apps.calibration.models import DeviceCalibration


@pytest.mark.django_db
def test_create_calibration_attaches_callers_practice(api, clinician):
    resp = api.post('/api/calibration/devices/', {
        'phone_model_id': 'iphone16,2', 'device_model': 'iPhone 16 Pro',
        'attachment_geometry': {'disc_lens_offset_mm': 8.0},
    }, format='json')
    assert resp.status_code == 201, resp.content
    cal = DeviceCalibration.objects.get(id=resp.data['id'])
    assert cal.practice_id == clinician.practice_id
    assert cal.calibration_version == 'calib-v0.1'


@pytest.mark.django_db
def test_list_calibrations_scoped_and_filterable(api, clinician):
    DeviceCalibration.objects.create(practice=clinician.practice, phone_model_id='iphone16,2')
    DeviceCalibration.objects.create(practice=clinician.practice, phone_model_id='pixel9')
    resp = api.get('/api/calibration/devices/?phone_model_id=iphone16,2')
    assert resp.status_code == 200
    ids = [r['phone_model_id'] for r in resp.data['results']]
    assert ids == ['iphone16,2']


@pytest.mark.django_db
def test_detail_other_practice_404(api):
    from conftest import PracticeFactory
    other = DeviceCalibration.objects.create(practice=PracticeFactory(), phone_model_id='x')
    resp = api.get(f'/api/calibration/devices/{other.id}/')
    assert resp.status_code == 404
```
(The `api` / `clinician` fixtures exist in `backend/conftest.py`. If `PracticeFactory` is not importable from `conftest`, create the other practice via the existing factory used elsewhere in the API tests — inspect `conftest.py` and adapt; if no practice factory exists, build one inline with `Practice.objects.create(...)`.)

- [ ] **Step 5: Run the tests (expect fail then pass)**

Run: `cd /opt/tearflex/backend && python3 -m pytest apps/calibration/tests/test_api.py -v`
Expected: initially FAIL (404 / no route), then PASS (3 tests) once Steps 1–3 are in place.

- [ ] **Step 6: Run the calibration app suite**

Run: `cd /opt/tearflex/backend && python3 -m pytest apps/calibration -v`
Expected: PASS (model + API tests green).

- [ ] **Step 7: Commit**

```bash
cd /opt/tearflex && git add backend/apps/calibration/serializers.py backend/apps/calibration/views.py backend/apps/calibration/urls.py backend/tearflex/urls.py backend/apps/calibration/tests/test_api.py && \
git commit -m "feat(calibration): practice-scoped DeviceCalibration API"
```

---

## Self-Review

**Spec coverage (structural slice of the design spec):**
- `DeviceCalibration` persistence backbone with JSON payloads (intrinsics/geometry/solve) → Task 1. ✓
- Version tracking (`calibration_version='calib-v0.1'`) → Task 1. ✓
- Practice-scoped API (create/list/detail), scoping reused → Task 2. ✓
- No analysis maths, no mobile capture, no module seam-wiring (deferred per spec) → not in plan. ✓

**Placeholder scan:** No TBD/TODO; every code step has complete code; every test step has real assertions. The one conditional ("if `PracticeFactory` not importable, adapt") is a concrete instruction to match the existing conftest, not a placeholder. ✓

**Type consistency:** `DeviceCalibration` field names in the model (Task 1) match the serializer `fields` (Task 2) and the test payloads. `scope_queryset(qs, user, 'practice')` uses the model's direct `practice` FK. `_caller_practice` attaches the clinician's practice on create, matching the `test_create_calibration_attaches_callers_practice` assertion. ✓
