# Corneal Topography — Backend (Slice 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the headless backend for the topography walking skeleton — models, a deterministic ring-reconstruction pipeline, a Celery task, and a practice-scoped API — so a posted ring image yields a stored axial map + SimK/astigmatism result, fully unit- and API-tested against synthetic fixtures.

**Architecture:** New `apps/topography` app holds the API/domain models (`TopographyScan` / `TopographyStill` / `TopographyResult`) reusing the existing `Assessment` session. Reconstruction code lives under `apps/analysis/topography/` (mirroring `nibut.py`): best-frame selection → ring extraction → curvature → metrics → map rendering, orchestrated by a DB-free `analyse_topography_frame()` that a Celery task wraps. Every result is stamped `calibration_state='uncalibrated'` + `algorithm_version='topo-v0.1'`.

**Tech Stack:** Django 5.x + DRF, Celery, OpenCV (`opencv-python-headless`), NumPy, Pillow, pytest + pytest-django. No new dependencies.

## Global Constraints

- Python 3.12+, Django 5.x + Django REST Framework.
- **No new backend dependencies** — `opencv-python-headless`, `numpy`, `scikit-image`, `Pillow`, `celery`, `pytest`, `pytest-django` are already in `requirements/base.txt`.
- `algorithm_version = 'topo-v0.1'` (exact string) on every result.
- `calibration_state` defaults to `'uncalibrated'`; the result copies it from its scan.
- Keratometric index `n = 1.3375`. `NOMINAL_DIOPTRE_SCALE` is an explicit calibration **placeholder** (subsystem A replaces it) — absolute dioptres are not metrically valid.
- Practice-scoping on every endpoint via `assessment__patient__practice`, reusing `apps.accounts.scoping` (`accessible_practice_ids`, `scope_queryset`).
- Reuse the existing `Assessment` session as the container; topography is a distinct modality, **not** a `TestCapture` test type.
- **Do NOT compute or emit** tangential map, irregularity score, inferior–superior asymmetry, keratoconus flag, or L/R comparison — deferred to subsystem B.
- Tests assert **relative correctness** against synthetic fixtures (concentric → ~zero astigmatism; astigmatic → non-zero with recoverable axis), never absolute dioptre values.
- All `pytest` commands run from `/opt/tearflex/backend`. All `git` commands run from `/opt/tearflex`.

---

## File Structure

**New — domain app (`backend/apps/topography/`):**
- `__init__.py`, `apps.py` — app config
- `models.py` — `TopographyScan`, `TopographyStill`, `TopographyResult`
- `migrations/__init__.py`, `migrations/0001_initial.py` (generated)
- `serializers.py` — scan create / detail / result serializers
- `views.py` — create / detail / status views
- `urls.py` — routes under `/api/topography/`
- `tasks.py` — `process_topography_scan` Celery task
- `tests/__init__.py`, `tests/test_models.py`, `tests/test_tasks.py`, `tests/test_api.py`

**New — reconstruction (`backend/apps/analysis/topography/`):**
- `__init__.py`
- `frames.py` — `sharpness`, `select_best_frame`
- `rings.py` — `find_reflection_center`, `extract_rings`
- `reconstruct.py` — `reconstruct_curvature` (+ constants)
- `metrics.py` — `compute_metrics`
- `maps.py` — `render_ring_overlay`, `render_axial_map`
- `pipeline.py` — `analyse_topography_frame`, `ALGORITHM_VERSION`
- `tests/__init__.py`, `tests/synthetic.py` (fixture generator), `tests/test_synthetic.py`, `tests/test_rings.py`, `tests/test_reconstruct.py`, `tests/test_metrics.py`, `tests/test_frames.py`, `tests/test_maps.py`, `tests/test_pipeline.py`

**Modified:**
- `backend/tearflex/settings/base.py` — add `'apps.topography'` to `INSTALLED_APPS`
- `backend/tearflex/urls.py` — mount `api/topography/`

---

### Task 1: Topography models, app scaffold & migration

**Files:**
- Create: `backend/apps/topography/__init__.py`, `backend/apps/topography/apps.py`, `backend/apps/topography/models.py`, `backend/apps/topography/migrations/__init__.py`, `backend/apps/topography/tests/__init__.py`
- Modify: `backend/tearflex/settings/base.py` (INSTALLED_APPS)
- Test: `backend/apps/topography/tests/test_models.py`

**Interfaces:**
- Produces: `TopographyScan(assessment FK, video_file, device_model, phone_model_id, app_version, calibration_state='uncalibrated', status='uploaded', celery_task_id, captured_at, updated_at)`; `TopographyStill(scan FK related_name='stills', image, index, sharpness_score, is_selected)`; `TopographyResult(scan O2O related_name='result', ring_overlay, axial_map, sim_k_flat, sim_k_steep, sim_k_axis, central_k, astigmatism_magnitude, astigmatism_axis, confidence, algorithm_version, calibration_state, raw_output, analysed_at)`.

- [ ] **Step 1: Create the app package and config**

`backend/apps/topography/__init__.py`: empty file.

`backend/apps/topography/apps.py`:
```python
from django.apps import AppConfig


class TopographyConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.topography'
```

`backend/apps/topography/migrations/__init__.py`: empty file.
`backend/apps/topography/tests/__init__.py`: empty file.

- [ ] **Step 2: Write the models**

`backend/apps/topography/models.py`:
```python
from django.db import models


class TopographyScan(models.Model):
    """A corneal topography capture within an assessment session."""
    STATUS_CHOICES = [
        ('uploaded', 'Uploaded'),
        ('processing', 'Processing'),
        ('analysed', 'Analysed'),
        ('failed', 'Failed'),
    ]
    CALIBRATION_STATE_CHOICES = [
        ('uncalibrated', 'Uncalibrated'),
        ('default', 'Default profile'),
        ('calibrated', 'Calibrated'),
    ]

    assessment = models.ForeignKey('assessments.Assessment', on_delete=models.CASCADE,
                                   related_name='topography_scans')
    video_file = models.FileField(upload_to='topography/video/%Y/%m/%d/', blank=True, null=True)
    device_model = models.CharField(max_length=100, blank=True)
    phone_model_id = models.CharField(max_length=100, blank=True)
    app_version = models.CharField(max_length=20, blank=True)
    calibration_state = models.CharField(max_length=20, choices=CALIBRATION_STATE_CHOICES,
                                         default='uncalibrated')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='uploaded')
    celery_task_id = models.CharField(max_length=255, blank=True)
    captured_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-captured_at']

    def __str__(self):
        return f'Topography scan {self.pk} ({self.status})'


class TopographyStill(models.Model):
    """One frame from the high-res still burst for a scan."""
    scan = models.ForeignKey(TopographyScan, on_delete=models.CASCADE, related_name='stills')
    image = models.ImageField(upload_to='topography/stills/%Y/%m/%d/')
    index = models.IntegerField()
    sharpness_score = models.FloatField(null=True, blank=True)
    is_selected = models.BooleanField(default=False)

    class Meta:
        ordering = ['index']


class TopographyResult(models.Model):
    """Reconstruction output for a scan."""
    scan = models.OneToOneField(TopographyScan, on_delete=models.CASCADE, related_name='result')

    ring_overlay = models.ImageField(upload_to='topography/overlays/%Y/%m/%d/', blank=True)
    axial_map = models.ImageField(upload_to='topography/axial/%Y/%m/%d/', blank=True)

    sim_k_flat = models.FloatField(null=True, blank=True)
    sim_k_steep = models.FloatField(null=True, blank=True)
    sim_k_axis = models.FloatField(null=True, blank=True)
    central_k = models.FloatField(null=True, blank=True)
    astigmatism_magnitude = models.FloatField(null=True, blank=True)
    astigmatism_axis = models.FloatField(null=True, blank=True)

    confidence = models.FloatField(null=True, blank=True)
    algorithm_version = models.CharField(max_length=20, blank=True)
    calibration_state = models.CharField(max_length=20, blank=True)
    raw_output = models.JSONField(default=dict, blank=True)
    analysed_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f'Result for scan {self.scan_id}'
```

