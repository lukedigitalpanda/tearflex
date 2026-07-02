import logging

import cv2
import numpy as np
from apps.analysis.utils import pil_image_to_django_file
from .rings import find_reflection_center, extract_rings
from .reconstruct import reconstruct_curvature, ImplausibleReconstruction
from .metrics import compute_metrics
from .maps import render_ring_overlay, render_axial_map

ALGORITHM_VERSION = 'topo-v0.1'

logger = logging.getLogger(__name__)


def analyse_topography_frame(bgr: np.ndarray, *, distance_mm=None, focal_px=None,
                             ring_object_radii_mm=None, ring_object_depths_mm=None,
                             object_distance_mm=None, calibration_state='default') -> dict:
    """Full reconstruction for a single best frame (BGR). DB-free, unit-testable.

    Supplying distance_mm + focal_px + ring_object_radii_mm engages the distance-aware
    catadioptric reconstruction (metrically-valid dioptres); otherwise the result stays
    calibration_state='uncalibrated' with the placeholder scale. ring_object_radii_mm is
    the disc's full physical ring radii (innermost-first); the innermost detected subset
    is used per frame. ring_object_depths_mm (same order) are the rings' axial depths on
    the Placido cone — each ring's object distance is distance_mm minus its depth, which
    is what makes the reconstruction cone-aware rather than flat-disc.
    """
    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    center = find_reflection_center(gray)
    rings = extract_rings(gray, center)
    obj_distance = object_distance_mm
    if ring_object_depths_mm is not None and distance_mm is not None:
        obj_distance = [distance_mm - z for z in ring_object_depths_mm]
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
    metrics = compute_metrics(curvature)

    overlay = render_ring_overlay(bgr, rings)
    axial = render_axial_map(curvature)

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
