import cv2
import numpy as np
from PIL import Image
import io
import logging

logger = logging.getLogger(__name__)

ANALYSIS_FPS = 10.0


def extract_frames(video_path: str, target_fps: float = ANALYSIS_FPS) -> list[np.ndarray]:
    """Extract frames from a video file at target_fps sampling rate. Returns BGR numpy arrays."""
    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        raise ValueError(f"Cannot open video file: {video_path}")

    video_fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    frame_interval = max(1, round(video_fps / target_fps))

    frames: list[np.ndarray] = []
    frame_idx = 0
    while True:
        ret, frame = cap.read()
        if not ret:
            break
        if frame_idx % frame_interval == 0:
            frames.append(frame)
        frame_idx += 1

    cap.release()
    if not frames:
        logger.warning("No frames extracted from %s — file may be empty or corrupt", video_path)
    else:
        logger.debug("Extracted %d frames from %s", len(frames), video_path)
    return frames


def detect_placido_roi(frame: np.ndarray) -> tuple[int, int, int, int]:
    """
    Detect Placido disc ring pattern using Hough circles.
    Returns (x, y, w, h) bounding box. Falls back to centre-of-frame if rings not found.
    """
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    blurred = cv2.GaussianBlur(gray, (9, 9), 2)
    h, w = gray.shape

    min_r = min(h, w) // 8
    max_r = min(h, w) // 3

    circles = cv2.HoughCircles(
        blurred,
        cv2.HOUGH_GRADIENT,
        dp=1.5,
        minDist=min(h, w) // 4,
        param1=80,
        param2=40,
        minRadius=min_r,
        maxRadius=max_r,
    )

    if circles is not None:
        circles_int = np.round(circles[0]).astype(int)
        cx, cy, r = sorted(circles_int, key=lambda c: c[2], reverse=True)[0]
        logger.debug("Placido ring detected at (%d, %d) r=%d", cx, cy, r)
    else:
        cx, cy = w // 2, h // 2
        r = min(h, w) // 4
        logger.warning("No Placido rings detected; using frame centre as ROI fallback")

    margin = int(r * 0.2)
    x1 = max(0, cx - r - margin)
    y1 = max(0, cy - r - margin)
    x2 = min(w, cx + r + margin)
    y2 = min(h, cy + r + margin)
    return (x1, y1, x2 - x1, y2 - y1)


def edge_density(gray_roi: np.ndarray) -> float:
    """Fraction of pixels that are edges within a greyscale ROI (Canny). Higher = more distortion."""
    edges = cv2.Canny(gray_roi, threshold1=50, threshold2=150)
    return float(np.count_nonzero(edges)) / float(edges.size)


def normalise_distortions(raw_densities: list[float], n_baseline: int = 5) -> list[float]:
    """Z-score normalise densities relative to first n_baseline frames."""
    if len(raw_densities) <= n_baseline:
        return [0.0] * len(raw_densities)
    baseline = raw_densities[:n_baseline]
    mean = float(np.mean(baseline))
    std = float(np.std(baseline)) + 1e-9
    return [(d - mean) / std for d in raw_densities]


def pil_image_to_django_file(img: Image.Image) -> bytes:
    """Serialise a PIL image to PNG bytes for saving to a Django ImageField."""
    buf = io.BytesIO()
    img.save(buf, format='PNG')
    return buf.getvalue()
