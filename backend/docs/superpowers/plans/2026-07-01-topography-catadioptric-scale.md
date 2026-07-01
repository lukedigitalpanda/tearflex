# Topography Catadioptric Distance-Aware Scale — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the topography reconstruction's fixed placeholder `scale=4300.0` with a physically-derived, distance-aware convex-mirror (catadioptric) model that yields metrically-valid keratometric dioptres, validated end-to-end against synthetic ground truth.

**Architecture:** The cornea is modelled as a convex mirror of radius `R`. A Placido ring of known physical radius `h₀` (from attachment geometry) at object distance `d₀` forms a diminished virtual image; a camera of focal length `f_px` (from intrinsics) at recovered working distance `d` images it. Paraxial optics give a closed-form forward map `R → r_px` and its exact inverse `r_px → R`. A new pure `optics.py` module holds this maths; `reconstruct.py` gains a catadioptric path that engages when distance + geometry are supplied and otherwise falls back unchanged to the uncalibrated placeholder; `pipeline.py` threads the new inputs through and surfaces `calibration_state`.

**Tech Stack:** Python 3.12, NumPy, pytest. Pure functions where possible (no DB). Backend is TDD.

## Global Constraints

- **Honesty model:** results computed without a recovered distance + geometry MUST stay `calibration_state='uncalibrated'` and keep the existing placeholder behaviour bit-for-bit. No keratoconus/irregularity signal is added by this slice.
- **Keratometric index:** `n = 1.3375`; power `P = 337.5 / R_mm` (dioptres).
- **Additive only:** do not change the `rings` dict shape, the `metrics.compute_metrics` contract, the API, or the DB. Distance/geometry values are passed in as explicit function arguments; DB lookup + mobile capture of iris/focus are OUT OF SCOPE (deferred to the wiring slice).
- **Run tests with:** `USE_SQLITE_TESTS=1 python3 -m pytest <path>` from `backend/` (no reachable Postgres on this host).
- **Physics (paraxial convex mirror), object distance `d₀` (defaults to working distance `d`):**
  - Forward: `r_px = f_px·h₀·R / (2·d₀·d + R·d + R·d₀)`
  - Inverse: `R = 2·r_px·d₀·d / (f_px·h₀ − r_px·(d + d₀))`  (physical only when denominator > 0)
  - Power: `P = 337.5 / R_mm`
  - Verified: R=7.8, d=d₀=40, f_px=3000, h₀=5 → r_px=30.596234; inverse recovers R to 1e-9; P=43.2692 D. Distance sensitivity ≈ 1 D per 1% distance error.

---

### Task 1: `optics.py` — convex-mirror forward/inverse + power (pure maths)

**Files:**
- Create: `backend/apps/analysis/topography/optics.py`
- Test: `backend/apps/analysis/topography/tests/test_optics.py`

**Interfaces:**
- Produces:
  - `KERATOMETRIC_INDEX: float = 1.3375`
  - `ring_radius_px(corneal_radius_mm: float, distance_mm: float, focal_px: float, object_radius_mm: float, object_distance_mm: float | None = None) -> float`
  - `corneal_radius_mm(ring_px: float, distance_mm: float, focal_px: float, object_radius_mm: float, object_distance_mm: float | None = None) -> float` — raises `ValueError` on non-physical inputs (non-positive args, or denominator `f_px·h₀ − r_px·(d+d₀) ≤ 0`).
  - `radius_to_power(corneal_radius_mm: float) -> float` — `337.5 / corneal_radius_mm`; raises `ValueError` if radius ≤ 0.

- [ ] **Step 1: Write the failing tests**

