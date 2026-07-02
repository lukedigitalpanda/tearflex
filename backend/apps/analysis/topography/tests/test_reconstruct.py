import numpy as np
import cv2
import pytest
from apps.analysis.topography.rings import find_reflection_center, extract_rings
from apps.analysis.topography.reconstruct import (
    reconstruct_curvature, _robust_radius, ImplausibleReconstruction)
from apps.analysis.topography.tests.synthetic import make_ring_image
from apps.analysis.topography import optics
from apps.analysis.topography.disc import default_cone_profile


def _curv(astig, axis=0.0):
    img, _ = make_ring_image(size=400, n_rings=6, astigmatism=astig, steep_axis_deg=axis)
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    return reconstruct_curvature(extract_rings(gray, find_reflection_center(gray)))


def test_power_profile_flat_for_concentric():
    p = _curv(0.0)['power_per_angle']
    assert p.std() / p.mean() < 0.05


def test_power_profile_varies_for_astigmatic():
    c = _curv(0.3)
    p = c['power_per_angle']
    assert p.std() / p.mean() > 0.05
    assert c['central_power'] > 0


def test_reconstruct_raises_on_degenerate_zero_radii():
    """Zero radii produce inf power; reconstruct_curvature must raise ValueError."""
    rings = {
        'radii': np.zeros((180, 6)),
        'angles_deg': np.linspace(0, 359, 180),
    }
    with pytest.raises(ValueError, match="degenerate reconstruction"):
        reconstruct_curvature(rings)


# ---------------------------------------------------------------------------
# Catadioptric (distance-aware) path tests
# ---------------------------------------------------------------------------

def _rings_for(radius_per_angle_mm, object_radii_mm, distance_mm, focal_px):
    """Build a synthetic rings dict whose pixel radii are the forward-model image of
    a cornea with the given per-meridian radius (mm)."""
    angles = np.arange(0, 360, 2.0)
    radii = np.empty((angles.size, len(object_radii_mm)), dtype=np.float64)
    for i, ang in enumerate(angles):
        R = radius_per_angle_mm(ang)
        for k, h0 in enumerate(object_radii_mm):
            radii[i, k] = optics.ring_radius_px(R, distance_mm, focal_px, h0)
    return {'angles_deg': angles, 'radii': radii, 'n_rings': len(object_radii_mm)}


def test_catadioptric_recovers_spherical_power():
    obj = [3.0, 6.0, 9.0, 12.0]
    rings = _rings_for(lambda a: 7.8, obj, 40.0, 3000.0)
    out = reconstruct_curvature(rings, distance_mm=40.0, focal_px=3000.0,
                                ring_object_radii_mm=obj)
    assert out['calibration_state'] == 'default'
    assert out['distance_mm'] == pytest.approx(40.0)
    assert np.allclose(out['power_per_angle'], 43.2692, atol=1e-3)
    assert out['central_power'] == pytest.approx(43.2692, abs=1e-3)


def test_catadioptric_recovers_astigmatism():
    obj = [3.0, 6.0, 9.0, 12.0]
    # steeper (smaller R) at 0 deg: R = 7.5 at axis 0, 8.1 at 90 (regular astigmatism)
    def R_of(a):
        t = np.deg2rad(a)
        return 7.8 - 0.3 * np.cos(2 * t)   # 7.5 at 0/180, 8.1 at 90
    rings = _rings_for(R_of, obj, 40.0, 3000.0)
    out = reconstruct_curvature(rings, distance_mm=40.0, focal_px=3000.0,
                                ring_object_radii_mm=obj)
    p = out['power_per_angle']
    assert p.max() == pytest.approx(45.00, abs=0.05)   # steep, R=7.5
    assert p.min() == pytest.approx(41.67, abs=0.05)   # flat, R=8.1


def test_uncalibrated_path_is_unchanged():
    rings = {'angles_deg': np.arange(0, 360, 2.0),
             'radii': np.full((180, 4), 30.0), 'n_rings': 4}
    out = reconstruct_curvature(rings)
    assert out['calibration_state'] == 'uncalibrated'
    assert out['distance_mm'] is None
    assert out['scale'] == 4300.0


def test_too_few_object_radii_raises():
    rings = {'angles_deg': np.arange(0, 360, 2.0),
             'radii': np.full((180, 4), 30.0), 'n_rings': 4}
    with pytest.raises(ValueError, match="detected"):
        reconstruct_curvature(rings, distance_mm=40.0, focal_px=3000.0,
                              ring_object_radii_mm=[3.0, 6.0])  # only 2 for 4 rings


