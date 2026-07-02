# Topography EXIF-Derived Focal (Slice 2a) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a topography scan has no mobile-declared `camera_focal_px`, derive the pixel focal length from the analysed still's EXIF `FocalLengthIn35mmFilm` so the calibrated path runs (badged `'default'`, provenance recorded); otherwise behaviour is unchanged.

**Architecture:** One new pure module `apps/analysis/topography/exif.py` (two functions: read the tag from a file; convert f35→f_px via the diagonal CIPA convention), plus a small wiring block in `apps/topography/tasks.py` implementing declared > EXIF > none precedence and a `raw_output['focal_source']` provenance key. No model/serializer/API changes, no migration.

**Tech Stack:** Django 5 / Celery, Pillow 10.4 (already a dependency), pytest (`USE_SQLITE_TESTS=1`).

**Spec:** `docs/superpowers/specs/2026-07-02-topography-exif-focal-design.md` — read first; its "Decisions" section governs.

## Global Constraints

- Working directory for all commands: `/opt/tearflex/backend`. Run tests as `USE_SQLITE_TESTS=1 python3 -m pytest …`.
- Baseline before Task 1: **237 passed**. Task 1 ends at **245**, Task 2 at **249**.
- Precedence is exactly: declared (`effective_focal_px` reconciled) > EXIF-derived > none. The declared path and the uncalibrated path must be byte-for-byte unchanged in behaviour.
- `FULL_FRAME_DIAGONAL_MM = 43.2666` carries a PROVISIONAL-convention comment (CIPA diagonal equivalence; ~4% vs horizontal convention — validate on real captures).
- `raw_output['focal_source']` is `'declared'` or `'exif'`, present ONLY when a focal was supplied to the pipeline; it records what was tried, so it remains on a backstop downgrade (alongside `downgrade_reason`).
- EXIF mechanics (machine-verified on this environment's Pillow 10.4.0):
  - Write the tag into the Exif sub-IFD in tests via `exif[0x8769] = {41989: value}` (dict assigned to the ExifIFD pointer) — mutating `exif.get_ifd(...)` does NOT serialize on this Pillow.
  - Top-level write is `exif[ExifTags.Base.FocalLengthIn35mmFilm] = value`.
  - `int(ExifTags.Base.FocalLengthIn35mmFilm) == 41989`; `ExifTags.IFD.Exif` exists.
- Verified arithmetic for expected values: `f_px = sqrt(w²+h²)·f35/43.2666`; f35=26 @ 800×800 → 679.8695; f35=42 → 1098.2507 (0.17% from the cone test image's true 1100 → pipeline error measured 0.071 D at JPEG q95, tolerance 2.0 D); f35=84 → 2196.5015 (≈2× true → backstop downgrade, measured message "power 101.3 D outside [25.0, 84.4] D").
- No new dependencies, no model changes, no migrations. `apps/topography/serializers.py`, `models.py`, `views.py` untouched.
- Commit after every task with the exact message given; end every commit message with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

---

### Task 1: EXIF focal module (`apps/analysis/topography/exif.py`)

**Files:**
- Create: `apps/analysis/topography/exif.py`
- Test: `apps/analysis/topography/tests/test_exif.py` (new file)

**Interfaces:**
- Consumes: Pillow (`PIL.Image`, `PIL.ExifTags`) only. No project imports.
- Produces: `focal_35mm_from_file(path) -> float | None` and `focal_px_from_35mm(f35, width_px, height_px) -> float | None`, plus `FULL_FRAME_DIAGONAL_MM = 43.2666`. Task 2 imports both functions from `apps.analysis.topography.exif`.

- [ ] **Step 1: Write the failing tests**

Create `apps/analysis/topography/tests/test_exif.py` with exactly:

```python
import pytest
from PIL import ExifTags, Image
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
```

- [ ] **Step 2: Run the new tests to verify they fail**

Run: `USE_SQLITE_TESTS=1 python3 -m pytest apps/analysis/topography/tests/test_exif.py -v`
Expected: **ImportError** — `No module named 'apps.analysis.topography.exif'` (all collected tests error).

- [ ] **Step 3: Implement the module**

Create `apps/analysis/topography/exif.py` with exactly:

```python
"""EXIF-derived camera focal length for topography stills.

When a scan carries no mobile-declared intrinsic, the analysed still's own
EXIF FocalLengthIn35mmFilm tag gives a screening-grade pixel focal length:
35mm equivalence encodes field of view, so the pixel focal follows from the
image diagonal. Correct under uniform downscaling with EXIF intact; wrong
under crop (accepted residual risk, bounded by the plausibility backstop).
The tag is an integer, so OEM rounding sets a ~1-2% accuracy floor.
"""
from PIL import ExifTags, Image

# Full-frame 35mm film diagonal, sqrt(36^2 + 24^2) mm. PROVISIONAL convention
# choice (CIPA diagonal equivalence, what OEMs write; also orientation-
# invariant): a writer using horizontal-36mm equivalence would differ ~4% on
# 4:3 — validate against real captures before trusting absolute dioptres.
FULL_FRAME_DIAGONAL_MM = 43.2666


def focal_35mm_from_file(path) -> float | None:
    """Read FocalLengthIn35mmFilm from an image file, or None.

    Checks the Exif sub-IFD first (the tag's standard placement), then the
    top-level IFD (lenient — some writers misplace it). Returns None for
    unreadable files, missing tags, or non-positive values. Never raises.
    """
    try:
        with Image.open(path) as img:
            exif = img.getexif()
    except Exception:
        return None
    value = exif.get_ifd(ExifTags.IFD.Exif).get(ExifTags.Base.FocalLengthIn35mmFilm)
    if value is None:
        value = exif.get(ExifTags.Base.FocalLengthIn35mmFilm)
    try:
        value = float(value)
    except (TypeError, ValueError):
        return None
    return value if value > 0 else None


def focal_px_from_35mm(f35, width_px, height_px) -> float | None:
    """Pixel focal length from a 35mm-equivalent focal at the given dims."""
    if f35 is None or width_px is None or height_px is None:
        return None
    if f35 <= 0 or width_px <= 0 or height_px <= 0:
        return None
    diagonal_px = (width_px ** 2 + height_px ** 2) ** 0.5
    return diagonal_px * float(f35) / FULL_FRAME_DIAGONAL_MM
```

- [ ] **Step 4: Run the new tests to verify they pass**

Run: `USE_SQLITE_TESTS=1 python3 -m pytest apps/analysis/topography/tests/test_exif.py -v`
Expected: **8 passed**.

- [ ] **Step 5: Run the full suite**

Run: `USE_SQLITE_TESTS=1 python3 -m pytest -q`
Expected: **245 passed** (237 baseline + 8).

- [ ] **Step 6: Commit**

```bash
git add apps/analysis/topography/exif.py apps/analysis/topography/tests/test_exif.py
git commit -m "feat(topography): EXIF-derived focal length module

FocalLengthIn35mmFilm (Exif sub-IFD, top-level fallback) -> pixel focal via
the diagonal CIPA convention (PROVISIONAL; orientation-invariant). Pure,
DB-free; never raises — unusable EXIF yields None.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Wire EXIF fallback into `process_topography_scan`

**Files:**
- Modify: `apps/topography/tasks.py` (import + one wiring block + provenance key)
- Test: `apps/topography/tests/test_tasks.py` (append helper + 4 tests)

**Interfaces:**
- Consumes: Task 1's `focal_35mm_from_file(path)` / `focal_px_from_35mm(f35, w, h)`; existing `effective_focal_px`, `analyse_topography_frame`, test helpers `AssessmentFactory` and `make_cone_ring_image`/`default_cone_profile`/`CONE_NOMINAL_WORKING_DISTANCE_MM` (already imported in `test_tasks.py`).
- Produces: `raw_output['focal_source']` contract (`'declared'`/`'exif'`/absent) — the acceptance surface for slices 2b/2c.

- [ ] **Step 1: Write the failing tests**

In `apps/topography/tests/test_tasks.py`, extend the imports at the top of the file: add

```python
import io

from PIL import ExifTags, Image as PILImage
```

(keep the existing imports unchanged), then append at the end of the file:

```python
def _cone_jpg(name, focal_px, f35=None):
    """A synthetic Placido-cone still as JPEG, optionally carrying an EXIF
    FocalLengthIn35mmFilm tag (written into the Exif sub-IFD, the tag's real
    placement) — exercises the EXIF-derived focal path."""
    radii, depths = default_cone_profile()
    img, gt = make_cone_ring_image(7.8, CONE_NOMINAL_WORKING_DISTANCE_MM, focal_px,
                                   radii, depths, size=800)
    pil = PILImage.fromarray(cv2.cvtColor(img, cv2.COLOR_BGR2RGB))
    buf = io.BytesIO()
    if f35 is None:
        pil.save(buf, format='JPEG', quality=95)
    else:
        exif = PILImage.Exif()
        exif[0x8769] = {int(ExifTags.Base.FocalLengthIn35mmFilm): f35}
        pil.save(buf, format='JPEG', quality=95, exif=exif)
    return SimpleUploadedFile(name, buf.getvalue(), content_type='image/jpeg'), gt


@pytest.mark.django_db
def test_process_scan_calibrated_from_exif_focal():
    """No declared focal, but the still's EXIF f35=42 gives f_px ~1098 (0.17%
    from the true 1100) -> the calibrated path runs with provenance 'exif'."""
    scan = TopographyScan.objects.create(assessment=AssessmentFactory(), status='uploaded')
    jpg, gt = _cone_jpg('cone.jpg', 1100.0, f35=42)
    TopographyStill.objects.create(scan=scan, image=jpg, index=0)

    process_topography_scan(scan.id)

    scan.refresh_from_db()
    assert scan.status == 'analysed'
    assert scan.result.calibration_state == 'default'
    assert scan.calibration_state == 'default'
    assert scan.result.raw_output['focal_source'] == 'exif'
    assert abs(scan.result.central_k - gt['expected_power']) < 2.0


@pytest.mark.django_db
def test_process_scan_declared_focal_beats_exif():
    """Precedence: a reconciled declared focal wins; junk EXIF is ignored."""
    scan = TopographyScan.objects.create(
        assessment=AssessmentFactory(), status='uploaded',
        camera_focal_px=1100.0, capture_width_px=800, capture_height_px=800)
    jpg, gt = _cone_jpg('cone.jpg', 1100.0, f35=99)  # EXIF would give ~2589 px
    TopographyStill.objects.create(scan=scan, image=jpg, index=0)

    process_topography_scan(scan.id)

    scan.refresh_from_db()
    assert scan.result.calibration_state == 'default'
    assert scan.result.raw_output['focal_source'] == 'declared'
    assert abs(scan.result.central_k - gt['expected_power']) < 2.0


@pytest.mark.django_db
def test_process_scan_exif_focal_downgraded_by_backstop():
    """EXIF f35=84 (~2x the truth) reconstructs implausibly -> the backstop
    downgrades; provenance still records that an EXIF focal was tried."""
    scan = TopographyScan.objects.create(assessment=AssessmentFactory(), status='uploaded')
    jpg, _ = _cone_jpg('cone.jpg', 1100.0, f35=84)
    TopographyStill.objects.create(scan=scan, image=jpg, index=0)

    process_topography_scan(scan.id)

    scan.refresh_from_db()
    assert scan.status == 'analysed'
    assert scan.result.calibration_state == 'uncalibrated'
    assert scan.result.raw_output['focal_source'] == 'exif'
    assert 'implausible' in scan.result.raw_output['downgrade_reason']


@pytest.mark.django_db
def test_process_scan_no_declared_no_exif_stays_uncalibrated():
    scan = TopographyScan.objects.create(assessment=AssessmentFactory(), status='uploaded')
    jpg, _ = _cone_jpg('cone.jpg', 1100.0)  # no EXIF written
    TopographyStill.objects.create(scan=scan, image=jpg, index=0)

    process_topography_scan(scan.id)

    scan.refresh_from_db()
    assert scan.result.calibration_state == 'uncalibrated'
    assert 'focal_source' not in scan.result.raw_output
```

- [ ] **Step 2: Run the new tests to verify they fail**

Run: `USE_SQLITE_TESTS=1 python3 -m pytest apps/topography/tests/test_tasks.py -v -k "exif or no_declared"`
Expected: `test_process_scan_calibrated_from_exif_focal` and `test_process_scan_exif_focal_downgraded_by_backstop` **FAIL** (no EXIF fallback exists — the first ends `'uncalibrated'` and has no `focal_source`; the second has no `focal_source`). `test_process_scan_declared_focal_beats_exif` also FAILS (no `focal_source` key yet). `test_process_scan_no_declared_no_exif_stays_uncalibrated` PASSES (asserts current behaviour — the regression guard).

- [ ] **Step 3: Implement the wiring**

In `apps/topography/tasks.py`:

Add to the imports (after the existing `from apps.analysis.topography.intrinsics import effective_focal_px` line):

```python
from apps.analysis.topography.exif import focal_35mm_from_file, focal_px_from_35mm
```

Replace this block:

```python
        still_h, still_w = best_image.shape[:2]
        focal_px = effective_focal_px(
            scan.camera_focal_px, scan.capture_width_px, scan.capture_height_px,
            still_w, still_h)
        if focal_px is not None:
```

with:

```python
        still_h, still_w = best_image.shape[:2]
        focal_px = effective_focal_px(
            scan.camera_focal_px, scan.capture_width_px, scan.capture_height_px,
            still_w, still_h)
        focal_source = 'declared' if focal_px is not None else None
        if focal_px is None:
            # No trustworthy declared intrinsic: fall back to the analysed
            # still's own EXIF (precedence: declared > EXIF > none). The
            # derived focal is expressed at the still's own dims, so no
            # rescale reconciliation is needed.
            f35 = focal_35mm_from_file(best_still.image.path)
            focal_px = focal_px_from_35mm(f35, still_w, still_h)
            focal_source = 'exif' if focal_px is not None else None
        if focal_px is not None:
```

Then, immediately after the `else:` branch's `out = analyse_topography_frame(best_image)  # uncalibrated placeholder` line (i.e. after the if/else that produces `out`, before the `result_state = ...` comment block), insert:

```python
        if focal_source is not None:
            # Provenance of the focal the pipeline was given. Deliberately kept
            # on a backstop downgrade (next to downgrade_reason): it records
            # what was tried, not what succeeded.
            out['raw_output']['focal_source'] = focal_source
```

- [ ] **Step 4: Run the new tests to verify they pass**

Run: `USE_SQLITE_TESTS=1 python3 -m pytest apps/topography/tests/test_tasks.py -v`
Expected: all pass (9 existing + 4 new = 13).

- [ ] **Step 5: Run the full suite**

Run: `USE_SQLITE_TESTS=1 python3 -m pytest -q`
Expected: **249 passed**.

- [ ] **Step 6: Commit**

```bash
git add apps/topography/tasks.py apps/topography/tests/test_tasks.py
git commit -m "feat(topography): EXIF focal fallback activates calibration (slice 2a)

process_topography_scan now derives f_px from the analysed still's
FocalLengthIn35mmFilm when no declared intrinsic reconciles (declared >
EXIF > none) and records raw_output.focal_source provenance. iOS app
captures calibrate with zero client changes; future upload paths (web 2b,
mobile 2c) are calibrated-capable on day one.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```
