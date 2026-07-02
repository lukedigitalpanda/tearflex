import pytest
from PIL import ExifTags, Image, TiffImagePlugin
from apps.analysis.topography.exif import (
    focal_35mm_from_file, focal_px_from_35mm, FULL_FRAME_DIAGONAL_MM)

F35_TAG = int(ExifTags.Base.FocalLengthIn35mmFilm)  # 41989


def _jpeg(tmp_path, name, exif=None):
    path = tmp_path / name
    img = Image.new('RGB', (32, 32))
    if exif is None:
        img.save(path, format='JPEG')
    else:
        img.save(path, format='JPEG', exif=exif)
    return str(path)


def test_focal_px_from_35mm_arithmetic():
    # sqrt(800^2 + 800^2) * 26 / 43.2666
    assert focal_px_from_35mm(26, 800, 800) == pytest.approx(679.8695, abs=1e-3)


def test_focal_px_from_35mm_is_orientation_invariant():
    """The diagonal convention gives the same focal whether the stored image
    is landscape or portrait — EXIF orientation cannot skew it."""
    assert focal_px_from_35mm(26, 1600, 1200) == pytest.approx(
        focal_px_from_35mm(26, 1200, 1600))


def test_focal_px_from_35mm_rejects_bad_inputs():
    assert focal_px_from_35mm(None, 800, 800) is None
    assert focal_px_from_35mm(26, None, 800) is None
    assert focal_px_from_35mm(26, 800, None) is None
    assert focal_px_from_35mm(0, 800, 800) is None
    assert focal_px_from_35mm(-26, 800, 800) is None
    assert focal_px_from_35mm(26, 0, 800) is None
    assert focal_px_from_35mm(26, 800, -1) is None


def test_focal_35mm_from_file_reads_exif_sub_ifd(tmp_path):
    """Standard placement: the tag lives in the Exif sub-IFD (as real device
    files write it)."""
    exif = Image.Exif()
    exif[0x8769] = {F35_TAG: 42}  # dict assigned to the ExifIFD pointer
    path = _jpeg(tmp_path, 'sub.jpg', exif)
    assert focal_35mm_from_file(path) == pytest.approx(42.0)


def test_focal_35mm_from_file_reads_top_level_fallback(tmp_path):
    """Lenient fallback: some writers put the tag in the top-level IFD."""
    exif = Image.Exif()
    exif[F35_TAG] = 42
    path = _jpeg(tmp_path, 'top.jpg', exif)
    assert focal_35mm_from_file(path) == pytest.approx(42.0)


def test_focal_35mm_from_file_no_exif(tmp_path):
    assert focal_35mm_from_file(_jpeg(tmp_path, 'plain.jpg')) is None


def test_focal_35mm_from_file_missing_file_returns_none(tmp_path):
    assert focal_35mm_from_file(str(tmp_path / 'nope.jpg')) is None


def test_focal_35mm_from_file_zero_tag_returns_none(tmp_path):
    exif = Image.Exif()
    exif[0x8769] = {F35_TAG: 0}
    path = _jpeg(tmp_path, 'zero.jpg', exif)
    assert focal_35mm_from_file(path) is None


def test_focal_35mm_from_file_zero_denominator_rational_returns_none(tmp_path):
    """Some EXIF writers encode 'not available' as a rational with denominator
    0; float() on that raises ZeroDivisionError — must yield None, not crash."""
    exif = Image.Exif()
    exif[0x8769] = {F35_TAG: TiffImagePlugin.IFDRational(26, 0)}
    path = _jpeg(tmp_path, 'zeroden.jpg', exif)
    assert focal_35mm_from_file(path) is None
