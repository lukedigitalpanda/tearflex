import cv2
import numpy as np
from PIL import Image
import logging
from .utils import (
    detect_placido_roi, edge_density, normalise_distortions,
    detect_breakup_times, N_BASELINE,
)

logger = logging.getLogger(__name__)

COLOUR_STABLE = (200, 100, 30)   # BGR: orange-blue gradient start (stable tear film)
COLOUR_BREAKUP = (30, 30, 220)   # BGR: red (tear film break-up)


def generate_nibut_heatmap(
    base_frame: np.ndarray,
    roi: tuple[int, int, int, int],
    distortions: list[float],
) -> Image.Image:
    """Generate a PIL heatmap overlay on base_frame coloured by distortion intensity."""
    x, y, w, h = roi
    overlay = base_frame.copy()

    if len(distortions) > 0 and w > 0 and h > 0:
        max_d = max(max(distortions), 1.0)
        norm = float(np.clip(float(np.mean(distortions)) / max_d, 0.0, 1.0))
        stable = np.array(COLOUR_STABLE, dtype=float)
        broken = np.array(COLOUR_BREAKUP, dtype=float)
        colour = (stable * (1 - norm) + broken * norm).astype(np.uint8)

        layer = np.full((h, w, 3), colour, dtype=np.uint8)
        roi_slice = overlay[y: y + h, x: x + w]
        cv2.addWeighted(layer, 0.4, roi_slice, 0.6, 0, roi_slice)
        overlay[y: y + h, x: x + w] = roi_slice

    rgb = cv2.cvtColor(overlay, cv2.COLOR_BGR2RGB)
    return Image.fromarray(rgb)


def analyse_nibut(frames: list[np.ndarray], fps: float = 10.0) -> dict:
    """
    Run NIBUT analysis on pre-extracted BGR frames.

    Args:
        frames: list of BGR numpy arrays sampled at `fps` frames/second
        fps: sampling rate of frames

    Returns dict with: first_breakup_seconds, mean_breakup_seconds,
                       heatmap_image (PIL.Image), confidence, frame_metrics
    """
    if len(frames) <= N_BASELINE:
        raise ValueError(
            f"Video too short for NIBUT analysis (need more than {N_BASELINE} sampled frames)"
        )

    roi = detect_placido_roi(frames[0])
    x, y, w, h = roi

    raw_densities: list[float] = []
    for frame in frames:
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        roi_gray = gray[y: y + h, x: x + w]
        raw_densities.append(edge_density(roi_gray))

    distortions = normalise_distortions(raw_densities, n_baseline=N_BASELINE)

    frame_metrics = [
        {
            'frame_index': i,
            'time_seconds': round(i / fps, 3),
            'edge_density': round(raw_densities[i], 6),
            'distortion': round(distortions[i], 4),
        }
        for i in range(len(frames))
    ]

    first_breakup, mean_breakup = detect_breakup_times(distortions, fps=fps)

    baseline = raw_densities[:N_BASELINE]
    baseline_mean = float(np.mean(baseline)) + 1e-9
    baseline_std = float(np.std(baseline))
    # CV of baseline densities; * 4 maps a CV of 0.25 (noisy) to confidence ~0
    confidence = float(np.clip(1.0 - (baseline_std / baseline_mean) * 4, 0.05, 0.99))

    heatmap_img = generate_nibut_heatmap(frames[0], roi, distortions)

    return {
        'first_breakup_seconds': first_breakup,
        'mean_breakup_seconds': mean_breakup,
        'heatmap_image': heatmap_img,
        'confidence': round(confidence, 3),
        'frame_metrics': frame_metrics,
    }
