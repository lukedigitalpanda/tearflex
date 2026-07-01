import numpy as np


def compute_metrics(curvature: dict) -> dict:
    """Fit a sinusoidal (regular-astigmatism) model to the power profile.

    power(theta) = c0 + c1*cos(2 theta) + c2*sin(2 theta)
                 = c0 + amp * cos(2(theta - steep_axis))
    Maximum power (steepest meridian) is at theta = 0.5*atan2(c2, c1).
    """
    theta = np.deg2rad(curvature['angles_deg'])
    power = curvature['power_per_angle']
    design = np.column_stack([np.ones_like(theta), np.cos(2 * theta), np.sin(2 * theta)])
    c0, c1, c2 = np.linalg.lstsq(design, power, rcond=None)[0]
    amp = float(np.hypot(c1, c2))
    steep_axis_deg = float(np.rad2deg(0.5 * np.arctan2(c2, c1)) % 180.0)
    # c0 is the DC (mean-power) term of the sinusoidal fit — same scale as
    # power_per_angle. curvature['central_power'] uses only radii[:,0] (innermost
    # ring), giving a ~4× larger denominator-based value that is incompatible with
    # the astigmatism_magnitude derived from power_per_angle. Using c0 keeps
    # central_k on a consistent scale for the magnitude ratio test.
    return {
        'sim_k_steep': float(c0 + amp),
        'sim_k_flat': float(c0 - amp),
        'sim_k_axis': steep_axis_deg,
        'astigmatism_magnitude': float(2 * amp),
        'astigmatism_axis': steep_axis_deg,
        'central_k': float(c0),
    }
