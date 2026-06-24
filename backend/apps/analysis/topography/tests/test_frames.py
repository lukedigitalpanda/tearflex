import cv2
import pytest
from apps.analysis.topography.frames import sharpness, select_best_frame
from apps.analysis.topography.tests.synthetic import make_ring_image


def _g(im):
    return cv2.cvtColor(im, cv2.COLOR_BGR2GRAY)


def test_sharpness_higher_for_crisper_image():
    crisp, _ = make_ring_image(blur=0.0)
    soft, _ = make_ring_image(blur=4.0)
    assert sharpness(_g(crisp)) > sharpness(_g(soft))


def test_select_best_frame_picks_sharpest():
    soft, _ = make_ring_image(blur=4.0)
    crisp, _ = make_ring_image(blur=0.0)
    blurry, _ = make_ring_image(blur=6.0)
    assert select_best_frame([soft, crisp, blurry]) == 1


def test_select_best_frame_empty_raises():
    with pytest.raises(ValueError):
        select_best_frame([])
