import cv2
import numpy as np
import pytest
from apps.analysis.tests.synthetic_lipid import make_lipid_pattern


def _saturation(img):
    return float(cv2.cvtColor(img, cv2.COLOR_BGR2HSV)[..., 1].mean())


def test_lipid_pattern_shapes_and_distinguishable():
    mesh = make_lipid_pattern('meshwork', size=200)
    amor = make_lipid_pattern('amorphous', size=200)
    fringes = make_lipid_pattern('fringes', size=200)
    for im in (mesh, amor, fringes):
        assert im.shape == (200, 200, 3) and im.dtype == np.uint8
    # meshwork has more fine edges than the smooth amorphous patch
    edges = lambda im: int(cv2.Canny(cv2.cvtColor(im, cv2.COLOR_BGR2GRAY), 50, 150).sum())
    assert edges(mesh) > edges(amor)
    # coloured fringes are far more saturated than the greyish meshwork/amorphous
    assert _saturation(fringes) > _saturation(mesh)
    assert _saturation(fringes) > _saturation(amor)


from apps.analysis.lipid import detect_lipid_roi, select_sharpest_frame


def test_detect_lipid_roi_bounds_the_disc():
    img = make_lipid_pattern('amorphous', size=200)
    x, y, w, h = detect_lipid_roi(img)
    assert 40 < w < 200 and 40 < h < 200


def test_select_sharpest_frame_picks_crisp():
    crisp = make_lipid_pattern('meshwork', size=200, blur=0.0)
    soft = make_lipid_pattern('meshwork', size=200, blur=4.0)
    assert select_sharpest_frame([soft, crisp, soft]) == 1


def test_select_sharpest_frame_empty_raises():
    with pytest.raises(ValueError):
        select_sharpest_frame([])


from apps.analysis.lipid import colour_features


def _roi(img):
    x, y, w, h = detect_lipid_roi(img)
    return img[y:y + h, x:x + w]


def test_colour_features_fringes_more_saturated_than_meshwork():
    f_mesh = colour_features(_roi(make_lipid_pattern('meshwork')))
    f_fringes = colour_features(_roi(make_lipid_pattern('fringes')))
    assert f_fringes['mean_saturation'] > f_mesh['mean_saturation']
    assert f_fringes['hue_spread'] >= f_mesh['hue_spread']


def test_colour_features_all_dark_returns_zero():
    f = colour_features(np.zeros((10, 10, 3), dtype=np.uint8))
    assert f['mean_saturation'] == 0.0