```python
# backend/apps/analysis/topography/tests/test_optics.py
import math
import pytest
from apps.analysis.topography import optics


def test_forward_known_value():
    r = optics.ring_radius_px(7.8, 40.0, 3000.0, 5.0)
    assert r == pytest.approx(30.596234, abs=1e-5)


def test_inverse_is_exact_round_trip():
    for R in (6.8, 7.2, 7.8, 8.4):
        r = optics.ring_radius_px(R, 40.0, 3000.0, 5.0)
        assert optics.corneal_radius_mm(r, 40.0, 3000.0, 5.0) == pytest.approx(R, abs=1e-9)


def test_radius_to_power():
    assert optics.radius_to_power(7.8) == pytest.approx(43.2692, abs=1e-3)


def test_distance_error_propagates_about_one_dioptre_per_percent():
    r = optics.ring_radius_px(7.8, 40.0, 3000.0, 5.0)  # true capture at 40 mm
    p_true = optics.radius_to_power(7.8)
    # invert with a +4% wrong distance -> power should drop ~3.5 D (verified)
    R_wrong = optics.corneal_radius_mm(r, 41.6, 3000.0, 5.0)
    assert optics.radius_to_power(R_wrong) - p_true == pytest.approx(-3.576, abs=0.05)


def test_object_distance_defaults_to_working_distance():
    a = optics.ring_radius_px(7.8, 40.0, 3000.0, 5.0)
    b = optics.ring_radius_px(7.8, 40.0, 3000.0, 5.0, object_distance_mm=40.0)
    assert a == pytest.approx(b, abs=1e-12)


def test_nonphysical_ring_raises():
    # a ring far too large for the geometry drives the denominator non-positive
    with pytest.raises(ValueError):
        optics.corneal_radius_mm(1e6, 40.0, 3000.0, 5.0)


def test_nonpositive_inputs_raise():
    with pytest.raises(ValueError):
        optics.ring_radius_px(0.0, 40.0, 3000.0, 5.0)
    with pytest.raises(ValueError):
        optics.radius_to_power(0.0)
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && USE_SQLITE_TESTS=1 python3 -m pytest apps/analysis/topography/tests/test_optics.py -q`
Expected: FAIL — `ModuleNotFoundError: No module named 'apps.analysis.topography.optics'`

- [ ] **Step 3: Write minimal implementation**

```python
# backend/apps/analysis/topography/optics.py
"""Paraxial convex-mirror (catadioptric) optics for Placido topography.

The cornea is a convex mirror of radius R (mm). A Placido ring of physical radius
h0 (mm) at object distance d0 (mm) forms a diminished, upright virtual image; a
camera of focal length f_px (pixels) at working distance d (mm) images it. Paraxial
Gaussian optics give a closed-form ring image radius and its exact inverse.

    r_px = f_px * h0 * R / (2*d0*d + R*d + R*d0)
    R    = 2*r_px*d0*d / (f_px*h0 - r_px*(d + d0))

This is the real image-formation physics (virtual image behind a convex mirror),
not a flat-object similar-triangles approximation. It is still paraxial: peripheral
/ aspheric reconstruction (subsystem B) needs per-ring ray tracing on top.
"""

KERATOMETRIC_INDEX = 1.3375
_POWER_NUMERATOR = (KERATOMETRIC_INDEX - 1.0) * 1000.0  # 337.5 D*mm


def _resolve_object_distance(distance_mm: float, object_distance_mm: float | None) -> float:
    return distance_mm if object_distance_mm is None else object_distance_mm


def ring_radius_px(corneal_radius_mm: float, distance_mm: float, focal_px: float,
                   object_radius_mm: float, object_distance_mm: float | None = None) -> float:
    d0 = _resolve_object_distance(distance_mm, object_distance_mm)
    if min(corneal_radius_mm, distance_mm, focal_px, object_radius_mm, d0) <= 0:
        raise ValueError("all optical inputs must be positive")
    R = corneal_radius_mm
    return focal_px * object_radius_mm * R / (2 * d0 * distance_mm + R * distance_mm + R * d0)


def corneal_radius_mm(ring_px: float, distance_mm: float, focal_px: float,
                      object_radius_mm: float, object_distance_mm: float | None = None) -> float:
    d0 = _resolve_object_distance(distance_mm, object_distance_mm)
    if min(ring_px, distance_mm, focal_px, object_radius_mm, d0) <= 0:
        raise ValueError("all optical inputs must be positive")
    denom = focal_px * object_radius_mm - ring_px * (distance_mm + d0)
    if denom <= 0:
        raise ValueError("non-physical ring radius for this geometry (denominator <= 0)")
    return 2 * ring_px * d0 * distance_mm / denom


def radius_to_power(corneal_radius_mm: float) -> float:
    if corneal_radius_mm <= 0:
        raise ValueError("corneal radius must be positive")
    return _POWER_NUMERATOR / corneal_radius_mm
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && USE_SQLITE_TESTS=1 python3 -m pytest apps/analysis/topography/tests/test_optics.py -q`
Expected: PASS (7 passed)

- [ ] **Step 5: Commit**

