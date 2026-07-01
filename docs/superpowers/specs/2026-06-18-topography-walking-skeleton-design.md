# Corneal Topography — Walking Skeleton (Slice 1) — Design Spec
_Date: 2026-06-18_

## Goal

Add **corneal topography** as a camera-capture-and-analyse modality in the assessments
section, alongside the existing tear-film tests (NIBUT / fluorescein / lipid). Topography
reconstructs corneal **shape** (curvature maps, SimK, astigmatism) from the static geometry
of the Placido ring reflection — the same clip-on rig the app already uses, a different
analysis of the rings.

This spec covers **slice 1 only**: a thin, end-to-end "walking skeleton" that captures on a
device, reconstructs on the backend, and shows a map + K-values on mobile and web — every
value explicitly badged **research-use / uncalibrated**. It deliberately establishes the
spine that calibration and longitudinal comparison hang off later.

This is production-quality scaffolding, not throwaway: real models, real API, real
reconstruction code — with the heavy DSP versioned and swappable, and absolute accuracy
gated behind a later calibration subsystem.

---

## Scope & decomposition

Topography is three independent subsystems with a hard dependency chain **A → B → C**.
Each gets its own spec → plan → build cycle.

- **A — Calibration & device foundation:** phone-model detection, per-model camera profile,
  attachment profile, lens-distortion correction, fitted-attachment setup check,
  reference-sphere/model-eye calibration mode, wrong-attachment warning, hardware/software
  version tracking. *The trust layer that makes absolute K-values metrically valid.*
- **B — Reconstruction depth & full map set:** tangential map, irregularity score,
  inferior–superior asymmetry, keratoconus **suspicion** flag (only if clinically validated),
  left/right comparison.
- **C — Longitudinal scan comparison:** previous scans, side-by-side, progression deltas
  (SimK / steep-K / irregularity / astig axis), "Stable / Possible progression / Retake
  required" status, progression alerts.

**This spec is the walking skeleton that precedes A/B/C** — a minimal vertical slice through
capture → reconstruct → view, with explicit seams (`calibration_state`, `algorithm_version`,
versioned modules) so A/B/C slot in without rework.

---

## Key decisions (from brainstorming)

1. **Walking skeleton first** — thin end-to-end slice, not calibration-foundation-first nor a
   throwaway feasibility spike.
2. **Slice 1 includes the real mobile capture** (not backend + web only).
3. **Camera layer → `react-native-vision-camera` on a development build.** Enables
   simultaneous video + still-burst capture, and is the foundation for real on-device
   frame-processor ring detection later. App leaves Expo Go for a dev/prebuild client.
4. **Capture = short video + high-res still burst, captured simultaneously.** Video = audit
   trail + robustness; stills = spatial detail for ring detection.
5. **Dedicated topography models** (`TopographyScan` / `TopographyStill` / `TopographyResult`)
   reusing the existing `Assessment` session — *not* overloading `TestCapture` / `TestResult`.
   Models live in a new **`apps/topography`** app; reconstruction code under
   `apps/analysis/topography/`.
6. **Honesty model:** map *pattern* and **astigmatism axis** are meaningful early; absolute
   **dioptre values are assumed-scale** until calibration (subsystem A). Every result carries
   `calibration_state='uncalibrated'` + `algorithm_version`, and the UI badges values
   research-use / not-for-diagnosis.
7. **Deferred to B:** tangential map, irregularity score, I-S asymmetry, keratoconus flag,
   L/R comparison. No keratoconus signal of any kind is surfaced in slice 1.

### Deliberate slice-1 boundaries (accepted)

- **Alignment stays simplified** (manual "capture when centred" / basic heuristic). Real
  frame-processor ring detection is a later follow-up — enabled by adopting vision-camera now,
  not built here.
- **Existing NIBUT capture stays on `expo-camera`** for this slice and migrates to
  vision-camera later (when it also gains real alignment). The two camera libraries coexist
  briefly — intentional, to keep slice 1 small.

---

## Architecture & data model

Reuse `Assessment` as the session container (patient, clinician, eye, practice-scoping — all
unchanged). A topography scan inherits its eye from `assessment.eye`.

### New app: `apps/topography`

