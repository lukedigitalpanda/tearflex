import cv2
import numpy as np
from PIL import Image


def render_ring_overlay(bgr: np.ndarray, rings: dict) -> Image.Image:
    """Draw detected ring points and the centre marker on the frame."""
    out = bgr.copy()
    cx, cy = rings['center']
    angles = np.deg2rad(rings['angles_deg'])
    for j in range(rings['n_rings']):
        for i, a in enumerate(angles):
            r = rings['radii'][i, j]
            x = int(round(cx + r * np.cos(a)))
            y = int(round(cy + r * np.sin(a)))
            if 0 <= x < out.shape[1] and 0 <= y < out.shape[0]:
                cv2.circle(out, (x, y), 1, (0, 230, 30), -1)
    cv2.drawMarker(out, (int(round(cx)), int(round(cy))), (0, 0, 255),
                   cv2.MARKER_CROSS, 12, 2)
    return Image.fromarray(cv2.cvtColor(out, cv2.COLOR_BGR2RGB))


def render_axial_map(curvature: dict, size: int = 400) -> Image.Image:
    """Colour-map the per-meridian power profile across a disc (radially uniform).

    Slice-1 rendering: shows astigmatism orientation. Radial (zone) variation and
    a true axial/sagittal reference are subsystem B.
    """
    angles_deg = curvature['angles_deg']
    power = curvature['power_per_angle']
    yy, xx = np.mgrid[0:size, 0:size]
    c = size / 2.0
    dx, dy = xx - c, yy - c
    rr = np.hypot(dx, dy)
    ang = np.rad2deg(np.arctan2(dy, dx)) % 360.0
    field = np.interp(ang, angles_deg, power, period=360.0)

    pmin, pmax = float(power.min()), float(power.max())
    if pmax - pmin < 1e-6:
        norm = np.full((size, size), 128, dtype=np.uint8)
    else:
        norm = np.clip((field - pmin) / (pmax - pmin) * 255, 0, 255).astype(np.uint8)
    coloured = cv2.applyColorMap(norm, cv2.COLORMAP_JET)
    coloured[rr > (c - 2)] = (255, 255, 255)
    return Image.fromarray(cv2.cvtColor(coloured, cv2.COLOR_BGR2RGB))
