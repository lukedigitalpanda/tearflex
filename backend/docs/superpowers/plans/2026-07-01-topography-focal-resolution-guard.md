# Topography Focal/Resolution Mismatch Guard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the calibrated topography path derive `focal_px` for the exact still it analyses — rescaling a mobile-provided intrinsic to the uploaded still's real dimensions, and refusing to badge `default` when it cannot prove a uniform-scale match.

**Architecture:** A pure function `effective_focal_px` reconciles the mobile-reported `camera_focal_px` + its reference dimensions against the still's actual pixel dimensions (read server-side). `TopographyScan` gains `capture_width_px`/`capture_height_px`. `tasks.py` uses the reconciled focal length; a `None` result (missing data or a crop/aspect change) falls back to the uncalibrated path.

**Tech Stack:** Django 5 + DRF, Celery, pytest (`pytest.ini` → `tearflex.settings.test`), OpenCV/NumPy.

## Global Constraints

- DB-backed tests run with `USE_SQLITE_TESTS=1` (this host has no reachable project Postgres): `USE_SQLITE_TESTS=1 python3 -m pytest ...`. `python` is not on PATH — use `python3`.
- Honesty model: a result may only be badged more calibrated than `uncalibrated` when the reconstruction actually used a trustworthy intrinsic. The badge must never overstate. `calibration_state` stays server-set/read-only on the API. No keratoconus signal.
- Calibrated path REQUIRES a reconcilable focal length: `camera_focal_px` alone (no capture resolution) → uncalibrated.
- `ASPECT_TOLERANCE = 0.01` (1% relative). Rescale factor is `still_width_px / capture_width_px`.
- makemigrations: `USE_SQLITE_TESTS=1 python3 manage.py makemigrations topography --settings=tearflex.settings.test`.

---

### Task 1: `effective_focal_px` reconciliation function

**Files:**
- Create: `backend/apps/analysis/topography/intrinsics.py`
- Test: `backend/apps/analysis/topography/tests/test_intrinsics.py`

**Interfaces:**
- Produces: `effective_focal_px(camera_focal_px, capture_width_px, capture_height_px, still_width_px, still_height_px) -> float | None` — the focal length in pixels rescaled to the analysed still, or `None` when it cannot be trusted (missing/non-positive inputs, or an aspect-ratio change). Task 3 consumes it.

- [ ] **Step 1: Write the failing tests**

Create `backend/apps/analysis/topography/tests/test_intrinsics.py`:

```python
from apps.analysis.topography.intrinsics import effective_focal_px


def test_uniform_downscale_rescales():
    # focal measured at 1600px capture; still delivered at 800px -> half.
    assert effective_focal_px(2200, 1600, 1600, 800, 800) == 1100


def test_same_resolution_returns_focal_unchanged():
    assert effective_focal_px(1100, 800, 800, 800, 800) == 1100


def test_uniform_scale_non_square_rescales():
    # 4:3 capture, 4:3 still at half scale -> half focal.
    assert effective_focal_px(2000, 1600, 1200, 800, 600) == 1000


def test_aspect_mismatch_returns_none():
    # capture 4:3, still 1:1 -> a crop, not a uniform scale.
    assert effective_focal_px(1100, 1600, 1200, 800, 800) is None


def test_missing_capture_resolution_returns_none():
    assert effective_focal_px(1100, None, None, 800, 800) is None
    assert effective_focal_px(1100, 1600, None, 800, 800) is None


def test_missing_or_nonpositive_focal_returns_none():
    assert effective_focal_px(None, 1600, 1600, 800, 800) is None
    assert effective_focal_px(0, 1600, 1600, 800, 800) is None
    assert effective_focal_px(-5, 1600, 1600, 800, 800) is None


def test_nonpositive_still_dims_returns_none():
    assert effective_focal_px(1100, 1600, 1600, 0, 800) is None
    assert effective_focal_px(1100, 1600, 1600, 800, -1) is None
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && USE_SQLITE_TESTS=1 python3 -m pytest apps/analysis/topography/tests/test_intrinsics.py -q`
Expected: FAIL — `ModuleNotFoundError: No module named 'apps.analysis.topography.intrinsics'`.

- [ ] **Step 3: Write the implementation**

Create `backend/apps/analysis/topography/intrinsics.py`:

```python
"""Reconcile a mobile-reported camera focal length to the still actually analysed.

`camera_focal_px` is measured against the camera's intrinsic reference dimensions,
which may differ from the delivered still's dimensions by a uniform scale (or, if the
image was cropped, by a non-uniform change we must not trust). The backend reads the
still's real dimensions and rescales; a crop or missing data yields None, meaning the
calibrated path must not run.
"""

ASPECT_TOLERANCE = 0.01  # 1% relative — tolerates rounding, rejects real crops


def effective_focal_px(camera_focal_px, capture_width_px, capture_height_px,
                       still_width_px, still_height_px):
    """Focal length in pixels rescaled to the analysed still, or None if untrusted.

    None means: do NOT run the calibrated path (fall back to uncalibrated). Returned
    when any input is missing/non-positive, or when the still's aspect ratio differs
    from the capture's (a crop). Otherwise returns
    camera_focal_px * (still_width_px / capture_width_px) — exact under uniform scaling.
    """
    if not camera_focal_px or camera_focal_px <= 0:
        return None
    if not capture_width_px or not capture_height_px:
        return None
    if still_width_px <= 0 or still_height_px <= 0:
        return None
    capture_aspect = capture_width_px / capture_height_px
    still_aspect = still_width_px / still_height_px
    if abs(still_aspect - capture_aspect) > ASPECT_TOLERANCE * capture_aspect:
        return None
    return camera_focal_px * (still_width_px / capture_width_px)
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd backend && USE_SQLITE_TESTS=1 python3 -m pytest apps/analysis/topography/tests/test_intrinsics.py -q`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/apps/analysis/topography/intrinsics.py backend/apps/analysis/topography/tests/test_intrinsics.py
git commit -m "feat(topography): effective_focal_px reconciles intrinsic to analysed still

Pure function: rescales a mobile-reported camera_focal_px from its reference
dimensions to the still's actual dimensions under uniform scaling; returns None
(untrusted -> uncalibrated) on missing/non-positive inputs or an aspect change.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: capture-resolution fields on `TopographyScan`

**Files:**
- Modify: `backend/apps/topography/models.py` (add two fields to `TopographyScan`)
- Create: `backend/apps/topography/migrations/0003_topographyscan_capture_dims.py` (generated)
- Modify: `backend/apps/topography/serializers.py`
- Test: `backend/apps/topography/tests/test_api.py`

**Interfaces:**
- Produces: `TopographyScan.capture_width_px: int | None`, `TopographyScan.capture_height_px: int | None` (`PositiveIntegerField(null=True, blank=True)`), both writable on create and readable on detail; serializer rejects a provided value `<= 0`. Task 3 consumes them.

- [ ] **Step 1: Write the failing API tests**

Add to `backend/apps/topography/tests/test_api.py`:

```python
@pytest.mark.django_db
def test_create_scan_stores_capture_resolution(api, clinician):
    assessment = AssessmentFactory(patient__practice=clinician.practice)
    with patch('apps.topography.views.process_topography_scan.delay') as delay:
        delay.return_value.id = 'task-res'
        resp = api.post('/api/topography/scans/', {
            'assessment': assessment.id,
            'camera_focal_px': 2200.0,
            'capture_width_px': 1600,
            'capture_height_px': 1600,
            'stills': [_png('a.png')],
        }, format='multipart')
    assert resp.status_code == 201, resp.content
    scan = TopographyScan.objects.get(id=resp.data['id'])
    assert scan.capture_width_px == 1600
    assert scan.capture_height_px == 1600
    detail = api.get(f'/api/topography/scans/{scan.id}/')
    assert detail.data['capture_width_px'] == 1600
    assert detail.data['capture_height_px'] == 1600


@pytest.mark.django_db
def test_create_scan_rejects_non_positive_capture_dims(api, clinician):
    assessment = AssessmentFactory(patient__practice=clinician.practice)
    for bad in ({'capture_width_px': 0}, {'capture_height_px': -10}):
        with patch('apps.topography.views.process_topography_scan.delay'):
            resp = api.post('/api/topography/scans/', {
                'assessment': assessment.id, 'stills': [_png('a.png')], **bad,
            }, format='multipart')
        assert resp.status_code == 400, resp.content
    assert not TopographyScan.objects.exists()
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && USE_SQLITE_TESTS=1 python3 -m pytest apps/topography/tests/test_api.py::test_create_scan_stores_capture_resolution apps/topography/tests/test_api.py::test_create_scan_rejects_non_positive_capture_dims -q`
Expected: FAIL — the model/serializer have no `capture_width_px`/`capture_height_px`.

- [ ] **Step 3: Add the model fields**

In `backend/apps/topography/models.py`, in `TopographyScan`, immediately after the `camera_focal_px` field:

```python
    capture_width_px = models.PositiveIntegerField(null=True, blank=True)
    capture_height_px = models.PositiveIntegerField(null=True, blank=True)
    # Pixel resolution camera_focal_px was measured at (mobile-provided). The backend
    # rescales focal_px to the analysed still; a mismatch/crop falls back to uncalibrated.
```