```python
class TopographyScan(models.Model):
    """A corneal topography capture within an assessment session."""
    STATUS_CHOICES = [
        ('uploaded', 'Uploaded'),
        ('processing', 'Processing'),
        ('analysed', 'Analysed'),
        ('failed', 'Failed'),
    ]
    CALIBRATION_STATE_CHOICES = [
        ('uncalibrated', 'Uncalibrated'),   # no calibration applied (slice 1 default)
        ('default', 'Default profile'),     # nominal profile applied (subsystem A)
        ('calibrated', 'Calibrated'),       # per-device/attachment calibration (subsystem A)
    ]

    assessment = models.ForeignKey('assessments.Assessment', on_delete=models.CASCADE,
                                   related_name='topography_scans')
    video_file = models.FileField(upload_to='topography/video/%Y/%m/%d/', blank=True, null=True)
    device_model = models.CharField(max_length=100, blank=True)       # "iPhone 15 Pro"
    phone_model_id = models.CharField(max_length=100, blank=True)     # "iphone15,2" — future calibration key
    app_version = models.CharField(max_length=20, blank=True)
    calibration_state = models.CharField(max_length=20, choices=CALIBRATION_STATE_CHOICES,
                                         default='uncalibrated')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='uploaded')
    celery_task_id = models.CharField(max_length=255, blank=True)
    captured_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-captured_at']


class TopographyStill(models.Model):
    """One frame from the high-res still burst for a scan."""
    scan = models.ForeignKey(TopographyScan, on_delete=models.CASCADE, related_name='stills')
    image = models.ImageField(upload_to='topography/stills/%Y/%m/%d/')
    index = models.IntegerField()                                # burst order
    sharpness_score = models.FloatField(null=True, blank=True)   # set during analysis
    is_selected = models.BooleanField(default=False)             # chosen best frame

    class Meta:
        ordering = ['index']


class TopographyResult(models.Model):
    """Reconstruction output for a scan."""
    scan = models.OneToOneField(TopographyScan, on_delete=models.CASCADE, related_name='result')

    ring_overlay = models.ImageField(upload_to='topography/overlays/%Y/%m/%d/', blank=True)
    axial_map = models.ImageField(upload_to='topography/axial/%Y/%m/%d/', blank=True)

    sim_k_flat = models.FloatField(null=True, blank=True)            # dioptres (assumed scale)
    sim_k_steep = models.FloatField(null=True, blank=True)           # dioptres (assumed scale)
    sim_k_axis = models.FloatField(null=True, blank=True)            # degrees (steep meridian)
    central_k = models.FloatField(null=True, blank=True)            # dioptres (assumed scale)
    astigmatism_magnitude = models.FloatField(null=True, blank=True) # dioptres (steep - flat)
    astigmatism_axis = models.FloatField(null=True, blank=True)      # degrees

    confidence = models.FloatField(null=True, blank=True)           # 0.0 - 1.0
    algorithm_version = models.CharField(max_length=20, blank=True)  # e.g. "topo-v0.1"
    calibration_state = models.CharField(max_length=20, blank=True)  # copied from scan at analysis
    raw_output = models.JSONField(default=dict, blank=True)          # per-ring / per-meridian arrays
    analysed_at = models.DateTimeField(auto_now_add=True)
```

**Rejected alternatives:** (B) overloading `TestCapture`/`TestResult` with a `topography`
test_type — pollutes `TestResult` with ~12 unrelated fields and can't hold the still burst;
(C) hybrid (reuse `TestCapture` for upload, dedicated result) — `TestCapture` still can't hold
the burst cleanly and splits topography across two apps.

---

## Capture flow (mobile)

### One-time setup (prerequisite)

- Add `react-native-vision-camera` (+ its Expo config plugin) and `expo-dev-client`; run
  `expo prebuild`. Development now runs on a **dev build**, not Expo Go.
- `expo-camera` remains installed for the existing NIBUT capture (coexists for this slice).

### Flow

