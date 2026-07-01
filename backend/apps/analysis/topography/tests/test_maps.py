import cv2
from PIL import Image
from apps.analysis.topography.rings import find_reflection_center, extract_rings
from apps.analysis.topography.reconstruct import reconstruct_curvature
from apps.analysis.topography.maps import render_ring_overlay, render_axial_map
from apps.analysis.topography.tests.synthetic import make_ring_image


def _setup(astig=0.2):
    img, _ = make_ring_image(size=400, n_rings=6, astigmatism=astig)
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    return img, extract_rings(gray, find_reflection_center(gray))


def test_ring_overlay_is_image_same_size():
    img, rings = _setup()
    out = render_ring_overlay(img, rings)
    assert isinstance(out, Image.Image)
    assert out.size == (img.shape[1], img.shape[0])


def test_axial_map_renders_requested_size():
    img, rings = _setup()
    out = render_axial_map(reconstruct_curvature(rings), size=300)
    assert isinstance(out, Image.Image)
    assert out.size == (300, 300)
