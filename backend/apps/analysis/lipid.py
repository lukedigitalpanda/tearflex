import cv2
import numpy as np
from .utils import edge_density

LIPID_BRIGHT_PERCENTILE = 70.0   # the specular reflection is the brighter region


def detect_lipid_roi(frame: np.ndarray) -> tuple[int, int, int, int]:
    """Bounding box of the bright specular/interference region; centred fallback."""
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    h, w = gray.shape
    thresh = np.percentile(gray, LIPID_BRIGHT_PERCENTILE)
    mask = gray >= max(thresh, 1)
    ys, xs = np.nonzero(mask)
    if xs.size == 0:
        cx, cy, r = w // 2, h // 2, min(h, w) // 4
        return (cx - r, cy - r, 2 * r, 2 * r)
    x1, x2 = int(xs.min()), int(xs.max())
    y1, y2 = int(ys.min()), int(ys.max())
    return (x1, y1, max(1, x2 - x1), max(1, y2 - y1))


def select_sharpest_frame(frames: list[np.ndarray]) -> int:
    """Index of the sharpest frame (max Laplacian variance). Lipid is a static pattern."""
    if not frames:
        raise ValueError("No frames to select from")
    scores = [cv2.Laplacian(cv2.cvtColor(f, cv2.COLOR_BGR2GRAY), cv2.CV_64F).var() for f in frames]
    return int(np.argmax(scores))


def colour_features(roi_bgr: np.ndarray) -> dict:
    """Interference-colour features over the bright ROI pixels."""
    if roi_bgr.size == 0:
        return {'mean_saturation': 0.0, 'hue_spread': 0.0, 'dominant_hue': 0.0}
    hsv = cv2.cvtColor(roi_bgr, cv2.COLOR_BGR2HSV)
    h, s, v = hsv[..., 0], hsv[..., 1], hsv[..., 2]
    bright = v > 40
    if not bright.any():
        return {'mean_saturation': 0.0, 'hue_spread': 0.0, 'dominant_hue': 0.0}
    return {
        'mean_saturation': float(s[bright].mean()),
        'hue_spread': float(h[bright].std()),
        'dominant_hue': float(np.median(h[bright])),
    }


# Provisional thresholds (research seeds — replaced by the ML grader / colour calibration).
_SAT_FRINGES = 60.0      # mean saturation above this => coloured fringes (grade 5)
_TEX_OPEN = 0.12         # edge density above this => open meshwork (grade 1)
_TEX_CLOSED = 0.06       # => closed meshwork (grade 2)
_TEX_WAVE = 0.02         # => wave/flow (grade 3); below => amorphous (grade 4)


def grade_lipid(roi_bgr: np.ndarray) -> int:
    """Provisional Guillon grade 1..5. SEAM: heuristic, not clinically validated.
    High texture + low colour => meshwork (low grade); smooth => amorphous (4);
    high saturation => coloured fringes (5)."""
    if roi_bgr.size == 0:
        return 1
    sat = colour_features(roi_bgr)['mean_saturation']
    if sat >= _SAT_FRINGES:
        return 5
    gray = cv2.cvtColor(roi_bgr, cv2.COLOR_BGR2GRAY)
    tex = edge_density(gray)
    if tex >= _TEX_OPEN:
        return 1
    if tex >= _TEX_CLOSED:
        return 2
    if tex >= _TEX_WAVE:
        return 3
    return 4


def thickness_from_colour(roi_bgr: np.ndarray) -> float:
    """Provisional lipid thickness (nm) from interference-colour saturation.
    SEAM: uncalibrated — not metrically valid until colour calibration (subsystem A)."""
    if roi_bgr.size == 0:
        return 10.0
    sat = colour_features(roi_bgr)['mean_saturation']
    nm = 15.0 + (sat / 255.0) * 90.0     # greyish (thin) -> ~15nm; saturated -> ~105nm
    return float(np.clip(round(nm, 1), 10.0, 120.0))


# Deliberately low: this slice is uncalibrated + unvalidated (see spec honesty model).
_BASE_CONFIDENCE = 0.2


def analyse_lipid(frames: list[np.ndarray], fps: float = 10.0, colour_profile=None) -> dict:
    """Provisional lipid Guillon grade + thickness from the sharpest frame.

    `colour_profile` is the calibration seam (None = passthrough); the shared
    calibration foundation will supply a white-balance transform here later.
    `fps` is unused (static pattern) — accepted for analyser-signature parity.
    """
    if not frames:
        raise ValueError("No frames for lipid analysis")
    if colour_profile is not None:
        frames = [colour_profile.apply(f) for f in frames]

    best = select_sharpest_frame(frames)
    frame = frames[best]
    x, y, w, h = detect_lipid_roi(frame)
    roi = frame[y:y + h, x:x + w]

    feats = colour_features(roi)
    grade = grade_lipid(roi)
    thickness = thickness_from_colour(roi)

    # Confidence stays low and drops further on an ambiguous (near-grey, low-texture) ROI.
    gray = cv2.cvtColor(roi, cv2.COLOR_BGR2GRAY) if roi.size else np.zeros((1, 1), np.uint8)
    tex = edge_density(gray)
    informative = min(1.0, feats['mean_saturation'] / 80.0 + tex / 0.1)
    confidence = float(np.clip(_BASE_CONFIDENCE * informative, 0.05, 0.5))

    return {
        'lipid_grade': grade,
        'lipid_thickness_nm': thickness,
        'grade_provisional': True,
        'thickness_provisional': True,
        'confidence': round(confidence, 3),
        'features': {k: round(v, 3) for k, v in feats.items()},
    }