1. **Select test** (`select-test.tsx`) — add **Topography** as a fourth selectable **modality**
   card. As today, choosing eye + modality creates the `Assessment` (`POST /api/assessments/`,
   eye included) *before* navigating onward; topography then routes to the topography capture
   path below while the other three keep the existing flow. **`'topography'` is *not* added to
   the shared `TestType` union or `TestCapture.test_type`** — it is a distinct modality that
   produces a `TopographyScan`, keeping the tear-film type system clean. The scan inherits its
   eye from the created assessment.
2. **Instructions** — "Fit the Placido attachment, ask the patient to look at the centre dot,
   eye wide open, hold still." (Distinct from NIBUT's "blink then hold.")
3. **Capture** (new `topography-capture.tsx`, vision-camera) — live preview + centring overlay.
   On trigger: record **~1–2s video** *and* fire a **burst of ~3–5 full-res stills** during it
   (simultaneous capture).
4. **Upload** — multipart `POST /api/topography/scans/` (assessment, video, stills[]). Capture
   `device_model`, `phone_model_id`, `app_version`, resolution/fps, timestamps. Payload is far
   smaller than NIBUT's 25s 4K video — no chunked upload needed yet.
5. **Processing** — reuse the existing `processing` screen pattern, polling
   `GET /api/topography/scans/{id}/status/`.
6. **Results** — new minimal `topography-results.tsx` (see Results presentation).

### New / modified mobile files

- New: `app/assessment/topography-capture.tsx`, `app/assessment/topography-results.tsx`
- Modified: `app/assessment/select-test.tsx` (add option), `app/assessment/processing.tsx`
  (poll topography status when given a scan id), `lib/api.ts`, `lib/types.ts`

---

## Analysis pipeline (backend)

Reconstruction modules under `apps/analysis/topography/`, mirroring the existing `nibut.py`
layout. Orchestrated by a Celery task, mirroring `apps/assessments/tasks.py::process_capture`.

```
apps/analysis/topography/
  frames.py      # best-frame selection: Laplacian-variance sharpness + ring completeness + centring
  rings.py       # centre detection (extends detect_placido_roi) + radial ring extraction r(ring, theta)
  reconstruct.py # ring radii -> local radius of curvature (arc-step / zonal); K = (n-1)/R, n = 1.3375
  metrics.py     # SimK flat/steep + steep axis, central K, astigmatism magnitude + axis
  maps.py        # render axial curvature map (dioptre colour scale) + ring-overlay image
  pipeline.py    # analyse_topography_scan(scan) -> result dict (+ image bytes)
```

```
apps/topography/tasks.py
  process_topography_scan(scan_id):
    1. set scan.status = 'processing'
    2. run pipeline: select best still -> mark TopographyStill.is_selected / sharpness_score
    3. extract rings -> reconstruct curvature -> metrics -> render maps
    4. create TopographyResult (calibration_state copied from scan, algorithm_version='topo-v0.1')
    5. set scan.status = 'analysed'   (on exception: 'failed', log)
```

### Reconstruction stages

1. **Best-frame selection** — score burst stills (video frames as fallback) on sharpness, ring
   completeness, centring; mark the winner.
2. **Ring extraction** — find the reflection centre, walk radial spokes (~every 1°), locate each
   ring crossing at sub-pixel precision → `r(ring, θ)`.
3. **Curvature reconstruction** — convert ring radii to local radius of curvature per
   meridian/zone (arc-step / zonal), then to power via `K = (n−1)/R`, keratometric `n = 1.3375`.
4. **Metrics** — SimK flat/steep + steep axis (central ~3 mm zone), central K, astigmatism
   magnitude + axis.
5. **Rendering** — axial curvature map (dioptre colour scale) + ring-overlay image (detected
   rings drawn on the selected frame).

### Honesty model — relative vs absolute

- **Meaningful in slice 1:** the *pattern/shape* of the map and the **astigmatism axis** (derived
  from angular asymmetry, independent of absolute scale).
- **Assumed in slice 1:** absolute **dioptre values** (SimK, central K). Without working distance,
  per-phone camera intrinsics, lens-distortion correction and exact Placido geometry (subsystem A),
  the radius→dioptre scale is a nominal default. Hence `calibration_state='uncalibrated'` on every
  result and a research-use badge in the UI.

### Slice-1 output set

