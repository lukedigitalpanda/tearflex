# Topography Plausibility Backstop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the catadioptric topography reconstruction robust to a single mis-extracted ring, and refuse the calibrated badge (downgrade to `uncalibrated`) whenever the reconstruction is physically impossible.

**Architecture:** Two pure additions inside `reconstruct.py`'s catadioptric path — a MAD-based robust per-ring aggregator replacing `np.mean`, and a physiological sanity gate that raises `ImplausibleReconstruction` — plus a downgrade policy in `pipeline.py` that catches the exception and re-runs the uncalibrated placeholder path. `tasks.py` needs **no production change**: it already badges scan + result from `raw_output['calibration_state']`.

**Tech Stack:** Django 5 / Celery backend, NumPy, pytest (`USE_SQLITE_TESTS=1`).

**Spec:** `docs/superpowers/specs/2026-07-02-topography-plausibility-backstop-design.md` — read it before starting; the "Locked design principle" and "Provisional constants" sections govern every task.

## Global Constraints

- Working directory for all commands: `/opt/tearflex/backend`. Run tests as `USE_SQLITE_TESTS=1 python3 -m pytest …`.
- Baseline before Task 1: **222 passed** (full suite, ~6s). Every task ends with the suite green.
- **All numeric thresholds are PROVISIONAL (user caveat 2026-07-02):** `R_MIN_MM = 4.0`, `R_MAX_MM = 13.5`, MAD multiplier `3.5`. Each must be a module-level constant whose definition-site comment contains the word `PROVISIONAL`. Tests never assert against these constants: "impossible" tests use values far outside any plausible revision (R ≈ 3 mm / 15 mm); "must pass" tests pin physiological facts (severe keratoconus R = 5.0 mm, normal R = 7.8 mm).
- **Safety principle (never violate):** the gate rejects physically-impossible measurements only. Steep-but-real pathology (keratoconus, ~67 D) must pass. Robust aggregation operates *within* one meridian across its rings — never across meridians (between-meridian asymmetry is the keratoconus signal).
- The gate exists **only** in the catadioptric path. The uncalibrated placeholder path (arbitrary scale, not metric) is never gated.
- No new dependencies, no model changes, no migrations.
- Keratometric arithmetic for test values: power D = 337.5 / R_mm. So R 7.8 → 43.2692 D, R 5.0 → 67.5 D, R 3.0 → 112.5 D, R 15.0 → 22.5 D; bounds R 4.0 → 84.375 D, R 13.5 → 25.0 D.
- Commit after every task with the exact message given; end every commit message with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

---

### Task 1: Robust per-ring aggregation (`_robust_radius`)

**Files:**
- Modify: `apps/analysis/topography/reconstruct.py` (add helper + constants; change one line in `_reconstruct_catadioptric`, currently `R_mean = float(np.mean(radius_estimates))` at ~line 104)
- Test: `apps/analysis/topography/tests/test_reconstruct.py` (append)

**Interfaces:**
- Consumes: existing `optics.corneal_radius_mm`, `optics.radius_to_power`, existing test helper `_rings_for(radius_per_angle_mm, object_radii_mm, distance_mm, focal_px)` already defined in `test_reconstruct.py`.
- Produces: `_robust_radius(estimates) -> float` in `reconstruct.py` (module-private but imported by tests), module constants `MAD_REJECT_SIGMA = 3.5` and `_MAD_TO_SIGMA = 1.4826`. Task 2 builds on the catadioptric path as modified here.

- [ ] **Step 1: Write the failing tests**

In `apps/analysis/topography/tests/test_reconstruct.py`, change the import line

```python
from apps.analysis.topography.reconstruct import reconstruct_curvature
```

to

```python
from apps.analysis.topography.reconstruct import reconstruct_curvature, _robust_radius
```

and append at the end of the file:

