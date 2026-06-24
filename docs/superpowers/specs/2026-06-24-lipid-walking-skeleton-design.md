# Lipid Layer Automated Analysis — Walking Skeleton — Design Spec
_Date: 2026-06-24_

## Goal

Replace the placeholder **lipid stub** with provisional automated analysis: a **Guillon grade
(1–5)** and a **lipid thickness (nm)** estimated from the interference pattern, running
automatically on upload — with manual entry retained as the authoritative override.

This is the third module in the **every-tear-film-test-runs-automatically-on-the-shared-camera**
direction (capture model "B": per-test guided captures, each auto-analysed; manual fallback). NIBUT
is automated; topography's walking skeleton is built; fluorescein's is in review. This spec covers
**lipid only**.

## Scope & context — read this honestly

Lipid is the hardest of the tear-film tests to automate deterministically, and unlike fluorescein it
has **no calibration-independent "real" metric**:

- The **Guillon grade** (open meshwork → closed meshwork → wave/flow → amorphous → coloured fringes)
  is a *pattern classification* — the kind of problem that wants the **graded clinical data that is
  coming**.
- The **thickness** is read from **interference colour**, which is only metrically meaningful once the
  camera's **colour/white-balance is calibrated** — and that calibration is part of subsystem A, which
  is **blocked on the working-distance hardware spec**.

So this walking skeleton is **almost entirely seams**: both outputs are provisional heuristics, badged
research-use, leaning on two things that are not ready yet (colour calibration = blocked, grading data
= coming). Its value now is structural — it gets lipid **off the stub**, stands up the module +
colour/texture feature extraction + the colour-calibration seam, and means lipid **lights up** the
moment colour-calibration and data land. The heuristics are deliberately simple and **explicitly
provisional seeds for clinical/professional validation** — they are not a clinical claim.

Today `apps/analysis/pipeline.py::_analyse_lipid` returns hardcoded values (`lipid_grade=2`,
`lipid_thickness_nm=30.0`, `analysis_version='lipid-stub-v1'`). This slice swaps that for a real
`apps/analysis/lipid.py`. It **reuses the entire existing pipeline** — `TestCapture` upload,
`process_capture`, the `TestResult` model (`lipid_grade` + `lipid_thickness_nm` fields already exist),
the lipid capture flow, and the manual-entry path. **No new models, no new capture flow.**

## Key decisions

1. **Build the fuller scope (per user):** both the Guillon grade and the thickness as provisional
   heuristics — more (clearly-provisional) signals for the professional reviewer to validate.
2. **Thickness from the dominant interference colour** (a semi-independent signal), via a simple
   monotonic colour→nm heuristic — not merely a restatement of the grade's Guillon thickness band.
3. **Grade from texture + colour features:** fine reticular texture + low colour saturation → meshwork
   (1–2); smoother/uniform → wave/amorphous (3–4); high colour saturation / varied hues → coloured
   fringes (5).
4. **Colour-calibration seam:** `analyse_lipid(..., colour_profile=None)` — `None` = passthrough now;
   the shared calibration foundation supplies a white-balance transform here later, with no rework.
5. **Confidence is deliberately low** for this slice, reflecting the uncalibrated + unvalidated nature.
6. `analysis_version = 'lipid-v0.1'` (drops the `-stub-` marker).
7. **Honesty model is the safeguard:** both numbers are badged provisional on web + mobile; manual
   entry stays authoritative and unbadged. Real-footage validation is deferred.

## Architecture & data model

No schema change. The flow is the existing one, with the stub replaced:

```
mobile lipid capture (existing)
  -> POST /api/assessments/captures/  (existing, test_type='lipid')
  -> process_capture (existing) -> analyse_capture (existing dispatch)
       -> _analyse_lipid(video_path)   <-- REWIRED to the real module
            -> extract_frames(video_path)            (reuse utils)
            -> analyse_lipid(frames, fps)            (NEW module)
       -> writes TestResult.lipid_grade / lipid_thickness_nm / confidence_score /
          analysis_version='lipid-v0.1' / raw_output (grade_provisional, thickness_provisional, features)
```

### New module: `apps/analysis/lipid.py`

