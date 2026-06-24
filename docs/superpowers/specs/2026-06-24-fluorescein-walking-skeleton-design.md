# Fluorescein Automated Analysis — Walking Skeleton — Design Spec
_Date: 2026-06-24_

## Goal

Replace the placeholder **fluorescein stub** with real automated analysis, so a captured
fluorescein video yields a computed tear-film **break-up time** and a **provisional Oxford
staining grade** — running automatically on upload, with manual entry retained as an override.

This is the first module in the broader direction of **every tear-film test running
automatically on the shared calibrated smartphone camera** (capture model "B": per-test guided
captures, each auto-analysed; manual entry kept as fallback). NIBUT is already automated;
topography's walking skeleton is built; fluorescein and lipid are currently stubs. This spec
covers **fluorescein only**.

## Scope & context

Today `apps/analysis/pipeline.py::_analyse_fluorescein` returns hardcoded values
(`fluorescein_grade=1`, `fluorescein_breakup_seconds=8.0`, `analysis_version='fluorescein-stub-v1'`).
This slice swaps that stub for a real `apps/analysis/fluorescein.py` module wired into the
existing pipeline.

**It deliberately reuses the entire existing tear-film pipeline** — the `TestCapture` upload,
the `process_capture` Celery task, the `TestResult` model (which already has
`fluorescein_breakup_seconds` and `fluorescein_grade` fields), the mobile fluorescein capture
flow, and the manual-entry path (`captures/manual/`, `source='manual'`). **No new models, no new
capture flow, no vision-camera.** That makes this materially smaller than the topography slice.

## Key decisions

1. **Two outputs, split by honesty:**
   - **Break-up time** — *real, deterministic.* The clinically-meaningful timing metric, computed
     by the same class of algorithm as NIBUT.
   - **Oxford staining grade (0–5)** — *a provisional, research-badged heuristic.* Built now (per
     user direction) but explicitly flagged provisional and swappable for an ML model when graded
     clinical data arrives — the same seam pattern as topography's uncalibrated dioptres.
2. **Reuse the NIBUT break-up-timing logic.** `detect_breakup_times` and `normalise_distortions`
   are generic over a normalised metric series; they move to `apps/analysis/utils.py` so NIBUT and
   fluorescein share one implementation (DRY). NIBUT keeps working unchanged.
3. **Fluorescein-specific frame metric.** NIBUT measures Placido-ring edge distortion; fluorescein
   has **no Placido rings**. Instead the per-frame metric is the **dark-spot area fraction within
   the fluorescing tear-film region** — bright dyed film that develops dark break-up holes as it
   thins. The metric rises as the film breaks up, feeding the shared break-up-time detector.
4. **Calibration enters as a colour seam.** Fluorescein leans on **colour/white-balance** far more
   than on the dioptre scale. The analysis accepts an optional device colour profile, defaulting to
   identity/passthrough now; the shared calibration foundation plugs in later with no rework.
5. **`analysis_version = 'fluorescein-v0.1'`** (drops the `-stub-` marker).
6. **Real-footage validation is deferred.** Like NIBUT and topography, the code is built and tested
   against synthetic fixtures; accuracy on genuine clinical footage is a separate, later step.

## Architecture & data model

No schema change. The flow is the existing one, with the stub replaced:

```
mobile fluorescein capture (existing)
  -> POST /api/assessments/captures/  (existing, test_type='fluorescein')
  -> process_capture Celery task (existing)
       -> analyse_capture(capture)  (existing dispatch)
            -> _analyse_fluorescein(video_path)   <-- REWIRED to call the real module
                 -> extract_frames(video_path)            (reuse utils)
                 -> analyse_fluorescein(frames, fps)      (NEW module)
       -> writes TestResult.fluorescein_breakup_seconds / fluorescein_grade /
          nibut_heatmap(reused image field for the break-up heatmap) / confidence_score /
          analysis_version='fluorescein-v0.1'
```

### New module: `apps/analysis/fluorescein.py`

```
detect_tearfilm_roi(frame) -> (x, y, w, h)
    # The fluorescing tear-film region under blue light (bright green/yellow blob),
    # NOT a Placido ROI. Threshold the fluorescence channel; fall back to centre region.

breakup_metric(roi_bgr) -> float
    # Fraction of the fluorescing ROI that is "broken up" (dark / low-fluorescence holes).
    # Rises from ~0 (intact bright film) toward 1 as the film thins.

grade_staining(roi_bgr) -> int        # provisional Oxford 0..5 heuristic (SEAM)
    # Quantify punctate staining (bright dye-uptake spots on the cornea) -> 0..5 bands.
    # Research-badged; replaced by the ML model when graded data lands.

generate_breakup_heatmap(base_frame, roi, metric_series) -> PIL.Image
    # Colour overlay marking where/when break-up occurred (mirrors generate_nibut_heatmap).

analyse_fluorescein(frames, fps=10.0, colour_profile=None) -> dict
    # Orchestrates: ROI -> per-frame breakup_metric series -> normalise -> detect_breakup_times
    # -> provisional grade -> confidence -> heatmap. colour_profile is the calibration seam
    # (None = passthrough). Returns:
    #   { first_breakup_seconds, mean_breakup_seconds, fluorescein_grade,
    #     grade_provisional: True, heatmap_image (PIL), confidence, frame_metrics }
```

