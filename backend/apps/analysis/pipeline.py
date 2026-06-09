import logging
from django.core.files.base import ContentFile
from .nibut import analyse_nibut
from .utils import extract_frames, pil_image_to_django_file

logger = logging.getLogger(__name__)


def analyse_capture(capture) -> dict:
    """
    Route a TestCapture to the correct analysis function.
    Returns a dict of result fields for TestResult, plus optional 'heatmap_bytes' key.
    """
    test_type = capture.test_type
    video_path = capture.video_file.path

    if test_type == 'nibut':
        return _analyse_nibut(video_path)
    elif test_type == 'fluorescein':
        return _analyse_fluorescein(video_path)
    elif test_type == 'lipid':
        return _analyse_lipid(video_path)
    else:
        raise ValueError(f"Unknown test type: {test_type!r}")


def _analyse_nibut(video_path: str) -> dict:
    """Run NIBUT analysis pipeline. Returns TestResult field dict + heatmap_bytes."""
    frames = extract_frames(video_path, target_fps=10.0)
    result = analyse_nibut(frames, fps=10.0)

    heatmap_bytes = pil_image_to_django_file(result['heatmap_image'])

    first_bu = result['first_breakup_seconds']
    if first_bu >= 10:
        severity = 'normal'
    elif first_bu >= 5:
        severity = 'mild'
    elif first_bu >= 2:
        severity = 'moderate'
    else:
        severity = 'severe'

    return {
        'nibut_first_breakup_seconds': result['first_breakup_seconds'],
        'nibut_mean_breakup_seconds': result['mean_breakup_seconds'],
        'heatmap_bytes': heatmap_bytes,
        'dry_eye_severity': severity,
        'confidence_score': result['confidence'],
        'analysis_version': 'nibut-v1',
        'raw_output': {'frame_metrics': result['frame_metrics']},
    }


def _analyse_fluorescein(video_path: str) -> dict:
    """Fluorescein analysis — algorithmic stub. Phase 2 will implement full detection."""
    logger.info("Fluorescein analysis: returning placeholder (Phase 2 implementation pending)")
    return {
        'fluorescein_grade': 1,
        'fluorescein_breakup_seconds': 8.0,
        'dry_eye_severity': 'mild',
        'confidence_score': 0.1,
        'analysis_version': 'fluorescein-stub-v1',
        'raw_output': {'note': 'Phase 1 placeholder'},
    }


def _analyse_lipid(video_path: str) -> dict:
    """Lipid layer analysis — algorithmic stub. Phase 2 will implement full detection."""
    logger.info("Lipid analysis: returning placeholder (Phase 2 implementation pending)")
    return {
        'lipid_grade': 2,
        'lipid_thickness_nm': 30.0,
        'dry_eye_severity': 'normal',
        'confidence_score': 0.1,
        'analysis_version': 'lipid-stub-v1',
        'raw_output': {'note': 'Phase 1 placeholder'},
    }
