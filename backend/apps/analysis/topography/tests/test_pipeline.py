import pytest
from apps.analysis.topography.pipeline import analyse_topography_frame, ALGORITHM_VERSION
from apps.analysis.topography.tests.synthetic import make_ring_image, make_physical_ring_image


def test_pipeline_returns_full_result():
    img, _ = make_ring_image(size=420, n_rings=7, astigmatism=0.0)
    res = analyse_topography_frame(img)
    for key in ('sim_k_flat', 'sim_k_steep', 'sim_k_axis', 'central_k',
                'astigmatism_magnitude', 'astigmatism_axis', 'confidence'):
        assert key in res
    assert res['algorithm_version'] == ALGORITHM_VERSION
    assert isinstance(res['ring_overlay_png'], (bytes, bytearray))
    assert isinstance(res['axial_map_png'], (bytes, bytearray))
    assert res['astigmatism_magnitude'] < 0.1 * res['central_k']
    assert 0.0 <= res['confidence'] <= 1.0
    assert res['raw_output']['n_rings'] >= 4


def test_pipeline_calibrated_recovers_physiological_power():
    obj = [3.0, 6.0, 9.0, 12.0, 15.0, 18.0]
    img, gt = make_physical_ring_image(7.8, 40.0, 5000.0, obj)
    out = analyse_topography_frame(img, distance_mm=40.0, focal_px=5000.0,
                                   ring_object_radii_mm=obj)
    assert out['raw_output']['calibration_state'] == 'default'
    assert out['raw_output']['distance_mm'] == pytest.approx(40.0)
    # ring extraction adds sub-pixel error; expect recovery near 43.27 D
    assert abs(out['central_k'] - gt['expected_power']) < 2.0


def test_pipeline_uncalibrated_stays_research_badged():
    obj = [3.0, 6.0, 9.0, 12.0, 15.0, 18.0]
    img, _ = make_physical_ring_image(7.8, 40.0, 5000.0, obj)
    out = analyse_topography_frame(img)
    assert out['raw_output']['calibration_state'] == 'uncalibrated'
    assert out['raw_output']['distance_mm'] is None
