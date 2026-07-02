# backend/apps/analysis/topography/reconstruct.py
import numpy as np
from . import optics

# Re-export: the exception is defined in optics (the lowest layer, so optics
# itself can raise it); every existing import site keeps working unchanged.
from .optics import ImplausibleReconstruction

KERATOMETRIC_INDEX = optics.KERATOMETRIC_INDEX
# Placeholder pixel-radius -> dioptre scale used only when no distance/geometry is
# supplied (calibration_state='uncalibrated'). NOT metrically valid.
NOMINAL_DIOPTRE_SCALE = 4300.0

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

    `ring_object_radii_mm` is the Placido disc's physical ring radii, innermost
    first — pass the whole set; the ring extractor detects a data-dependent inner
    subset per frame, and only the innermost `n_rings` radii are used to match it.
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


def _per_ring_object_distances(object_distance_mm, n_rings):
    """Broadcast `object_distance_mm` to one value per ring (innermost-first).

    None -> defaults to the working distance inside optics (flat disc). A scalar
    applies to every ring. A sequence gives per-ring object distances (the cone case:
    working distance minus each ring's axial depth); its innermost n_rings are used.
    """
    if object_distance_mm is None:
        return [None] * n_rings
    if isinstance(object_distance_mm, (list, tuple, np.ndarray)):
        seq = list(object_distance_mm)
        if len(seq) < n_rings:
            raise ValueError(
                f"object_distance_mm has {len(seq)} entries, but {n_rings} rings "
                f"were detected")
        return [None if v is None else float(v) for v in seq[:n_rings]]
    return [float(object_distance_mm)] * n_rings


def _reconstruct_catadioptric(rings, distance_mm, focal_px, object_radii_mm,
                              object_distance_mm, calibration_state):
    radii = rings['radii']
    n_rings = radii.shape[1]
    # The extractor keeps the innermost n_rings rings that every spoke resolves
    # (rings.py sorts ascending and truncates), and n_rings shrinks with image
    # quality. Callers pass the disc's full physical ring radii (innermost-first),
    # so pair the detected rings with the innermost physical radii. Only too few
    # radii to explain the detected rings is an error.
    if len(object_radii_mm) < n_rings:
        raise ValueError(
            f"ring_object_radii_mm has {len(object_radii_mm)} entries, but "
            f"{n_rings} rings were detected; supply at least one physical radius "
            f"per detectable ring (innermost first)")
    object_radii_mm = object_radii_mm[:n_rings]
    object_distances = _per_ring_object_distances(object_distance_mm, n_rings)
    if radii.size == 0 or not np.all(radii > 0):
        raise ValueError("degenerate reconstruction: non-positive radii")

    n_angles = radii.shape[0]
    power_per_angle = np.empty(n_angles, dtype=np.float64)
    central_powers = np.empty(n_angles, dtype=np.float64)
    for i in range(n_angles):
        radius_estimates = [
            optics.corneal_radius_mm(radii[i, k], distance_mm, focal_px,
                                     object_radii_mm[k], object_distances[k])
            for k in range(n_rings)
        ]
        power_per_angle[i] = optics.radius_to_power(_robust_radius(radius_estimates))
        central_powers[i] = optics.radius_to_power(radius_estimates[0])

    central_power = float(np.mean(central_powers))
    if not np.all(np.isfinite(power_per_angle)) or not np.isfinite(central_power):
        raise ValueError("degenerate reconstruction: non-finite curvature")
    _gate_plausibility(power_per_angle, central_power)
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
