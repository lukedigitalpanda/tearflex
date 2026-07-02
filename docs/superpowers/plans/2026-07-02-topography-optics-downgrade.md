# Topography Optics Downgrade Hardening (pre-2b) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wrong-intrinsics optics failures downgrade the scan (honest `uncalibrated`) instead of failing it through Celery retries, and a positively-detected crop skips the EXIF focal fallback.

**Architecture:** Move `ImplausibleReconstruction` down into `optics.py` (re-exported from `reconstruct.py` so all import sites keep working) and convert the two measurement-shaped optics raises to it — the pipeline's existing catch then generalizes for free. Add a pure `aspect_mismatch` predicate to `intrinsics.py` (single source of truth, `effective_focal_px` refactored onto it) and guard the EXIF fallback in `tasks.py` with it.

**Tech Stack:** Django 5 / Celery, NumPy, pytest (`USE_SQLITE_TESTS=1`).

**Spec:** `docs/superpowers/specs/2026-07-02-topography-optics-downgrade-design.md` — read first; its Decisions and behaviour matrix govern.

## Global Constraints

- Working directory: `/opt/tearflex/backend`. Tests: `USE_SQLITE_TESTS=1 python3 -m pytest …`.
- Baseline before Task 1: **252 passed**. Task 1 ends at **257**, Task 2 at **261**.
- `ImplausibleReconstruction` must remain a `ValueError` subclass and keep its importability from `apps.analysis.topography.reconstruct` (re-export) — `pipeline.py` and existing tests import it from there and must not change.
- Only the two `optics.py` raises named in the spec convert (denominator<=0 in `corneal_radius_mm`; `<=0` in `radius_to_power`). The `"all optical inputs must be positive"` contract checks stay plain `ValueError`.
- `aspect_mismatch` returns True ONLY on a positive detection (all four dims present and positive AND aspect delta > `ASPECT_TOLERANCE`); missing/invalid dims → False. `effective_focal_px` behaviour is unchanged (existing tests must pass untouched).
- Verified trigger values (machine-checked): `corneal_radius_mm(100, 40, 200, 3)` → denom 600−8000<0; reconstruct-level flat rings for R=7.8 rendered @ f=3000 then reconstructed claiming `focal_px=200` → raises; pipeline-level rendered f=5000 claimed 500 → downgrade; task-level EXIF f35=13 (f_px≈340) → raises today, must downgrade after Task 1; f35=20 already downgrades via the gate (unchanged).
- No model/serializer/API changes, no migrations, no new dependencies.
- Commit after every task with the exact message given; end every commit message with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

---

### Task 1: Move + convert `ImplausibleReconstruction` in the optics layer

**Files:**
- Modify: `apps/analysis/topography/optics.py` (add exception class; convert 2 raises)
- Modify: `apps/analysis/topography/reconstruct.py` (remove class; re-export import)
- Test: `apps/analysis/topography/tests/test_optics.py`, `.../test_reconstruct.py`, `.../test_pipeline.py` (append), `apps/topography/tests/test_tasks.py` (append)

**Interfaces:**
- Consumes: existing `_rings_for` helper (test_reconstruct.py), `make_physical_ring_image` (test_pipeline.py), `_cone_jpg` helper (test_tasks.py), `ImplausibleReconstruction` import already present in test_reconstruct.py.
- Produces: `optics.ImplausibleReconstruction` (canonical definition); `reconstruct.ImplausibleReconstruction` remains importable (re-export). Task 2 needs nothing from this task.

- [ ] **Step 1: Write the failing tests**

In `apps/analysis/topography/tests/test_optics.py`: read the file's existing import style first. Ensure `ImplausibleReconstruction` is imported from `apps.analysis.topography.optics`, and append (adapting the `optics.` call prefix to the file's existing style — if it imports functions directly, call them directly):

```python
def test_corneal_radius_non_physical_raises_implausible():
    """Positive but mutually-inconsistent inputs (ring too large for the claimed
    focal/geometry) are a measurement failure, not a caller bug — they must raise
    the downgradeable exception type, not plain ValueError."""
    with pytest.raises(ImplausibleReconstruction, match="non-physical"):
        optics.corneal_radius_mm(100.0, 40.0, 200.0, 3.0)  # denom = 600 - 8000 < 0


def test_radius_to_power_non_positive_raises_implausible():
    with pytest.raises(ImplausibleReconstruction, match="positive"):
        optics.radius_to_power(0.0)
```

In `apps/analysis/topography/tests/test_reconstruct.py`, append:

