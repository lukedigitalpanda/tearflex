from apps.analysis.topography.intrinsics import aspect_mismatch, effective_focal_px


def test_uniform_downscale_rescales():
    # focal measured at 1600px capture; still delivered at 800px -> half.
    assert effective_focal_px(2200, 1600, 1600, 800, 800) == 1100


def test_same_resolution_returns_focal_unchanged():
    assert effective_focal_px(1100, 800, 800, 800, 800) == 1100


def test_uniform_scale_non_square_rescales():
    # 4:3 capture, 4:3 still at half scale -> half focal.
    assert effective_focal_px(2000, 1600, 1200, 800, 600) == 1000


def test_aspect_mismatch_returns_none():
    # capture 4:3, still 1:1 -> a crop, not a uniform scale.
    assert effective_focal_px(1100, 1600, 1200, 800, 800) is None


def test_missing_capture_resolution_returns_none():
    assert effective_focal_px(1100, None, None, 800, 800) is None
    assert effective_focal_px(1100, 1600, None, 800, 800) is None


def test_missing_or_nonpositive_focal_returns_none():
    assert effective_focal_px(None, 1600, 1600, 800, 800) is None
    assert effective_focal_px(0, 1600, 1600, 800, 800) is None
    assert effective_focal_px(-5, 1600, 1600, 800, 800) is None


def test_nonpositive_still_dims_returns_none():
    assert effective_focal_px(1100, 1600, 1600, 0, 800) is None
    assert effective_focal_px(1100, 1600, 1600, 800, -1) is None


def test_negative_capture_dims_returns_none():
    assert effective_focal_px(1100, -800, 600, 800, 600) is None
    assert effective_focal_px(1100, 800, -600, 800, 600) is None


def test_aspect_mismatch_detects_crop():
    assert aspect_mismatch(1600, 1200, 800, 800) is True


def test_aspect_mismatch_false_when_dims_missing_or_invalid():
    """Absence of evidence is not a detection — missing/invalid dims must not
    veto other focal sources."""
    assert aspect_mismatch(None, None, 800, 800) is False
    assert aspect_mismatch(1600, None, 800, 800) is False
    assert aspect_mismatch(0, 1200, 800, 800) is False
    assert aspect_mismatch(1600, 1200, 0, 800) is False


def test_aspect_mismatch_false_on_uniform_scale():
    assert aspect_mismatch(1600, 1200, 800, 600) is False
