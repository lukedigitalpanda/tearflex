import numpy as np
import cv2
import pytest
from apps.analysis.topography.rings import find_reflection_center, extract_rings
from apps.analysis.topography.reconstruct import reconstruct_curvature
from apps.analysis.topography.tests.synthetic import make_ring_image


def _curv(astig, axis=0.0):
    img, _ = make_ring_image(size=400, n_rings=6, astigmatism=astig, steep_axis_deg=axis)
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    return reconstruct_curvature(extract_rings(gray, find_reflection_center(gray)))


def test_power_profile_flat_for_concentric():
    p = _curv(0.0)['power_per_angle']
    assert p.std() / p.mean() < 0.05


def test_power_profile_varies_for_astigmatic():
    c = _curv(0.3)
    p = c['power_per_angle']
    assert p.std() / p.mean() > 0.05
    assert c['central_power'] > 0


def test_reconstruct_raises_on_degenerate_zero_radii():
    """Zero radii produce inf power; reconstruct_curvature must raise ValueError."""
    rings = {
        'radii': np.zeros((180, 6)),
        'angles_deg': np.linspace(0, 359, 180),
    }
    with pytest.raises(ValueError, match="degenerate reconstruction"):
        reconstruct_curvature(rings)