- [ ] **Step 4: Generate the migration**

Run: `cd backend && USE_SQLITE_TESTS=1 python3 manage.py makemigrations topography --settings=tearflex.settings.test`
Expected: creates `0003_topographyscan_capture_dims.py` (or similar) adding two nullable fields, chained off `0002`.

- [ ] **Step 5: Expose + validate the fields on the serializers**

In `backend/apps/topography/serializers.py`:
- Add `'capture_width_px'`, `'capture_height_px'` to `TopographyScanSerializer.Meta.fields` (after `'camera_focal_px'`).
- Add `'capture_width_px'`, `'capture_height_px'` to `TopographyScanCreateSerializer.Meta.fields` (after `'camera_focal_px'`).
- Add two field validators to `TopographyScanCreateSerializer` (mirroring the existing `validate_camera_focal_px`):

```python
    def validate_capture_width_px(self, value):
        if value is not None and value <= 0:
            raise serializers.ValidationError("capture_width_px must be positive.")
        return value

    def validate_capture_height_px(self, value):
        if value is not None and value <= 0:
            raise serializers.ValidationError("capture_height_px must be positive.")
        return value
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd backend && USE_SQLITE_TESTS=1 python3 -m pytest apps/topography/tests/test_api.py -q`
Expected: all pass (existing + 2 new).

- [ ] **Step 7: Commit**

```bash
git add backend/apps/topography/models.py backend/apps/topography/serializers.py \
        backend/apps/topography/migrations/0003_topographyscan_capture_dims.py \
        backend/apps/topography/tests/test_api.py
git commit -m "feat(topography): capture_width_px/capture_height_px on TopographyScan

Mobile-provided reference resolution for camera_focal_px, write-on-create and
readable, non-positive values rejected with HTTP 400. Consumed by the focal
reconciliation guard.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: use the reconciled focal length in `tasks.py`

**Files:**
- Modify: `backend/apps/topography/tasks.py`
- Test: `backend/apps/topography/tests/test_tasks.py`

**Interfaces:**
- Consumes: `effective_focal_px(...)` (Task 1); `TopographyScan.capture_width_px`/`capture_height_px` (Task 2); existing `disc.default_cone_profile()`, `disc.CONE_NOMINAL_WORKING_DISTANCE_MM`, `analyse_topography_frame(...)`, and the existing `_cone_png(name, focal_px)` helper in `test_tasks.py` (renders a `size=800` cone still → 800×800 image, returns `(uploaded_file, ground_truth)`).

- [ ] **Step 1: Write/adjust the failing task tests**

In `backend/apps/topography/tests/test_tasks.py`:

(a) Update the existing `test_process_scan_calibrated_when_focal_px_present` so the scan also carries matching capture dims (the still is 800×800). Change its `TopographyScan.objects.create(...)` call to:

```python
    scan = TopographyScan.objects.create(
        assessment=AssessmentFactory(), status='uploaded',
        camera_focal_px=1100.0, capture_width_px=800, capture_height_px=800)
```

(b) Add three new tests:

```python
@pytest.mark.django_db
def test_process_scan_calibrated_with_downscaled_still():
    """focal measured at 1600px capture, still delivered at 800px: the backend
    rescales 2200 -> 1100 and still recovers the true power."""
    scan = TopographyScan.objects.create(
        assessment=AssessmentFactory(), status='uploaded',
        camera_focal_px=2200.0, capture_width_px=1600, capture_height_px=1600)
    png, gt = _cone_png('cone.png', 1100.0)  # still rendered at the effective focal
    TopographyStill.objects.create(scan=scan, image=png, index=0)

    process_topography_scan(scan.id)

    scan.refresh_from_db()
    assert scan.calibration_state == 'default'
    assert abs(scan.result.central_k - gt['expected_power']) < 2.0


@pytest.mark.django_db
def test_process_scan_uncalibrated_on_aspect_mismatch():
    """capture 4:3 but the analysed still is 1:1 (a crop) -> refuse to calibrate."""
    scan = TopographyScan.objects.create(
        assessment=AssessmentFactory(), status='uploaded',
        camera_focal_px=1100.0, capture_width_px=1600, capture_height_px=1200)
    png, _ = _cone_png('cone.png', 1100.0)  # 800x800 still
    TopographyStill.objects.create(scan=scan, image=png, index=0)

    process_topography_scan(scan.id)

    scan.refresh_from_db()
    assert scan.result.calibration_state == 'uncalibrated'
    assert scan.calibration_state == 'uncalibrated'


