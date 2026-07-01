# Topography Calibrated-Path Wiring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `apps/topography/tasks.py` run the cone-aware catadioptric reconstruction (badged `default`) whenever a scan carries a mobile-provided camera focal length, with a clean fallback to the uncalibrated placeholder otherwise.

**Architecture:** Add a nullable `camera_focal_px` field to `TopographyScan` (mobile sends it on create). The Celery task branches on that field: when present, it reconstructs with a provisional nominal working distance + the `disc.py` default cone profile; otherwise it keeps today's uncalibrated call. The stored `calibration_state` is sourced from what the reconstruction actually produced, not from the scan's input.

**Tech Stack:** Django 5 + DRF, Celery, pytest (`pytest.ini` → `tearflex.settings.test`), OpenCV/NumPy for synthetic frames.

## Global Constraints

- DB-backed tests run with `USE_SQLITE_TESTS=1` (this host has no reachable project Postgres): `USE_SQLITE_TESTS=1 pytest ...`.
- Honesty model: a result may only be badged more calibrated than `uncalibrated` when the reconstruction actually used real geometry. No keratoconus signal is surfaced. Absolute keratometry stays screening-grade until CAD / reference-sphere calibration.
- `calibration_state` stays server-set and read-only on the API (mobile cannot set the badge).
- Cone profile + nominal distance are provisional placeholders; label them as such in code.

---

### Task 1: Data contract — `camera_focal_px` field + nominal distance constant + serializers

**Files:**
- Modify: `backend/apps/analysis/topography/disc.py` (add `CONE_NOMINAL_WORKING_DISTANCE_MM`)
- Modify: `backend/apps/topography/models.py` (add `camera_focal_px`)
- Create: `backend/apps/topography/migrations/0002_topographyscan_camera_focal_px.py` (generated)
- Modify: `backend/apps/topography/serializers.py` (expose the field on create + read)
- Test: `backend/apps/topography/tests/test_api.py`

**Interfaces:**
- Produces: `TopographyScan.camera_focal_px: float | None`; `disc.CONE_NOMINAL_WORKING_DISTANCE_MM: float = 35.0`. Task 2 consumes both.

- [ ] **Step 1: Add the nominal-distance constant to `disc.py`**

Add below the existing `CONE_N_RINGS = 10` line:

```python
# PLACEHOLDER camera-to-cornea working distance (mm). The cone (30 mm deep) braces
# against the face, so the cornea sits just beyond the wide rim. This value is a
# provisional stand-in until the CAD file / reference-sphere calibration pin it — a
# ~1 mm error is ~3 D, so absolute keratometry stays screening-grade until then.
# It must exceed the deepest ring depth so every per-ring object distance is positive.
CONE_NOMINAL_WORKING_DISTANCE_MM = 35.0
```

- [ ] **Step 2: Write the failing API round-trip test**

Add to `backend/apps/topography/tests/test_api.py`:

```python
@pytest.mark.django_db
def test_create_scan_stores_camera_focal_px(api, clinician):
    assessment = AssessmentFactory(patient__practice=clinician.practice)
    with patch('apps.topography.views.process_topography_scan.delay') as delay:
        delay.return_value.id = 'task-focal'
        resp = api.post('/api/topography/scans/', {
            'assessment': assessment.id,
            'camera_focal_px': 2500.0,
            'stills': [_png('a.png')],
        }, format='multipart')
    assert resp.status_code == 201, resp.content
    scan = TopographyScan.objects.get(id=resp.data['id'])
    assert scan.camera_focal_px == 2500.0
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd backend && USE_SQLITE_TESTS=1 pytest apps/topography/tests/test_api.py::test_create_scan_stores_camera_focal_px -v`
Expected: FAIL — the model has no `camera_focal_px`, so the create serializer ignores it and `scan.camera_focal_px` raises `AttributeError` (or the field is absent).

- [ ] **Step 4: Add the model field**

In `backend/apps/topography/models.py`, add to `TopographyScan` (after `phone_model_id`):

```python
    camera_focal_px = models.FloatField(null=True, blank=True)
    # Horizontal focal length in pixels, matched to the uploaded still's resolution
    # (mobile-provided). Drives the distance-aware catadioptric reconstruction.
```

- [ ] **Step 5: Generate the migration**

Run: `cd backend && USE_SQLITE_TESTS=1 python3 manage.py makemigrations topography --settings=tearflex.settings.test`
Expected: creates `0002_topographyscan_camera_focal_px.py` adding one nullable field. (makemigrations does not touch the database.)

