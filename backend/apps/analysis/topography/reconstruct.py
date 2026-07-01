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