def _cone_rings_for(radius_per_angle_mm, ring_radii_mm, ring_depths_mm, distance_mm, focal_px):
    """rings dict for a cone: each ring imaged at its own object distance (working
    distance minus the ring's axial depth)."""
    angles = np.arange(0, 360, 2.0)
    radii = np.empty((angles.size, len(ring_radii_mm)), dtype=np.float64)
    for i, ang in enumerate(angles):
        R = radius_per_angle_mm(ang)
        for k, (h0, z) in enumerate(zip(ring_radii_mm, ring_depths_mm)):
            radii[i, k] = optics.ring_radius_px(R, distance_mm, focal_px, h0,
                                                object_distance_mm=distance_mm - z)
    return {'angles_deg': angles, 'radii': radii, 'n_rings': len(ring_radii_mm)}


def test_catadioptric_cone_recovers_spherical_power():
    """Per-ring object distances (cone depths) recover the true power exactly."""
    radii_mm, depths_mm = default_cone_profile()
    d, f = 45.0, 2500.0
    rings = _cone_rings_for(lambda a: 7.8, radii_mm, depths_mm, d, f)
    obj_dist = [d - z for z in depths_mm]
    out = reconstruct_curvature(rings, distance_mm=d, focal_px=f,
                                ring_object_radii_mm=radii_mm,
                                object_distance_mm=obj_dist)
    assert np.allclose(out['power_per_angle'], optics.radius_to_power(7.8), atol=1e-3)
    assert out['central_power'] == pytest.approx(optics.radius_to_power(7.8), abs=1e-3)


def test_flat_object_distance_biases_cone_reconstruction():
    """Ignoring cone depth (a single flat object distance) materially biases the
    inversion — this is why per-ring object distances are needed. Pinned at the
    optics level, gate-independently: the full flat reconstruction of these
    rings currently also trips the plausibility gate, but only ~1% past a
    PROVISIONAL bound, so this test asserts the stable physics (ring-0 /
    central-power bias > 1 D) rather than that boundary-adjacent behaviour."""
    radii_mm, depths_mm = default_cone_profile()
    d, f = 45.0, 2500.0
    # Render ring 0 at its true cone depth, then invert it assuming a flat disc
    # (object distance defaulting to the working distance).
    ring0_px = optics.ring_radius_px(7.8, d, f, radii_mm[0],
                                     object_distance_mm=d - depths_mm[0])
    central_flat = optics.radius_to_power(
        optics.corneal_radius_mm(ring0_px, d, f, radii_mm[0]))
    assert abs(central_flat - optics.radius_to_power(7.8)) > 1.0


def test_catadioptric_uses_innermost_when_more_object_radii_supplied():
    """The detector keeps the innermost n_rings rings, but the caller supplies the
    Placido disc's full physical ring radii (innermost-first). Reconstruction must
    pair the detected rings with the innermost physical radii and still recover the
    true power — not crash on the count mismatch."""
    detected_obj = [3.0, 6.0, 9.0, 12.0]                    # 4 rings actually detected
    full_disc = [3.0, 6.0, 9.0, 12.0, 15.0, 18.0]           # disc has 6 physical rings
    rings = _rings_for(lambda a: 7.8, detected_obj, 40.0, 3000.0)
    out = reconstruct_curvature(rings, distance_mm=40.0, focal_px=3000.0,
                                ring_object_radii_mm=full_disc)
    assert np.allclose(out['power_per_angle'], 43.2692, atol=1e-3)
    assert out['central_power'] == pytest.approx(43.2692, abs=1e-3)


# ---------------------------------------------------------------------------
# Robust per-ring aggregation (plausibility backstop, task 1)
# ---------------------------------------------------------------------------

def test_robust_radius_rejects_gross_outlier():
    """One mis-extracted ring must not drag the meridian estimate."""
    assert _robust_radius([7.7, 7.8, 7.9, 23.4]) == pytest.approx(7.8)


def test_robust_radius_preserves_moderate_spread():
    """Real spread within a meridian is kept — nothing trimmed, plain mean."""
    assert _robust_radius([7.5, 7.7, 7.9, 8.1]) == pytest.approx(7.8)


def test_robust_radius_two_elements_uses_median():
    assert _robust_radius([7.0, 9.0]) == pytest.approx(8.0)


def test_robust_radius_single_element():
    assert _robust_radius([7.8]) == pytest.approx(7.8)


def test_robust_radius_all_equal_mad_zero():
    """Zero MAD (all rings agree) must not divide by zero — returns the median."""
    assert _robust_radius([7.8, 7.8, 7.8, 7.8, 7.8]) == pytest.approx(7.8)