```bash
git add backend/apps/analysis/topography/optics.py backend/apps/analysis/topography/tests/test_optics.py
git commit -m "feat(topography): convex-mirror optics forward/inverse + keratometric power"
```

---

### Task 2: catadioptric distance-aware path in `reconstruct.py`

**Files:**
- Modify: `backend/apps/analysis/topography/reconstruct.py`
- Test: `backend/apps/analysis/topography/tests/test_reconstruct.py` (add cases; do not break existing)

**Interfaces:**
- Consumes: `optics.corneal_radius_mm`, `optics.radius_to_power` (Task 1); the `rings` dict `{angles_deg: (A,), radii: (A, n_rings), n_rings, ...}`.
- Produces: extended `reconstruct_curvature(rings, scale=NOMINAL_DIOPTRE_SCALE, *, distance_mm=None, focal_px=None, ring_object_radii_mm=None, object_distance_mm=None, calibration_state='default') -> dict`.
  - When `distance_mm`, `focal_px`, and `ring_object_radii_mm` are all provided → catadioptric path: real dioptres; result adds `distance_mm` (float), `calibration_state` (the passed value), `scale=None`.
  - Otherwise → existing placeholder path, unchanged, plus `distance_mm=None`, `calibration_state='uncalibrated'`.
  - Result always contains: `angles_deg`, `mean_radius_per_angle`, `power_per_angle`, `central_power`, `scale`, `n_index`, `distance_mm`, `calibration_state`.

- [ ] **Step 1: Write the failing tests**

```python
# add to backend/apps/analysis/topography/tests/test_reconstruct.py
import numpy as np
import pytest
from apps.analysis.topography import optics
from apps.analysis.topography.reconstruct import reconstruct_curvature


def _rings_for(radius_per_angle_mm, object_radii_mm, distance_mm, focal_px):
    """Build a synthetic rings dict whose pixel radii are the forward-model image of
    a cornea with the given per-meridian radius (mm)."""
    angles = np.arange(0, 360, 2.0)
    radii = np.empty((angles.size, len(object_radii_mm)), dtype=np.float64)
    for i, ang in enumerate(angles):
        R = radius_per_angle_mm(ang)
        for k, h0 in enumerate(object_radii_mm):
            radii[i, k] = optics.ring_radius_px(R, distance_mm, focal_px, h0)
    return {'angles_deg': angles, 'radii': radii, 'n_rings': len(object_radii_mm)}


def test_catadioptric_recovers_spherical_power():
    obj = [3.0, 6.0, 9.0, 12.0]
    rings = _rings_for(lambda a: 7.8, obj, 40.0, 3000.0)
    out = reconstruct_curvature(rings, distance_mm=40.0, focal_px=3000.0,
                                ring_object_radii_mm=obj)
    assert out['calibration_state'] == 'default'
    assert out['distance_mm'] == pytest.approx(40.0)
    assert np.allclose(out['power_per_angle'], 43.2692, atol=1e-3)
    assert out['central_power'] == pytest.approx(43.2692, abs=1e-3)


def test_catadioptric_recovers_astigmatism():
    obj = [3.0, 6.0, 9.0, 12.0]
    # steeper (smaller R) at 0 deg: R = 7.5 at axis 0, 8.1 at 90 (regular astigmatism)
    def R_of(a):
        t = np.deg2rad(a)
        return 7.8 - 0.3 * np.cos(2 * t)   # 7.5 at 0/180, 8.1 at 90
    rings = _rings_for(R_of, obj, 40.0, 3000.0)
    out = reconstruct_curvature(rings, distance_mm=40.0, focal_px=3000.0,
                                ring_object_radii_mm=obj)
    p = out['power_per_angle']
    assert p.max() == pytest.approx(45.00, abs=0.05)   # steep, R=7.5
    assert p.min() == pytest.approx(41.67, abs=0.05)   # flat, R=8.1


def test_uncalibrated_path_is_unchanged():
    rings = {'angles_deg': np.arange(0, 360, 2.0),
             'radii': np.full((180, 4), 30.0), 'n_rings': 4}
    out = reconstruct_curvature(rings)
    assert out['calibration_state'] == 'uncalibrated'
    assert out['distance_mm'] is None
    assert out['scale'] == 4300.0


def test_object_radii_length_must_match_rings():
    rings = {'angles_deg': np.arange(0, 360, 2.0),
             'radii': np.full((180, 4), 30.0), 'n_rings': 4}
    with pytest.raises(ValueError):
        reconstruct_curvature(rings, distance_mm=40.0, focal_px=3000.0,
                              ring_object_radii_mm=[3.0, 6.0])  # only 2 for 4 rings
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && USE_SQLITE_TESTS=1 python3 -m pytest apps/analysis/topography/tests/test_reconstruct.py -q`
Expected: FAIL — `reconstruct_curvature() got an unexpected keyword argument 'distance_mm'`