@pytest.mark.django_db
def test_process_scan_uncalibrated_without_capture_resolution():
    """camera_focal_px present but no capture resolution -> cannot verify -> uncalibrated."""
    scan = TopographyScan.objects.create(
        assessment=AssessmentFactory(), status='uploaded', camera_focal_px=1100.0)
    png, _ = _cone_png('cone.png', 1100.0)
    TopographyStill.objects.create(scan=scan, image=png, index=0)

    process_topography_scan(scan.id)

    scan.refresh_from_db()
    assert scan.result.calibration_state == 'uncalibrated'
    assert scan.calibration_state == 'uncalibrated'
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && USE_SQLITE_TESTS=1 python3 -m pytest apps/topography/tests/test_tasks.py -q`
Expected: FAIL — `tasks.py` still branches on `if scan.camera_focal_px:` (ignores resolution), so the downscaled test reconstructs with the wrong focal (2200 not 1100) and the aspect-mismatch / no-resolution tests badge `default` instead of `uncalibrated`.

- [ ] **Step 3: Add the import to `tasks.py`**

In `backend/apps/topography/tasks.py`, after the existing `from apps.analysis.topography.disc import default_cone_profile, CONE_NOMINAL_WORKING_DISTANCE_MM`:

```python
from apps.analysis.topography.intrinsics import effective_focal_px
```

- [ ] **Step 4: Replace the calibrated-path guard**

In `backend/apps/topography/tasks.py`, replace this block:

```python
        if scan.camera_focal_px:
            radii_mm, depths_mm = default_cone_profile()
            out = analyse_topography_frame(
                best_image,
                distance_mm=CONE_NOMINAL_WORKING_DISTANCE_MM,
                focal_px=scan.camera_focal_px,
                ring_object_radii_mm=radii_mm,
                ring_object_depths_mm=depths_mm,
                calibration_state='default',
            )
        else:
            out = analyse_topography_frame(best_image)
```

with:

```python
        still_h, still_w = best_image.shape[:2]
        focal_px = effective_focal_px(
            scan.camera_focal_px, scan.capture_width_px, scan.capture_height_px,
            still_w, still_h)
        if focal_px:
            radii_mm, depths_mm = default_cone_profile()
            out = analyse_topography_frame(
                best_image,
                distance_mm=CONE_NOMINAL_WORKING_DISTANCE_MM,
                focal_px=focal_px,
                ring_object_radii_mm=radii_mm,
                ring_object_depths_mm=depths_mm,
                calibration_state='default',
            )
        else:
            out = analyse_topography_frame(best_image)  # uncalibrated placeholder
```

- [ ] **Step 5: Run the task tests to verify they pass**

Run: `cd backend && USE_SQLITE_TESTS=1 python3 -m pytest apps/topography/tests/test_tasks.py -q`
Expected: all pass (updated calibrated test + 3 new + existing uncalibrated).

- [ ] **Step 6: Run the full backend suite for regressions**

Run: `cd backend && USE_SQLITE_TESTS=1 python3 -m pytest -q`
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add backend/apps/topography/tasks.py backend/apps/topography/tests/test_tasks.py
git commit -m "feat(topography): derive focal_px from the analysed still's resolution

process_topography_scan now reconciles camera_focal_px against the uploaded
still's real dimensions via effective_focal_px: rescales under uniform scaling,
and falls back to the uncalibrated path when the resolution is missing or the
aspect ratio differs (a crop). Closes the focal/resolution mismatch by which a
'default' badge could overstate without failing.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:**
- Pure `effective_focal_px` (rescale + aspect/crop refusal + None on missing/non-positive) → Task 1. ✓
- `capture_width_px`/`capture_height_px` fields + serializer + validation + migration → Task 2. ✓
- `tasks.py` uses reconciled focal; missing resolution → uncalibrated (tightening) → Task 3. ✓
- `ASPECT_TOLERANCE = 0.01`, rescale factor `still_width/capture_width` → Task 1 code. ✓
- Existing calibrated task test updated for the new required fields → Task 3 Step 1(a). ✓
- Tests: unit (Task 1), API round-trip + rejection (Task 2), task calibrated/downscale/crop/missing-res (Task 3). ✓
- Physiological-bounds backstop correctly absent (deferred by spec).

**Placeholder scan:** No TBD/TODO; every step carries real code/commands.

**Type consistency:** `effective_focal_px(camera_focal_px, capture_width_px, capture_height_px, still_width_px, still_height_px) -> float | None` used identically in Task 1 (definition) and Task 3 (call, with `best_image.shape[:2]` giving `(still_h, still_w)` — note the call passes `still_w, still_h` in width,height order, matching the signature). `capture_width_px`/`capture_height_px` are `PositiveIntegerField` in Task 2 and read as ints in Task 3. `_cone_png(name, focal_px)` renders `size=800` (→ 800×800), matching the capture dims used in the Task 3 tests.
