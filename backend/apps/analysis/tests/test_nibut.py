import numpy as np
import cv2
import pytest
from PIL import Image
from apps.analysis.nibut import (
    detect_breakup_times,
    generate_nibut_heatmap,
    analyse_nibut,
)


def _stable_frames(n: int = 10, size: int = 240) -> list[np.ndarray]:
    frames = []
    cx, cy = size // 2, size // 2
    for _ in range(n):
        f = np.zeros((size, size, 3), dtype=np.uint8)
        for r in range(20, size // 3, 15):
            cv2.circle(f, (cx, cy), r, (200, 200, 200), 2)
        frames.append(f)
    return frames


def _noisy_frames(n: int = 10, size: int = 240) -> list[np.ndarray]:
    rng = np.random.default_rng(42)
    frames = []
    cx, cy = size // 2, size // 2
    for i in range(n):
        f = np.zeros((size, size, 3), dtype=np.uint8)
        for r in range(20, size // 3, 15):
            cv2.circle(f, (cx, cy), r, (200, 200, 200), 2)
        noise = rng.integers(0, 60 + i * 10, f.shape, dtype=np.uint8)
        f = cv2.add(f, noise)
        frames.append(f)
    return frames


def test_detect_breakup_times_finds_breakup():
    distortions = [0.1, 0.2, -0.1, 0.0, 0.1, 0.2, 0.3, 2.0, 2.5, 3.0]
    first, mean = detect_breakup_times(distortions, fps=10.0, n_baseline=5, threshold_multiplier=1.5)
    assert first is not None
    assert 0.3 <= first <= 1.5


def test_detect_breakup_times_no_breakup_returns_video_duration():
    distortions = [0.1] * 20
    first, mean = detect_breakup_times(distortions, fps=10.0, n_baseline=5, threshold_multiplier=1.5)
    assert first == pytest.approx((len(distortions) - 1) / 10.0, abs=0.2)


def test_generate_nibut_heatmap_returns_pil_image():
    frame = np.zeros((240, 240, 3), dtype=np.uint8)
    roi = (60, 60, 120, 120)
    distortions = [float(i) / 10 for i in range(20)]
    img = generate_nibut_heatmap(frame, roi, distortions)
    assert isinstance(img, Image.Image)
    assert img.size == (240, 240)


def test_analyse_nibut_returns_expected_keys():
    frames = _stable_frames(8) + _noisy_frames(8)
    result = analyse_nibut(frames, fps=10.0)
    for key in ('first_breakup_seconds', 'mean_breakup_seconds', 'heatmap_image', 'confidence', 'frame_metrics'):
        assert key in result
    assert isinstance(result['heatmap_image'], Image.Image)


def test_analyse_nibut_confidence_in_range():
    frames = _stable_frames(8) + _noisy_frames(8)
    result = analyse_nibut(frames, fps=10.0)
    assert 0.0 <= result['confidence'] <= 1.0


def test_analyse_nibut_raises_on_too_few_frames():
    with pytest.raises(ValueError, match="too short"):
        analyse_nibut(_stable_frames(2), fps=10.0)


def test_analyse_nibut_frame_metrics_have_correct_structure():
    frames = _stable_frames(5) + _noisy_frames(5)
    result = analyse_nibut(frames, fps=10.0)
    for m in result['frame_metrics']:
        assert 'frame_index' in m
        assert 'time_seconds' in m
        assert 'edge_density' in m
        assert 'distortion' in m