- [ ] **Step 3: Write minimal implementation**

Replace the body of `reconstruct.py` with (keeps the existing placeholder maths intact in the fallback branch):

```python
# backend/apps/analysis/topography/reconstruct.py
import numpy as np
from . import optics

KERATOMETRIC_INDEX = optics.KERATOMETRIC_INDEX
# Placeholder pixel-radius -> dioptre scale used only when no distance/geometry is
# supplied (calibration_state='uncalibrated'). NOT metrically valid.
NOMINAL_DIOPTRE_SCALE = 4300.0


def reconstruct_curvature(rings: dict, scale: float = NOMINAL_DIOPTRE_SCALE, *,
                          distance_mm: float | None = None,
                          focal_px: float | None = None,
                          ring_object_radii_mm=None,
                          object_distance_mm: float | None = None,
                          calibration_state: str = 'default') -> dict:
    """Map ring radii to a per-meridian apparent power profile.

    Catadioptric (distance-aware) path — when `distance_mm`, `focal_px` and
    `ring_object_radii_mm` are all supplied — inverts the convex-mirror image
    formation per ring/meridian (see optics.py) to give metrically-valid dioptres.
    Otherwise falls back to the uncalibrated placeholder scale.
    """
    if distance_mm is not None and focal_px is not None and ring_object_radii_mm is not None:
        return _reconstruct_catadioptric(
            rings, float(distance_mm), float(focal_px),
            list(ring_object_radii_mm), object_distance_mm, calibration_state)

    radii = rings['radii']
    mean_radius_per_angle = radii.mean(axis=1)
    if (
        mean_radius_per_angle.size == 0
        or not np.all(mean_radius_per_angle > 0)
        or not np.all(radii[:, 0] > 0)
    ):
        raise ValueError("degenerate reconstruction: non-positive radii")
    power_per_angle = scale / mean_radius_per_angle
    central_power = float(np.mean(scale / radii[:, 0]))
    if not np.all(np.isfinite(power_per_angle)) or not np.isfinite(central_power):
        raise ValueError("degenerate reconstruction: non-finite curvature")
    return {
        'angles_deg': rings['angles_deg'],
        'mean_radius_per_angle': mean_radius_per_angle,
        'power_per_angle': power_per_angle,
        'central_power': central_power,
        'scale': float(scale),
        'n_index': KERATOMETRIC_INDEX,
        'distance_mm': None,
        'calibration_state': 'uncalibrated',
    }


def _reconstruct_catadioptric(rings, distance_mm, focal_px, object_radii_mm,
                              object_distance_mm, calibration_state):
    radii = rings['radii']
    n_rings = radii.shape[1]
    if len(object_radii_mm) != n_rings:
        raise ValueError(
            f"ring_object_radii_mm has {len(object_radii_mm)} entries, expected {n_rings}")
    if radii.size == 0 or not np.all(radii > 0):
        raise ValueError("degenerate reconstruction: non-positive radii")

    n_angles = radii.shape[0]
    power_per_angle = np.empty(n_angles, dtype=np.float64)
    central_powers = np.empty(n_angles, dtype=np.float64)
    for i in range(n_angles):
        radius_estimates = [
            optics.corneal_radius_mm(radii[i, k], distance_mm, focal_px,
                                     object_radii_mm[k], object_distance_mm)
            for k in range(n_rings)
        ]
        R_mean = float(np.mean(radius_estimates))
        power_per_angle[i] = optics.radius_to_power(R_mean)
        central_powers[i] = optics.radius_to_power(radius_estimates[0])

    central_power = float(np.mean(central_powers))
    if not np.all(np.isfinite(power_per_angle)) or not np.isfinite(central_power):
        raise ValueError("degenerate reconstruction: non-finite curvature")
    return {
        'angles_deg': rings['angles_deg'],
        'mean_radius_per_angle': radii.mean(axis=1),
        'power_per_angle': power_per_angle,
        'central_power': central_power,
        'scale': None,
        'n_index': KERATOMETRIC_INDEX,
        'distance_mm': distance_mm,
        'calibration_state': calibration_state,
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && USE_SQLITE_TESTS=1 python3 -m pytest apps/analysis/topography/tests/test_reconstruct.py -q`
Expected: PASS (existing reconstruct tests + 4 new)

