import cv2
import numpy as np

FLUOR_BRIGHT_PERCENTILE = 75.0   # pixels brighter than this (within frame) are "fluorescing"
HOLE_RELATIVE_FRACTION = 0.45    # holes are < this * the fluorescing brightness


def detect_tearfilm_roi(frame: np.ndarray) -> tuple[int, int, int, int]:
    """Bounding box of the bright fluorescing tear-film region (not Placido rings).
    Falls back to a centred box if nothing bright is found."""
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    h, w = gray.shape
    thresh = np.percentile(gray, FLUOR_BRIGHT_PERCENTILE)
    mask = gray >= max(thresh, 1)
    ys, xs = np.nonzero(mask)
    if xs.size == 0:
        cx, cy, r = w // 2, h // 2, min(h, w) // 4
        return (cx - r, cy - r, 2 * r, 2 * r)
    x1, x2 = int(xs.min()), int(xs.max())
    y1, y2 = int(ys.min()), int(ys.max())
    return (x1, y1, max(1, x2 - x1), max(1, y2 - y1))


def breakup_metric(roi_bgr: np.ndarray) -> float:
    """Fraction of the fluorescing ROI that has broken up (dark holes).
    Bright fluorescing pixels define the film; dark pixels inside that envelope are holes."""
    gray = cv2.cvtColor(roi_bgr, cv2.COLOR_BGR2GRAY).astype(np.float32)
    if gray.size == 0:
        return 0.0
    bright = float(np.percentile(gray, 90)) + 1e-6
    film = gray >= (0.25 * bright)          # the disc envelope (film + holes)
    holes = gray < (HOLE_RELATIVE_FRACTION * bright)
    film_area = int(film.sum())
    if film_area == 0:
        return 0.0
    filled = _fill(film)        # fill once; breakup_metric runs per frame
    hole_in_film = int(np.logical_and(holes, filled).sum())
    return float(hole_in_film) / float(filled.sum() or 1)


def _fill(mask: np.ndarray) -> np.ndarray:
    """Convex-ish fill of the film mask so interior holes count as 'inside the film'."""
    m = mask.astype(np.uint8) * 255
    contours, _ = cv2.findContours(m, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    filled = np.zeros_like(m)
    if contours:
        cv2.drawContours(filled, contours, -1, 255, thickness=cv2.FILLED)
    return filled > 0


# Provisional Oxford-grade bands by punctate-staining coverage (fraction of ROI area).
# SEAM: a research heuristic only — replaced by the ML grader when graded data lands.
_STAINING_BANDS = [0.0008, 0.004, 0.012, 0.03, 0.07]   # thresholds for grades 1..5


def grade_staining(roi_bgr: np.ndarray) -> int:
    """Provisional Oxford staining grade 0..5 from punctate bright-spot coverage.
    Research heuristic, not clinically validated."""
    if roi_bgr.size == 0:
        return 0
    gray = cv2.cvtColor(roi_bgr, cv2.COLOR_BGR2GRAY)
    # staining spots are bright; threshold on brightness.
    spots = gray >= max(float(np.percentile(gray, 99)), 180)
    coverage = float(spots.sum()) / float(gray.size or 1)
    grade = 0
    for band in _STAINING_BANDS:
        if coverage >= band:
            grade += 1
    return min(grade, 5)