### Shared helpers moved to `apps/analysis/utils.py`

`detect_breakup_times` and `normalise_distortions` move from `nibut.py` to `utils.py`; `nibut.py`
imports them from there. Behaviour is unchanged (NIBUT's tests stay green). Fluorescein imports the
same functions — one break-up-timing implementation, two callers.

## Analysis approach

### Break-up time (real)
1. Detect the fluorescing tear-film ROI in the first post-blink frame.
2. Per frame, compute `breakup_metric` = dark-hole area fraction within the ROI.
3. `normalise_distortions` z-scores the series against the first N baseline frames (freshly-spread,
   intact film).
4. `detect_breakup_times` returns first/mean break-up seconds — reused verbatim from NIBUT.

### Provisional Oxford grade (seam)
A deterministic heuristic on the staining (dye-uptake) pattern: count and total area of punctate
bright spots within the corneal region, mapped to 0–5 bands. Returned with `grade_provisional: True`.
This is **explicitly not clinically validated** — it gives clinicians a starting number that they
can accept or override via manual entry, and it is replaced wholesale by the ML grader when graded
data is available.

### Confidence
Derived from baseline-film stability (as NIBUT does), so a noisy/poor capture yields low confidence.

## Calibration / colour seam

`analyse_fluorescein(..., colour_profile=None)` applies a device colour/white-balance correction to
frames before measuring, when a profile is supplied. Until the shared calibration foundation exists,
it is `None` (passthrough). This is the single, well-defined seam where calibration later plugs in —
no other part of the module changes.

## Honesty model

- **Break-up time** is shown as a normal metric (deterministic), with the standing caveat that it is
  not yet validated on real footage.
- **The auto grade is badged "provisional — pending validation"** on web and mobile, and manual entry
  remains available to override it. Provisional-ness is **derived from `analysis_version`** (a
  `fluorescein-v0.x` heuristic version is provisional) — **no new DB field** is added. The
  `analyse_fluorescein` return dict still carries a `grade_provisional` flag for in-process clarity,
  but it is not persisted; the UI keys off the version string.

## API / data

No new endpoints or fields. Reuses `TestCapture` / `TestResult` and the existing capture/status/detail
APIs. The break-up heatmap reuses the existing `TestResult.nibut_heatmap` image field (a generic
"break-up heatmap" slot already populated by the NIBUT path); a follow-up may rename it, out of scope
here. `analysis_version='fluorescein-v0.1'`.

## Mobile / web

Minimal, since results screens already display `fluorescein_grade` and `fluorescein_breakup_seconds`:
- Add a **"provisional"** badge next to the auto staining grade (web `ResultsDisplay`, mobile results),
  shown when `analysis_version` is a heuristic `fluorescein-v0.x`.
- Confirm the existing fluorescein capture routes the video into the standard upload (it already does).

## Definition of done

A clinician captures a fluorescein video → it uploads → `process_capture` runs the real
`analyse_fluorescein` → the assessment shows a computed break-up time and a **provisional** staining
grade (badged, overridable), persisted and versioned `fluorescein-v0.1`, with the stub gone.

## Testing (synthetic fixtures, mirroring topography)

- **Synthetic dyed-film clip generator** (in tests): a bright disc that develops dark break-up holes
  after frame N → assert recovered first/mean break-up time ≈ N/fps; a stable clip (no holes) →
  break-up = video duration.
- **Grade heuristic**: synthetic staining patterns with increasing spot count/area → assert the grade
  rises monotonically (relative correctness; never an absolute clinical-grade claim).
- **Confidence**: a noisy baseline yields lower confidence than a clean one.
- **Shared-helper refactor**: NIBUT's existing tests stay green after `detect_breakup_times` /
  `normalise_distortions` move to `utils`.
- **Pipeline wiring**: `_analyse_fluorescein` returns the real keys and `analysis_version='fluorescein-v0.1'`.

## Out of scope (this slice)

- **The ML staining grader** — arrives with the graded clinical dataset; the heuristic is the seam.
- **Real-footage validation / clinical accuracy** — deferred (synthetic-tested only now).
- **The shared calibration foundation** (colour/white-balance, lens distortion, device profile) — the
  colour seam is present but passthrough until that foundation is built.
- **Lipid automation** — the next module, its own spec.
- **Capture-flow / illumination changes** (blue-light handling, dye workflow) — assumed adequate;
  revisited during real-footage validation.
