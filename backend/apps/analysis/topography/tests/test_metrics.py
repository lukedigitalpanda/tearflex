import cv2
import pytest
from apps.analysis.topography.rings import find_reflection_center, extract_rings
from apps.analysis.topography.reconstruct import reconstruct_curvature
from apps.analysis.topography.metrics import compute_metrics
from apps.analysis.topography.tests.synthetic import make_ring_image


def _metrics(astig, axis):
    img, _ = make_ring_image(size=420, n_rings=7, astigmatism=astig, steep_axis_deg=axis)
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    return compute_metrics(reconstruct_curvature(extract_rings(gray, find_reflection_center(gray))))


def _circular_diff(a, b):
    return abs(((a - b + 90) % 180) - 90)


def test_concentric_has_near_zero_astigmatism():
    m = _metrics(0.0, 0.0)
    assert m['astigmatism_magnitude'] < 0.05 * m['central_k']
    assert m['sim_k_steep'] == pytest.approx(m['sim_k_flat'], rel=0.05)


@pytest.mark.parametrize('axis', [0.0, 90.0])
def test_cardinal_axis_recovered(axis):
    m = _metrics(0.3, axis)
    assert m['astigmatism_magnitude'] > 0.1 * m['central_k']
    assert _circular_diff(m['sim_k_axis'], axis) < 12.0


def test_diagonal_axis_detected():
    # 45 vs 135 depends on polar handedness; assert it lands diagonal, not cardinal.
    m = _metrics(0.3, 45.0)
    assert min(_circular_diff(m['sim_k_axis'], 45.0),
               _circular_diff(m['sim_k_axis'], 135.0)) < 15.0