- [ ] **Step 5: Commit**

```bash
git add backend/apps/analysis/topography/reconstruct.py backend/apps/analysis/topography/tests/test_reconstruct.py
git commit -m "feat(topography): distance-aware catadioptric reconstruction path"
```

---

### Task 3: thread distance + geometry through `pipeline.py` (end-to-end)

**Files:**
- Modify: `backend/apps/analysis/topography/pipeline.py`
- Modify: `backend/apps/analysis/topography/tests/synthetic.py` (add a physically-rendered ring image helper)
- Test: `backend/apps/analysis/topography/tests/test_pipeline.py` (add cases; do not break existing)

**Interfaces:**
- Consumes: `reconstruct_curvature(..., distance_mm=, focal_px=, ring_object_radii_mm=)` (Task 2); `optics.ring_radius_px` (Task 1).
- Produces:
  - `synthetic.make_physical_ring_image(corneal_radius_mm, distance_mm, focal_px, object_radii_mm, size=600, blur=1.5, thickness=2) -> tuple[np.ndarray, dict]` — draws concentric rings at the forward-model pixel radii for a spherical cornea; ground-truth dict includes `expected_power`.
  - `analyse_topography_frame(bgr, *, distance_mm=None, focal_px=None, ring_object_radii_mm=None, object_distance_mm=None, calibration_state='default') -> dict` — passes the calibration inputs through to `reconstruct_curvature`; adds `calibration_state` and `distance_mm` to the returned `raw_output`.

- [ ] **Step 1: Write the failing tests**

First add the helper to `synthetic.py`:

```python
# append to backend/apps/analysis/topography/tests/synthetic.py
from apps.analysis.topography import optics as _optics


def make_physical_ring_image(corneal_radius_mm, distance_mm, focal_px, object_radii_mm,
                             size=600, blur=1.5, thickness=2):
    """Concentric Placido rings rendered at the convex-mirror forward-model radii for a
    spherical cornea, so a correct reconstruction recovers `corneal_radius_mm`."""
    center = (size // 2, size // 2)
    img = np.zeros((size, size, 3), dtype=np.uint8)
    radii_px = [
        _optics.ring_radius_px(corneal_radius_mm, distance_mm, focal_px, h0)
        for h0 in object_radii_mm
    ]
    for r in radii_px:
        cv2.circle(img, center, int(round(r)), (210, 210, 210), thickness, cv2.LINE_AA)
    if blur > 0:
        img = cv2.GaussianBlur(img, (0, 0), blur)
    ground_truth = {
        'center': center,
        'radii_px': radii_px,
        'expected_power': _optics.radius_to_power(corneal_radius_mm),
    }
    return img, ground_truth
```

Then the pipeline tests:

```python
# add to backend/apps/analysis/topography/tests/test_pipeline.py
import pytest
from apps.analysis.topography.pipeline import analyse_topography_frame
from apps.analysis.topography.tests.synthetic import make_physical_ring_image


def test_pipeline_calibrated_recovers_physiological_power():
    obj = [3.0, 6.0, 9.0, 12.0, 15.0, 18.0]
    img, gt = make_physical_ring_image(7.8, 40.0, 5000.0, obj)
    out = analyse_topography_frame(img, distance_mm=40.0, focal_px=5000.0,
                                   ring_object_radii_mm=obj)
    assert out['raw_output']['calibration_state'] == 'default'
    assert out['raw_output']['distance_mm'] == pytest.approx(40.0)
    # ring extraction adds sub-pixel error; expect recovery near 43.27 D
    assert abs(out['central_k'] - gt['expected_power']) < 2.0


def test_pipeline_uncalibrated_stays_research_badged():
    obj = [3.0, 6.0, 9.0, 12.0, 15.0, 18.0]
    img, _ = make_physical_ring_image(7.8, 40.0, 5000.0, obj)
    out = analyse_topography_frame(img)
    assert out['raw_output']['calibration_state'] == 'uncalibrated'
    assert out['raw_output']['distance_mm'] is None
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && USE_SQLITE_TESTS=1 python3 -m pytest apps/analysis/topography/tests/test_pipeline.py -q`
Expected: FAIL — `analyse_topography_frame() got an unexpected keyword argument 'distance_mm'`