```python
# ---------------------------------------------------------------------------
# Robust per-ring aggregation (plausibility backstop, task 1)
# ---------------------------------------------------------------------------

def test_robust_radius_rejects_gross_outlier():
    """One mis-extracted ring must not drag the meridian estimate."""
    assert _robust_radius([7.7, 7.8, 7.9, 23.4]) == pytest.approx(7.8)


def test_robust_radius_preserves_moderate_spread():
    """Real spread within a meridian is kept — nothing trimmed, plain mean."""
    assert _robust_radius([7.5, 7.7, 7.9, 8.1]) == pytest.approx(7.8)


def test_robust_radius_two_elements_uses_median():
    assert _robust_radius([7.0, 9.0]) == pytest.approx(8.0)


def test_robust_radius_single_element():
    assert _robust_radius([7.8]) == pytest.approx(7.8)


def test_robust_radius_all_equal_mad_zero():
    """Zero MAD (all rings agree) must not divide by zero — returns the median."""
    assert _robust_radius([7.8, 7.8, 7.8, 7.8, 7.8]) == pytest.approx(7.8)


def test_single_bad_ring_does_not_bias_meridian_power():
    """End-to-end through the catadioptric path: one ring mis-extracted 1.5x too
    large in every meridian (inverts to R ~13 mm vs true 7.8 mm). With plain mean
    this biased power to ~37 D; robust aggregation must recover ~43.27 D."""
    obj = [3.0, 6.0, 9.0, 12.0]
    rings = _rings_for(lambda a: 7.8, obj, 40.0, 3000.0)
    rings['radii'][:, 2] *= 1.5
    out = reconstruct_curvature(rings, distance_mm=40.0, focal_px=3000.0,
                                ring_object_radii_mm=obj)
    assert np.allclose(out['power_per_angle'], 43.2692, atol=1e-3)
    assert out['central_power'] == pytest.approx(43.2692, abs=1e-3)  # ring 0 untouched
```

- [ ] **Step 2: Run the new tests to verify they fail**

Run: `USE_SQLITE_TESTS=1 python3 -m pytest apps/analysis/topography/tests/test_reconstruct.py -v -k "robust or bad_ring"`
Expected: **ImportError** — `cannot import name '_robust_radius'` (all collected tests error).

- [ ] **Step 3: Implement `_robust_radius` and wire it in**

In `apps/analysis/topography/reconstruct.py`, after the `NOMINAL_DIOPTRE_SCALE = 4300.0` block, add:

```python
# PROVISIONAL outlier cut (unconfirmed as of 2026-07-02): reject per-ring radius
# estimates further than 3.5 robust standard deviations from the meridian median.
# Deliberately loose — it rejects a grossly mis-extracted ring, not real spread.
MAD_REJECT_SIGMA = 3.5
_MAD_TO_SIGMA = 1.4826  # scaled-MAD consistency constant (normal distribution)


def _robust_radius(estimates) -> float:
    """Aggregate one meridian's per-ring corneal-radius estimates robustly.

    Median for <= 2 rings; otherwise MAD-reject-then-mean, so a single
    mis-extracted ring cannot silently drag the meridian power. This operates
    WITHIN a meridian, across its rings — between-meridian variation is real
    signal (e.g. keratoconus asymmetry) and must never be smoothed here.
    """
    values = np.asarray(estimates, dtype=np.float64)
    if values.size <= 2:
        return float(np.median(values))
    med = float(np.median(values))
    scaled_mad = _MAD_TO_SIGMA * float(np.median(np.abs(values - med)))
    if scaled_mad == 0.0:
        return med
    keep = np.abs(values - med) <= MAD_REJECT_SIGMA * scaled_mad
    # At least half the values sit within one raw MAD of the median, so `keep`
    # is never empty.
    return float(values[keep].mean())
```

In `_reconstruct_catadioptric`, replace

```python
        R_mean = float(np.mean(radius_estimates))
        power_per_angle[i] = optics.radius_to_power(R_mean)
```

with

```python
        power_per_angle[i] = optics.radius_to_power(_robust_radius(radius_estimates))
```

Do **not** touch the `central_powers[i] = optics.radius_to_power(radius_estimates[0])` line — central K keeps its innermost-ring (apex) definition per the spec.

- [ ] **Step 4: Run the new tests to verify they pass**

Run: `USE_SQLITE_TESTS=1 python3 -m pytest apps/analysis/topography/tests/test_reconstruct.py -v`
Expected: all pass (11 existing + 6 new = 17).

- [ ] **Step 5: Run the full suite**

Run: `USE_SQLITE_TESTS=1 python3 -m pytest -q`
Expected: **228 passed** (222 baseline + 6). The existing exact-synthetic catadioptric tests stay green because with no outlier nothing is trimmed and the robust mean equals the plain mean.

- [ ] **Step 6: Commit**

