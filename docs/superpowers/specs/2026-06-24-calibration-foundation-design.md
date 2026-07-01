# Subsystem A — Shared Calibration Foundation — Design Spec
_Date: 2026-06-24_

## Goal

Turn the placeholder measurement scales in the tear-film analysis modules into **real,
distance-aware calibrated transforms**, so absolute numbers (corneal dioptres, lipid thickness in
nm, interference colour) become metrically trustworthy and every result's badge can flip from
**research-use** to **calibrated**. Built around a **variable working distance** and designed
**cross-platform (iOS + Android)** from the start.

This is the shared foundation that **all** automated modules consume — topography (PR #2),
fluorescein (PR #3), lipid (PR #4), and future ones. It is additive: it fills seams the modules
already expose, so the modules themselves do not change.

## Context — what changed, and why

Earlier brainstorming assumed we'd build an "automatic per-phone-model default profile" first. The
user's input reframed it: **the Placido clip mounts on the camera and is held freehand (~3–5 cm from
the eye), so the working distance is variable** — *"that is why I am having a calibration in the first
place."* A per-model lookup assumes a fixed geometry it won't have, so it cannot produce absolute
numbers on its own. **The calibration's core job is therefore to recover the variable working distance
for each capture, then convert correctly.**

**Why distance is the linchpin:** the Placido rings reflect off the curved tear film; the apparent
ring size on the sensor depends on *both* the corneal curvature (what we want) *and* the disc-to-eye
distance. "Curvier cornea" and "held closer" look identical to the camera unless the distance is known.

## Key decisions

1. **Variable-distance architecture.** The calibrated `scale` is a *function of the recovered working
   distance*, not a constant.
2. **Cross-platform, iris-anchored.** The primary distance lever is the **iris / limbus as a built-in
   scale reference** — its visible diameter is ~11.7 mm ± 0.5 mm across humans, it is always in frame
   during an eye capture, and recovering distance from it (pixel size + focal length, similar
   triangles) is pure image processing, so it works identically on iOS and Android. Google's
   open-source **MediaPipe Iris** implements exactly this and reports **~4.3% mean distance error**
   (population-average iris). It substantially reduces — possibly removes — the dependence on a shipped
   physical reference object (the patient's own eye is the ruler).
3. **Accuracy path & honesty (the load-bearing caveat).** ~4.3% distance ≈ ~±2 D on K = **screening
   grade**. Approaching **diagnostic grade** (<1% distance ≈ ~±0.4 D, near keratometry's ±0.25–0.5 D)
   means stacking: **patient-specific iris size** (measure once — kills the dominant biological-
   variation error), **sub-pixel limbus segmentation** + good intrinsics, **multi-frame averaging**,
   and **LiDAR** (<2%, rear-facing on iPhone Pro) where the device has it. **<1% is the target, not a
   guarantee** — only validation against a gold-standard keratometer (e.g. Keratograph) on real eyes
   confirms the real number. We already do circle detection for the Placido rings, so limbus detection
   is in reach (caveat: the clip must not fully occlude the limbus — verify on real captures).
4. **Secondary / opportunistic levers:** a one-time **reference-object** solve (known-size sphere /
   model eye) as an *optional* higher-confidence anchor; **autofocus distance** (reliable iOS,
   "uncalibrated" on many Androids) and **ring-geometry** inter-ring spacing as refinements / backstops.
   None is load-bearing on its own. *(Note: the front-facing Face ID / TrueDepth depth sensor cannot be
   used — the clinical capture is on the REAR camera; the iris method runs on that rear image instead.)*
5. **Additive via existing seams.** Subsystem A produces the real `scale` (and `colour_profile`); the
   modules consume them unchanged through seams they already have.
6. **Honest validation boundary.** Synthetic tests can only prove the maths is *self-consistent*; real
   *accuracy* can only be validated against a real reference capture. The build is split accordingly.

## Architecture

### Where it plugs in (no module rework)
The modules already expose the seams:
- Topography: `reconstruct_curvature(rings, scale=NOMINAL_DIOPTRE_SCALE)` — A supplies a real `scale`
  computed from the recovered distance + device calibration.
- Fluorescein / lipid: `analyse_*(..., colour_profile=None)` — A supplies a real colour/white-balance
  profile.
Subsystem A computes these and the analysers consume them; nothing in the modules changes.

### Data model
- **`DeviceCalibration`** — per phone-model + attachment: camera intrinsics, attachment ring geometry,
  the reference-object solve result (the system constant relating ring size + distance → curvature),
  `calibration_method`, `version`, `created_at`. Keyed so a scan's `phone_model_id` finds its profile.
- **Per-scan capture metadata** — the recovered/estimated working distance, the camera intrinsics and
  (where available) the autofocus focus-distance reading at capture time. (Scans already carry
  `device_model` / `phone_model_id` / `app_version`.)

### Distance recovery (per capture)
```
working_distance = best_available_of(
    iris_scale_estimate(image, camera_intrinsics, patient_iris_mm),   # PRIMARY, cross-platform (MediaPipe-Iris style)
    lidar_depth(capture_metadata) if available,                       # accuracy bonus: iPhone Pro (rear LiDAR)
    reference_anchored_estimate(device_calibration) if calibrated,    # optional higher-confidence anchor
    autofocus_distance(capture_metadata) if trustworthy,              # refinement: iOS + capable Android
    ring_spacing_estimate(rings),                                     # fallback / sanity check
)
scale = device_calibration.scale_at(working_distance, camera_intrinsics)
calibration_state = 'calibrated' if device_calibration else 'default' if model_profile else 'uncalibrated'
```

### The calibration maths (form; constants are hardware-spec inputs)
The reflection of concentric Placido rings off a convex mirror (the tear film), imaged by a camera at
distance `d`, is a well-defined geometric model. The **reference-object solve**: capture a sphere of
*known* radius at a *known* (or autofocus-measured) distance, measure ring radii, fit the system
constant. **Inversion at analysis time**: given the fitted constant + the recovered `d` for an unknown
cornea, convert ring radii → radius of curvature → dioptres. The *form* is known; the specific
constants depend on the attachment's exact ring geometry (an input, below).

## Cross-platform handling

- **Both platforms** run the **same iris-scale distance recovery on the rear-camera image** (pure image
  processing — the patient's iris is the cross-platform ruler) and the **same** reconstruction maths.
- **iOS** (AVFoundation / vision-camera): adds reliable camera intrinsics + autofocus distance, and
  **rear LiDAR** (<2%) on Pro models, as accuracy refinements.
- **Android** (Camera2): iris-scale is primary; autofocus distance used **only** when the device reports
  `LENS_INFO_FOCUS_DISTANCE_CALIBRATION` as calibrated; rear ToF / ARCore Depth used where present. The
  capture layer records which signals were available for provenance.

## Honesty model

- `calibration_state` progresses `uncalibrated → default → calibrated` (the field already exists).
  Absolute numbers are badged research-use until `calibrated`; the badge flips only when a real
  reference calibration is applied. Relative outputs (map shape, astigmatism axis, break-up timing,
  lipid grade *ordering*) remain valid throughout.
- Calibration provenance (method, which distance signal was used, version) is persisted so a result is
  self-describing for clinical/professional review.

## What's buildable & validatable NOW vs what needs real data

**Buildable + genuinely useful now (the "structural" first slice):**
- The `DeviceCalibration` data model + API + version tracking.
- Mobile capture of the focus-distance + intrinsics metadata (cross-platform, best-effort).
- The distance-aware `scale` *signature* + the `calibration_state` → badge plumbing.
- The **iris-scale distance estimate** + the **calibration solve + inversion maths**, tested for
  **self-consistency** against synthetic ground truth (a synthetic Placido reflection of a known-radius
  sphere with a known iris at a known distance → assert the calibrated reconstruction recovers the true
  curvature within tolerance). MediaPipe-Iris-style iris measurement can be prototyped now against the
  published ~4.3% accuracy.

**Needs the hardware spec + a real reference object + real captures (deferred — accuracy, not maths):**
- Real metric accuracy on actual eyes (synthetic self-consistency ≠ clinical accuracy).
- The exact numeric constants (ring geometry, reference dimensions).
- Per-platform autofocus reliability validation.

## Decomposition & sequencing

- **A-structural** (model, metadata capture, seam signatures, badge plumbing, the solve/inversion maths
  with synthetic self-consistency tests) — independent of the modules being merged; producible now.
- **A-accuracy** (real constants + real reference validation) — gated on the hardware spec + reference
  object + real captures.
- **Integration note:** A produces the transforms the modules *consume*; the modules currently live on
  unmerged branches (PRs #2–#4). The seam-wiring (A → each module) happens when they converge. Per the
  user's decision, the modules + A merge together once A is done — so the wiring is the final
  integration step, not a per-module change now.

## Open inputs / validation items (parameters, not blockers to A-structural)

1. The attachment's **exact ring geometry** (ring radii + disc-to-lens offset) — needed for the
   reconstruction maths.
2. **Iris / limbus visibility through the clip** — confirm the limbus is reliably segmentable in the
   rear capture (the iris is now the primary cross-platform distance anchor); verify on real captures.
3. **Patient iris-diameter source** for diagnostic grade — a one-time per-patient measurement removes
   the ~4% biological-variation error; population-average (~11.7 mm) is fine for screening grade.
4. *(De-prioritized)* Whether a physical **reference object** ships — now an *optional* higher-confidence
   anchor, no longer load-bearing; plus per-platform autofocus / LiDAR availability.

## Out of scope (this subsystem / deferred)

- Keratoconus screening and the other subsystem-B reconstruction-depth features (separate subsystem).
- Longitudinal/progression comparison (subsystem C).
- The ML graders for fluorescein/lipid (arrive with graded data; orthogonal to calibration).
- Real-footage clinical validation (the accuracy gate above).
