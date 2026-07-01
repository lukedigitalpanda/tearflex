import numpy as np
import cv2
import pytest
from apps.analysis.topography.rings import find_reflection_center, extract_rings
from apps.analysis.topography.reconstruct import reconstruct_curvature
from apps.analysis.topography.tests.synthetic import make_ring_image
from apps.analysis.topography import optics


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


# ---------------------------------------------------------------------------
# Catadioptric (distance-aware) path tests
# ---------------------------------------------------------------------------

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
