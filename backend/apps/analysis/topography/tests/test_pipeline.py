from apps.analysis.topography.pipeline import analyse_topography_frame, ALGORITHM_VERSION
from apps.analysis.topography.tests.synthetic import make_ring_image


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
