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


N_BASELINE = 5
BREAKUP_THRESHOLD_MULTIPLIER = 1.5
MIN_BREAKUP_SECONDS = 0.3


def detect_breakup_times(
    distortions: list[float],
    fps: float,
    n_baseline: int = N_BASELINE,
    threshold_multiplier: float = BREAKUP_THRESHOLD_MULTIPLIER,
) -> tuple[float, float]:
    """Given a normalised metric series (z-scores) and fps, return
    (first_breakup_seconds, mean_breakup_seconds). If no break-up is detected,
    first_breakup equals the video duration. Shared by NIBUT and fluorescein."""
    threshold = threshold_multiplier
    first_breakup: float | None = None
    breakup_times: list[float] = []

    for i, d in enumerate(distortions[n_baseline:], start=n_baseline):
        t = i / fps
        if d >= threshold:
            if first_breakup is None and t >= MIN_BREAKUP_SECONDS:
                first_breakup = t
            breakup_times.append(t)

    if first_breakup is None:
        if breakup_times:
            first_breakup = breakup_times[0]
        else:
            first_breakup = (len(distortions) - 1) / fps

    mean_breakup = float(np.mean(breakup_times)) if breakup_times else first_breakup
    return (round(first_breakup, 2), round(mean_breakup, 2))


def pil_image_to_django_file(img: Image.Image) -> bytes:
    """Serialise a PIL image to PNG bytes for saving to a Django ImageField."""
    buf = io.BytesIO()
    img.save(buf, format='PNG')
    return buf.getvalue()