```bash
git add apps/analysis/topography/reconstruct.py apps/analysis/topography/tests/test_reconstruct.py
git commit -m "feat(topography): robust per-ring aggregation (MAD-reject-then-mean)

One mis-extracted ring no longer drags a meridian's power: per-meridian
per-ring radius estimates are aggregated median (<=2 rings) or
MAD-reject-then-mean (PROVISIONAL 3.5 sigma cut). Within-meridian only —
between-meridian asymmetry is the keratoconus signal and is untouched.
Central K keeps its innermost-ring definition.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Physiological sanity gate (`ImplausibleReconstruction`)

**Files:**
- Modify: `apps/analysis/topography/reconstruct.py` (exception + PROVISIONAL bounds + `_gate_plausibility`; call it at the end of `_reconstruct_catadioptric`)
- Test: `apps/analysis/topography/tests/test_reconstruct.py` (append)

**Interfaces:**
- Consumes: Task 1's catadioptric path (gate runs on the **robust** aggregated powers, after the existing non-finite check).
- Produces: `class ImplausibleReconstruction(ValueError)`, constants `R_MIN_MM = 4.0`, `R_MAX_MM = 13.5`, `_POWER_MIN`, `_POWER_MAX`, and `_gate_plausibility(power_per_angle: np.ndarray, central_power: float) -> None`. Task 3 imports `ImplausibleReconstruction` from `apps.analysis.topography.reconstruct`. The exception message always contains the word `implausible`.

- [ ] **Step 1: Write the failing tests**

In `apps/analysis/topography/tests/test_reconstruct.py`, change the import line to

```python
from apps.analysis.topography.reconstruct import (
    reconstruct_curvature, _robust_radius, ImplausibleReconstruction)
```

and append at the end of the file:

```python
# ---------------------------------------------------------------------------
# Physiological sanity gate (plausibility backstop, task 2)
# ---------------------------------------------------------------------------
# Impossible-cornea tests use R = 3 mm / 15 mm — far outside the PROVISIONAL
# bounds so they survive a bound revision. Must-pass tests pin physiological
# facts (severe keratoconus R = 5 mm, normal R = 7.8 mm): if a future bound
# revision breaks them, the revision is wrong, not the tests.

def test_gate_rejects_impossibly_steep_cornea():
    """R = 3 mm (112.5 D) is not a cornea — measurement failure, must raise."""
    obj = [3.0, 6.0, 9.0, 12.0]
    rings = _rings_for(lambda a: 3.0, obj, 40.0, 3000.0)
    with pytest.raises(ImplausibleReconstruction, match="implausible"):
        reconstruct_curvature(rings, distance_mm=40.0, focal_px=3000.0,
                              ring_object_radii_mm=obj)


def test_gate_rejects_impossibly_flat_cornea():
    """R = 15 mm (22.5 D) is not a cornea — must raise."""
    obj = [3.0, 6.0, 9.0, 12.0]
    rings = _rings_for(lambda a: 15.0, obj, 40.0, 3000.0)
    with pytest.raises(ImplausibleReconstruction, match="implausible"):
        reconstruct_curvature(rings, distance_mm=40.0, focal_px=3000.0,
                              ring_object_radii_mm=obj)


def test_gate_passes_severe_keratoconus():
    """SAFETY-CRITICAL: steep-but-real pathology (R = 5 mm, 67.5 D — severe
    keratoconus) must NEVER be suppressed by the gate."""
    obj = [3.0, 6.0, 9.0, 12.0]
    rings = _rings_for(lambda a: 5.0, obj, 40.0, 3000.0)
    out = reconstruct_curvature(rings, distance_mm=40.0, focal_px=3000.0,
                                ring_object_radii_mm=obj)
    assert out['calibration_state'] == 'default'
    assert np.allclose(out['power_per_angle'], 67.5, atol=1e-3)


def test_gate_passes_normal_cornea():
    obj = [3.0, 6.0, 9.0, 12.0]
    rings = _rings_for(lambda a: 7.8, obj, 40.0, 3000.0)
    out = reconstruct_curvature(rings, distance_mm=40.0, focal_px=3000.0,
                                ring_object_radii_mm=obj)
    assert out['calibration_state'] == 'default'


def test_gate_trips_on_single_impossible_meridian():
    """One impossible meridian among normal ones is an extraction failure (the
    generous bounds mean it cannot be real pathology) — the whole reconstruction
    is refused, not published with one bad meridian. Note the aggregate central
    power (~43.7 D) stays in bounds, so this exercises per-meridian gating."""
    obj = [3.0, 6.0, 9.0, 12.0]
    rings = _rings_for(lambda a: 3.0 if a == 90.0 else 7.8, obj, 40.0, 3000.0)
    with pytest.raises(ImplausibleReconstruction, match="implausible"):
        reconstruct_curvature(rings, distance_mm=40.0, focal_px=3000.0,
                              ring_object_radii_mm=obj)


