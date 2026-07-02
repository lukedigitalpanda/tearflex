"""Reconcile a mobile-reported camera focal length to the still actually analysed.

`camera_focal_px` is measured against the camera's intrinsic reference dimensions,
which may differ from the delivered still's dimensions by a uniform scale (or, if the
image was cropped, by a non-uniform change we must not trust). The backend reads the
still's real dimensions and rescales; a crop or missing data yields None, meaning the
calibrated path must not run.
"""

ASPECT_TOLERANCE = 0.01  # 1% relative — tolerates rounding, rejects real crops


def aspect_mismatch(capture_width_px, capture_height_px,
                    still_width_px, still_height_px) -> bool:
    """True only when a crop is POSITIVELY detected: all four dims present and
    positive, and the still's aspect ratio differs from the declared capture's
    beyond ASPECT_TOLERANCE. Missing or invalid dims are "not detected" (False)
    — absence of evidence must not veto other focal sources.
    """
    if not capture_width_px or not capture_height_px \
            or capture_width_px <= 0 or capture_height_px <= 0:
        return False
    if not still_width_px or not still_height_px \
            or still_width_px <= 0 or still_height_px <= 0:
        return False
    capture_aspect = capture_width_px / capture_height_px
    still_aspect = still_width_px / still_height_px
    return abs(still_aspect - capture_aspect) > ASPECT_TOLERANCE * capture_aspect


def effective_focal_px(camera_focal_px, capture_width_px, capture_height_px,
                       still_width_px, still_height_px):
    """Focal length in pixels rescaled to the analysed still, or None if untrusted.

    None means: do NOT run the calibrated path (fall back to uncalibrated). Returned
    when any input is missing/non-positive, or when the still's aspect ratio differs
    from the capture's (a crop). Otherwise returns
    camera_focal_px * (still_width_px / capture_width_px) — exact under uniform scaling.
    """
    if not camera_focal_px or camera_focal_px <= 0:
        return None
    if not capture_width_px or not capture_height_px \
            or capture_width_px <= 0 or capture_height_px <= 0:
        return None
    if still_width_px <= 0 or still_height_px <= 0:
        return None
    if aspect_mismatch(capture_width_px, capture_height_px,
                       still_width_px, still_height_px):
        return None
    return camera_focal_px * (still_width_px / capture_width_px)