- [ ] **Step 6: Expose the field on the serializers**

In `backend/apps/topography/serializers.py`:
- Add `'camera_focal_px'` to `TopographyScanCreateSerializer.Meta.fields` (after `'app_version'`).
- Add `'camera_focal_px'` to `TopographyScanSerializer.Meta.fields` (after `'app_version'`).

- [ ] **Step 7: Run the test to verify it passes**

Run: `cd backend && USE_SQLITE_TESTS=1 pytest apps/topography/tests/test_api.py::test_create_scan_stores_camera_focal_px -v`
Expected: PASS.

- [ ] **Step 8: Run the topography API + model suites for regressions**

Run: `cd backend && USE_SQLITE_TESTS=1 pytest apps/topography/tests/test_api.py apps/topography/tests/test_models.py -q`
Expected: all pass.

- [ ] **Step 9: Commit**

```bash
git add backend/apps/analysis/topography/disc.py backend/apps/topography/models.py \
        backend/apps/topography/migrations/0002_topographyscan_camera_focal_px.py \
        backend/apps/topography/serializers.py backend/apps/topography/tests/test_api.py
git commit -m "feat(topography): add camera_focal_px capture field + nominal distance constant

TopographyScan gains a nullable mobile-provided camera_focal_px (write on create,
read on detail). disc.py gains a PLACEHOLDER nominal cone working distance. These
are the inputs the calibrated reconstruction path will consume.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Wire the calibrated path + reconcile `calibration_state` in `tasks.py`

**Files:**
- Modify: `backend/apps/topography/tasks.py`
- Test: `backend/apps/topography/tests/test_tasks.py`

**Interfaces:**
- Consumes: `TopographyScan.camera_focal_px`, `disc.CONE_NOMINAL_WORKING_DISTANCE_MM`, `disc.default_cone_profile()`, `pipeline.analyse_topography_frame(bgr, *, distance_mm, focal_px, ring_object_radii_mm, ring_object_depths_mm, calibration_state)` which returns `raw_output['calibration_state']`.
- Produces: `TopographyResult.calibration_state` and `TopographyScan.calibration_state` both equal to `out['raw_output']['calibration_state']` (`'default'` when calibrated inputs present, else `'uncalibrated'`).

- [ ] **Step 1: Write the failing calibrated + uncalibrated task tests**

Add to `backend/apps/topography/tests/test_tasks.py`. First extend the imports at the top:

```python
from apps.analysis.topography.tests.synthetic import make_ring_image, make_cone_ring_image
from apps.analysis.topography.disc import default_cone_profile, CONE_NOMINAL_WORKING_DISTANCE_MM
```

Then add a cone-still helper and two tests:

```python
def _cone_png(name, focal_px):
    """A synthetic Placido-cone still rendered at the nominal working distance, so the
    calibrated path should recover ~43.27 D. Returns (uploaded_file, ground_truth)."""
    radii, depths = default_cone_profile()
    img, gt = make_cone_ring_image(7.8, CONE_NOMINAL_WORKING_DISTANCE_MM, focal_px,
                                   radii, depths, size=800)
    ok, buf = cv2.imencode('.png', img)
    return SimpleUploadedFile(name, buf.tobytes(), content_type='image/png'), gt


@pytest.mark.django_db
def test_process_scan_calibrated_when_focal_px_present():
    scan = TopographyScan.objects.create(assessment=AssessmentFactory(),
                                         status='uploaded', camera_focal_px=1100.0)
    png, gt = _cone_png('cone.png', 1100.0)
    TopographyStill.objects.create(scan=scan, image=png, index=0)

    process_topography_scan(scan.id)

    scan.refresh_from_db()
    assert scan.status == 'analysed'
    assert scan.result.calibration_state == 'default'
    assert scan.calibration_state == 'default'
    assert abs(scan.result.central_k - gt['expected_power']) < 2.0