```python
def test_catadioptric_non_physical_focal_raises_implausible():
    """A focal far too small for the observed ring radii makes the optics
    inversion non-physical (denominator <= 0); this must surface as
    ImplausibleReconstruction so the pipeline downgrades instead of failing."""
    obj = [3.0, 6.0, 9.0, 12.0]
    rings = _rings_for(lambda a: 7.8, obj, 40.0, 3000.0)
    with pytest.raises(ImplausibleReconstruction, match="non-physical"):
        reconstruct_curvature(rings, distance_mm=40.0, focal_px=200.0,
                              ring_object_radii_mm=obj)
```

In `apps/analysis/topography/tests/test_pipeline.py`, append:

```python
def test_pipeline_downgrades_non_physical_focal():
    """Optics-level wrong-intrinsics failures (not just gate-range ones) must
    downgrade — previously they escaped as plain ValueError and failed the scan."""
    obj = [3.0, 6.0, 9.0, 12.0, 15.0, 18.0]
    img, _ = make_physical_ring_image(7.8, 40.0, 5000.0, obj)
    out = analyse_topography_frame(img, distance_mm=40.0, focal_px=500.0,
                                   ring_object_radii_mm=obj)
    assert out['raw_output']['calibration_state'] == 'uncalibrated'
    assert 'non-physical' in out['raw_output']['downgrade_reason']
```

In `apps/topography/tests/test_tasks.py`, append:

```python
@pytest.mark.django_db
def test_process_scan_ultrawide_exif_downgrades_not_fails():
    """f35=13 is a REAL ultra-wide tag; at this geometry it inverts non-physically.
    Before the optics hardening this failed the scan and burned retries; it must
    downgrade like any other implausible focal."""
    scan = TopographyScan.objects.create(assessment=AssessmentFactory(), status='uploaded')
    jpg, _ = _cone_jpg('cone.jpg', 1100.0, f35=13)
    TopographyStill.objects.create(scan=scan, image=jpg, index=0)

    process_topography_scan(scan.id)

    scan.refresh_from_db()
    assert scan.status == 'analysed'
    assert scan.result.calibration_state == 'uncalibrated'
    assert scan.result.raw_output['focal_source'] == 'exif'
    assert 'non-physical' in scan.result.raw_output['downgrade_reason']
```

- [ ] **Step 2: Run the new tests to verify they fail**

Run: `USE_SQLITE_TESTS=1 python3 -m pytest apps/analysis/topography/tests/test_optics.py apps/analysis/topography/tests/test_reconstruct.py::test_catadioptric_non_physical_focal_raises_implausible apps/analysis/topography/tests/test_pipeline.py::test_pipeline_downgrades_non_physical_focal "apps/topography/tests/test_tasks.py::test_process_scan_ultrawide_exif_downgrades_not_fails" -v`
Expected: optics tests error with **ImportError** (`ImplausibleReconstruction` not in optics); the reconstruct test fails with plain `ValueError` propagating (not the expected subclass); the pipeline test errors with `ValueError` escaping `analyse_topography_frame`; the tasks test errors (the task raises through retry, scan ends `failed`). Record each observed mode.

- [ ] **Step 3: Implement**

In `apps/analysis/topography/optics.py`, after the `_POWER_NUMERATOR = ...` line, add:

```python
class ImplausibleReconstruction(ValueError):
    """The reconstruction produced (or implies) a physically-impossible cornea.

    Measurement failure — wrong intrinsics, bad extraction — not a caller bug:
    the caller should refuse the calibrated badge (downgrade), never publish
    the number or fail the scan. Raised here when individually-valid inputs
    are mutually non-physical, and by the reconstruction-level plausibility
    gate (see reconstruct._gate_plausibility, which re-exports this class).
    """
```

Convert exactly two raises (messages unchanged):
- In `corneal_radius_mm`: `raise ValueError("non-physical ring radius for this geometry (denominator <= 0)")` → `raise ImplausibleReconstruction("non-physical ring radius for this geometry (denominator <= 0)")`
- In `radius_to_power`: `raise ValueError("corneal radius must be positive")` → `raise ImplausibleReconstruction("corneal radius must be positive")`

Leave both `"all optical inputs must be positive"` raises as plain `ValueError`.

In `apps/analysis/topography/reconstruct.py`:
- After the `from . import optics` line, add:

```python
# Re-export: the exception is defined in optics (the lowest layer, so optics
# itself can raise it); every existing import site keeps working unchanged.
from .optics import ImplausibleReconstruction
```