def test_uncalibrated_path_is_not_gated():
    """The placeholder scale is not metrically valid, so its 'powers' (here
    4300/30 ~ 143) must not trip the physiological gate."""
    rings = {'angles_deg': np.arange(0, 360, 2.0),
             'radii': np.full((180, 4), 30.0), 'n_rings': 4}
    out = reconstruct_curvature(rings)
    assert out['calibration_state'] == 'uncalibrated'
```

- [ ] **Step 2: Run the new tests to verify they fail**

Run: `USE_SQLITE_TESTS=1 python3 -m pytest apps/analysis/topography/tests/test_reconstruct.py -v -k "gate or not_gated"`
Expected: **ImportError** — `cannot import name 'ImplausibleReconstruction'`.

- [ ] **Step 3: Implement the gate**

In `apps/analysis/topography/reconstruct.py`, after the `_robust_radius` function from Task 1, add:

```python
class ImplausibleReconstruction(ValueError):
    """The reconstruction produced a physically-impossible cornea.

    This means measurement failure (bad extraction, wrong intrinsics) — the
    caller should refuse the calibrated badge, not publish the number.
    """


# PROVISIONAL physiological measurement-sanity bounds (unconfirmed as of
# 2026-07-02). Generous by design: they reject impossible corneas only, never
# abnormal-but-real ones — severe keratoconus (~R 4.8-5 mm, ~70 D) must always
# pass. NOT clinical/normality thresholds; revise here when confirmed.
R_MIN_MM = 4.0    # PROVISIONAL: ~84.4 D, steeper than any real cornea
R_MAX_MM = 13.5   # PROVISIONAL: ~25.0 D, flatter than any real cornea
_POWER_MAX = optics.radius_to_power(R_MIN_MM)  # bounds derived via the same
_POWER_MIN = optics.radius_to_power(R_MAX_MM)  # keratometric index as results


def _gate_plausibility(power_per_angle: np.ndarray, central_power: float) -> None:
    """Raise ImplausibleReconstruction if any meridian power (or the central
    power) is outside the physically-possible range. Runs on the robustly
    aggregated powers only — a single outlier RING is handled (rejected) by
    _robust_radius; a whole impossible MERIDIAN is a measurement failure."""
    values = np.append(power_per_angle, central_power)
    out_of_bounds = values[(values < _POWER_MIN) | (values > _POWER_MAX)]
    if out_of_bounds.size:
        raise ImplausibleReconstruction(
            f"implausible reconstruction: power {out_of_bounds[0]:.1f} D outside "
            f"[{_POWER_MIN:.1f}, {_POWER_MAX:.1f}] D (corneal radius outside "
            f"[{R_MIN_MM}, {R_MAX_MM}] mm) — refusing calibrated badge")
```

In `_reconstruct_catadioptric`, immediately after the existing non-finite check

```python
    central_power = float(np.mean(central_powers))
    if not np.all(np.isfinite(power_per_angle)) or not np.isfinite(central_power):
        raise ValueError("degenerate reconstruction: non-finite curvature")
```

add:

```python
    _gate_plausibility(power_per_angle, central_power)
```

Do **not** add any gate call to the uncalibrated branch of `reconstruct_curvature`.

- [ ] **Step 4: Run the new tests to verify they pass**

Run: `USE_SQLITE_TESTS=1 python3 -m pytest apps/analysis/topography/tests/test_reconstruct.py -v`
Expected: all pass (17 from Task 1 + 6 new = 23).

- [ ] **Step 5: Run the full suite**

Run: `USE_SQLITE_TESTS=1 python3 -m pytest -q`
Expected: **234 passed**. (Existing calibrated tests reconstruct R 7.8 / astigmatic 7.5–8.1 — all inside bounds, unaffected.)

- [ ] **Step 6: Commit**

```bash
git add apps/analysis/topography/reconstruct.py apps/analysis/topography/tests/test_reconstruct.py
git commit -m "feat(topography): physiological sanity gate on catadioptric path

Reject physically-impossible reconstructions (any meridian or central power
outside PROVISIONAL R 4.0-13.5 mm ~ 25-84 D) with ImplausibleReconstruction.
Measurement-sanity bounds, not normality: severe keratoconus (~67 D) passes
by design and by test. Uncalibrated placeholder path is not gated.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Downgrade-to-uncalibrated policy in the pipeline

