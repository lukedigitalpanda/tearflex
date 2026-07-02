# Topography Optics Downgrade Hardening (pre-2b) — Design

**Date:** 2026-07-02
**Branch:** `feat/topography-optics-downgrade` (off master `00c515c`)
**Status:** Scope approved by user 2026-07-02 ("go ahead" on the two-item hardening gate named in the 2a wrap-up).

## Goal

Close the two reviewer-quantified gaps that must land before slice 2b (web uploads):

1. **Wrong-intrinsics optics errors downgrade instead of failing.** An in-band but
   too-small focal (real ultra-wide tag f35 ≈ 10–16 at the reference geometry; verified
   f35=13 → f_px≈340) makes `optics.corneal_radius_mm` raise a plain
   `ValueError("non-physical ring radius … denominator <= 0")` — not
   `ImplausibleReconstruction` — so the scan ends `failed` after 3 burned Celery
   retries instead of downgrading to `uncalibrated`. No usability band can close this
   (13mm is a legitimate tag); only the optics layer can.
2. **Crop-detected scans skip the EXIF fallback.** When `effective_focal_px` rejects a
   declared focal specifically because the still's aspect differs from the declared
   capture dims (a detected crop), the still's own f35 tag is crop-invalidated — yet
   the 2a wiring currently falls through and trusts it.

## Decisions

1. **`ImplausibleReconstruction` moves to `optics.py`** (it cannot be imported from
   `reconstruct.py` there — circular). `reconstruct.py` re-exports it
   (`from .optics import ImplausibleReconstruction`), so every existing import site
   (`pipeline.py`, tests) keeps working unchanged.
2. **Two optics raises convert** to `ImplausibleReconstruction` (which subclasses
   `ValueError`, so any existing `except ValueError` / `pytest.raises(ValueError)`
   still matches):
   - `corneal_radius_mm`: the `denominator <= 0` case — positive, individually-valid
     inputs that are mutually non-physical = measurement failure, exactly the
     exception's documented domain.
   - `radius_to_power`: the `corneal_radius_mm <= 0` case — defence in depth, same
     rationale.
   The `"all optical inputs must be positive"` contract checks **stay plain
   `ValueError`**: a negative/zero input is a programming error upstream and must fail
   loud, not downgrade.
   Effect: the pipeline's existing `except ImplausibleReconstruction` now also catches
   optics-level wrong-intrinsics failures → downgrade + `downgrade_reason`, no retries.
   This also fixes the same failure mode for *declared* focals (part of the old
   "don't Celery-retry deterministic input errors" deferral).
3. **New pure predicate `intrinsics.aspect_mismatch(capture_width_px,
   capture_height_px, still_width_px, still_height_px) -> bool`** — True only when all
   four are present and positive AND the aspect ratios differ beyond the existing
   `ASPECT_TOLERANCE`; False otherwise (missing dims = "not detected", not "mismatch").
   `effective_focal_px` is refactored to call it internally (single source of truth for
   the crop test; behaviour unchanged). `tasks.py` guards the EXIF fallback with
   `and not aspect_mismatch(...)`.
4. **Docs ride-alongs** (stale pre-band / pre-conversion language): `exif.py` module
   docstring ("bounded by the plausibility backstop" → downgraded via the plausibility
   machinery, now true in both directions); the 2a spec's module sketch ("value <= 0",
   crop "backstop bounds it") updated to match shipped behaviour.

## Behaviour matrix after this slice (scan outcomes)

| Focal situation | Before | After |
|---|---|---|
| EXIF f35=13 (ultra-wide, too small for geometry) | `failed` + 3 retries | `analysed`, `uncalibrated`, `focal_source='exif'`, `downgrade_reason` "non-physical…" |
| Declared focal too small for geometry | `failed` + 3 retries | downgraded, `focal_source='declared'` |
| Crop detected (aspect mismatch) + still carries valid-looking f35 | calibrates from crop-invalidated EXIF | `uncalibrated`, `focal_source` absent (EXIF skipped) |
| Gate-range implausible (e.g. f35=20 → 13.6 D) | downgraded (2a) | unchanged |
| Missing/garbage EXIF, plain uncalibrated, declared-good paths | — | byte-identical behaviour |

## Test plan (TDD, `USE_SQLITE_TESTS=1`, baseline 252)

Task 1 (+5 → 257): optics units (denominator<=0 and radius_to_power(<=0) raise
`ImplausibleReconstruction`); reconstruct-level (flat rings for R=7.8 @ f=3000
reconstructed claiming `focal_px=200` → verified denominator<0 → raises
`ImplausibleReconstruction`); pipeline-level (calibrated frame with focal far too
small → downgraded, reason contains "non-physical", no raise); task-level headline
(EXIF f35=13 → `analysed` + `uncalibrated` + provenance + reason — the exact scenario
that fails today).

Task 2 (+4 → 261): `aspect_mismatch` units (detects 4:3-vs-1:1; False on missing dims;
False on same-aspect scaled dims); task integration (declared capture 1600×1200 +
800×800 still carrying f35=42 that would otherwise calibrate → stays `uncalibrated`,
`focal_source` absent). Existing aspect-mismatch and 2a tests must pass unchanged.

## Out of scope (YAGNI)

Slice 2b UI; converting other Celery-retryable deterministic errors (unreadable
stills, degenerate frames); surfacing a retake cue for downgraded scans (UI, tracked);
`ImplausibleReconstruction` message unification.
