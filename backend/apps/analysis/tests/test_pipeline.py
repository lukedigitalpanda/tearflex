from unittest.mock import patch
from apps.analysis import pipeline
from apps.analysis.tests.synthetic_fluorescein import make_dyed_film_clip


def test_analyse_fluorescein_pipeline_returns_real_result():
    frames = make_dyed_film_clip(n_frames=30, size=200, break_at=15, n_holes=6)
    # Bypass real video decoding — feed synthetic frames straight in.
    with patch('apps.analysis.pipeline.extract_frames', return_value=frames):
        out = pipeline._analyse_fluorescein('ignored.mp4')
    assert out['analysis_version'] == 'fluorescein-v0.1'
    assert 'fluorescein_breakup_seconds' in out
    assert 0 <= out['fluorescein_grade'] <= 5
    assert isinstance(out['heatmap_bytes'], (bytes, bytearray))
    assert out['dry_eye_severity'] in ('normal', 'mild', 'moderate', 'severe')
    assert out['raw_output']['grade_provisional'] is True
