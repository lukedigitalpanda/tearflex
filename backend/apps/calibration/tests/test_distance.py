import math

import pytest

from apps.calibration.distance import (
    distance_from_iris,
    distance_from_focus,
    fuse_distances,
    DistanceEstimate,
)


# --- iris-as-scale lever (similar triangles) ---

def test_distance_from_iris_similar_triangles():
    # iris 100 px wide, focal length 1000 px, real iris 11.7 mm
    # distance = focal_px * iris_mm / iris_px = 1000 * 11.7 / 100 = 117 mm
    est = distance_from_iris(iris_px=100.0, focal_px=1000.0, iris_mm=11.7)
    assert est.distance_mm == pytest.approx(117.0, rel=1e-6)
    assert est.source == 'iris'
    assert est.sigma_mm > 0


def test_distance_from_iris_closer_means_bigger_iris():
    far = distance_from_iris(iris_px=100.0, focal_px=1000.0)
    near = distance_from_iris(iris_px=200.0, focal_px=1000.0)   # iris twice as big -> half the distance
    assert near.distance_mm == pytest.approx(far.distance_mm / 2, rel=1e-6)


def test_distance_from_iris_rejects_nonpositive():
    with pytest.raises(ValueError):
        distance_from_iris(iris_px=0.0, focal_px=1000.0)


# --- camera-focus lever (Camera2 LENS_FOCUS_DISTANCE is in diopters = 1/metres) ---

def test_distance_from_focus_reciprocal_diopters():
    # 2 diopters -> 0.5 m -> 500 mm
    est = distance_from_focus(focus_diopters=2.0)
    assert est.distance_mm == pytest.approx(500.0, rel=1e-6)
    assert est.source == 'focus'


def test_distance_from_focus_nonpositive_is_infinite_focus():
    # 0 diopters means focused at infinity — not a usable near-distance.
    with pytest.raises(ValueError):
        distance_from_focus(focus_diopters=0.0)


# --- fusion: inverse-variance (precision) weighting ---

def test_fuse_weights_toward_the_more_precise_estimate():
    loose = DistanceEstimate('iris', 100.0, sigma_mm=10.0)
    tight = DistanceEstimate('focus', 110.0, sigma_mm=2.0)
    fused = fuse_distances([loose, tight])
    # fused sits between, much closer to the tighter (110) estimate
    assert 105.0 < fused.distance_mm < 110.0
    # combining independent estimates beats either one alone
    assert fused.sigma_mm < tight.sigma_mm
    assert fused.source == 'fused'


def test_fuse_reports_spread_so_we_can_see_disagreement():
    fused = fuse_distances([
        DistanceEstimate('iris', 100.0, sigma_mm=5.0),
        DistanceEstimate('focus', 112.0, sigma_mm=5.0),
    ])
    assert fused.spread_mm == pytest.approx(12.0, rel=1e-6)
    # equal precision -> simple midpoint
    assert fused.distance_mm == pytest.approx(106.0, rel=1e-6)


def test_fuse_single_estimate_returns_it():
    only = DistanceEstimate('iris', 117.0, sigma_mm=4.0)
    fused = fuse_distances([only])
    assert fused.distance_mm == pytest.approx(117.0)
    assert fused.sigma_mm == pytest.approx(4.0)
    assert fused.spread_mm == 0.0


def test_fuse_empty_raises():
    with pytest.raises(ValueError):
        fuse_distances([])
