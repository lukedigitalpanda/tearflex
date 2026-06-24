import cv2
import numpy as np
from apps.analysis.topography.rings import find_reflection_center, extract_rings
from apps.analysis.topography.tests.synthetic import make_ring_image


def _gray(**kw):
    img, gt = make_ring_image(**kw)
    return cv2.cvtColor(img, cv2.COLOR_BGR2GRAY), gt


def test_find_center_on_centered_rings():
    gray, gt = _gray(size=400, n_rings=6)
    cx, cy = find_reflection_center(gray)
    assert abs(cx - gt['center'][0]) < 6
    assert abs(cy - gt['center'][1]) < 6


def test_extract_rings_concentric_radii_increase():
    gray, _ = _gray(size=400, n_rings=6, ring_step=24, astigmatism=0.0)
    rings = extract_rings(gray, find_reflection_center(gray))
    assert rings['n_rings'] >= 4
    mean_radii = rings['radii'].mean(axis=0)
    assert np.all(np.diff(mean_radii) > 0)
    per_angle = rings['radii'].mean(axis=1)
    assert per_angle.std() / per_angle.mean() < 0.05
    assert rings['completeness'] > 0.8


def test_extract_rings_astigmatic_varies_by_meridian():
    gray, _ = _gray(size=400, n_rings=6, astigmatism=0.3, steep_axis_deg=0.0)
    rings = extract_rings(gray, find_reflection_center(gray))
    per_angle = rings['radii'].mean(axis=1)
    assert per_angle.std() / per_angle.mean() > 0.05