```
detect_lipid_roi(frame) -> (x, y, w, h)
    # The specular/interference region (bright tear-film reflection); centre-region fallback.

colour_features(roi_bgr) -> dict
    # {mean_saturation, hue_spread, dominant_hue} from HSV — drives "coloured fringes" signal + thickness.

texture_density(roi_gray) -> float
    # Fine-structure metric (e.g. Canny edge density / local variance) — meshwork vs amorphous.

grade_lipid(roi_bgr) -> int
    # Provisional Guillon grade 1..5 from texture_density + colour_features. SEAM.

thickness_from_colour(roi_bgr) -> float
    # Provisional nm estimate from the dominant interference hue (monotonic colour->nm). SEAM.

analyse_lipid(frames, fps=10.0, colour_profile=None) -> dict
    # Best-frame (sharpest) -> ROI -> features -> grade + thickness -> low confidence.
    # Returns { lipid_grade, lipid_thickness_nm, grade_provisional: True,
    #           thickness_provisional: True, confidence, features }
```

The lipid pattern is **static** (no break-up over time), so unlike NIBUT/fluorescein there is no
time-series — `analyse_lipid` picks the sharpest frame (Laplacian variance) and analyses it.

## Analysis approach

1. **Best frame:** choose the sharpest frame (Laplacian variance) — the lipid pattern is static.
2. **ROI:** the bright specular/interference region.
3. **Features:** `texture_density` (fine reticular structure) + `colour_features` (saturation, hue
   spread). High texture + low saturation → meshwork; low texture → amorphous/wave; high saturation /
   wide hue spread → coloured fringes.
4. **Provisional grade:** a banded mapping from those features to Guillon 1–5.
5. **Provisional thickness:** dominant interference hue → nm via a simple monotonic lookup (thin films
   shift colour with thickness). Uncalibrated.
6. **Confidence:** deliberately low (reflecting uncalibrated + unvalidated); reduced further on a
   low-texture / low-saturation (ambiguous) ROI.

## Honesty model (the safeguard)

- Both `lipid_grade` and `lipid_thickness_nm` are badged **"provisional — pending validation"** on web
  and mobile, keyed on `analysis_version` starting `lipid-v0` (same mechanism as fluorescein) — **no
  new DB field** (the return dict carries `grade_provisional`/`thickness_provisional` for in-process
  clarity; the UI keys off the version string).
- Manual entry remains authoritative and **unbadged** (the existing `captures/manual/` path is
  untouched).
- The heuristics are explicitly seeds for **clinical/professional accuracy review**, not a diagnosis.

## API / data

No new endpoints or fields. Reuses `TestCapture` / `TestResult` and the existing capture/status/detail
API. `analysis_version='lipid-v0.1'`. (Lipid produces no heatmap in this slice.)

## Mobile / web

- Add the **"provisional"** badge to the lipid grade (web `ResultsDisplay`, mobile lipid results
  branch), shown when `analysis_version` starts `lipid-v0`. Re-applies the same `analysis_version`-prefix
  pattern fluorescein introduced (additive — merges cleanly with fluorescein PR #3).
- Confirm the existing lipid capture routes the video into the standard upload (it already does).

## Definition of done

A clinician captures a lipid video → it uploads → `process_capture` runs the real `analyse_lipid` →
the assessment shows a **provisional** Guillon grade and thickness (badged, overridable), persisted and
versioned `lipid-v0.1`, with the stub gone.

## Testing (synthetic fixtures)

- **Synthetic interference-pattern generator** (in tests): a fine-meshwork texture, a smooth/amorphous
  patch, and a high-saturation coloured-fringe pattern.
- **Grade heuristic** orders them sensibly (meshwork < amorphous/wave < coloured fringes), within [1,5]
  — relative correctness, never an absolute clinical claim.
- **Thickness heuristic** shifts monotonically as the dominant interference colour shifts.
- **Best-frame**: the sharpest of a blurred/crisp pair is chosen.
- **Pipeline wiring**: `_analyse_lipid` returns the real keys and `analysis_version='lipid-v0.1'`.

## Out of scope (this slice)

- **The ML Guillon grader** — arrives with the graded clinical dataset; the heuristic is the seam.
- **Colour/white-balance calibration** — the seam is present but passthrough until the shared
  calibration foundation (subsystem A) is built; absolute thickness is not metrically valid until then.
- **Real-footage validation / clinical accuracy** — deferred; the heuristics are provisional seeds for
  professional review.
- **Capture-flow / illumination changes** (specular light angle, fringe visibility) — assumed adequate;
  revisited during real-footage validation.
