import cv2
import numpy as np
from apps.analysis.topography.tests.synthetic import make_ring_image


def test_make_ring_image_shape_and_truth():
    img, gt = make_ring_image(size=256, n_rings=6, blur=0.0)
    assert img.shape == (256, 256, 3)
    assert img.dtype == np.uint8
    assert gt['n_rings'] == 6
    assert gt['center'] == (128, 128)
    assert img.max() > 0


def test_astigmatism_compresses_steep_axis():
    # steep axis horizontal (0 deg) -> rings compressed in x, extend further in y
    img, _ = make_ring_image(size=400, n_rings=6, astigmatism=0.3,
                             steep_axis_deg=0.0, blur=0.0)
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    ys, xs = np.where(gray > 50)
    cx, cy = 200, 200
    x_extent = np.abs(xs - cx).max()
    y_extent = np.abs(ys - cy).max()
    assert y_extent > x_extent
