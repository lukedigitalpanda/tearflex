import numpy as np
from apps.analysis.tests.synthetic_fluorescein import make_dyed_film_clip, make_staining_image
from apps.analysis.fluorescein import detect_tearfilm_roi, breakup_metric


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


def _roi(frame):
    x, y, w, h = detect_tearfilm_roi(frame)
    return frame[y:y + h, x:x + w]


def test_detect_tearfilm_roi_covers_disc():
    frames = make_dyed_film_clip(n_frames=4, size=200, break_at=99)  # no break-up
    x, y, w, h = detect_tearfilm_roi(frames[0])
    # ROI should be a sizeable central box around the disc, not the whole frame nor empty.
    assert 40 < w < 200 and 40 < h < 200


def test_breakup_metric_rises_after_breakup():
    frames = make_dyed_film_clip(n_frames=30, size=200, break_at=15, n_holes=6)
    intact = breakup_metric(_roi(frames[2]))
    broken = breakup_metric(_roi(frames[29]))
    assert broken > intact + 0.05
