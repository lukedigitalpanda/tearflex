# Topography: focal-length / still-resolution mismatch guard

**Date:** 2026-07-01
**Status:** Design — approved (in-conversation), pending implementation
**Branch:** `feat/topography-focal-resolution-guard`

## Problem

The calibrated reconstruction uses a mobile-provided `camera_focal_px` to convert
ring pixel radii into absolute dioptres. The maths is invariant to a *uniform* resize
only when `focal_px` and the ring radii are expressed in the **same pixels** — i.e.
`focal_px` must match the resolution of the still that `extract_rings` actually runs
on. Today the backend trusts mobile to guarantee that match. If a client measures
`focal_px` at capture resolution (say 4K) but uploads a downscaled still, the
reconstruction runs to completion and produces a *wrong-but-plausible* corneal power
that is still badged `default` — the single path by which the honesty badge can
overstate **without** failing.

## Goal

Make the mismatch structurally impossible for uniform scaling, and refuse to badge
`default` in the one case a uniform rescale cannot fix (cropping). Enabler: the
backend already loads the still (`cv2.imread`), so it knows the exact pixel
dimensions of the image it is about to measure — it can derive `focal_px` for that
image instead of trusting a bare number.

## Decisions

- **Contract change:** mobile sends `capture_width_px` and `capture_height_px`
  alongside `camera_focal_px` (the resolution `focal_px` was measured at). The
  backend rescales `focal_px` to the analysed still's dimensions.
- **Calibrated path now REQUIRES the capture resolution.** Without it the backend
  cannot prove the intrinsic matches the still, so it falls back to uncalibrated.
  This tightens the previous "`camera_focal_px` alone → default" behaviour. No
  production regression: mobile does not send any of these fields yet.
- **Cropping is refused, not guessed.** A non-uniform scale (aspect-ratio change =
  crop/letterbox) shifts the field of view non-linearly, so a width-ratio rescale
  would be wrong → do not badge `default`; fall back to uncalibrated.
- **Rescale is kept even though stills are not expected to be downscaled.** A camera's
  intrinsic *reference dimensions* (what `focal_px` is defined against) are not
  guaranteed to equal the delivered still's dimensions even absent any resize — both
  iOS (`intrinsicMatrixReferenceDimensions`) and Android (pre-correction active array)
  define intrinsics against a reference frame that can differ from the photo output by
  a uniform scale. The rescale absorbs that exactly; a strict dims-must-match check
  would spuriously fall back to uncalibrated on valid captures. For a pipeline that
  never downscales, the rescale is simply a no-op (ratio ≈ 1.0).
- **Physiological-bounds backstop stays OUT of this slice.** Bounding reconstructed
  R/power (~5–12 mm / ~28–60 D) is a complementary sanity net tied to the existing
  "real-image ring hardening / outlier rejection" deferral — not this guard.

## Design

### Pure reconciliation function

New module `apps/analysis/topography/intrinsics.py` (DB-free, unit-testable):

```python
ASPECT_TOLERANCE = 0.01  # 1% relative — tolerates rounding, rejects real crops


def effective_focal_px(camera_focal_px, capture_width_px, capture_height_px,
                       still_width_px, still_height_px):
    """Focal length in pixels rescaled to the analysed still, or None if it cannot be
    trusted. None means: do NOT run the calibrated path (fall back to uncalibrated).

    Returns None when any input is missing/non-positive, or when the still's aspect
    ratio differs from the capture's (a crop, which a uniform-scale rescale cannot
    correct). Otherwise returns camera_focal_px * (still_width_px / capture_width_px)
    — exact under uniform scaling, since ring radii scale by the same factor.
    """
    if not camera_focal_px or camera_focal_px <= 0:
        return None
    if not capture_width_px or not capture_height_px:
        return None
    if still_width_px <= 0 or still_height_px <= 0:
        return None
    capture_aspect = capture_width_px / capture_height_px
    still_aspect = still_width_px / still_height_px
    if abs(still_aspect - capture_aspect) > ASPECT_TOLERANCE * capture_aspect:
        return None
    return camera_focal_px * (still_width_px / capture_width_px)
```

Width ratio is used because, under a uniform scale, width and height ratios are equal
(the aspect check guarantees it).

### Data contract

`TopographyScan` gains:

```python
capture_width_px = models.PositiveIntegerField(null=True, blank=True)
capture_height_px = models.PositiveIntegerField(null=True, blank=True)
# Pixel resolution camera_focal_px was measured at (mobile-provided). The backend
# rescales focal_px to the analysed still; a mismatch/crop falls back to uncalibrated.
```

Both added to `TopographyScanCreateSerializer` (write) and `TopographyScanSerializer`
(read). Serializer rejects a provided value `<= 0` with HTTP 400 (mirrors the existing
`camera_focal_px` validator). One additive migration; existing scans keep `NULL`.

### `tasks.py` wiring

Replace the `if scan.camera_focal_px:` guard with a resolution-derived focal length:

```python
        still_h, still_w = best_image.shape[:2]
        focal_px = effective_focal_px(
            scan.camera_focal_px, scan.capture_width_px, scan.capture_height_px,
            still_w, still_h)
        if focal_px:
            radii_mm, depths_mm = default_cone_profile()
            out = analyse_topography_frame(
                best_image,
                distance_mm=CONE_NOMINAL_WORKING_DISTANCE_MM,
                focal_px=focal_px,
                ring_object_radii_mm=radii_mm,
                ring_object_depths_mm=depths_mm,
                calibration_state='default',
            )
        else:
            out = analyse_topography_frame(best_image)  # uncalibrated placeholder
```

The `calibration_state` reconciliation from the previous slice (result + scan sourced
from `out['raw_output']['calibration_state']`) is unchanged.

## Error handling

- Missing `camera_focal_px` OR missing capture resolution → `effective_focal_px`
  returns `None` → uncalibrated path (no regression; honest).
- Aspect mismatch (crop) → `None` → uncalibrated path.
- Serializer rejects non-positive `capture_width_px` / `capture_height_px` (HTTP 400).
- A degenerate frame still raises inside reconstruction → existing `except` marks the
  scan `failed` — unchanged.

## Testing (backend TDD)

**Unit (`test_intrinsics.py`, DB-free):**
1. Uniform downscale: `effective_focal_px(2200, 1600, 1600, 800, 800) == 1100`.
2. Same resolution: returns `camera_focal_px` unchanged.
3. Aspect mismatch (crop): `effective_focal_px(1100, 1600, 1200, 800, 800) is None`.
4. Missing resolution / non-positive / missing focal → `None`.

**Task (`test_tasks.py`, DB):**
5. Update the existing calibrated test to also set `capture_width_px=800,
   capture_height_px=800` (matching the `size=800` synthetic still) → still `default`.
6. Downscaled: scan `camera_focal_px=2200, capture=1600×1600`, still rendered at the
   *effective* focal `1100` and `size=800` → recovered `central_k` near truth,
   `default`. Proves the rescale is correct end-to-end.
7. Aspect mismatch: scan `capture=1600×1200`, `size=800` still → `uncalibrated`.
8. `camera_focal_px` present but no capture resolution → `uncalibrated`.

**API (`test_api.py`):** `capture_width_px`/`capture_height_px` round-trip on create
and read; non-positive values rejected with 400.

DB-backed tests run under `USE_SQLITE_TESTS=1`.

## Migration

One additive migration adding the two nullable `PositiveIntegerField`s. No backfill.
