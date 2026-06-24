import numpy as np

KERATOMETRIC_INDEX = 1.3375
# Placeholder pixel-radius -> dioptre scale. Calibration (subsystem A) replaces
# this with a per-device/attachment transform. Chosen so typical mean ring radii
# land near physiological keratometry (~43 D); NOT metrically valid.
NOMINAL_DIOPTRE_SCALE = 4300.0


def reconstruct_curvature(rings: dict, scale: float = NOMINAL_DIOPTRE_SCALE) -> dict:
    """Map ring radii to a per-meridian apparent power profile (uncalibrated)."""
    radii = rings['radii']
    mean_radius_per_angle = radii.mean(axis=1)
    power_per_angle = scale / mean_radius_per_angle
    central_power = float(np.mean(scale / radii[:, 0]))
    if (
        mean_radius_per_angle.size == 0
        or not np.all(mean_radius_per_angle > 0)
        or not np.all(np.isfinite(power_per_angle))
        or not np.isfinite(central_power)
    ):
        raise ValueError("degenerate reconstruction: non-finite curvature")
    return {
        'angles_deg': rings['angles_deg'],
        'mean_radius_per_angle': mean_radius_per_angle,
        'power_per_angle': power_per_angle,
        'central_power': central_power,
        'scale': float(scale),
        'n_index': KERATOMETRIC_INDEX,
    }
