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