**Files:**
- Modify: `apps/analysis/topography/pipeline.py` (catch `ImplausibleReconstruction`, fall back to the uncalibrated path, record `downgrade_reason`)
- Test: `apps/analysis/topography/tests/test_pipeline.py` (append)

**Interfaces:**
- Consumes: `ImplausibleReconstruction` from `apps.analysis.topography.reconstruct` (Task 2); existing synthetic helper `make_physical_ring_image(corneal_radius_mm, distance_mm, focal_px, object_radii_mm)` from `apps.analysis.topography.tests.synthetic` (already imported in `test_pipeline.py`).
- Produces: on downgrade, `analyse_topography_frame(...)['raw_output']` has `calibration_state == 'uncalibrated'` and a `downgrade_reason` string key; on a plausible calibrated frame the `downgrade_reason` key is **absent**. Task 4 relies on exactly this contract propagating through `tasks.py` unchanged.

- [ ] **Step 1: Write the failing tests**

Append to `apps/analysis/topography/tests/test_pipeline.py`:

```python
def test_pipeline_downgrades_implausible_calibrated_frame():
    """A wrong-but-internally-consistent focal (2x the truth — exactly the
    wrong-intrinsics-from-mobile threat) reconstructs to R ~3.6 mm, which is
    impossible. The pipeline must refuse the calibrated badge and fall back to
    the uncalibrated placeholder — never raise, never hide the map."""
    obj = [3.0, 6.0, 9.0, 12.0, 15.0, 18.0]
    img, _ = make_physical_ring_image(7.8, 40.0, 5000.0, obj)
    out = analyse_topography_frame(img, distance_mm=40.0, focal_px=10000.0,
                                   ring_object_radii_mm=obj)
    assert out['raw_output']['calibration_state'] == 'uncalibrated'
    assert out['raw_output']['distance_mm'] is None
    assert 'implausible' in out['raw_output']['downgrade_reason']
    assert out['central_k'] > 0  # research-use map still produced


def test_pipeline_plausible_calibrated_frame_has_no_downgrade_reason():
    obj = [3.0, 6.0, 9.0, 12.0, 15.0, 18.0]
    img, _ = make_physical_ring_image(7.8, 40.0, 5000.0, obj)
    out = analyse_topography_frame(img, distance_mm=40.0, focal_px=5000.0,
                                   ring_object_radii_mm=obj)
    assert out['raw_output']['calibration_state'] == 'default'
    assert 'downgrade_reason' not in out['raw_output']
```

- [ ] **Step 2: Run the new tests to verify they fail**

Run: `USE_SQLITE_TESTS=1 python3 -m pytest apps/analysis/topography/tests/test_pipeline.py -v -k downgrade`
Expected: `test_pipeline_downgrades_implausible_calibrated_frame` **FAILS** with `ImplausibleReconstruction` raised (unhandled, propagates out of `analyse_topography_frame`); `test_pipeline_plausible_calibrated_frame_has_no_downgrade_reason` PASSES (it asserts current behaviour — that's fine, it's the regression guard).

- [ ] **Step 3: Implement the downgrade policy**

In `apps/analysis/topography/pipeline.py`:

Replace the imports header

```python
import cv2
import numpy as np
from apps.analysis.utils import pil_image_to_django_file
from .rings import find_reflection_center, extract_rings
from .reconstruct import reconstruct_curvature
```

with

```python
import logging

import cv2
import numpy as np
from apps.analysis.utils import pil_image_to_django_file
from .rings import find_reflection_center, extract_rings
from .reconstruct import reconstruct_curvature, ImplausibleReconstruction
```

and after the `ALGORITHM_VERSION = 'topo-v0.1'` line add:

```python
logger = logging.getLogger(__name__)
```

Replace the reconstruction call

```python
    curvature = reconstruct_curvature(
        rings, distance_mm=distance_mm, focal_px=focal_px,
        ring_object_radii_mm=ring_object_radii_mm,
        object_distance_mm=obj_distance, calibration_state=calibration_state)
```

with

```python
    downgrade_reason = None
    try:
        curvature = reconstruct_curvature(
            rings, distance_mm=distance_mm, focal_px=focal_px,
            ring_object_radii_mm=ring_object_radii_mm,
            object_distance_mm=obj_distance, calibration_state=calibration_state)
    except ImplausibleReconstruction as exc:
        # Downgrade, never suppress: refuse the calibrated badge but keep the
        # research-use map — the gate must not hide pathology from the clinician.
        logger.warning("downgrading to uncalibrated: %s", exc)
        downgrade_reason = str(exc)
        curvature = reconstruct_curvature(rings)
```