- Delete the entire `class ImplausibleReconstruction(ValueError): ...` block (class line + docstring) from this file. Everything else (bounds, `_gate_plausibility`, its raise) stays exactly as is.

- [ ] **Step 4: Run the new tests to verify they pass**

Run the Step 2 command again.
Expected: all 5 new tests pass.

- [ ] **Step 5: Run the full suite**

Run: `USE_SQLITE_TESTS=1 python3 -m pytest -q`
Expected: **257 passed** (252 + 5). Existing `pytest.raises(ValueError, ...)` optics/reconstruct tests still pass because `ImplausibleReconstruction` subclasses `ValueError` with unchanged messages.

- [ ] **Step 6: Commit**

```bash
git add apps/analysis/topography/optics.py apps/analysis/topography/reconstruct.py apps/analysis/topography/tests/test_optics.py apps/analysis/topography/tests/test_reconstruct.py apps/analysis/topography/tests/test_pipeline.py apps/topography/tests/test_tasks.py
git commit -m "fix(topography): wrong-intrinsics optics errors downgrade, not fail

Move ImplausibleReconstruction into optics (re-exported from reconstruct)
and raise it for the two measurement-shaped failures (non-physical ring
denominator; non-positive radius). The pipeline's existing catch now
downgrades them: a real ultra-wide EXIF tag (f35~13) ends analysed +
uncalibrated instead of failed + 3 burned retries. Contract errors
(non-positive inputs) still raise plain ValueError.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Crop-detected scans skip the EXIF fallback

**Files:**
- Modify: `apps/analysis/topography/intrinsics.py` (add `aspect_mismatch`; refactor `effective_focal_px` onto it)
- Modify: `apps/topography/tasks.py` (guard the EXIF fallback; import)
- Modify (docs ride-alongs): `apps/analysis/topography/exif.py` (module docstring), `docs/superpowers/specs/2026-07-02-topography-exif-focal-design.md` (two stale lines)
- Test: `apps/analysis/topography/tests/test_intrinsics.py` (append), `apps/topography/tests/test_tasks.py` (append)

**Interfaces:**
- Consumes: `ASPECT_TOLERANCE` and `effective_focal_px` in `intrinsics.py` (shown below as currently on disk); the `_cone_jpg` helper in `test_tasks.py`.
- Produces: `intrinsics.aspect_mismatch(capture_width_px, capture_height_px, still_width_px, still_height_px) -> bool`, consumed by `tasks.py`.

- [ ] **Step 1: Write the failing tests**

In `apps/analysis/topography/tests/test_intrinsics.py`: extend the existing import from `apps.analysis.topography.intrinsics` to also import `aspect_mismatch`, then append:

```python
def test_aspect_mismatch_detects_crop():
    assert aspect_mismatch(1600, 1200, 800, 800) is True


def test_aspect_mismatch_false_when_dims_missing_or_invalid():
    """Absence of evidence is not a detection — missing/invalid dims must not
    veto other focal sources."""
    assert aspect_mismatch(None, None, 800, 800) is False
    assert aspect_mismatch(1600, None, 800, 800) is False
    assert aspect_mismatch(0, 1200, 800, 800) is False
    assert aspect_mismatch(1600, 1200, 0, 800) is False


def test_aspect_mismatch_false_on_uniform_scale():
    assert aspect_mismatch(1600, 1200, 800, 600) is False
```

In `apps/topography/tests/test_tasks.py`, append:

```python
@pytest.mark.django_db
def test_process_scan_crop_detected_skips_exif_fallback():
    """An aspect mismatch between declared capture dims and the analysed still is
    a positively-detected crop, which invalidates the still's own f35 (it
    describes the uncropped capture's field of view). The EXIF fallback must not
    run; the scan stays honestly uncalibrated."""
    scan = TopographyScan.objects.create(
        assessment=AssessmentFactory(), status='uploaded',
        camera_focal_px=1100.0, capture_width_px=1600, capture_height_px=1200)
    jpg, _ = _cone_jpg('cone.jpg', 1100.0, f35=42)  # would calibrate if trusted
    TopographyStill.objects.create(scan=scan, image=jpg, index=0)

    process_topography_scan(scan.id)

    scan.refresh_from_db()
    assert scan.result.calibration_state == 'uncalibrated'
    assert 'focal_source' not in scan.result.raw_output
