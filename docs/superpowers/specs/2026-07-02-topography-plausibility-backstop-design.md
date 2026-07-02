# Topography Plausibility Backstop — Design

**Date:** 2026-07-02
**Branch:** `feat/topography-plausibility-backstop` (off master `f2c4f5b`)
**Status:** Design — awaiting user review before writing the implementation plan.

## Context

The catadioptric (distance-aware) topography reconstruction is built, merged, and
correct, but **inactive in production** — mobile does not yet populate camera
intrinsics, so every scan currently takes the uncalibrated placeholder path. Before
mobile activates the calibrated path (Slice 2), the calibrated path has a known safety
gap:

1. **No outlier rejection in per-ring aggregation.** In
   `reconstruct.py::_reconstruct_catadioptric` each meridian's power is
   `radius_to_power(mean(per-ring R estimates))` (line ~104). A single mis-extracted
   ring silently drags the meridian power (opus-flagged bias).
2. **No physiological sanity check.** A within-tolerance-but-wrong input, or a bad
   extraction, can reconstruct to a physically-impossible cornea and still be badged
   `calibration_state='default'` — the one path where the badge could overstate
   confidence *without* the pipeline failing.

This slice closes both gaps. It is pure backend and fully testable with synthetic
inputs — no hardware dependency — which is why it is sequenced **before** mobile
activation.

## Locked design principle

The sanity gate rejects physically-**impossible** values (measurement failure). It must
**never** suppress abnormal-but-real findings. A steep, small-radius, irregular cornea is
exactly the keratoconus pathology topography exists to catch. Bounds are therefore
**generous measurement-sanity bounds, not normality bounds.**

## Failure-handling decision

On an implausible calibrated reconstruction, the scan is **downgraded to
`uncalibrated`** (best-judgment default, consistent with the honesty model built across
this feature; user was away at decision time and can revise):

- Refuse the `'default'` badge; re-run the uncalibrated placeholder-scale path.
- The research-use map still renders — **keratoconus is never hidden**; we simply stop
  claiming metrically-valid dioptres.
- Non-destructive (no forced retake), and it slots into the existing
  `uncalibrated → default → calibrated` ladder.

Rejected alternatives: *mark failed → retake* (adds friction, discards a salvageable
map, and overloads `failed` which currently means a processing error); *keep number +
suspect flag* (risks a clinician anchoring on a wrong K).

## Design

### (a) Robust per-ring aggregation — `reconstruct.py`

New pure helper:

```
_robust_radius(estimates: list[float]) -> float
```

- `len <= 2`: return the median (== mean for 2, the value for 1).
- otherwise: MAD-reject-then-mean.
  - `med = median(estimates)`
  - `scaled_mad = 1.4826 * median(|estimates - med|)`
  - if `scaled_mad == 0`: return `med`
  - else keep `e` where `|e - med| <= 3.5 * scaled_mad`; return `mean(survivors)`
    (survivors always non-empty — the median itself passes).

Replaces `R_mean = float(np.mean(radius_estimates))` at line ~104.

**Scope boundary (safety-critical):** this aggregation is *within one meridian, across
its rings*. Between-meridian variation is untouched — that asymmetry is the keratoconus
signal. The `3.5σ` threshold is deliberately loose: it rejects a gross outlier (a
mis-extracted ring), not real spread.

Central-K keeps its current definition (`radius_to_power(radius_estimates[0])`, the
innermost/apex ring) — unchanged semantics; an impossible innermost value is caught by
the gate below rather than silently robust-averaged into a different meaning.

### (b) Physiological sanity gate — `reconstruct.py`

Module constants:

```
R_MIN_MM = 4.0     # ~84 D — steeper than any real cornea
R_MAX_MM = 13.5    # ~25 D — flatter than any real cornea
```

Power bounds derived once via `optics.radius_to_power` so they stay keratometric-index
consistent:

```
_POWER_MAX = optics.radius_to_power(R_MIN_MM)   # upper power bound
_POWER_MIN = optics.radius_to_power(R_MAX_MM)   # lower power bound
```

New exception:

```
class ImplausibleReconstruction(ValueError): ...
```

After `power_per_angle` and `central_power` are computed and the finite-check passes,
gate them: if `central_power` **or any** `power_per_angle` element falls outside
`[_POWER_MIN, _POWER_MAX]`, raise `ImplausibleReconstruction` with a message naming the
offending value and bound.

Rationale for gating every meridian, not just the aggregate: given these generous
bounds, an out-of-range meridian is an extraction failure, never real pathology (severe
keratoconus tops out around ~R4.8mm/70D, comfortably inside). Publishing a calibrated map
with one impossible meridian would be worse than downgrading the whole scan.

The gate lives **only** in the catadioptric path. The uncalibrated placeholder path is
not metrically valid and is not gated (so the fallback below can never re-trip it).

### (c) Downgrade policy — `pipeline.py::analyse_topography_frame`

Wrap the calibrated `reconstruct_curvature` call in
`try / except ImplausibleReconstruction`:

- on catch: log a warning, re-run `reconstruct_curvature(rings)` with **no** calibration
  args (uncalibrated placeholder), and continue. Downstream metrics/overlay/axial render
  from the uncalibrated curvature.
- `raw_output['calibration_state']` becomes `'uncalibrated'` automatically (the
  uncalibrated path sets it); additionally set `raw_output['downgrade_reason'] = str(exc)`
  on the fallback branch for debugging.

`tasks.py` is **unchanged**: it already badges the scan from
`out['raw_output']['calibration_state']`, so the downgrade propagates to both the result
and the scan. Because the fallback happens inside the pipeline, no exception reaches the
`except Exception → self.retry` path — so an implausible reconstruction does **not** burn
Celery retries and the scan ends `status='analysed'`, not `failed`.

## Test plan (TDD, backend, `USE_SQLITE_TESTS=1`)

`test_reconstruct.py`:
- `_robust_radius`: gross single outlier rejected (result ≈ clean subset); moderate real
  spread preserved (not over-trimmed); ≤2-element median fallback; all-equal / MAD==0
  path.
- Gate raises `ImplausibleReconstruction` when rings reconstruct to R < 4mm (and > 13.5mm).
- **Gate passes steep-but-real keratoconus (~R5mm / ~67D)** — the safety-critical test:
  assert no raise and `calibration_state == 'default'`.
- Gate passes a normal cornea (~R7.8mm / ~43D).
- Per-meridian gate: one impossible meridian among normal ones → raises.

`test_pipeline.py`:
- Implausible calibrated frame → returns `calibration_state == 'uncalibrated'` with a
  `downgrade_reason` in `raw_output`; does **not** raise.
- Plausible calibrated frame → stays `'default'` (no regression).

`test_tasks.py` (DB integration):
- Scan with calibrated inputs that reconstruct implausibly → ends
  `calibration_state='uncalibrated'`, `status='analysed'` (not `failed`, not retried).

## Out of scope (YAGNI)

- No suspect-flag DB field (we chose downgrade, not flag).
- No central-K redefinition.
- No DB-configurable bounds — these are physical-plausibility (measurement-sanity)
  constants, not clinical thresholds, so the "configurable in DB" rule from CLAUDE.md
  does not apply.
- Mobile activation (Slice 2) — a react-native-vision-camera intrinsics feasibility spike
  precedes any mobile build.