- [ ] **Step 3: Write minimal implementation**

Modify `pipeline.py` — change the signature and the `reconstruct_curvature` call, and extend `raw_output`:

```python
def analyse_topography_frame(bgr: np.ndarray, *, distance_mm=None, focal_px=None,
                             ring_object_radii_mm=None, object_distance_mm=None,
                             calibration_state='default') -> dict:
    """Full reconstruction for a single best frame (BGR). DB-free, unit-testable.

    Supplying distance_mm + focal_px + ring_object_radii_mm engages the distance-aware
    catadioptric reconstruction (metrically-valid dioptres); otherwise the result stays
    calibration_state='uncalibrated' with the placeholder scale.
    """
    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    center = find_reflection_center(gray)
    rings = extract_rings(gray, center)
    curvature = reconstruct_curvature(
        rings, distance_mm=distance_mm, focal_px=focal_px,
        ring_object_radii_mm=ring_object_radii_mm,
        object_distance_mm=object_distance_mm, calibration_state=calibration_state)
    metrics = compute_metrics(curvature)

    overlay = render_ring_overlay(bgr, rings)
    axial = render_axial_map(curvature)

    return {
        **metrics,
        'confidence': round(rings['completeness'], 3),
        'algorithm_version': ALGORITHM_VERSION,
        'ring_overlay_png': pil_image_to_django_file(overlay),
        'axial_map_png': pil_image_to_django_file(axial),
        'raw_output': {
            'center': list(rings['center']),
            'n_rings': rings['n_rings'],
            'angles_deg': rings['angles_deg'].round(2).tolist(),
            'mean_radius_per_angle': curvature['mean_radius_per_angle'].round(3).tolist(),
            'power_per_angle': curvature['power_per_angle'].round(4).tolist(),
            'scale': curvature['scale'],
            'distance_mm': curvature['distance_mm'],
            'calibration_state': curvature['calibration_state'],
        },
    }
```

Note: passing `distance_mm=None` (etc.) into `reconstruct_curvature` selects the uncalibrated branch, so the no-arg call keeps today's behaviour.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && USE_SQLITE_TESTS=1 python3 -m pytest apps/analysis/topography/tests/test_pipeline.py -q`
Expected: PASS (existing pipeline tests + 2 new)

- [ ] **Step 5: Run the full topography + calibration suites (no regressions)**

Run: `cd backend && USE_SQLITE_TESTS=1 python3 -m pytest apps/analysis/topography apps/topography apps/calibration -q`
Expected: PASS (all green)

- [ ] **Step 6: Commit**

```bash
git add backend/apps/analysis/topography/pipeline.py backend/apps/analysis/topography/tests/synthetic.py backend/apps/analysis/topography/tests/test_pipeline.py
git commit -m "feat(topography): thread distance+geometry through the analysis pipeline"
```

---

## Self-Review

**Spec coverage:**
- Convex-mirror forward/inverse maths + power → Task 1. ✓
- Distance-aware scale replacing the `4300.0` seam, with uncalibrated fallback → Task 2. ✓
- End-to-end wiring + synthetic ground-truth validation → Task 3 (physically-rendered image → recovered power). ✓
- Honesty model (`uncalibrated` unchanged; no keratoconus signal) → Global Constraints + Task 2/3 fallback tests. ✓
- Deferred (explicitly OUT OF SCOPE): DB lookup of `DeviceCalibration`, mobile iris/focus capture, per-ring aspheric ray tracing (subsystem B). Recorded here so the next slice picks them up.

**Placeholder scan:** No TBD/TODO; every code step shows complete code; every test asserts concrete verified numbers.

**Type consistency:** `ring_radius_px` / `corneal_radius_mm` / `radius_to_power` signatures identical across Tasks 1–3. `reconstruct_curvature` keyword set (`distance_mm`, `focal_px`, `ring_object_radii_mm`, `object_distance_mm`, `calibration_state`) identical in Tasks 2 and 3. Result dict keys (`distance_mm`, `calibration_state`, `scale`) consistent across both reconstruction branches and consumed unchanged by `compute_metrics` (which only reads `angles_deg` + `power_per_angle`).
