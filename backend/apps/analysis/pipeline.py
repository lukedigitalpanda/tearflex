"""
TearFlex Analysis Pipeline

Phase 1: Deterministic image processing (no ML dependency).
Analyses Placido ring distortion in video captures to measure NIBUT.
"""
import logging

logger = logging.getLogger(__name__)


def analyse_capture(capture):
    """
    Main entry point. Routes to the appropriate analysis module based on test type.

    Args:
        capture: TestCapture model instance with video_file attached.

    Returns:
        dict: Result fields matching TestResult model fields.
    """
    if capture.test_type == 'nibut':
        return analyse_nibut(capture)
    elif capture.test_type == 'fluorescein':
        return analyse_fluorescein(capture)
    elif capture.test_type == 'lipid':
        return analyse_lipid(capture)
    else:
        raise ValueError(f'Unknown test type: {capture.test_type}')


def analyse_nibut(capture):
    """
    NIBUT analysis via Placido ring distortion measurement.

    Algorithm (Phase 1 - deterministic):
    1. Extract frames at 10fps from the video
    2. Detect Placido ring pattern in first frame (Hough circles)
    3. Define region of interest (corneal reflection area)
    4. For each frame: compute ring distortion metric via edge detection + fractal dimension
    5. Build time series of distortion values
    6. Detect first break-up (distortion exceeds threshold)
    7. Detect mean break-up (average distortion exceeds threshold)
    8. Generate heatmap overlay

    TODO: Implement with OpenCV + scikit-image
    Currently returns placeholder data for API development.
    """
    logger.info(f'Analysing NIBUT capture {capture.id}')

    # PLACEHOLDER - replace with actual CV pipeline
    # This allows the API and frontend to be developed in parallel
    return {
        'nibut_first_breakup_seconds': 7.2,
        'nibut_mean_breakup_seconds': 9.8,
        'dry_eye_severity': 'mild',
        'confidence_score': 0.85,
        'raw_output': {
            'algorithm': 'placeholder',
            'note': 'Replace with actual NIBUT analysis pipeline',
            'frames_analysed': 0,
        },
    }


def analyse_fluorescein(capture):
    """
    Fluorescein break-up analysis.

    TODO: Implement fluorescein dye detection under blue light.
    - Detect green fluorescence regions
    - Measure time to first dark spot appearance
    - Grade using Oxford scale (0-5)
    """
    logger.info(f'Analysing fluorescein capture {capture.id}')

    return {
        'fluorescein_grade': 2,
        'fluorescein_breakup_seconds': 6.5,
        'dry_eye_severity': 'mild',
        'confidence_score': 0.75,
        'raw_output': {'algorithm': 'placeholder'},
    }


def analyse_lipid(capture):
    """
    Lipid layer thickness analysis.

    TODO: Implement lipid layer interference pattern analysis.
    - Detect interference colour fringes
    - Classify using Guillon scale (1-5)
    - Estimate thickness in nanometres
    """
    logger.info(f'Analysing lipid capture {capture.id}')

    return {
        'lipid_grade': 3,
        'lipid_thickness_nm': 60.0,
        'dry_eye_severity': 'normal',
        'confidence_score': 0.70,
        'raw_output': {'algorithm': 'placeholder'},
    }