- [ ] **Step 3: Register the app**

In `backend/tearflex/settings/base.py`, add `'apps.topography',` to `INSTALLED_APPS` immediately after `'apps.analysis',`:
```python
    'apps.assessments',
    'apps.analysis',
    'apps.topography',
```

- [ ] **Step 4: Write the failing test**

`backend/apps/topography/tests/test_models.py`:
```python
import pytest
from conftest import AssessmentFactory
from apps.topography.models import TopographyScan, TopographyStill, TopographyResult


@pytest.mark.django_db
def test_scan_creation_defaults():
    assessment = AssessmentFactory()
    scan = TopographyScan.objects.create(assessment=assessment)
    assert scan.status == 'uploaded'
    assert scan.calibration_state == 'uncalibrated'
    assert scan.assessment_id == assessment.id


@pytest.mark.django_db
def test_still_and_result_relations():
    assessment = AssessmentFactory()
    scan = TopographyScan.objects.create(assessment=assessment)
    still = TopographyStill.objects.create(scan=scan, image='topography/stills/x.png', index=0)
    result = TopographyResult.objects.create(
        scan=scan, sim_k_steep=44.0, sim_k_flat=42.0,
        algorithm_version='topo-v0.1', calibration_state='uncalibrated',
    )
    assert list(scan.stills.all()) == [still]
    assert scan.result == result
    assert scan.result.astigmatism_magnitude is None
```

- [ ] **Step 5: Generate the migration and run the test (expect fail then pass)**

Run: `cd /opt/tearflex/backend && python manage.py makemigrations topography`
Expected: creates `apps/topography/migrations/0001_initial.py`.

Run: `cd /opt/tearflex/backend && pytest apps/topography/tests/test_models.py -v`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
cd /opt/tearflex && git add backend/apps/topography backend/tearflex/settings/base.py && \
git commit -m "feat(topography): add scan/still/result models and app scaffold"
```

---

### Task 2: Synthetic ring fixture generator

**Files:**
- Create: `backend/apps/analysis/topography/__init__.py`, `backend/apps/analysis/topography/tests/__init__.py`, `backend/apps/analysis/topography/tests/synthetic.py`
- Test: `backend/apps/analysis/topography/tests/test_synthetic.py`

**Interfaces:**
- Produces: `make_ring_image(size=512, n_rings=8, ring_step=22, center=None, steep_axis_deg=0.0, astigmatism=0.0, blur=1.5, thickness=2) -> tuple[np.ndarray, dict]`. Image is BGR `uint8`; ground-truth dict has keys `center`, `n_rings`, `ring_step`, `steep_axis_deg`, `astigmatism`. Rings are concentric ellipses; `astigmatism` compresses them along `steep_axis_deg` (0 → perfect circles).

- [ ] **Step 1: Create package init files**

`backend/apps/analysis/topography/__init__.py`: empty.
`backend/apps/analysis/topography/tests/__init__.py`: empty.

- [ ] **Step 2: Write the failing test**

`backend/apps/analysis/topography/tests/test_synthetic.py`:
```python
import cv2
import numpy as np
from apps.analysis.topography.tests.synthetic import make_ring_image


def test_make_ring_image_shape_and_truth():
    img, gt = make_ring_image(size=256, n_rings=6, blur=0.0)
    assert img.shape == (256, 256, 3)
    assert img.dtype == np.uint8
    assert gt['n_rings'] == 6
    assert gt['center'] == (128, 128)
    assert img.max() > 0


def test_astigmatism_compresses_steep_axis():
    # steep axis horizontal (0 deg) -> rings compressed in x, extend further in y
    img, _ = make_ring_image(size=400, n_rings=6, astigmatism=0.3,
                             steep_axis_deg=0.0, blur=0.0)
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    ys, xs = np.where(gray > 50)
    cx, cy = 200, 200
    x_extent = np.abs(xs - cx).max()
    y_extent = np.abs(ys - cy).max()
    assert y_extent > x_extent
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd /opt/tearflex/backend && pytest apps/analysis/topography/tests/test_synthetic.py -v`
Expected: FAIL with `ModuleNotFoundError: ...synthetic`.

- [ ] **Step 4: Write the generator**

`backend/apps/analysis/topography/tests/synthetic.py`:
```python
import cv2
import numpy as np


