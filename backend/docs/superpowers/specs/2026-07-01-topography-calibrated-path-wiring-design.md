# Topography: wire the calibrated reconstruction path into production

**Date:** 2026-07-01
**Status:** Design — approved, pending spec review
**Branch:** `feat/topography-calibrated-wiring`

## Problem

The distance-aware catadioptric reconstruction (`optics.py` + the cone-aware
`reconstruct.py` / `pipeline.py`) is implemented and unit-tested, but production
never runs it. `apps/topography/tasks.py` calls
`analyse_topography_frame(best_image)` with no geometry, so every scan takes the
uncalibrated placeholder-scale path and is badged `calibration_state='uncalibrated'`.

To run the real reconstruction, the pipeline needs three inputs per capture:
`focal_px` (camera intrinsic), the working distance, and the ring geometry. Today
none of them reach `tasks.py`.

## Decisions (from brainstorming)

- **Working distance is nominally fixed, slightly variable.** The 30 mm cone braces
  against the face at a repeatable spot, so we treat the camera-to-cornea distance as
  a per-attachment nominal constant now, and defer removing the residual human-error
  wobble to a later refinement.
- **`focal_px` comes from the mobile device.** iOS/Android camera APIs expose focal
  length + sensor size; the intrinsic varies device-to-device, so per-capture
  mobile-provided is the accurate source (chosen over a per-model table or
  reference-sphere calibration for this slice).
- **Ring geometry is the `disc.py` default cone profile** — provisional until the CAD
  file / reference-sphere calibration supersede it.

## Scope

**In scope (backend only):**
1. New nullable field `TopographyScan.camera_focal_px`, accepted on scan create.
2. `tasks.py` runs the cone-aware catadioptric path when `camera_focal_px` is present,
   using the nominal distance + default cone profile; otherwise the existing
   uncalibrated path, unchanged.
3. Honesty reconciliation: the stored `calibration_state` reflects what the
   reconstruction actually did, not the scan's input value.
4. A provisional `CONE_NOMINAL_WORKING_DISTANCE_MM` constant in `disc.py`.

**Explicitly deferred (not this slice):**
- Mobile capturing & sending `focal_px` (small follow-on; untestable without a device).
- The "minimise the wobble" tool — capture-time positioning aid or server-side
  iris-distance recovery (`distance.py` iris lever) — refines `default` → `calibrated`.
- `DeviceCalibration` lookup for per-device geometry / intrinsics (geometry stays the
  `disc.py` default; clean seam to swap later).
- Reference-sphere `calibrated` path.

## Design

### Data contract

`TopographyScan` gains:

```python
camera_focal_px = models.FloatField(null=True, blank=True)
# Horizontal focal length in pixels, matched to the uploaded still's resolution.
```

Rationale for a single float rather than a full intrinsics JSON: the reconstruction
only needs `focal_px`, and it is scale-invariant with the ring radii as long as both
are in the same pixel units. Because `tasks.py` analyses the uploaded still directly,
the contract is simply: **mobile sends `focal_px` matched to the still it uploads.**
`camera_focal_px` is added to `TopographyScanCreateSerializer` (write) and
`TopographyScanSerializer` (read). It stays out of `read_only_fields`.

### Nominal working distance

`disc.py` gains:

```python
# Provisional camera-to-cornea working distance (mm). The cone (30 mm deep) braces
# against the face, so the cornea sits just beyond the wide rim. Refine with the CAD
# file / reference-sphere calibration; a ~1 mm error is ~3 D, so absolute keratometry
# stays screening-grade until then.
CONE_NOMINAL_WORKING_DISTANCE_MM = 35.0
```

This is > the deepest ring (27.9 mm), so every per-ring object distance
`d0_j = distance - depth_j` stays positive.

### `tasks.py` control flow

Replace the single `analyse_topography_frame(best_image)` call with:

```python
if scan.camera_focal_px:
    radii_mm, depths_mm = default_cone_profile()
    out = analyse_topography_frame(
        best_image,
        distance_mm=CONE_NOMINAL_WORKING_DISTANCE_MM,
        focal_px=scan.camera_focal_px,
        ring_object_radii_mm=radii_mm,
        ring_object_depths_mm=depths_mm,
        calibration_state='default',
    )
else:
    out = analyse_topography_frame(best_image)  # uncalibrated placeholder, unchanged
```

`analyse_topography_frame` already returns `raw_output['calibration_state']`
(`'default'` on the catadioptric path, `'uncalibrated'` otherwise).

### Honesty reconciliation

Today (`tasks.py`):
```python
calibration_state=scan.calibration_state,   # ignores what the pipeline did
```
Change to source the label from the reconstruction and keep the scan consistent:
```python
result_state = out['raw_output']['calibration_state']
result = TopographyResult(..., calibration_state=result_state, ...)
...
scan.calibration_state = result_state
scan.save(update_fields=['status', 'calibration_state', 'updated_at'])
```
The badge can then never claim more than the maths delivered.

## Error handling

- No `camera_focal_px` → uncalibrated path (current behaviour; no regression).
- A malformed/degenerate frame in the catadioptric path raises `ValueError`
  (existing guards in `optics.py` / `reconstruct.py`); the task's existing
  `except Exception` marks the scan `failed` and retries — unchanged.
- `camera_focal_px <= 0` is treated as absent (falsy guard) → uncalibrated path.

## Testing (backend TDD)

1. **Task, calibrated:** seed a scan with `camera_focal_px` + synthetic cone stills
   (`make_cone_ring_image` at the nominal distance) → run `process_topography_scan`
   → assert `result.calibration_state == 'default'`, `scan.calibration_state == 'default'`,
   and recovered `central_k` within tolerance of the rendered truth.
2. **Task, uncalibrated:** scan without `camera_focal_px` → `result.calibration_state
   == 'uncalibrated'` (regression guard).
3. **Serializer:** `camera_focal_px` round-trips on create and is readable.

DB-backed tests run under `USE_SQLITE_TESTS=1` (project convention on this host).

## Migration

One additive migration for the nullable `camera_focal_px` field. No data backfill —
existing scans keep `NULL` and read as uncalibrated.
