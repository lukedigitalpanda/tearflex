import numpy as np
from apps.analysis.tests.synthetic_fluorescein import make_dyed_film_clip, make_staining_image


def test_dyed_film_clip_shape_and_breakup_progression():
    frames = make_dyed_film_clip(n_frames=30, size=200, break_at=15, n_holes=6)
    assert len(frames) == 30
    assert frames[0].shape == (200, 200, 3)
    assert frames[0].dtype == np.uint8
    # An early (intact) frame is brighter overall than a late (broken-up) frame.
    assert frames[2].mean() > frames[29].mean()


def test_staining_image_more_spots_more_bright_area():
    none = make_staining_image(n_spots=0, size=200)
    many = make_staining_image(n_spots=12, size=200)
    bright = lambda im: int((im.max(axis=2) > 180).sum())
    assert bright(many) > bright(none)