def make_ring_image(
    size: int = 512,
    n_rings: int = 8,
    ring_step: int = 22,
    center: tuple[int, int] | None = None,
    steep_axis_deg: float = 0.0,
    astigmatism: float = 0.0,
    blur: float = 1.5,
    thickness: int = 2,
) -> tuple[np.ndarray, dict]:
    """Synthetic Placido ring reflection (concentric ellipses).

    `astigmatism` (0..~0.4) compresses ring radii along `steep_axis_deg`
    (the steeper meridian), so 0 yields perfect circles. Returns
    (BGR uint8 image, ground_truth dict).
    """
    if center is None:
        center = (size // 2, size // 2)
    img = np.zeros((size, size, 3), dtype=np.uint8)
    for k in range(1, n_rings + 1):
        r = ring_step * k
        semi_steep = int(round(r * (1.0 - astigmatism / 2.0)))
        semi_flat = int(round(r * (1.0 + astigmatism / 2.0)))
        # cv2.ellipse axes = (half-length along `angle` direction, perpendicular).
        # Put the smaller (steep) axis along steep_axis_deg.
        cv2.ellipse(img, center, (semi_steep, semi_flat), steep_axis_deg,
                    0, 360, (210, 210, 210), thickness, cv2.LINE_AA)
    if blur > 0:
        img = cv2.GaussianBlur(img, (0, 0), blur)
    ground_truth = {
        'center': center,
        'n_rings': n_rings,
        'ring_step': ring_step,
        'steep_axis_deg': steep_axis_deg % 180.0,
        'astigmatism': astigmatism,
    }
    return img, ground_truth
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd /opt/tearflex/backend && pytest apps/analysis/topography/tests/test_synthetic.py -v`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
cd /opt/tearflex && git add backend/apps/analysis/topography && \
git commit -m "test(topography): add synthetic Placido ring fixture generator"
```

---

### Task 3: Ring extraction (`rings.py`)

**Files:**
- Create: `backend/apps/analysis/topography/rings.py`
- Test: `backend/apps/analysis/topography/tests/test_rings.py`

**Interfaces:**
- Consumes: `make_ring_image` (Task 2).
- Produces: `find_reflection_center(gray: np.ndarray) -> tuple[float, float]`; `extract_rings(gray: np.ndarray, center: tuple[float, float], n_angles=180, max_rings=10) -> dict` with keys `center`, `angles_deg` `(n_angles,)`, `radii` `(n_angles, n_rings)` ascending, `n_rings: int`, `completeness: float` (fraction of spokes that found ≥ `n_rings` peaks).

- [ ] **Step 1: Write the failing test**

`backend/apps/analysis/topography/tests/test_rings.py`:
```python
import cv2
import numpy as np
from apps.analysis.topography.rings import find_reflection_center, extract_rings
from apps.analysis.topography.tests.synthetic import make_ring_image


def _gray(**kw):
    img, gt = make_ring_image(**kw)
    return cv2.cvtColor(img, cv2.COLOR_BGR2GRAY), gt


def test_find_center_on_centered_rings():
    gray, gt = _gray(size=400, n_rings=6)
    cx, cy = find_reflection_center(gray)
    assert abs(cx - gt['center'][0]) < 6
    assert abs(cy - gt['center'][1]) < 6


def test_extract_rings_concentric_radii_increase():
    gray, _ = _gray(size=400, n_rings=6, ring_step=24, astigmatism=0.0)
    rings = extract_rings(gray, find_reflection_center(gray))
    assert rings['n_rings'] >= 4
    mean_radii = rings['radii'].mean(axis=0)
    assert np.all(np.diff(mean_radii) > 0)
    per_angle = rings['radii'].mean(axis=1)
    assert per_angle.std() / per_angle.mean() < 0.05
    assert rings['completeness'] > 0.8


def test_extract_rings_astigmatic_varies_by_meridian():
    gray, _ = _gray(size=400, n_rings=6, astigmatism=0.3, steep_axis_deg=0.0)
    rings = extract_rings(gray, find_reflection_center(gray))
    per_angle = rings['radii'].mean(axis=1)
    assert per_angle.std() / per_angle.mean() > 0.05
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /opt/tearflex/backend && pytest apps/analysis/topography/tests/test_rings.py -v`
Expected: FAIL with `ModuleNotFoundError: ...rings`.

- [ ] **Step 3: Write the implementation**

`backend/apps/analysis/topography/rings.py`:
```python
import cv2
import numpy as np

CENTER_INTENSITY_PERCENTILE = 92.0
PEAK_MIN_RELATIVE_HEIGHT = 0.35


def find_reflection_center(gray: np.ndarray) -> tuple[float, float]:
    """Intensity-weighted centroid of the brightest pixels (the ring pattern)."""
    h, w = gray.shape
    thresh = np.percentile(gray, CENTER_INTENSITY_PERCENTILE)
    mask = gray >= thresh
    if not mask.any():
        return (w / 2.0, h / 2.0)
    ys, xs = np.nonzero(mask)
    weights = gray[ys, xs].astype(np.float64)
    return (float(np.average(xs, weights=weights)), float(np.average(ys, weights=weights)))


def _find_peaks(profile: np.ndarray, min_rel_height: float = PEAK_MIN_RELATIVE_HEIGHT) -> list[float]:
    """Sub-pixel indices of local maxima above a relative-height threshold."""
    if profile.size < 3:
        return []
    span = float(profile.max() - profile.min())
    if span <= 1e-6:
        return []
    thr = profile.min() + min_rel_height * span
    peaks: list[float] = []
    for i in range(1, profile.size - 1):
        if profile[i] >= thr and profile[i] >= profile[i - 1] and profile[i] > profile[i + 1]:
            denom = profile[i - 1] - 2 * profile[i] + profile[i + 1]
            delta = 0.5 * (profile[i - 1] - profile[i + 1]) / denom if denom != 0 else 0.0
            peaks.append(i + float(np.clip(delta, -1.0, 1.0)))
    return peaks


def extract_rings(gray: np.ndarray, center: tuple[float, float],
                  n_angles: int = 180, max_rings: int = 10) -> dict:
    """Sample radial intensity profiles around `center` and locate ring crossings."""
    cx, cy = center
    h, w = gray.shape
    max_r = int(min(cx, cy, w - cx, h - cy)) - 2
    if max_r < 5:
        raise ValueError("Reflection centre too close to image edge for ring extraction")

    polar = cv2.warpPolar(
        gray.astype(np.float32), (max_r, n_angles), (cx, cy), max_r,
        cv2.WARP_POLAR_LINEAR + cv2.WARP_FILL_OUTLIERS,
    )  # shape (n_angles, max_r): row = angle, col = radius

    per_spoke = [_find_peaks(polar[i])[:max_rings] for i in range(n_angles)]
    positive_counts = [len(p) for p in per_spoke if p]
    n_rings = max(1, min(positive_counts)) if positive_counts else 1
    n_rings = min(n_rings, max_rings)

    radii = np.full((n_angles, n_rings), np.nan, dtype=np.float64)
    complete = 0
    for i, peaks in enumerate(per_spoke):
        srt = sorted(peaks)
        if len(srt) >= n_rings:
            radii[i] = srt[:n_rings]
            complete += 1
        elif srt:
            radii[i, :len(srt)] = srt
            radii[i, len(srt):] = srt[-1]

    col_means = np.nanmean(radii, axis=0)
    nan_idx = np.where(np.isnan(radii))
    radii[nan_idx] = np.take(col_means, nan_idx[1])

    return {
        'center': (float(cx), float(cy)),
        'angles_deg': np.arange(n_angles) * (360.0 / n_angles),
        'radii': radii,
        'n_rings': int(n_rings),
        'completeness': float(complete / n_angles),
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /opt/tearflex/backend && pytest apps/analysis/topography/tests/test_rings.py -v`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
cd /opt/tearflex && git add backend/apps/analysis/topography/rings.py backend/apps/analysis/topography/tests/test_rings.py && \
git commit -m "feat(topography): ring centre detection and radial ring extraction"
```

---

### Task 4: Curvature reconstruction (`reconstruct.py`)

**Files:**
- Create: `backend/apps/analysis/topography/reconstruct.py`
- Test: `backend/apps/analysis/topography/tests/test_reconstruct.py`

**Interfaces:**
- Consumes: `extract_rings` output dict (Task 3).
- Produces: `KERATOMETRIC_INDEX = 1.3375`, `NOMINAL_DIOPTRE_SCALE = 4300.0`; `reconstruct_curvature(rings: dict, scale=NOMINAL_DIOPTRE_SCALE) -> dict` with keys `angles_deg`, `mean_radius_per_angle` `(n_angles,)`, `power_per_angle` `(n_angles,)` (dioptres), `central_power: float`, `scale: float`, `n_index: float`.

- [ ] **Step 1: Write the failing test**

`backend/apps/analysis/topography/tests/test_reconstruct.py`:
```python
import cv2
from apps.analysis.topography.rings import find_reflection_center, extract_rings
from apps.analysis.topography.reconstruct import reconstruct_curvature
from apps.analysis.topography.tests.synthetic import make_ring_image


def _curv(astig, axis=0.0):
    img, _ = make_ring_image(size=400, n_rings=6, astigmatism=astig, steep_axis_deg=axis)
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    return reconstruct_curvature(extract_rings(gray, find_reflection_center(gray)))


def test_power_profile_flat_for_concentric():
    p = _curv(0.0)['power_per_angle']
    assert p.std() / p.mean() < 0.05


def test_power_profile_varies_for_astigmatic():
    c = _curv(0.3)
    p = c['power_per_angle']
    assert p.std() / p.mean() > 0.05
    assert c['central_power'] > 0
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /opt/tearflex/backend && pytest apps/analysis/topography/tests/test_reconstruct.py -v`
Expected: FAIL with `ModuleNotFoundError: ...reconstruct`.

- [ ] **Step 3: Write the implementation**

`backend/apps/analysis/topography/reconstruct.py`:
```python
import numpy as np

KERATOMETRIC_INDEX = 1.3375
# Placeholder pixel-radius -> dioptre scale. Calibration (subsystem A) replaces
# this with a per-device/attachment transform. Chosen so typical mean ring radii
# land near physiological keratometry (~43 D); NOT metrically valid.
NOMINAL_DIOPTRE_SCALE = 4300.0


def reconstruct_curvature(rings: dict, scale: float = NOMINAL_DIOPTRE_SCALE) -> dict:
    """Map ring radii to a per-meridian apparent power profile (uncalibrated)."""
    radii = rings['radii']
    mean_radius_per_angle = radii.mean(axis=1)
    power_per_angle = scale / mean_radius_per_angle
    central_power = float(np.mean(scale / radii[:, 0]))
    return {
        'angles_deg': rings['angles_deg'],
        'mean_radius_per_angle': mean_radius_per_angle,
        'power_per_angle': power_per_angle,
        'central_power': central_power,
        'scale': float(scale),
        'n_index': KERATOMETRIC_INDEX,
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /opt/tearflex/backend && pytest apps/analysis/topography/tests/test_reconstruct.py -v`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
cd /opt/tearflex && git add backend/apps/analysis/topography/reconstruct.py backend/apps/analysis/topography/tests/test_reconstruct.py && \
git commit -m "feat(topography): per-meridian curvature reconstruction (uncalibrated scale)"
```

---

### Task 5: Metrics (`metrics.py`)

**Files:**
- Create: `backend/apps/analysis/topography/metrics.py`
- Test: `backend/apps/analysis/topography/tests/test_metrics.py`

**Interfaces:**
- Consumes: `reconstruct_curvature` output dict (Task 4).
- Produces: `compute_metrics(curvature: dict) -> dict` with float keys `sim_k_flat`, `sim_k_steep`, `sim_k_axis` (deg, steep meridian, `[0,180)`), `central_k`, `astigmatism_magnitude`, `astigmatism_axis` (= `sim_k_axis`).

- [ ] **Step 1: Write the failing test**

`backend/apps/analysis/topography/tests/test_metrics.py`:
```python
import cv2
import pytest
from apps.analysis.topography.rings import find_reflection_center, extract_rings
from apps.analysis.topography.reconstruct import reconstruct_curvature
from apps.analysis.topography.metrics import compute_metrics
from apps.analysis.topography.tests.synthetic import make_ring_image


def _metrics(astig, axis):
    img, _ = make_ring_image(size=420, n_rings=7, astigmatism=astig, steep_axis_deg=axis)
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    return compute_metrics(reconstruct_curvature(extract_rings(gray, find_reflection_center(gray))))


def _circular_diff(a, b):
    return abs(((a - b + 90) % 180) - 90)


def test_concentric_has_near_zero_astigmatism():
    m = _metrics(0.0, 0.0)
    assert m['astigmatism_magnitude'] < 0.05 * m['central_k']
    assert m['sim_k_steep'] == pytest.approx(m['sim_k_flat'], rel=0.05)


@pytest.mark.parametrize('axis', [0.0, 90.0])
def test_cardinal_axis_recovered(axis):
    m = _metrics(0.3, axis)
    assert m['astigmatism_magnitude'] > 0.1 * m['central_k']
    assert _circular_diff(m['sim_k_axis'], axis) < 12.0


def test_diagonal_axis_detected():
    # 45 vs 135 depends on polar handedness; assert it lands diagonal, not cardinal.
    m = _metrics(0.3, 45.0)
    assert min(_circular_diff(m['sim_k_axis'], 45.0),
               _circular_diff(m['sim_k_axis'], 135.0)) < 15.0
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /opt/tearflex/backend && pytest apps/analysis/topography/tests/test_metrics.py -v`
Expected: FAIL with `ModuleNotFoundError: ...metrics`.

- [ ] **Step 3: Write the implementation**

`backend/apps/analysis/topography/metrics.py`:
```python
import numpy as np


def compute_metrics(curvature: dict) -> dict:
    """Fit a sinusoidal (regular-astigmatism) model to the power profile.

    power(theta) = c0 + c1*cos(2 theta) + c2*sin(2 theta)
                 = c0 + amp * cos(2(theta - steep_axis))
    Maximum power (steepest meridian) is at theta = 0.5*atan2(c2, c1).
    """
    theta = np.deg2rad(curvature['angles_deg'])
    power = curvature['power_per_angle']
    design = np.column_stack([np.ones_like(theta), np.cos(2 * theta), np.sin(2 * theta)])
    c0, c1, c2 = np.linalg.lstsq(design, power, rcond=None)[0]
    amp = float(np.hypot(c1, c2))
    steep_axis_deg = float(np.rad2deg(0.5 * np.arctan2(c2, c1)) % 180.0)
    return {
        'sim_k_steep': float(c0 + amp),
        'sim_k_flat': float(c0 - amp),
        'sim_k_axis': steep_axis_deg,
        'astigmatism_magnitude': float(2 * amp),
        'astigmatism_axis': steep_axis_deg,
        'central_k': float(curvature['central_power']),
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /opt/tearflex/backend && pytest apps/analysis/topography/tests/test_metrics.py -v`
Expected: PASS (4 tests). If a cardinal-axis test fails by ~90°, the polar/ellipse handedness is inverted — confirm `make_ring_image` and `extract_rings` share the `+x = 0°` convention before adjusting.

- [ ] **Step 5: Commit**

```bash
cd /opt/tearflex && git add backend/apps/analysis/topography/metrics.py backend/apps/analysis/topography/tests/test_metrics.py && \
git commit -m "feat(topography): SimK, central K and astigmatism metrics"
```

---

### Task 6: Best-frame selection (`frames.py`)

**Files:**
- Create: `backend/apps/analysis/topography/frames.py`
- Test: `backend/apps/analysis/topography/tests/test_frames.py`

**Interfaces:**
- Produces: `sharpness(gray: np.ndarray) -> float` (Laplacian variance); `select_best_frame(images: list[np.ndarray]) -> int` (index of sharpest BGR frame; raises `ValueError` on empty list).

- [ ] **Step 1: Write the failing test**

`backend/apps/analysis/topography/tests/test_frames.py`:
```python
import cv2
import pytest
from apps.analysis.topography.frames import sharpness, select_best_frame
from apps.analysis.topography.tests.synthetic import make_ring_image


def _g(im):
    return cv2.cvtColor(im, cv2.COLOR_BGR2GRAY)


def test_sharpness_higher_for_crisper_image():
    crisp, _ = make_ring_image(blur=0.0)
    soft, _ = make_ring_image(blur=4.0)
    assert sharpness(_g(crisp)) > sharpness(_g(soft))


def test_select_best_frame_picks_sharpest():
    soft, _ = make_ring_image(blur=4.0)
    crisp, _ = make_ring_image(blur=0.0)
    blurry, _ = make_ring_image(blur=6.0)
    assert select_best_frame([soft, crisp, blurry]) == 1


def test_select_best_frame_empty_raises():
    with pytest.raises(ValueError):
        select_best_frame([])
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /opt/tearflex/backend && pytest apps/analysis/topography/tests/test_frames.py -v`
Expected: FAIL with `ModuleNotFoundError: ...frames`.

- [ ] **Step 3: Write the implementation**

`backend/apps/analysis/topography/frames.py`:
```python
import cv2
import numpy as np


def sharpness(gray: np.ndarray) -> float:
    """Variance of the Laplacian — higher means crisper focus."""
    return float(cv2.Laplacian(gray, cv2.CV_64F).var())


def select_best_frame(images: list[np.ndarray]) -> int:
    """Index of the sharpest image among BGR frames."""
    if not images:
        raise ValueError("No images to select from")
    scores = [sharpness(cv2.cvtColor(im, cv2.COLOR_BGR2GRAY)) for im in images]
    return int(np.argmax(scores))
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /opt/tearflex/backend && pytest apps/analysis/topography/tests/test_frames.py -v`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
cd /opt/tearflex && git add backend/apps/analysis/topography/frames.py backend/apps/analysis/topography/tests/test_frames.py && \
git commit -m "feat(topography): best-frame selection by Laplacian sharpness"
```

---

### Task 7: Map rendering (`maps.py`)

**Files:**
- Create: `backend/apps/analysis/topography/maps.py`
- Test: `backend/apps/analysis/topography/tests/test_maps.py`

**Interfaces:**
- Consumes: `extract_rings` dict (Task 3), `reconstruct_curvature` dict (Task 4).
- Produces: `render_ring_overlay(bgr: np.ndarray, rings: dict) -> PIL.Image.Image` (same WxH as input); `render_axial_map(curvature: dict, size=400) -> PIL.Image.Image` (`size` x `size`).

- [ ] **Step 1: Write the failing test**

`backend/apps/analysis/topography/tests/test_maps.py`:
```python
import cv2
from PIL import Image
from apps.analysis.topography.rings import find_reflection_center, extract_rings
from apps.analysis.topography.reconstruct import reconstruct_curvature
from apps.analysis.topography.maps import render_ring_overlay, render_axial_map
from apps.analysis.topography.tests.synthetic import make_ring_image


def _setup(astig=0.2):
    img, _ = make_ring_image(size=400, n_rings=6, astigmatism=astig)
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    return img, extract_rings(gray, find_reflection_center(gray))


def test_ring_overlay_is_image_same_size():
    img, rings = _setup()
    out = render_ring_overlay(img, rings)
    assert isinstance(out, Image.Image)
    assert out.size == (img.shape[1], img.shape[0])


def test_axial_map_renders_requested_size():
    img, rings = _setup()
    out = render_axial_map(reconstruct_curvature(rings), size=300)
    assert isinstance(out, Image.Image)
    assert out.size == (300, 300)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /opt/tearflex/backend && pytest apps/analysis/topography/tests/test_maps.py -v`
Expected: FAIL with `ModuleNotFoundError: ...maps`.

- [ ] **Step 3: Write the implementation**

`backend/apps/analysis/topography/maps.py`:
```python
import cv2
import numpy as np
from PIL import Image


def render_ring_overlay(bgr: np.ndarray, rings: dict) -> Image.Image:
    """Draw detected ring points and the centre marker on the frame."""
    out = bgr.copy()
    cx, cy = rings['center']
    angles = np.deg2rad(rings['angles_deg'])
    for j in range(rings['n_rings']):
        for i, a in enumerate(angles):
            r = rings['radii'][i, j]
            x = int(round(cx + r * np.cos(a)))
            y = int(round(cy + r * np.sin(a)))
            if 0 <= x < out.shape[1] and 0 <= y < out.shape[0]:
                cv2.circle(out, (x, y), 1, (0, 230, 30), -1)
    cv2.drawMarker(out, (int(round(cx)), int(round(cy))), (0, 0, 255),
                   cv2.MARKER_CROSS, 12, 2)
    return Image.fromarray(cv2.cvtColor(out, cv2.COLOR_BGR2RGB))


def render_axial_map(curvature: dict, size: int = 400) -> Image.Image:
    """Colour-map the per-meridian power profile across a disc (radially uniform).

    Slice-1 rendering: shows astigmatism orientation. Radial (zone) variation and
    a true axial/sagittal reference are subsystem B.
    """
    angles_deg = curvature['angles_deg']
    power = curvature['power_per_angle']
    yy, xx = np.mgrid[0:size, 0:size]
    c = size / 2.0
    dx, dy = xx - c, yy - c
    rr = np.hypot(dx, dy)
    ang = np.rad2deg(np.arctan2(dy, dx)) % 360.0
    field = np.interp(ang, angles_deg, power, period=360.0)

    pmin, pmax = float(power.min()), float(power.max())
    if pmax - pmin < 1e-6:
        norm = np.full((size, size), 128, dtype=np.uint8)
    else:
        norm = np.clip((field - pmin) / (pmax - pmin) * 255, 0, 255).astype(np.uint8)
    coloured = cv2.applyColorMap(norm, cv2.COLORMAP_JET)
    coloured[rr > (c - 2)] = (255, 255, 255)
    return Image.fromarray(cv2.cvtColor(coloured, cv2.COLOR_BGR2RGB))
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /opt/tearflex/backend && pytest apps/analysis/topography/tests/test_maps.py -v`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
cd /opt/tearflex && git add backend/apps/analysis/topography/maps.py backend/apps/analysis/topography/tests/test_maps.py && \
git commit -m "feat(topography): ring-overlay and axial-map rendering"
```

---

### Task 8: Pipeline orchestrator (`pipeline.py`)

**Files:**
- Create: `backend/apps/analysis/topography/pipeline.py`
- Test: `backend/apps/analysis/topography/tests/test_pipeline.py`

**Interfaces:**
- Consumes: Tasks 3–7 functions; `apps.analysis.utils.pil_image_to_django_file` (existing — returns PNG `bytes`).
- Produces: `ALGORITHM_VERSION = 'topo-v0.1'`; `analyse_topography_frame(bgr: np.ndarray) -> dict` containing the `compute_metrics` keys plus `confidence: float`, `algorithm_version: str`, `ring_overlay_png: bytes`, `axial_map_png: bytes`, `raw_output: dict`.

- [ ] **Step 1: Write the failing test**

`backend/apps/analysis/topography/tests/test_pipeline.py`:
```python
from apps.analysis.topography.pipeline import analyse_topography_frame, ALGORITHM_VERSION
from apps.analysis.topography.tests.synthetic import make_ring_image


def test_pipeline_returns_full_result():
    img, _ = make_ring_image(size=420, n_rings=7, astigmatism=0.0)
    res = analyse_topography_frame(img)
    for key in ('sim_k_flat', 'sim_k_steep', 'sim_k_axis', 'central_k',
                'astigmatism_magnitude', 'astigmatism_axis', 'confidence'):
        assert key in res
    assert res['algorithm_version'] == ALGORITHM_VERSION
    assert isinstance(res['ring_overlay_png'], (bytes, bytearray))
    assert isinstance(res['axial_map_png'], (bytes, bytearray))
    assert res['astigmatism_magnitude'] < 0.1 * res['central_k']
    assert 0.0 <= res['confidence'] <= 1.0
    assert res['raw_output']['n_rings'] >= 4
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /opt/tearflex/backend && pytest apps/analysis/topography/tests/test_pipeline.py -v`
Expected: FAIL with `ModuleNotFoundError: ...pipeline`.

- [ ] **Step 3: Write the implementation**

`backend/apps/analysis/topography/pipeline.py`:
```python
import cv2
import numpy as np
from apps.analysis.utils import pil_image_to_django_file
from .rings import find_reflection_center, extract_rings
from .reconstruct import reconstruct_curvature
from .metrics import compute_metrics
from .maps import render_ring_overlay, render_axial_map

ALGORITHM_VERSION = 'topo-v0.1'


def analyse_topography_frame(bgr: np.ndarray) -> dict:
    """Full reconstruction for a single best frame (BGR). DB-free, unit-testable."""
    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    center = find_reflection_center(gray)
    rings = extract_rings(gray, center)
    curvature = reconstruct_curvature(rings)
    metrics = compute_metrics(curvature)

    overlay = render_ring_overlay(bgr, rings)
    axial = render_axial_map(curvature)

    return {
        **metrics,
        'confidence': round(rings['completeness'], 3),
        'algorithm_version': ALGORITHM_VERSION,
        'ring_overlay_png': pil_image_to_django_file(overlay),
        'axial_map_png': pil_image_to_django_file(axial),
        'raw_output': {
            'center': list(rings['center']),
            'n_rings': rings['n_rings'],
            'angles_deg': rings['angles_deg'].round(2).tolist(),
            'mean_radius_per_angle': curvature['mean_radius_per_angle'].round(3).tolist(),
            'power_per_angle': curvature['power_per_angle'].round(4).tolist(),
            'scale': curvature['scale'],
        },
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /opt/tearflex/backend && pytest apps/analysis/topography/tests/test_pipeline.py -v`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
cd /opt/tearflex && git add backend/apps/analysis/topography/pipeline.py backend/apps/analysis/topography/tests/test_pipeline.py && \
git commit -m "feat(topography): reconstruction pipeline orchestrator"
```

---

### Task 9: Celery task (`tasks.py`)

**Files:**
- Create: `backend/apps/topography/tasks.py`
- Test: `backend/apps/topography/tests/test_tasks.py`

**Interfaces:**
- Consumes: `select_best_frame`, `sharpness` (Task 6), `analyse_topography_frame` (Task 8), models (Task 1).
- Produces: `process_topography_scan(scan_id: int) -> None` (Celery `@shared_task`). Sets `scan.status` through `processing → analysed`, marks one still `is_selected` with its `sharpness_score`, creates `TopographyResult` (copying `calibration_state`, saving both images). On any error sets `status='failed'` and re-raises.

- [ ] **Step 1: Write the failing test**

`backend/apps/topography/tests/test_tasks.py`:
```python
import cv2
import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from conftest import AssessmentFactory
from apps.topography.models import TopographyScan, TopographyStill
from apps.topography.tasks import process_topography_scan
from apps.analysis.topography.tests.synthetic import make_ring_image


def _png(name, blur):
    img, _ = make_ring_image(size=400, n_rings=6, blur=blur)
    ok, buf = cv2.imencode('.png', img)
    return SimpleUploadedFile(name, buf.tobytes(), content_type='image/png')


@pytest.mark.django_db
def test_process_scan_creates_result_and_marks_selected():
    scan = TopographyScan.objects.create(assessment=AssessmentFactory(), status='uploaded')
    TopographyStill.objects.create(scan=scan, image=_png('soft.png', 5.0), index=0)
    TopographyStill.objects.create(scan=scan, image=_png('crisp.png', 1.0), index=1)

    process_topography_scan(scan.id)

    scan.refresh_from_db()
    assert scan.status == 'analysed'
    assert scan.result.algorithm_version == 'topo-v0.1'
    assert scan.result.calibration_state == 'uncalibrated'
    assert scan.result.axial_map
    assert scan.result.ring_overlay
    selected = scan.stills.filter(is_selected=True)
    assert selected.count() == 1
    assert selected.first().index == 1


@pytest.mark.django_db
def test_process_scan_no_stills_sets_failed():
    scan = TopographyScan.objects.create(assessment=AssessmentFactory(), status='uploaded')
    with pytest.raises(Exception):
        process_topography_scan(scan.id)
    scan.refresh_from_db()
    assert scan.status == 'failed'
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /opt/tearflex/backend && pytest apps/topography/tests/test_tasks.py -v`
Expected: FAIL with `ModuleNotFoundError: ...tasks`.

- [ ] **Step 3: Write the implementation**

`backend/apps/topography/tasks.py`:
```python
import cv2
from celery import shared_task
from django.core.files.base import ContentFile
from apps.analysis.topography.frames import select_best_frame, sharpness
from apps.analysis.topography.pipeline import analyse_topography_frame
from .models import TopographyScan, TopographyResult


@shared_task
def process_topography_scan(scan_id: int) -> None:
    scan = TopographyScan.objects.get(id=scan_id)
    scan.status = 'processing'
    scan.save(update_fields=['status', 'updated_at'])
    try:
        stills = list(scan.stills.all())
        images = [cv2.imread(s.image.path) for s in stills]
        valid = [(s, im) for s, im in zip(stills, images) if im is not None]
        if not valid:
            raise ValueError(f"No readable stills for scan {scan_id}")

        valid_imgs = [im for _, im in valid]
        best_local = select_best_frame(valid_imgs)
        best_still = valid[best_local][0]
        best_image = valid_imgs[best_local]

        for s, im in valid:
            s.sharpness_score = sharpness(cv2.cvtColor(im, cv2.COLOR_BGR2GRAY))
            s.is_selected = (s.id == best_still.id)
            s.save(update_fields=['sharpness_score', 'is_selected'])

        out = analyse_topography_frame(best_image)
        result = TopographyResult(
            scan=scan,
            sim_k_flat=out['sim_k_flat'],
            sim_k_steep=out['sim_k_steep'],
            sim_k_axis=out['sim_k_axis'],
            central_k=out['central_k'],
            astigmatism_magnitude=out['astigmatism_magnitude'],
            astigmatism_axis=out['astigmatism_axis'],
            confidence=out['confidence'],
            algorithm_version=out['algorithm_version'],
            calibration_state=scan.calibration_state,
            raw_output=out['raw_output'],
        )
        result.ring_overlay.save(f'overlay_{scan_id}.png',
                                 ContentFile(out['ring_overlay_png']), save=False)
        result.axial_map.save(f'axial_{scan_id}.png',
                              ContentFile(out['axial_map_png']), save=False)
        result.save()

        scan.status = 'analysed'
        scan.save(update_fields=['status', 'updated_at'])
    except Exception:
        scan.status = 'failed'
        scan.save(update_fields=['status', 'updated_at'])
        raise
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /opt/tearflex/backend && pytest apps/topography/tests/test_tasks.py -v`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
cd /opt/tearflex && git add backend/apps/topography/tasks.py backend/apps/topography/tests/test_tasks.py && \
git commit -m "feat(topography): celery task to analyse a scan end-to-end"
```

---

### Task 10: API — serializers, views, routes

**Files:**
- Create: `backend/apps/topography/serializers.py`, `backend/apps/topography/views.py`, `backend/apps/topography/urls.py`
- Modify: `backend/tearflex/urls.py` (mount `api/topography/`)
- Test: `backend/apps/topography/tests/test_api.py`

**Interfaces:**
- Consumes: models (Task 1), `process_topography_scan` (Task 9), `apps.accounts.scoping.accessible_practice_ids` / `scope_queryset` (existing).
- Produces: `POST /api/topography/scans/`, `GET /api/topography/scans/{id}/`, `GET /api/topography/scans/{id}/status/`.

- [ ] **Step 1: Write the serializers**

`backend/apps/topography/serializers.py`:
```python
from rest_framework import serializers
from .models import TopographyScan, TopographyStill, TopographyResult


class TopographyResultSerializer(serializers.ModelSerializer):
    class Meta:
        model = TopographyResult
        fields = [
            'id', 'ring_overlay', 'axial_map', 'sim_k_flat', 'sim_k_steep', 'sim_k_axis',
            'central_k', 'astigmatism_magnitude', 'astigmatism_axis', 'confidence',
            'algorithm_version', 'calibration_state', 'analysed_at',
        ]


class TopographyStillSerializer(serializers.ModelSerializer):
    class Meta:
        model = TopographyStill
        fields = ['id', 'image', 'index', 'sharpness_score', 'is_selected']


class TopographyScanSerializer(serializers.ModelSerializer):
    stills = TopographyStillSerializer(many=True, read_only=True)
    result = TopographyResultSerializer(read_only=True)

    class Meta:
        model = TopographyScan
        fields = [
            'id', 'assessment', 'video_file', 'device_model', 'phone_model_id',
            'app_version', 'calibration_state', 'status', 'captured_at', 'stills', 'result',
        ]
        read_only_fields = ['status', 'calibration_state', 'captured_at']


class TopographyScanCreateSerializer(serializers.ModelSerializer):
    stills = serializers.ListField(
        child=serializers.ImageField(), write_only=True, required=False, default=list,
    )

    class Meta:
        model = TopographyScan
        fields = ['assessment', 'video_file', 'device_model', 'phone_model_id', 'app_version', 'stills']
```

- [ ] **Step 2: Write the views**

`backend/apps/topography/views.py`:
```python
from rest_framework import generics, permissions, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response
from apps.accounts.scoping import accessible_practice_ids, scope_queryset
from .models import TopographyScan, TopographyStill
from .serializers import (
    TopographyScanSerializer, TopographyScanCreateSerializer, TopographyResultSerializer,
)
from .tasks import process_topography_scan


def _require_assessment_access(user, assessment):
    allowed = accessible_practice_ids(user)
    if allowed is not None and assessment.patient.practice_id not in allowed:
        raise PermissionDenied()


class TopographyScanCreateView(generics.CreateAPIView):
    serializer_class = TopographyScanCreateSerializer
    permission_classes = [permissions.IsAuthenticated]

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)
        stills = data.pop('stills', [])
        _require_assessment_access(request.user, data['assessment'])

        scan = TopographyScan.objects.create(**data)
        for i, img in enumerate(stills):
            TopographyStill.objects.create(scan=scan, image=img, index=i)

        task = process_topography_scan.delay(scan.id)
        scan.celery_task_id = task.id
        scan.status = 'processing'
        scan.save(update_fields=['celery_task_id', 'status', 'updated_at'])
        return Response(TopographyScanSerializer(scan).data, status=status.HTTP_201_CREATED)


class TopographyScanDetailView(generics.RetrieveAPIView):
    serializer_class = TopographyScanSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return scope_queryset(
            TopographyScan.objects.select_related('result').prefetch_related('stills'),
            self.request.user, 'assessment__patient__practice',
        )


@api_view(['GET'])
@permission_classes([permissions.IsAuthenticated])
def topography_scan_status(request, pk):
    qs = scope_queryset(TopographyScan.objects.all(), request.user, 'assessment__patient__practice')
    try:
        scan = qs.get(pk=pk)
    except TopographyScan.DoesNotExist:
        return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
    data = {'id': scan.id, 'status': scan.status}
    if scan.status == 'analysed' and hasattr(scan, 'result'):
        data['result'] = TopographyResultSerializer(scan.result).data
    return Response(data)
```

- [ ] **Step 3: Write the routes and mount them**

`backend/apps/topography/urls.py`:
```python
from django.urls import path
from .views import TopographyScanCreateView, TopographyScanDetailView, topography_scan_status

urlpatterns = [
    path('scans/', TopographyScanCreateView.as_view(), name='topography-scan-create'),
    path('scans/<int:pk>/', TopographyScanDetailView.as_view(), name='topography-scan-detail'),
    path('scans/<int:pk>/status/', topography_scan_status, name='topography-scan-status'),
]
```

In `backend/tearflex/urls.py`, add to `urlpatterns` alongside the other `api/...` includes:
```python
    path('api/topography/', include('apps.topography.urls')),
```
(Ensure `from django.urls import include, path` is present — it already is for the existing API includes.)

- [ ] **Step 4: Write the failing test**

`backend/apps/topography/tests/test_api.py`:
```python
import cv2
import pytest
from unittest.mock import patch
from django.core.files.uploadedfile import SimpleUploadedFile
from conftest import AssessmentFactory
from apps.topography.models import TopographyScan, TopographyResult
from apps.analysis.topography.tests.synthetic import make_ring_image


def _png(name='s.png'):
    img, _ = make_ring_image(size=300, n_rings=5)
    ok, buf = cv2.imencode('.png', img)
    return SimpleUploadedFile(name, buf.tobytes(), content_type='image/png')


@pytest.mark.django_db
def test_create_scan_kicks_processing(api, clinician):
    assessment = AssessmentFactory(patient__practice=clinician.practice)
    with patch('apps.topography.views.process_topography_scan.delay') as delay:
        delay.return_value.id = 'task-123'
        resp = api.post('/api/topography/scans/', {
            'assessment': assessment.id,
            'device_model': 'iPhone 15 Pro',
            'stills': [_png('a.png'), _png('b.png')],
        }, format='multipart')
    assert resp.status_code == 201, resp.content
    scan = TopographyScan.objects.get(id=resp.data['id'])
    assert scan.status == 'processing'
    assert scan.celery_task_id == 'task-123'
    assert scan.stills.count() == 2
    delay.assert_called_once_with(scan.id)


@pytest.mark.django_db
def test_create_scan_other_practice_forbidden(api):
    other = AssessmentFactory()
    with patch('apps.topography.views.process_topography_scan.delay'):
        resp = api.post('/api/topography/scans/', {
            'assessment': other.id, 'stills': [_png()],
        }, format='multipart')
    assert resp.status_code == 403


@pytest.mark.django_db
def test_status_returns_result_when_analysed(api, clinician):
    assessment = AssessmentFactory(patient__practice=clinician.practice)
    scan = TopographyScan.objects.create(assessment=assessment, status='analysed')
    TopographyResult.objects.create(scan=scan, sim_k_steep=44.2, sim_k_flat=42.1,
                                    algorithm_version='topo-v0.1', calibration_state='uncalibrated')
    resp = api.get(f'/api/topography/scans/{scan.id}/status/')
    assert resp.status_code == 200
    assert resp.data['status'] == 'analysed'
    assert resp.data['result']['sim_k_steep'] == 44.2


@pytest.mark.django_db
def test_detail_scoped_to_practice(api):
    other = AssessmentFactory()
    scan = TopographyScan.objects.create(assessment=other, status='uploaded')
    resp = api.get(f'/api/topography/scans/{scan.id}/')
    assert resp.status_code == 404
```

- [ ] **Step 5: Run test to verify it fails, then passes**

Run: `cd /opt/tearflex/backend && pytest apps/topography/tests/test_api.py -v`
Expected: initially FAIL (404s / missing route), then PASS (4 tests) once Steps 1–3 are in place.

- [ ] **Step 6: Run the full backend suite**

Run: `cd /opt/tearflex/backend && pytest apps/topography apps/analysis/topography -v`
Expected: PASS (all topography tests green).

- [ ] **Step 7: Commit**

```bash
cd /opt/tearflex && git add backend/apps/topography/serializers.py backend/apps/topography/views.py backend/apps/topography/urls.py backend/tearflex/urls.py backend/apps/topography/tests/test_api.py && \
git commit -m "feat(topography): practice-scoped scan create/detail/status API"
```

---

## Self-Review

**Spec coverage (backend slice of the spec):**
- Data model (`TopographyScan` / `TopographyStill` / `TopographyResult`, reuse `Assessment`) → Task 1. ✓
- Reconstruction modules (`frames`/`rings`/`reconstruct`/`metrics`/`maps`/`pipeline`) → Tasks 2–8. ✓
- Slice-1 output set (ring overlay, axial map, SimK flat/steep/axis, central K, astig mag+axis, confidence, raw_output) → Tasks 5, 7, 8. ✓
- Celery task with status transitions + best-frame selection → Task 9. ✓
- Practice-scoped API (create/detail/status) → Task 10. ✓
- Honesty model (`calibration_state='uncalibrated'`, `algorithm_version='topo-v0.1'`, nominal scale) → Tasks 1, 4, 8, 9. ✓
- Deferred items (tangential/irregularity/I-S/keratoconus/L-R) → not implemented, per Global Constraints. ✓
- **Not in this plan (frontend slice — separate plan):** mobile vision-camera capture, mobile/web results views, shared TS types, research-use UI banner. Tracked for the follow-up Frontend plan.

**Placeholder scan:** No TBD/TODO; every code step contains complete code; every test step has real assertions. ✓

**Type consistency:** `extract_rings` dict keys (`center`/`angles_deg`/`radii`/`n_rings`/`completeness`) are consumed identically in `reconstruct.py`, `maps.py`, `pipeline.py`. `reconstruct_curvature` keys (`power_per_angle`/`central_power`/`mean_radius_per_angle`) match `metrics.py`/`maps.py`/`pipeline.py`. `analyse_topography_frame` output keys match the fields written in `tasks.py`. `process_topography_scan(scan_id)` signature matches the `.delay(scan.id)` call in `views.py` and the mocked assertion in `test_api.py`. ✓