ring-overlay, axial map, SimK flat/steep/axis, central K, astigmatism magnitude+axis, confidence
(from ring-detection completeness / contrast), `raw_output` (per-ring / per-meridian arrays, for
re-processing and debugging).

### Dependencies

OpenCV (`cv2`), NumPy, scikit-image, Pillow — all already in the analysis stack. No new heavy
dependencies.

---

## API endpoints

Mounted at `/api/topography/`, practice-scoped via `assessment__patient__practice` (reusing
`apps.accounts.scoping`).

```
POST  /api/topography/scans/            # multipart: assessment, video, stills[] ->
                                        #   create scan + stills, kick Celery task, return scan id + status
GET   /api/topography/scans/{id}/       # detail, with nested result when analysed
GET   /api/topography/scans/{id}/status/ # poll status; includes result when status == 'analysed'
```

Access rule: the clinician must be able to access the scan's `assessment.patient.practice`
(same rule as existing capture upload / status).

---

## Results presentation

### Web (primary viewing surface)

New `web/src/components/topography/TopographyResult.tsx`, shown under the assessment detail:

- Ring-overlay image and the **axial curvature map** with a dioptre colour legend
- K-value readout: SimK flat/steep + axis, central K, astigmatism magnitude + axis
- Confidence indicator
- Prominent banner: **"Research use — values uncalibrated, not for diagnosis"**
- `algorithm_version` + `calibration_state` shown for provenance

Supporting: `web/src/hooks/useTopography.ts` (TanStack Query), `web/src/lib/api.ts` additions.

### Mobile

New `topography-results.tsx` reusing the `processing → results` pattern: axial map + ring overlay
+ headline K-values + the same research-use banner.

### Shared

- `shared/types/topography.ts` — `TopographyScan`, `TopographyStill`, `TopographyResult`,
  `CalibrationState`
- `shared/constants/topography.ts` — dioptre colour scale, keratometric index `n = 1.3375`,
  nominal/default scale constant

---

## Definition of done (slice 1)

On a dev build, a clinician picks **Topography** in the assessment capture flow → captures
(video + still burst via vision-camera) → uploads → backend reconstructs → sees ring overlay +
axial map + SimK / central K / astigmatism on both mobile and web, every value badged
research-use / uncalibrated, persisted and versioned.

---

## Testing

Even without absolute calibration, **relative correctness** is testable against fixture images:

- **Synthetic fixtures** (generated in tests): a perfect concentric pattern → ~zero astigmatism;
  a known astigmatic pattern → the **correct axis** (within tolerance).
- Best-frame selection picks the sharpest of a burst.
- Metric maths (SimK / astigmatism from a known curvature field).
- `calibration_state` / `algorithm_version` populated on every result.
- API tests: scan-create, status-poll, result detail — with practice-scoping (reuse the existing
  scoping test pattern).

Real ring frames from the actual rig are welcome as additional fixtures when available — not
required to build or test slice 1.

Mobile testing is lighter: capture screen renders, upload wiring covered; manual verification on
a real device build.

---

## Setup / migration steps

- Mobile: add `react-native-vision-camera` + config plugin + `expo-dev-client`; `expo prebuild`;
  switch dev workflow to the development build.
- Backend: create `apps/topography`; add to `INSTALLED_APPS` (`base.py`); include its `urls`;
  generate migration `0001_initial`.
- No new backend dependencies (OpenCV / NumPy / scikit-image / Pillow already present).

---

## Out of scope (this slice)

**Deferred to subsystem A (calibration):** phone-model registry, per-model camera profile,
attachment profile, lens-distortion correction, fitted-attachment setup check, reference-sphere
calibration mode, wrong-attachment warning, full hardware/software version tracking, and
therefore metrically-valid absolute K-values.

**Deferred to subsystem B (reconstruction depth):** tangential curvature map, irregularity score,
inferior–superior asymmetry, keratoconus **suspicion** flag (only if clinically validated),
left/right comparison.

**Deferred to subsystem C (longitudinal):** previous-scan list, side-by-side comparison,
progression deltas, "Stable / Possible progression / Retake required" status, progression alerts.

**Also out of scope now:** real frame-processor alignment (overlay turns green on true ring lock);
migrating the existing NIBUT capture to vision-camera; chunked upload for topography payloads.