```

- [ ] **Step 2: Run the new tests to verify they fail**

Run: `USE_SQLITE_TESTS=1 python3 -m pytest apps/analysis/topography/tests/test_intrinsics.py "apps/topography/tests/test_tasks.py::test_process_scan_crop_detected_skips_exif_fallback" -v`
Expected: intrinsics tests **error with ImportError** (`aspect_mismatch` doesn't exist); the tasks test **FAILS** — today the crop-rejected scan falls through to EXIF f35=42 and calibrates (`'default'`, `focal_source == 'exif'`).

- [ ] **Step 3: Implement**

In `apps/analysis/topography/intrinsics.py`, after the `ASPECT_TOLERANCE = 0.01 ...` line, add:

```python
def aspect_mismatch(capture_width_px, capture_height_px,
                    still_width_px, still_height_px) -> bool:
    """True only when a crop is POSITIVELY detected: all four dims present and
    positive, and the still's aspect ratio differs from the declared capture's
    beyond ASPECT_TOLERANCE. Missing or invalid dims are "not detected" (False)
    — absence of evidence must not veto other focal sources.
    """
    if not capture_width_px or not capture_height_px \
            or capture_width_px <= 0 or capture_height_px <= 0:
        return False
    if not still_width_px or not still_height_px \
            or still_width_px <= 0 or still_height_px <= 0:
        return False
    capture_aspect = capture_width_px / capture_height_px
    still_aspect = still_width_px / still_height_px
    return abs(still_aspect - capture_aspect) > ASPECT_TOLERANCE * capture_aspect
```

In `effective_focal_px`, replace the aspect-check block

```python
    capture_aspect = capture_width_px / capture_height_px
    still_aspect = still_width_px / still_height_px
    if abs(still_aspect - capture_aspect) > ASPECT_TOLERANCE * capture_aspect:
        return None
```

with

```python
    if aspect_mismatch(capture_width_px, capture_height_px,
                       still_width_px, still_height_px):
        return None
```

(the earlier missing/non-positive guards in `effective_focal_px` stay exactly as they are — its behaviour is unchanged).

In `apps/topography/tasks.py`:
- Extend the intrinsics import to `from apps.analysis.topography.intrinsics import aspect_mismatch, effective_focal_px`.
- Change the EXIF-fallback guard from `if focal_px is None:` to:

```python
        if focal_px is None and not aspect_mismatch(
                scan.capture_width_px, scan.capture_height_px, still_w, still_h):
```

and extend that block's comment with one line: `# A positively-detected crop (aspect mismatch) invalidates the still's f35, so the EXIF fallback is skipped.`

Docs ride-alongs:
- `apps/analysis/topography/exif.py` module docstring: replace `wrong
  under crop (accepted residual risk, bounded by the plausibility backstop).` with `wrong under crop — detected crops (declared-dims aspect mismatch) skip this fallback entirely, and undetectable ones are downgraded by the plausibility machinery (gate + optics guards).`
- `docs/superpowers/specs/2026-07-02-topography-exif-focal-design.md`: in the module sketch, replace `missing tag, non-numeric, or value <= 0. Never raises.` with `missing tag, non-numeric, non-finite, or outside the PROVISIONAL usability band. Never raises.`; in decision 4, replace `accepted residual risk, same class as the existing
   within-tolerance-wrong-declared-focal gap; the backstop bounds it.` with `detected crops skip the fallback (see the optics-downgrade hardening spec); undetectable crops remain a residual risk downgraded by the plausibility machinery.`

- [ ] **Step 4: Run the new tests to verify they pass**

Run the Step 2 command again.
Expected: all 4 new tests pass.

- [ ] **Step 5: Run the full suite**

Run: `USE_SQLITE_TESTS=1 python3 -m pytest -q`
Expected: **261 passed** (257 + 4). The pre-existing `test_process_scan_uncalibrated_on_aspect_mismatch` still passes (its PNG carries no EXIF; now doubly guarded).

- [ ] **Step 6: Commit**

```bash
git add apps/analysis/topography/intrinsics.py apps/topography/tasks.py apps/analysis/topography/exif.py apps/analysis/topography/tests/test_intrinsics.py apps/topography/tests/test_tasks.py docs/superpowers/specs/2026-07-02-topography-exif-focal-design.md
git commit -m "fix(topography): crop-detected scans skip the EXIF focal fallback

A declared-dims aspect mismatch is a positively-detected crop, which
invalidates the still's f35 (it describes the uncropped capture's FoV).
New intrinsics.aspect_mismatch predicate (effective_focal_px refactored
onto it) guards the fallback; missing dims stay non-vetoing. Stale 2a
docstring/spec language updated for the band + optics-downgrade reality.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```
