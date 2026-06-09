import numpy as np
import cv2
import pytest
from apps.analysis.utils import (
    extract_frames,
    detect_placido_roi,
    edge_density,
    normalise_distortions,
    pil_image_to_django_file,
)


def _synthetic_circle_frame(size: int = 240) -> np.ndarray:
    frame = np.zeros((size, size, 3), dtype=np.uint8)
    cx, cy = size // 2, size // 2
    for r in range(20, min(size // 2, 100), 15):
        cv2.circle(frame, (cx, cy), r, (200, 200, 200), 2)
    return frame


def test_detect_placido_roi_on_circle_frame():
    frame = _synthetic_circle_frame()
    roi = detect_placido_roi(frame)
    assert roi is not None
    x, y, w, h = roi
    cx, cy = 120, 120
    assert 0 <= x < 240
    assert 0 <= y < 240
    assert w > 0 and h > 0
    assert x <= cx <= x + w
    assert y <= cy <= y + h


def test_detect_placido_roi_falls_back_on_blank_frame():
    frame = np.zeros((240, 240, 3), dtype=np.uint8)
    roi = detect_placido_roi(frame)
    assert roi is not None
    x, y, w, h = roi
    assert w > 0 and h > 0


def test_edge_density_higher_for_noisy_frame():
    rng = np.random.default_rng(42)
    clean = np.zeros((100, 100), dtype=np.uint8)
    cv2.circle(clean, (50, 50), 30, 200, 2)
    noisy = clean.copy()
    noisy = cv2.add(noisy, rng.integers(0, 60, clean.shape, dtype=np.uint8))
    assert edge_density(noisy) >= edge_density(clean)


def test_edge_density_range():
    frame = np.zeros((100, 100), dtype=np.uint8)
    d = edge_density(frame)
    assert 0.0 <= d <= 1.0


def test_normalise_distortions_baseline_near_zero():
    raw = [0.1, 0.1, 0.12, 0.11, 0.1, 0.5, 0.8, 1.0]
    normed = normalise_distortions(raw, n_baseline=5)
    assert len(normed) == len(raw)
    assert all(abs(v) < 2.0 for v in normed[:5])
    assert normed[7] > normed[5]


def test_normalise_distortions_short_input():
    raw = [0.1, 0.2]
    normed = normalise_distortions(raw, n_baseline=5)
    assert normed == [0.0, 0.0]


def test_pil_image_to_django_file_returns_png_bytes():
    from PIL import Image
    img = Image.new('RGB', (100, 100), color=(255, 0, 0))
    data = pil_image_to_django_file(img)
    assert isinstance(data, bytes)
    assert data[:4] == b'\x89PNG'
