import pytest
from apps.analysis.topography.disc import default_cone_profile


def test_default_cone_profile_shape_and_bounds():
    radii, depths = default_cone_profile()
    assert len(radii) == len(depths) == 10
    # innermost-first: strictly increasing radius and depth
    assert radii == sorted(radii)
    assert depths == sorted(depths)
    # rings are inset from the rims by the leading/trailing gap
    assert 7.5 < radii[0] < radii[-1] < 35.0
    assert 0.0 < depths[0] < depths[-1] < 30.0


def test_default_cone_profile_matches_geometry():
    radii, depths = default_cone_profile()
    # ring k centred at t_k = (2k + 1.5) / 21; radius = 7.5 + 27.5 t, depth = 30 t
    assert radii[0] == pytest.approx(7.5 + 27.5 * (1.5 / 21), abs=1e-6)
    assert depths[0] == pytest.approx(30.0 * (1.5 / 21), abs=1e-6)
    assert radii[9] == pytest.approx(7.5 + 27.5 * (19.5 / 21), abs=1e-6)
    assert depths[9] == pytest.approx(30.0 * (19.5 / 21), abs=1e-6)


def test_cone_profile_radius_and_depth_share_fraction():
    # linear cone: radius and depth advance in lockstep (same fractional position)
    radii, depths = default_cone_profile()
    fr = [(r - 7.5) / (35.0 - 7.5) for r in radii]
    fz = [z / 30.0 for z in depths]
    assert fr == pytest.approx(fz, abs=1e-9)
