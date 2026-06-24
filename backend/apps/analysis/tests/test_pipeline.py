from unittest.mock import patch
from apps.analysis import pipeline
from apps.analysis.tests.synthetic_lipid import make_lipid_pattern


def test_analyse_lipid_pipeline_returns_real_result():
    frames = [make_lipid_pattern('fringes', size=200, blur=0.0)]
    with patch('apps.analysis.pipeline.extract_frames', return_value=frames):
        out = pipeline._analyse_lipid('ignored.mp4')
    assert out['analysis_version'] == 'lipid-v0.1'
    assert 1 <= out['lipid_grade'] <= 5
    assert 10 <= out['lipid_thickness_nm'] <= 120
    assert out['dry_eye_severity'] in ('normal', 'mild', 'moderate', 'severe')
    assert out['raw_output']['grade_provisional'] is True
    assert out['raw_output']['thickness_provisional'] is True
