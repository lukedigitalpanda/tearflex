import cv2
import numpy as np
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
