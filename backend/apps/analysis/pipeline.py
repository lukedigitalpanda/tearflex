import logging
from django.core.files.base import ContentFile
from .nibut import analyse_nibut
from .lipid import analyse_lipid
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
    # Severity mapping: normal/mild follow TFOS DEWS II (≥10s / ≥5s).
    # Moderate/severe sub-classifies the <5s concern band — TearFlex extension of the standard.
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
    """Run lipid analysis pipeline. Returns TestResult field dict (provisional)."""
    frames = extract_frames(video_path, target_fps=10.0)
    result = analyse_lipid(frames, fps=10.0)

    # A thicker/normal lipid layer (higher Guillon grade) maps to lower dry-eye severity;
    # a very thin layer (grade 1) maps to higher severity. Provisional mapping.
    grade = result['lipid_grade']
    if grade >= 4:
        severity = 'normal'
    elif grade == 3:
        severity = 'mild'
    elif grade == 2:
        severity = 'moderate'
    else:
        severity = 'severe'

    return {
        'lipid_grade': result['lipid_grade'],
        'lipid_thickness_nm': result['lipid_thickness_nm'],
        'dry_eye_severity': severity,
        'confidence_score': result['confidence'],
        'analysis_version': 'lipid-v0.1',
        'raw_output': {
            'note': 'Provisional heuristic — not a clinical claim; pending professional validation.',
            'grade_provisional': result['grade_provisional'],
            'thickness_provisional': result['thickness_provisional'],
            'features': result['features'],
        },
    }