@pytest.mark.django_db
def test_process_scan_uncalibrated_without_focal_px():
    scan = TopographyScan.objects.create(assessment=AssessmentFactory(), status='uploaded')
    TopographyStill.objects.create(scan=scan, image=_png('crisp.png', 1.0), index=0)

    process_topography_scan(scan.id)

    scan.refresh_from_db()
    assert scan.result.calibration_state == 'uncalibrated'
    assert scan.calibration_state == 'uncalibrated'
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && USE_SQLITE_TESTS=1 pytest apps/topography/tests/test_tasks.py::test_process_scan_calibrated_when_focal_px_present apps/topography/tests/test_tasks.py::test_process_scan_uncalibrated_without_focal_px -v`
Expected: the calibrated test FAILS — `tasks.py` ignores `camera_focal_px`, so `calibration_state` is `'uncalibrated'`, not `'default'`. (The uncalibrated test may already pass; that is fine — it is a regression guard.)

- [ ] **Step 3: Add the imports to `tasks.py`**

In `backend/apps/topography/tasks.py`, after the existing `from apps.analysis.topography.pipeline import analyse_topography_frame`:

```python
from apps.analysis.topography.disc import default_cone_profile, CONE_NOMINAL_WORKING_DISTANCE_MM
```

- [ ] **Step 4: Branch the analysis call and reconcile `calibration_state`**

In `backend/apps/topography/tasks.py`, replace this block:

```python
        out = analyse_topography_frame(best_image)
        result = TopographyResult(
            scan=scan,
            sim_k_flat=out['sim_k_flat'],
            sim_k_steep=out['sim_k_steep'],
            sim_k_axis=out['sim_k_axis'],
            central_k=out['central_k'],
            astigmatism_magnitude=out['astigmatism_magnitude'],
            astigmatism_axis=out['astigmatism_axis'],
            confidence=out['confidence'],
            algorithm_version=out['algorithm_version'],
            calibration_state=scan.calibration_state,
            raw_output=out['raw_output'],
        )
```

with:

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

        # Badge the result with what the reconstruction actually did, not the scan's
        # input state — the label must never claim more than the maths delivered.
        result_state = out['raw_output']['calibration_state']
        result = TopographyResult(
            scan=scan,
            sim_k_flat=out['sim_k_flat'],
            sim_k_steep=out['sim_k_steep'],
            sim_k_axis=out['sim_k_axis'],
            central_k=out['central_k'],
            astigmatism_magnitude=out['astigmatism_magnitude'],
            astigmatism_axis=out['astigmatism_axis'],
            confidence=out['confidence'],
            algorithm_version=out['algorithm_version'],
            calibration_state=result_state,
            raw_output=out['raw_output'],
        )
```

- [ ] **Step 5: Persist the reconciled state on the scan**

In `backend/apps/topography/tasks.py`, replace:

```python
        scan.status = 'analysed'
        scan.save(update_fields=['status', 'updated_at'])
```

with:

```python
        scan.status = 'analysed'
        scan.calibration_state = result_state
        scan.save(update_fields=['status', 'calibration_state', 'updated_at'])
```

- [ ] **Step 6: Run the two task tests to verify they pass**

Run: `cd backend && USE_SQLITE_TESTS=1 pytest apps/topography/tests/test_tasks.py::test_process_scan_calibrated_when_focal_px_present apps/topography/tests/test_tasks.py::test_process_scan_uncalibrated_without_focal_px -v`
Expected: both PASS.

- [ ] **Step 7: Run the full backend suite for regressions**

Run: `cd backend && USE_SQLITE_TESTS=1 pytest -q`
Expected: all pass (previously 203 + 3 new = 206).

- [ ] **Step 8: Commit**

```bash
git add backend/apps/topography/tasks.py backend/apps/topography/tests/test_tasks.py
git commit -m "feat(topography): run calibrated cone reconstruction when focal_px present

process_topography_scan now engages the distance-aware catadioptric path (nominal
working distance + default cone profile) when the scan carries camera_focal_px,
badged 'default'; otherwise the uncalibrated placeholder is unchanged. The stored
calibration_state (on both result and scan) is sourced from what the reconstruction
actually produced, not the scan's input value.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:**
- `camera_focal_px` field + serializer → Task 1. ✓
- Nominal distance constant → Task 1 (PLACEHOLDER-labelled). ✓
- `tasks.py` branch on `camera_focal_px` → Task 2. ✓
- Honesty reconciliation (state from `raw_output`, scan + result consistent) → Task 2. ✓
- Migration → Task 1 Step 5. ✓
- Tests: serializer round-trip (Task 1), calibrated + uncalibrated task (Task 2). ✓
- Deferred items (mobile send, iris/focus refinement, DeviceCalibration lookup, reference-sphere) are correctly absent.

**Placeholder scan:** No TBD/TODO; all steps carry real code/commands.

**Type consistency:** `camera_focal_px` (float|None), `CONE_NOMINAL_WORKING_DISTANCE_MM` (float), `default_cone_profile() -> (list, list)`, `analyse_topography_frame` keyword args and `raw_output['calibration_state']` all match the current implementations verified in the codebase.
