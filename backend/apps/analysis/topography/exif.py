"""EXIF-derived camera focal length for topography stills.

When a scan carries no mobile-declared intrinsic, the analysed still's own
EXIF FocalLengthIn35mmFilm tag gives a screening-grade pixel focal length:
35mm equivalence encodes field of view, so the pixel focal follows from the
image diagonal. Correct under uniform downscaling with EXIF intact; wrong
under crop (accepted residual risk, bounded by the plausibility backstop).
The tag is an integer, so OEM rounding sets a ~1-2% accuracy floor.
"""
import math
import warnings

from PIL import ExifTags, Image

# Full-frame 35mm film diagonal, sqrt(36^2 + 24^2) mm. PROVISIONAL convention
# choice (CIPA diagonal equivalence, what OEMs write; also orientation-
# invariant): a writer using horizontal-36mm equivalence would differ ~4% on
# 4:3 — validate against real captures before trusting absolute dioptres.
FULL_FRAME_DIAGONAL_MM = 43.2666

# PROVISIONAL usability band for the 35mm-equivalent tag (unconfirmed): phone
# cameras span roughly 13mm (ultra-wide) to ~130mm (tele) equivalents, so
# values outside this generous band are treated as unusable metadata, not
# measurements. Revise here when confirmed against real captures.
F35_MIN_MM = 10.0
F35_MAX_MM = 200.0


def focal_35mm_from_file(path) -> float | None:
    """Read FocalLengthIn35mmFilm from an image file, or None.

    Checks the Exif sub-IFD first (the tag's standard placement), then the
    top-level IFD (lenient — some writers misplace it). Returns None for
    unreadable files, missing tags, non-finite values, or values outside the
    PROVISIONAL usability band. Never raises. Corrupt or oddly-encoded EXIF
    is an expected, silent case — Pillow's parser warnings are suppressed.
    """
    try:
        with warnings.catch_warnings():
            # Pillow warns while parsing corrupt EXIF; absent/broken metadata
            # is an expected, silent case here (and never-raises must hold
            # even under an escalated warnings filter).
            warnings.simplefilter('ignore')
            with Image.open(path) as img:
                exif = img.getexif()
            value = exif.get_ifd(ExifTags.IFD.Exif).get(ExifTags.Base.FocalLengthIn35mmFilm)
            if value is None:
                value = exif.get(ExifTags.Base.FocalLengthIn35mmFilm)
    except Exception:
        return None
    try:
        value = float(value)
    except (TypeError, ValueError, ZeroDivisionError):
        return None
    if not math.isfinite(value):
        return None
    return value if F35_MIN_MM <= value <= F35_MAX_MM else None


def focal_px_from_35mm(f35, width_px, height_px) -> float | None:
    """Pixel focal length from a 35mm-equivalent focal at the given dims."""
    if f35 is None or width_px is None or height_px is None:
        return None
    if f35 <= 0 or width_px <= 0 or height_px <= 0:
        return None
    diagonal_px = (width_px ** 2 + height_px ** 2) ** 0.5
    return diagonal_px * float(f35) / FULL_FRAME_DIAGONAL_MM