def test_single_bad_ring_does_not_bias_meridian_power():
    """End-to-end through the catadioptric path: one ring mis-extracted 1.5x too
    large in every meridian (inverts to R ~13 mm vs true 7.8 mm). With plain mean
    this biased power to ~37 D; robust aggregation must recover ~43.27 D."""
    obj = [3.0, 6.0, 9.0, 12.0]
    rings = _rings_for(lambda a: 7.8, obj, 40.0, 3000.0)
    rings['radii'][:, 2] *= 1.5
    out = reconstruct_curvature(rings, distance_mm=40.0, focal_px=3000.0,
                                ring_object_radii_mm=obj)
    assert np.allclose(out['power_per_angle'], 43.2692, atol=1e-3)
    assert out['central_power'] == pytest.approx(43.2692, abs=1e-3)  # ring 0 untouched


# ---------------------------------------------------------------------------
# Physiological sanity gate (plausibility backstop, task 2)
# ---------------------------------------------------------------------------
# Impossible-cornea tests use R = 3 mm / 15 mm — far outside the PROVISIONAL
# bounds so they survive a bound revision. Must-pass tests pin physiological
# facts (severe keratoconus R = 5 mm, normal R = 7.8 mm): if a future bound
# revision breaks them, the revision is wrong, not the tests.

def test_gate_rejects_impossibly_steep_cornea():
    """R = 3 mm (112.5 D) is not a cornea — measurement failure, must raise."""
    obj = [3.0, 6.0, 9.0, 12.0]
    rings = _rings_for(lambda a: 3.0, obj, 40.0, 3000.0)
    with pytest.raises(ImplausibleReconstruction, match="implausible"):
        reconstruct_curvature(rings, distance_mm=40.0, focal_px=3000.0,
                              ring_object_radii_mm=obj)


def test_gate_rejects_impossibly_flat_cornea():
    """R = 15 mm (22.5 D) is not a cornea — must raise."""
    obj = [3.0, 6.0, 9.0, 12.0]
    rings = _rings_for(lambda a: 15.0, obj, 40.0, 3000.0)
    with pytest.raises(ImplausibleReconstruction, match="implausible"):
        reconstruct_curvature(rings, distance_mm=40.0, focal_px=3000.0,
                              ring_object_radii_mm=obj)


def test_gate_passes_severe_keratoconus():
    """SAFETY-CRITICAL: steep-but-real pathology (R = 5 mm, 67.5 D — severe
    keratoconus) must NEVER be suppressed by the gate."""
    obj = [3.0, 6.0, 9.0, 12.0]
    rings = _rings_for(lambda a: 5.0, obj, 40.0, 3000.0)
    out = reconstruct_curvature(rings, distance_mm=40.0, focal_px=3000.0,
                                ring_object_radii_mm=obj)
    assert out['calibration_state'] == 'default'
    assert np.allclose(out['power_per_angle'], 67.5, atol=1e-3)


def test_gate_passes_normal_cornea():
    obj = [3.0, 6.0, 9.0, 12.0]
    rings = _rings_for(lambda a: 7.8, obj, 40.0, 3000.0)
    out = reconstruct_curvature(rings, distance_mm=40.0, focal_px=3000.0,
                                ring_object_radii_mm=obj)
    assert out['calibration_state'] == 'default'


def test_gate_trips_on_single_impossible_meridian():
    """One impossible meridian among normal ones is an extraction failure (the
    generous bounds mean it cannot be real pathology) — the whole reconstruction
    is refused, not published with one bad meridian. Note the aggregate central
    power (~43.7 D) stays in bounds, so this exercises per-meridian gating."""
    obj = [3.0, 6.0, 9.0, 12.0]
    rings = _rings_for(lambda a: 3.0 if a == 90.0 else 7.8, obj, 40.0, 3000.0)
    with pytest.raises(ImplausibleReconstruction, match="implausible"):
        reconstruct_curvature(rings, distance_mm=40.0, focal_px=3000.0,
                              ring_object_radii_mm=obj)


def test_uncalibrated_path_is_not_gated():
    """The placeholder scale is not metrically valid, so its 'powers' (here
    4300/30 ~ 143) must not trip the physiological gate."""
    rings = {'angles_deg': np.arange(0, 360, 2.0),
             'radii': np.full((180, 4), 30.0), 'n_rings': 4}
    out = reconstruct_curvature(rings)
    assert out['calibration_state'] == 'uncalibrated'
