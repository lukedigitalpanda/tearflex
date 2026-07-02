# Topography EXIF-Derived Focal (Slice 2a) — Design

**Date:** 2026-07-02
**Branch:** `feat/topography-exif-focal` (off master `0e31e26`)
**Status:** Design — awaiting user review.
**Sequence context:** user-ratified order 2a (this) → 2b (web topography image-upload UI) → 2c (mobile take-or-upload parity + declared intrinsics). Parity principle: every test is take-or-upload on mobile, upload-only on web, results visible everywhere.

## Goal

When a topography scan has **no mobile-declared `camera_focal_px`**, derive the focal
length in pixels from the analysed still's own EXIF (`FocalLengthIn35mmFilm`) so the
calibrated catadioptric path can run — badged `'default'` with a recorded provenance —
instead of falling to the uncalibrated placeholder. Zero client changes: this
immediately benefits iOS app captures (vision-camera stills carry the tag) and makes
every future upload path (web 2b, mobile-library 2c) calibrated-capable on day one.

## Decisions

1. **Analysis-time, not upload-time.** The derivation happens in
   `tasks.py::process_topography_scan`, reading EXIF from the **selected best still**
   (the image actually analysed) — dims are self-consistent by construction, re-runs
   re-derive, no API/serializer/model changes, and the declared fields keep their
   documented "mobile-provided" meaning. No migration.
2. **Precedence: declared > EXIF > none.** If `scan.camera_focal_px` reconciles via
   `effective_focal_px` (existing path), it wins unchanged. EXIF is consulted only when
   that yields `None`. No EXIF or unusable tag → uncalibrated exactly as today.
3. **Diagonal (CIPA) 35mm-equivalence convention.**
   `f_px = sqrt(w² + h²) × f35 / 43.2666` (full-frame diagonal = √(36²+24²) mm).
   Chosen over the horizontal-36mm variant because CIPA DCG-001 diagonal equivalence is
   what OEMs write, and the diagonal form is **orientation-invariant** (√(w²+h²) is the
   same whether the stored image is rotated), sidestepping EXIF-orientation issues
   (the diagonal is invariant under the 90° rotations EXIF orientation can introduce,
   regardless of whether the decoder applies them). CONVENTION RISK: a
   writer using horizontal equivalence differs by ~4% on 4:3 — flagged PROVISIONAL,
   validate against real captures. Accuracy floor either way: the tag is an integer
   (EXIF SHORT), so OEM rounding gives ~1–2% ≈ ~1–2 D — screening-grade, consistent
   with the `'default'` badge; the plausibility backstop (merged 2026-07-02) downgrades
   gross errors.
4. **Correct under downscale, wrong under crop.** f35 encodes field of view, so
   `f_px` derived at the current dims survives uniform resizing with EXIF intact. A
   crop changes FoV undetectably — detected crops skip the fallback (see the
   optics-downgrade hardening spec); undetectable crops remain a residual risk
   downgraded by the plausibility machinery.
5. **Provenance recorded.** `raw_output['focal_source'] = 'declared' | 'exif'` whenever
   a focal was supplied to the pipeline (absent when uncalibrated from the start). It
   records what was *tried*: on a backstop downgrade the key remains alongside
   `downgrade_reason`. `raw_output` is not exposed by serializers — server-side/audit
   only, no client change.

## New module — `apps/analysis/topography/exif.py` (pure, DB-free)

```python
FULL_FRAME_DIAGONAL_MM = 43.2666  # sqrt(36^2 + 24^2); CIPA diagonal equivalence.
                                  # PROVISIONAL convention — see design note 3.

def focal_35mm_from_file(path) -> float | None:
    # PIL Image.getexif(); read FocalLengthIn35mmFilm (tag 41989) from the Exif
    # sub-IFD first (ExifTags.IFD.Exif), then fall back to the top-level IFD
    # (lenient — some writers misplace it). Returns None on: unreadable file,
    # missing tag, non-numeric, non-finite, or outside the PROVISIONAL usability band. Never raises.

def focal_px_from_35mm(f35, width_px, height_px) -> float | None:
    # sqrt(w^2 + h^2) * f35 / FULL_FRAME_DIAGONAL_MM.
    # None if any input is None or <= 0.
```

## `tasks.py` wiring (only change outside the new module + tests)

Current: `focal_px = effective_focal_px(scan.camera_focal_px, …, still_w, still_h)`.
New:

```python
focal_px = effective_focal_px(scan.camera_focal_px, scan.capture_width_px,
                              scan.capture_height_px, still_w, still_h)
focal_source = 'declared' if focal_px is not None else None
if focal_px is None:
    f35 = focal_35mm_from_file(best_still.image.path)
    focal_px = focal_px_from_35mm(f35, still_w, still_h)
    focal_source = 'exif' if focal_px is not None else None
```

Calibrated/uncalibrated dispatch below is unchanged. After `analyse_topography_frame`
returns, when `focal_source` is not None: `out['raw_output']['focal_source'] = focal_source`
before the result is saved.

## Test plan (TDD, `USE_SQLITE_TESTS=1`, baseline 237 passed)

New `apps/analysis/topography/tests/test_exif.py` (unit, no DB):
- `focal_px_from_35mm`: exact arithmetic (e.g. f35=26 @ 800×800 → √2·800·26/43.2666);
  None on None/zero/negative inputs.
- `focal_35mm_from_file`: JPEG written with the tag (top-level IFD via PIL —
  reader must find it there per the lenient fallback) → returns the value; JPEG with
  no EXIF → None; nonexistent path → None (no raise); tag value 0 → None.

`apps/topography/tests/test_tasks.py` (integration, DB):
- **EXIF activates calibration:** scan with NO declared focal; cone still (rendered at
  f=1100, 800×800) saved with EXIF f35=42 (→ f_px≈1098, 0.2% off true) → scan ends
  `'default'`, `raw_output['focal_source'] == 'exif'`, central_k within 2.0 D of truth.
- **Declared beats EXIF:** both present (declared correct, EXIF junk e.g. f35=99) →
  `'default'` via declared, `focal_source == 'declared'`.
- **Backstop synergy:** EXIF-only with f35=84 (≈2× true) → downgraded: `'uncalibrated'`,
  `focal_source == 'exif'`, `downgrade_reason` present.
- **No declared, no EXIF:** unchanged uncalibrated; `focal_source` absent from
  raw_output. (Existing no-focal tests keep passing untouched.)

Test JPEGs: existing `_cone_png` helper produces PNG via cv2 — the new tests re-encode
to JPEG with PIL and attach `Image.Exif` (top-level tag write round-trips reliably
across Pillow versions; the reader's lenient fallback makes this valid). No new
dependencies (Pillow already used by the analysis pipeline).

## Out of scope (YAGNI)

Web upload UI (2b); mobile changes (2c); model/serializer/API changes; EXIF
Make/Model per-model table fallback (F — evidence-gated); reading EXIF from
`FocalLength`-mm + sensor size (needs a sensor table); surfacing focal_source to
clients; treating deterministic optics errors as non-retryable (pre-existing deferral).