Replace the final `return { ... }` statement (keep its contents identical) with:

```python
    result = {
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
    if downgrade_reason is not None:
        result['raw_output']['downgrade_reason'] = downgrade_reason
    return result
```

(The `from .metrics import compute_metrics` and `from .maps import render_ring_overlay, render_axial_map` lines sit below the replaced block — leave them untouched.)

- [ ] **Step 4: Run the new tests to verify they pass**

Run: `USE_SQLITE_TESTS=1 python3 -m pytest apps/analysis/topography/tests/test_pipeline.py -v`
Expected: all pass (4 existing + 2 new = 6).

- [ ] **Step 5: Run the full suite**

Run: `USE_SQLITE_TESTS=1 python3 -m pytest -q`
Expected: **236 passed**.

- [ ] **Step 6: Commit**

```bash
git add apps/analysis/topography/pipeline.py apps/analysis/topography/tests/test_pipeline.py
git commit -m "feat(topography): downgrade implausible calibrated reconstructions

analyse_topography_frame catches ImplausibleReconstruction, logs a warning,
re-runs the uncalibrated placeholder path and records downgrade_reason in
raw_output. The scan keeps its research-use map (pathology is never hidden);
it just loses the calibrated badge. No exception escapes, so Celery does not
retry a deterministic measurement failure.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: End-to-end task integration test (no production change)

**Files:**
- Test: `apps/topography/tests/test_tasks.py` (append). `apps/topography/tasks.py` is intentionally **not modified** — this task proves the downgrade propagates through it as-is.

**Interfaces:**
- Consumes: Task 3's `downgrade_reason` / `calibration_state` contract; existing test helpers `_cone_png(name, focal_px)` and `AssessmentFactory` already in `test_tasks.py`; `tasks.py` already badges scan + result from `out['raw_output']['calibration_state']` and stores `raw_output` on the result.
- Produces: the final acceptance evidence for the slice.

- [ ] **Step 1: Write the test (expected to pass — this is an integration acceptance test of Tasks 1–3; if it fails, STOP and debug, do not modify `tasks.py` without flagging it)**

Append to `apps/topography/tests/test_tasks.py`:

```python
@pytest.mark.django_db
def test_process_scan_downgrades_implausible_calibrated_result():
    """Wrong-but-plausible intrinsics from mobile (claimed focal 2x the truth)
    reconstruct to an impossible cornea. The scan must end analysed +
    downgraded to uncalibrated — NOT failed, NOT retried — with the reason
    recorded in raw_output. tasks.py is unchanged: the downgrade flows through
    raw_output['calibration_state'] exactly like a normal result."""
    scan = TopographyScan.objects.create(
        assessment=AssessmentFactory(), status='uploaded',
        camera_focal_px=2200.0, capture_width_px=800, capture_height_px=800)
    png, _ = _cone_png('cone.png', 1100.0)  # rendered at true focal 1100
    TopographyStill.objects.create(scan=scan, image=png, index=0)

    process_topography_scan(scan.id)

    scan.refresh_from_db()
    assert scan.status == 'analysed'
    assert scan.result.calibration_state == 'uncalibrated'
    assert scan.calibration_state == 'uncalibrated'
    assert 'implausible' in scan.result.raw_output['downgrade_reason']
```

- [ ] **Step 2: Run the test**

Run: `USE_SQLITE_TESTS=1 python3 -m pytest apps/topography/tests/test_tasks.py -v`
Expected: all pass (8 existing + 1 new = 9). The new test passes because the still is rendered at focal 1100 but the scan claims 2200 with matching 800×800 capture dims (no rescale), so reconstruction inverts to R ≈ 2.9–3.6 mm → `ImplausibleReconstruction` → pipeline downgrade → `tasks.py` badges `uncalibrated` and completes without retries.

- [ ] **Step 3: Run the full suite**

Run: `USE_SQLITE_TESTS=1 python3 -m pytest -q`
Expected: **237 passed** (222 baseline + 15 new across Tasks 1–4).

- [ ] **Step 4: Commit**

```bash
git add apps/topography/tests/test_tasks.py
git commit -m "test(topography): end-to-end downgrade of implausible calibrated scan

Proves the plausibility backstop propagates through process_topography_scan
unchanged: a scan whose claimed focal is 2x the truth ends analysed +
uncalibrated with downgrade_reason recorded — not failed, not retried.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```
