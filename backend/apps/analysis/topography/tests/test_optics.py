import math
import pytest
from apps.analysis.topography import optics
from apps.analysis.topography.optics import ImplausibleReconstruction


def test_forward_known_value():
    r = optics.ring_radius_px(7.8, 40.0, 3000.0, 5.0)
    assert r == pytest.approx(30.596234, abs=1e-5)


def test_inverse_is_exact_round_trip():
    for R in (6.8, 7.2, 7.8, 8.4):
        r = optics.ring_radius_px(R, 40.0, 3000.0, 5.0)
        assert optics.corneal_radius_mm(r, 40.0, 3000.0, 5.0) == pytest.approx(R, abs=1e-9)


def test_radius_to_power():
    assert optics.radius_to_power(7.8) == pytest.approx(43.2692, abs=1e-3)


def test_distance_error_propagates_about_one_dioptre_per_percent():
    r = optics.ring_radius_px(7.8, 40.0, 3000.0, 5.0)  # true capture at 40 mm
    p_true = optics.radius_to_power(7.8)
    # invert with a +4% wrong distance -> power should drop ~3.5 D (verified)
    R_wrong = optics.corneal_radius_mm(r, 41.6, 3000.0, 5.0)
    assert optics.radius_to_power(R_wrong) - p_true == pytest.approx(-3.576, abs=0.05)


def test_object_distance_defaults_to_working_distance():
    a = optics.ring_radius_px(7.8, 40.0, 3000.0, 5.0)
    b = optics.ring_radius_px(7.8, 40.0, 3000.0, 5.0, object_distance_mm=40.0)
    assert a == pytest.approx(b, abs=1e-12)


def test_nonphysical_ring_raises():
    # a ring far too large for the geometry drives the denominator non-positive
    with pytest.raises(ValueError):
        optics.corneal_radius_mm(1e6, 40.0, 3000.0, 5.0)


def test_nonpositive_inputs_raise():
    with pytest.raises(ValueError):
        optics.ring_radius_px(0.0, 40.0, 3000.0, 5.0)
    with pytest.raises(ValueError):
        optics.radius_to_power(0.0)


def test_corneal_radius_non_physical_raises_implausible():
    """Positive but mutually-inconsistent inputs (ring too large for the claimed
    focal/geometry) are a measurement failure, not a caller bug — they must raise
    the downgradeable exception type, not plain ValueError."""
    with pytest.raises(ImplausibleReconstruction, match="non-physical"):
        optics.corneal_radius_mm(100.0, 40.0, 200.0, 3.0)  # denom = 600 - 8000 < 0


def test_radius_to_power_non_positive_raises_implausible():
    with pytest.raises(ImplausibleReconstruction, match="positive"):
        optics.radius_to_power(0.0)
