# Fluorescein Automated Analysis (Walking Skeleton) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the fluorescein analysis **stub** with a real `apps/analysis/fluorescein.py` — deterministic tear-film **break-up timing** plus a **provisional Oxford staining-grade heuristic** — wired into the existing capture pipeline, with a "provisional" badge on web + mobile.

**Architecture:** Reuse the entire existing tear-film pipeline (`TestCapture` → `process_capture` → `TestResult`); only `pipeline._analyse_fluorescein` is rewired to call the new module. The new module mirrors `nibut.py`: detect a region of interest, build a per-frame metric series, reuse the shared `detect_breakup_times` for timing, add a staining-grade heuristic. The NIBUT break-up-timing logic moves to shared `utils` (DRY). No schema change.

**Tech Stack:** Django 5 + DRF, OpenCV (`cv2`), NumPy, Pillow, pytest (backend); Next.js + Vitest (web); React Native + `tsc` (mobile).

## Global Constraints

- **No schema change.** Reuse `TestCapture` / `TestResult` and the existing capture/status/detail API. The break-up heatmap reuses the existing `TestResult.nibut_heatmap` image field (a generic "break-up heatmap" slot); rename deferred.
- `analysis_version = 'fluorescein-v0.1'` (exact string) — replaces `'fluorescein-stub-v1'`.
- **Break-up time is real/deterministic;** the **Oxford grade is a provisional heuristic** (a seam for a future ML grader). `analyse_fluorescein` returns a `grade_provisional: True` flag for in-process clarity; it is **NOT persisted** — the UI derives provisional-ness from `analysis_version` starting `fluorescein-v0`.
- **Colour-calibration seam:** `analyse_fluorescein(..., colour_profile=None)` — `None` = passthrough now; the shared calibration foundation plugs in later with no rework.
- **DRY:** `detect_breakup_times` moves from `nibut.py` to `apps/analysis/utils.py`; NIBUT imports it and its tests stay green.
- Tests are **pure analysis** (no `@pytest.mark.django_db`, no live video files) — they run on this branch's default settings without Postgres. Run `pytest` from `/opt/tearflex/backend`; all `git` from `/opt/tearflex`.
- **Scoped commits only** — use `git add <explicit paths>`, never `git add .` (untracked `mobile/ios/` and `mobile/android/` prebuild dirs are present on this branch and must not be committed).
- Branch: `feat/fluorescein-analysis` (already checked out, off master).

---

## File Structure

**New:**
- `backend/apps/analysis/fluorescein.py` — `detect_tearfilm_roi`, `breakup_metric`, `grade_staining`, `generate_breakup_heatmap`, `analyse_fluorescein`
- `backend/apps/analysis/tests/synthetic_fluorescein.py` — synthetic clip + staining-image generators (test helper)
- `backend/apps/analysis/tests/test_fluorescein.py` — module unit tests

**Modified:**
- `backend/apps/analysis/utils.py` — gains `detect_breakup_times` + its constants (moved from nibut)
- `backend/apps/analysis/nibut.py` — imports `detect_breakup_times`/`N_BASELINE` from utils; local copies removed
- `backend/apps/analysis/tests/test_utils.py` — test for the moved `detect_breakup_times`
- `backend/apps/analysis/pipeline.py` — `_analyse_fluorescein` rewired to the real module
- `backend/apps/analysis/tests/test_pipeline.py` (create if absent) — `_analyse_fluorescein` wiring test
- `web/src/components/assessments/ResultsDisplay.tsx` (+ `.test.tsx`) — provisional badge
- `mobile/app/assessment/results.tsx` — provisional badge

---

### Task 1: Move `detect_breakup_times` into shared `utils` (DRY)

**Files:**
- Modify: `backend/apps/analysis/utils.py`, `backend/apps/analysis/nibut.py`
- Test: `backend/apps/analysis/tests/test_utils.py`

**Interfaces:**
- Produces: `apps.analysis.utils.detect_breakup_times(distortions: list[float], fps: float, n_baseline: int = N_BASELINE, threshold_multiplier: float = BREAKUP_THRESHOLD_MULTIPLIER) -> tuple[float, float]` (first, mean break-up seconds); module constants `N_BASELINE = 5`, `BREAKUP_THRESHOLD_MULTIPLIER = 1.5`, `MIN_BREAKUP_SECONDS = 0.3`.

- [ ] **Step 1: Write the failing test**

Append to `backend/apps/analysis/tests/test_utils.py`:
```python
from apps.analysis.utils import detect_breakup_times


def test_detect_breakup_times_first_crossing():
    # 5 baseline frames at 0, then a sustained jump above threshold from index 10.
    series = [0.0] * 10 + [2.0] * 10
    first, mean = detect_breakup_times(series, fps=10.0)
    assert first == 1.0           # index 10 / 10 fps
    assert mean >= first


def test_detect_breakup_times_no_breakup_returns_duration():
    series = [0.0] * 20
    first, mean = detect_breakup_times(series, fps=10.0)
    assert first == round((len(series) - 1) / 10.0, 2)   # 1.9
```

- [ ] **Step 2: Run it — expect FAIL (ImportError)**

Run: `cd /opt/tearflex/backend && python3 -m pytest apps/analysis/tests/test_utils.py -q`
Expected: FAIL — `cannot import name 'detect_breakup_times' from 'apps.analysis.utils'`.

- [ ] **Step 3: Move the function + constants into `utils.py`**

In `backend/apps/analysis/utils.py`, after the existing `normalise_distortions` function, add:
```python
N_BASELINE = 5
BREAKUP_THRESHOLD_MULTIPLIER = 1.5
MIN_BREAKUP_SECONDS = 0.3


def detect_breakup_times(
    distortions: list[float],
    fps: float,
    n_baseline: int = N_BASELINE,
    threshold_multiplier: float = BREAKUP_THRESHOLD_MULTIPLIER,
) -> tuple[float, float]:
    """Given a normalised metric series (z-scores) and fps, return
    (first_breakup_seconds, mean_breakup_seconds). If no break-up is detected,
    first_breakup equals the video duration. Shared by NIBUT and fluorescein."""
    threshold = threshold_multiplier
    first_breakup: float | None = None
    breakup_times: list[float] = []

    for i, d in enumerate(distortions[n_baseline:], start=n_baseline):
        t = i / fps
        if d >= threshold:
            if first_breakup is None and t >= MIN_BREAKUP_SECONDS:
                first_breakup = t
            breakup_times.append(t)

    if first_breakup is None:
        if breakup_times:
            first_breakup = breakup_times[0]
        else:
            first_breakup = (len(distortions) - 1) / fps

    mean_breakup = float(np.mean(breakup_times)) if breakup_times else first_breakup
    return (round(first_breakup, 2), round(mean_breakup, 2))
```

- [ ] **Step 4: Update `nibut.py` to import from utils**

In `backend/apps/analysis/nibut.py`:
- Change the import line `from .utils import detect_placido_roi, edge_density, normalise_distortions` to:
  ```python
  from .utils import (
      detect_placido_roi, edge_density, normalise_distortions,
      detect_breakup_times, N_BASELINE,
  )
  ```
- Delete the local `N_BASELINE = 5`, `BREAKUP_THRESHOLD_MULTIPLIER = 1.5`, `MIN_NIBUT_SECONDS = 0.3` constants and the entire local `def detect_breakup_times(...)` function. (Keep `COLOUR_STABLE` / `COLOUR_BREAKUP` and everything else.) `analyse_nibut` still calls `detect_breakup_times(distortions, fps=fps)` and references `N_BASELINE` — both now imported.

- [ ] **Step 5: Run tests — expect PASS (utils + nibut green)**

Run: `cd /opt/tearflex/backend && python3 -m pytest apps/analysis/tests/test_utils.py apps/analysis/tests/test_nibut.py -q`
Expected: PASS (the 2 new utils tests + all existing nibut/utils tests).

- [ ] **Step 6: Commit**

```bash
cd /opt/tearflex && git add backend/apps/analysis/utils.py backend/apps/analysis/nibut.py backend/apps/analysis/tests/test_utils.py && \
git commit -m "refactor(analysis): move detect_breakup_times to shared utils (DRY for fluorescein)"
```

---

### Task 2: Synthetic fluorescein fixtures

**Files:**
- Create: `backend/apps/analysis/tests/synthetic_fluorescein.py`
- Test: `backend/apps/analysis/tests/test_fluorescein.py` (created here, first test)

**Interfaces:**
- Produces: `make_dyed_film_clip(n_frames=30, size=200, break_at=15, n_holes=6, blur=1.0) -> list[np.ndarray]` (BGR uint8 frames: a bright fluorescing disc; from frame `break_at` onward, growing dark holes appear inside it; `break_at >= n_frames` ⇒ no break-up). `make_staining_image(n_spots=0, size=200, radius=4) -> np.ndarray` (BGR uint8: dim corneal disc with `n_spots` bright punctate staining spots).

- [ ] **Step 1: Write the failing test**

Create `backend/apps/analysis/tests/test_fluorescein.py`:
```python
import numpy as np
from apps.analysis.tests.synthetic_fluorescein import make_dyed_film_clip, make_staining_image


def test_dyed_film_clip_shape_and_breakup_progression():
    frames = make_dyed_film_clip(n_frames=30, size=200, break_at=15, n_holes=6)
    assert len(frames) == 30
    assert frames[0].shape == (200, 200, 3)
    assert frames[0].dtype == np.uint8
    # An early (intact) frame is brighter overall than a late (broken-up) frame.
    assert frames[2].mean() > frames[29].mean()


def test_staining_image_more_spots_more_bright_area():
    none = make_staining_image(n_spots=0, size=200)
    many = make_staining_image(n_spots=12, size=200)
    bright = lambda im: int((im.max(axis=2) > 180).sum())
    assert bright(many) > bright(none)
```

- [ ] **Step 2: Run it — expect FAIL (ModuleNotFoundError)**

Run: `cd /opt/tearflex/backend && python3 -m pytest apps/analysis/tests/test_fluorescein.py -q`
Expected: FAIL — `No module named 'apps.analysis.tests.synthetic_fluorescein'`.

- [ ] **Step 3: Write the generators**

Create `backend/apps/analysis/tests/synthetic_fluorescein.py`:
```python
import cv2
import numpy as np


def make_dyed_film_clip(
    n_frames: int = 30,
    size: int = 200,
    break_at: int = 15,
    n_holes: int = 6,
    blur: float = 1.0,
) -> list[np.ndarray]:
    """Synthetic fluorescein clip: a bright fluorescing disc (green-ish under blue
    light) that develops growing dark break-up holes from frame `break_at` onward.
    `break_at >= n_frames` yields a stable clip with no break-up."""
    centre = (size // 2, size // 2)
    disc_r = size // 3
    rng_offsets = [(int(disc_r * 0.5 * np.cos(k)), int(disc_r * 0.5 * np.sin(k)))
                   for k in np.linspace(0, 2 * np.pi, n_holes, endpoint=False)]
    frames: list[np.ndarray] = []
    for i in range(n_frames):
        img = np.zeros((size, size, 3), dtype=np.uint8)
        # bright fluorescing disc (BGR: strong green + some blue/red so it's clearly bright)
        cv2.circle(img, centre, disc_r, (120, 220, 120), -1, cv2.LINE_AA)
        if i >= break_at:
            progress = (i - break_at + 1) / max(1, n_frames - break_at)
            hole_r = max(1, int(disc_r * 0.25 * progress))
            for ox, oy in rng_offsets:
                cv2.circle(img, (centre[0] + ox, centre[1] + oy), hole_r, (0, 0, 0), -1, cv2.LINE_AA)
        if blur > 0:
            img = cv2.GaussianBlur(img, (0, 0), blur)
        frames.append(img)
    return frames


def make_staining_image(n_spots: int = 0, size: int = 200, radius: int = 4) -> np.ndarray:
    """Synthetic corneal frame with `n_spots` bright punctate staining spots
    on a dim corneal disc."""
    img = np.zeros((size, size, 3), dtype=np.uint8)
    centre = (size // 2, size // 2)
    disc_r = size // 3
    cv2.circle(img, centre, disc_r, (40, 60, 40), -1, cv2.LINE_AA)
    for k in range(n_spots):
        ang = 2 * np.pi * k / max(1, n_spots)
        rad = disc_r * 0.6 * ((k % 3) + 1) / 3.0
        x = int(centre[0] + rad * np.cos(ang))
        y = int(centre[1] + rad * np.sin(ang))
        cv2.circle(img, (x, y), radius, (210, 245, 210), -1, cv2.LINE_AA)
    return img
```

- [ ] **Step 4: Run it — expect PASS**

Run: `cd /opt/tearflex/backend && python3 -m pytest apps/analysis/tests/test_fluorescein.py -q`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
cd /opt/tearflex && git add backend/apps/analysis/tests/synthetic_fluorescein.py backend/apps/analysis/tests/test_fluorescein.py && \
git commit -m "test(fluorescein): add synthetic dyed-film + staining fixtures"
```

---

### Task 3: Tear-film ROI + break-up metric

**Files:**
- Create: `backend/apps/analysis/fluorescein.py`
- Test: `backend/apps/analysis/tests/test_fluorescein.py` (append)

**Interfaces:**
- Consumes: `make_dyed_film_clip` (Task 2).
- Produces: `detect_tearfilm_roi(frame: np.ndarray) -> tuple[int, int, int, int]` (x, y, w, h of the bright fluorescing region; centre-region fallback); `breakup_metric(roi_bgr: np.ndarray) -> float` (fraction of the *fluorescing* area that is dark break-up holes, 0..1).

- [ ] **Step 1: Write the failing test**

Append to `backend/apps/analysis/tests/test_fluorescein.py`:
```python
from apps.analysis.fluorescein import detect_tearfilm_roi, breakup_metric


def _roi(frame):
    x, y, w, h = detect_tearfilm_roi(frame)
    return frame[y:y + h, x:x + w]


def test_detect_tearfilm_roi_covers_disc():
    frames = make_dyed_film_clip(n_frames=4, size=200, break_at=99)  # no break-up
    x, y, w, h = detect_tearfilm_roi(frames[0])
    # ROI should be a sizeable central box around the disc, not the whole frame nor empty.
    assert 40 < w < 200 and 40 < h < 200


def test_breakup_metric_rises_after_breakup():
    frames = make_dyed_film_clip(n_frames=30, size=200, break_at=15, n_holes=6)
    intact = breakup_metric(_roi(frames[2]))
    broken = breakup_metric(_roi(frames[29]))
    assert broken > intact + 0.05
```

- [ ] **Step 2: Run it — expect FAIL (ImportError)**

Run: `cd /opt/tearflex/backend && python3 -m pytest apps/analysis/tests/test_fluorescein.py -q -k "tearfilm or breakup_metric"`
Expected: FAIL — `cannot import name 'detect_tearfilm_roi' from 'apps.analysis.fluorescein'`.

- [ ] **Step 3: Write the implementation**

Create `backend/apps/analysis/fluorescein.py`:
```python
import cv2
import numpy as np

FLUOR_BRIGHT_PERCENTILE = 75.0   # pixels brighter than this (within frame) are "fluorescing"
HOLE_RELATIVE_FRACTION = 0.45    # holes are < this * the fluorescing brightness


def detect_tearfilm_roi(frame: np.ndarray) -> tuple[int, int, int, int]:
    """Bounding box of the bright fluorescing tear-film region (not Placido rings).
    Falls back to a centred box if nothing bright is found."""
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    h, w = gray.shape
    thresh = np.percentile(gray, FLUOR_BRIGHT_PERCENTILE)
    mask = gray >= max(thresh, 1)
    ys, xs = np.nonzero(mask)
    if xs.size == 0:
        cx, cy, r = w // 2, h // 2, min(h, w) // 4
        return (cx - r, cy - r, 2 * r, 2 * r)
    x1, x2 = int(xs.min()), int(xs.max())
    y1, y2 = int(ys.min()), int(ys.max())
    return (x1, y1, max(1, x2 - x1), max(1, y2 - y1))


def breakup_metric(roi_bgr: np.ndarray) -> float:
    """Fraction of the fluorescing ROI that has broken up (dark holes).
    Bright fluorescing pixels define the film; dark pixels inside that envelope are holes."""
    gray = cv2.cvtColor(roi_bgr, cv2.COLOR_BGR2GRAY).astype(np.float32)
    if gray.size == 0:
        return 0.0
    bright = float(np.percentile(gray, 90)) + 1e-6
    film = gray >= (0.25 * bright)          # the disc envelope (film + holes)
    holes = gray < (HOLE_RELATIVE_FRACTION * bright)
    film_area = int(film.sum())
    if film_area == 0:
        return 0.0
    hole_in_film = int(np.logical_and(holes, _fill(film)).sum())
    return float(hole_in_film) / float(_fill(film).sum() or 1)


def _fill(mask: np.ndarray) -> np.ndarray:
    """Convex-ish fill of the film mask so interior holes count as 'inside the film'."""
    m = mask.astype(np.uint8) * 255
    contours, _ = cv2.findContours(m, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    filled = np.zeros_like(m)
    if contours:
        cv2.drawContours(filled, contours, -1, 255, thickness=cv2.FILLED)
    return filled > 0
```

- [ ] **Step 4: Run it — expect PASS**

Run: `cd /opt/tearflex/backend && python3 -m pytest apps/analysis/tests/test_fluorescein.py -q -k "tearfilm or breakup_metric"`
Expected: PASS (2 tests). If `test_breakup_metric_rises_after_breakup` is marginal, the synthetic holes grow with `progress` so frame 29 has the largest holes — the assertion margin (0.05) is comfortable.

- [ ] **Step 5: Commit**

```bash
cd /opt/tearflex && git add backend/apps/analysis/fluorescein.py backend/apps/analysis/tests/test_fluorescein.py && \
git commit -m "feat(fluorescein): tear-film ROI detection and break-up metric"
```

---

### Task 4: Provisional Oxford staining-grade heuristic

**Files:**
- Modify: `backend/apps/analysis/fluorescein.py`
- Test: `backend/apps/analysis/tests/test_fluorescein.py` (append)

**Interfaces:**
- Consumes: `make_staining_image` (Task 2).
- Produces: `grade_staining(roi_bgr: np.ndarray) -> int` — a provisional Oxford grade in `[0, 5]`, rising with the amount of punctate staining. **Not clinically validated** (research seam).

- [ ] **Step 1: Write the failing test**

Append to `backend/apps/analysis/tests/test_fluorescein.py`:
```python
from apps.analysis.fluorescein import grade_staining


def test_grade_staining_zero_for_clean_cornea():
    assert grade_staining(make_staining_image(n_spots=0)) == 0


def test_grade_staining_monotonic_with_spots():
    g_few = grade_staining(make_staining_image(n_spots=2))
    g_many = grade_staining(make_staining_image(n_spots=20))
    assert 0 <= g_few <= g_many <= 5
    assert g_many > g_few
```

- [ ] **Step 2: Run it — expect FAIL (ImportError)**

Run: `cd /opt/tearflex/backend && python3 -m pytest apps/analysis/tests/test_fluorescein.py -q -k grade_staining`
Expected: FAIL — `cannot import name 'grade_staining'`.

- [ ] **Step 3: Write the implementation**

Append to `backend/apps/analysis/fluorescein.py`:
```python
# Provisional Oxford-grade bands by punctate-staining coverage (fraction of ROI area).
# SEAM: a research heuristic only — replaced by the ML grader when graded data lands.
_STAINING_BANDS = [0.0008, 0.004, 0.012, 0.03, 0.07]   # thresholds for grades 1..5


def grade_staining(roi_bgr: np.ndarray) -> int:
    """Provisional Oxford staining grade 0..5 from punctate bright-spot coverage.
    Research heuristic, not clinically validated."""
    if roi_bgr.size == 0:
        return 0
    hsv = cv2.cvtColor(roi_bgr, cv2.COLOR_BGR2HSV)
    gray = cv2.cvtColor(roi_bgr, cv2.COLOR_BGR2GRAY)
    # staining spots are bright AND high-value; threshold on brightness.
    spots = gray >= max(float(np.percentile(gray, 99)), 180)
    coverage = float(spots.sum()) / float(gray.size or 1)
    grade = 0
    for band in _STAINING_BANDS:
        if coverage >= band:
            grade += 1
    return min(grade, 5)
```

- [ ] **Step 4: Run it — expect PASS**

Run: `cd /opt/tearflex/backend && python3 -m pytest apps/analysis/tests/test_fluorescein.py -q -k grade_staining`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
cd /opt/tearflex && git add backend/apps/analysis/fluorescein.py backend/apps/analysis/tests/test_fluorescein.py && \
git commit -m "feat(fluorescein): provisional Oxford staining-grade heuristic (research seam)"
```

---

### Task 5: Orchestrator + break-up heatmap (`analyse_fluorescein`)

**Files:**
- Modify: `backend/apps/analysis/fluorescein.py`
- Test: `backend/apps/analysis/tests/test_fluorescein.py` (append)

**Interfaces:**
- Consumes: `detect_tearfilm_roi`, `breakup_metric`, `grade_staining` (Tasks 3–4); `apps.analysis.utils.normalise_distortions`, `detect_breakup_times` (Task 1).
- Produces: `generate_breakup_heatmap(base_frame, roi, metric_series) -> PIL.Image.Image`; `analyse_fluorescein(frames: list[np.ndarray], fps: float = 10.0, colour_profile=None) -> dict` with keys `first_breakup_seconds`, `mean_breakup_seconds`, `fluorescein_grade`, `grade_provisional` (`True`), `heatmap_image` (PIL), `confidence`, `frame_metrics`.

- [ ] **Step 1: Write the failing test**

Append to `backend/apps/analysis/tests/test_fluorescein.py`:
```python
from PIL import Image
from apps.analysis.fluorescein import analyse_fluorescein


def test_analyse_fluorescein_recovers_breakup_time():
    frames = make_dyed_film_clip(n_frames=30, size=200, break_at=15, n_holes=6)
    res = analyse_fluorescein(frames, fps=10.0)
    for key in ('first_breakup_seconds', 'mean_breakup_seconds', 'fluorescein_grade',
                'grade_provisional', 'heatmap_image', 'confidence', 'frame_metrics'):
        assert key in res
    assert res['grade_provisional'] is True
    assert isinstance(res['heatmap_image'], Image.Image)
    assert 0.0 <= res['confidence'] <= 1.0
    # break-up begins around frame 15 (= 1.5s at 10fps); allow detector latency.
    assert 1.0 <= res['first_breakup_seconds'] <= 2.5


def test_analyse_fluorescein_stable_clip_no_early_breakup():
    frames = make_dyed_film_clip(n_frames=30, size=200, break_at=99)  # never breaks up
    res = analyse_fluorescein(frames, fps=10.0)
    assert res['first_breakup_seconds'] >= 2.5   # ~video duration, no early break-up
```

- [ ] **Step 2: Run it — expect FAIL (ImportError)**

Run: `cd /opt/tearflex/backend && python3 -m pytest apps/analysis/tests/test_fluorescein.py -q -k analyse_fluorescein`
Expected: FAIL — `cannot import name 'analyse_fluorescein'`.

- [ ] **Step 3: Write the implementation**

Append to `backend/apps/analysis/fluorescein.py`:
```python
from PIL import Image
from .utils import normalise_distortions, detect_breakup_times, N_BASELINE

_HEATMAP_STABLE = (120, 220, 120)   # BGR green (intact film)
_HEATMAP_BREAKUP = (30, 30, 220)    # BGR red (break-up)


def generate_breakup_heatmap(base_frame, roi, metric_series) -> Image.Image:
    """Overlay a stable→break-up colour on the ROI, intensity = mean break-up metric."""
    x, y, w, h = roi
    overlay = base_frame.copy()
    if metric_series and w > 0 and h > 0:
        norm = float(np.clip(np.mean(metric_series), 0.0, 1.0))
        stable = np.array(_HEATMAP_STABLE, dtype=float)
        broken = np.array(_HEATMAP_BREAKUP, dtype=float)
        colour = (stable * (1 - norm) + broken * norm).astype(np.uint8)
        layer = np.full((h, w, 3), colour, dtype=np.uint8)
        roi_slice = overlay[y:y + h, x:x + w]
        cv2.addWeighted(layer, 0.4, roi_slice, 0.6, 0, roi_slice)
        overlay[y:y + h, x:x + w] = roi_slice
    return Image.fromarray(cv2.cvtColor(overlay, cv2.COLOR_BGR2RGB))


def analyse_fluorescein(frames: list[np.ndarray], fps: float = 10.0, colour_profile=None) -> dict:
    """Deterministic fluorescein break-up timing + provisional staining grade.

    `colour_profile` is the calibration seam (None = passthrough); the shared
    calibration foundation will supply a white-balance transform here later.
    """
    if len(frames) <= N_BASELINE:
        raise ValueError(
            f"Video too short for fluorescein analysis (need more than {N_BASELINE} sampled frames)"
        )
    # colour_profile seam: identity for now.
    if colour_profile is not None:
        frames = [colour_profile.apply(f) for f in frames]

    roi = detect_tearfilm_roi(frames[0])
    x, y, w, h = roi

    metrics: list[float] = []
    for frame in frames:
        metrics.append(breakup_metric(frame[y:y + h, x:x + w]))

    distortions = normalise_distortions(metrics, n_baseline=N_BASELINE)
    first_bu, mean_bu = detect_breakup_times(distortions, fps=fps)

    grade = grade_staining(frames[0][y:y + h, x:x + w])

    baseline = metrics[:N_BASELINE]
    baseline_mean = float(np.mean(baseline)) + 1e-9
    baseline_std = float(np.std(baseline))
    confidence = float(np.clip(1.0 - (baseline_std / baseline_mean) * 4, 0.05, 0.99))

    frame_metrics = [
        {'frame_index': i, 'time_seconds': round(i / fps, 3),
         'breakup_metric': round(metrics[i], 6), 'distortion': round(distortions[i], 4)}
        for i in range(len(frames))
    ]
    heatmap = generate_breakup_heatmap(frames[0], roi, metrics)

    return {
        'first_breakup_seconds': first_bu,
        'mean_breakup_seconds': mean_bu,
        'fluorescein_grade': grade,
        'grade_provisional': True,
        'heatmap_image': heatmap,
        'confidence': round(confidence, 3),
        'frame_metrics': frame_metrics,
    }
```

- [ ] **Step 4: Run it — expect PASS, then the whole fluorescein module suite**

Run: `cd /opt/tearflex/backend && python3 -m pytest apps/analysis/tests/test_fluorescein.py -q`
Expected: PASS (all fluorescein tests — fixtures, ROI/metric, grade, orchestrator).

- [ ] **Step 5: Commit**

```bash
cd /opt/tearflex && git add backend/apps/analysis/fluorescein.py backend/apps/analysis/tests/test_fluorescein.py && \
git commit -m "feat(fluorescein): analyse_fluorescein orchestrator + break-up heatmap"
```

---

### Task 6: Rewire the pipeline to the real module

**Files:**
- Modify: `backend/apps/analysis/pipeline.py`
- Test: `backend/apps/analysis/tests/test_pipeline.py` (create)

**Interfaces:**
- Consumes: `analyse_fluorescein` (Task 5), `extract_frames`, `pil_image_to_django_file` (utils).
- Produces: `_analyse_fluorescein(video_path) -> dict` with keys `fluorescein_breakup_seconds`, `fluorescein_grade`, `heatmap_bytes`, `dry_eye_severity`, `confidence_score`, `analysis_version='fluorescein-v0.1'`, `raw_output`.

- [ ] **Step 1: Write the failing test**

Create `backend/apps/analysis/tests/test_pipeline.py`:
```python
from unittest.mock import patch
from apps.analysis import pipeline
from apps.analysis.tests.synthetic_fluorescein import make_dyed_film_clip


def test_analyse_fluorescein_pipeline_returns_real_result():
    frames = make_dyed_film_clip(n_frames=30, size=200, break_at=15, n_holes=6)
    # Bypass real video decoding — feed synthetic frames straight in.
    with patch('apps.analysis.pipeline.extract_frames', return_value=frames):
        out = pipeline._analyse_fluorescein('ignored.mp4')
    assert out['analysis_version'] == 'fluorescein-v0.1'
    assert 'fluorescein_breakup_seconds' in out
    assert 0 <= out['fluorescein_grade'] <= 5
    assert isinstance(out['heatmap_bytes'], (bytes, bytearray))
    assert out['dry_eye_severity'] in ('normal', 'mild', 'moderate', 'severe')
    assert out['raw_output']['grade_provisional'] is True
```

- [ ] **Step 2: Run it — expect FAIL (stub version mismatch)**

Run: `cd /opt/tearflex/backend && python3 -m pytest apps/analysis/tests/test_pipeline.py -q`
Expected: FAIL — `assert 'fluorescein-stub-v1' == 'fluorescein-v0.1'` (and no `heatmap_bytes`).

- [ ] **Step 3: Rewire `_analyse_fluorescein`**

In `backend/apps/analysis/pipeline.py`:
- Add to the imports at the top: `from .fluorescein import analyse_fluorescein`
- Replace the entire stub `_analyse_fluorescein` function with:
```python
def _analyse_fluorescein(video_path: str) -> dict:
    """Run fluorescein analysis pipeline. Returns TestResult field dict + heatmap_bytes."""
    frames = extract_frames(video_path, target_fps=10.0)
    result = analyse_fluorescein(frames, fps=10.0)

    heatmap_bytes = pil_image_to_django_file(result['heatmap_image'])

    first_bu = result['first_breakup_seconds']
    # Fluorescein break-up time bands mirror the NIBUT severity mapping.
    if first_bu >= 10:
        severity = 'normal'
    elif first_bu >= 5:
        severity = 'mild'
    elif first_bu >= 2:
        severity = 'moderate'
    else:
        severity = 'severe'

    return {
        'fluorescein_breakup_seconds': result['first_breakup_seconds'],
        'fluorescein_grade': result['fluorescein_grade'],
        'heatmap_bytes': heatmap_bytes,
        'dry_eye_severity': severity,
        'confidence_score': result['confidence'],
        'analysis_version': 'fluorescein-v0.1',
        'raw_output': {
            'grade_provisional': result['grade_provisional'],
            'frame_metrics': result['frame_metrics'],
        },
    }
```
(Leave `_analyse_nibut` and `_analyse_lipid` unchanged.)

- [ ] **Step 4: Run tests — expect PASS (pipeline + full analysis suite)**

Run: `cd /opt/tearflex/backend && python3 -m pytest apps/analysis/tests -q`
Expected: PASS (fluorescein + pipeline + nibut + utils all green).

- [ ] **Step 5: Commit**

```bash
cd /opt/tearflex && git add backend/apps/analysis/pipeline.py backend/apps/analysis/tests/test_pipeline.py && \
git commit -m "feat(fluorescein): wire real analysis into the pipeline (fluorescein-v0.1)"
```

---

### Task 7: Web — provisional badge on the fluorescein grade

**Files:**
- Modify: `web/src/components/assessments/ResultsDisplay.tsx`
- Test: `web/src/components/assessments/ResultsDisplay.test.tsx` (append)

**Interfaces:**
- Consumes: `result.analysis_version`, `result.fluorescein_grade` (existing `TestResult` shape).
- Produces: a "Provisional" badge shown next to the Fluorescein-grade metric when `analysis_version` starts `fluorescein-v0` and a grade is present.

- [ ] **Step 1: Write the failing test**

Append to `web/src/components/assessments/ResultsDisplay.test.tsx`:
```tsx
const fluoresceinProvisional = {
  nibut_first_breakup_seconds: null, nibut_mean_breakup_seconds: null, nibut_heatmap: null,
  fluorescein_grade: 2, fluorescein_breakup_seconds: 7.0,
  lipid_grade: null, lipid_thickness_nm: null, tear_meniscus_height_mm: null,
  dry_eye_severity: 'mild' as const, confidence_score: 0.5, analysis_version: 'fluorescein-v0.1',
}

describe('ResultsDisplay fluorescein provisional badge', () => {
  it('badges the auto fluorescein grade as provisional', () => {
    render(<ResultsDisplay result={fluoresceinProvisional as never} thresholds={{ normal: 10, borderline: 5 }} />)
    expect(screen.getByText(/provisional/i)).toBeInTheDocument()
  })
  it('does not badge a NIBUT result as provisional', () => {
    render(<ResultsDisplay result={{ ...fluoresceinProvisional, analysis_version: 'nibut-v1', fluorescein_grade: null } as never} thresholds={{ normal: 10, borderline: 5 }} />)
    expect(screen.queryByText(/provisional/i)).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run it — expect FAIL**

Run: `cd /opt/tearflex/web && npx vitest run src/components/assessments/ResultsDisplay.test.tsx`
Expected: FAIL — no "provisional" text rendered.

- [ ] **Step 3: Add the badge**

In `web/src/components/assessments/ResultsDisplay.tsx`, inside the `ResultsDisplay` function after the existing `const fluoresceinValue = ...` block, add:
```tsx
  const fluoresceinProvisional =
    result.fluorescein_grade != null && (result.analysis_version ?? '').startsWith('fluorescein-v0')
```
Then replace the existing fluorescein metric line:
```tsx
        <Metric label="Fluorescein grade" value={fluoresceinValue} />
```
with a labelled variant that appends the badge:
```tsx
        <div>
          <div className="text-xs uppercase text-muted-foreground">
            Fluorescein grade
            {fluoresceinProvisional && (
              <span className="ml-1 rounded bg-amber-100 px-1 py-0.5 text-[10px] font-medium text-amber-800">
                Provisional
              </span>
            )}
          </div>
          <div className="font-medium tabular-nums">{fluoresceinValue}</div>
        </div>
```
(This mirrors the existing `Metric` markup but allows the inline badge.)

- [ ] **Step 4: Run test + typecheck — expect PASS**

Run: `cd /opt/tearflex/web && npx vitest run src/components/assessments/ResultsDisplay.test.tsx && npm run typecheck`
Expected: PASS (both new tests + existing ResultsDisplay tests; typecheck clean).

- [ ] **Step 5: Commit**

```bash
cd /opt/tearflex && git add web/src/components/assessments/ResultsDisplay.tsx web/src/components/assessments/ResultsDisplay.test.tsx && \
git commit -m "feat(fluorescein): badge the provisional auto staining grade (web)"
```

---

### Task 8: Mobile — provisional badge on the fluorescein result

**Files:**
- Modify: `mobile/app/assessment/results.tsx`

**Interfaces:**
- Consumes: the screen's `CaptureResult` (extend with `analysis_version` if absent) + `fluorescein_grade`.
- Produces: a "Provisional" badge in the fluorescein results branch when `analysis_version` starts `fluorescein-v0`.

- [ ] **Step 1: Ensure `analysis_version` is on the result type**

In `mobile/app/assessment/results.tsx`, in the local `interface CaptureResult { ... }`, add the field if it is not already present:
```tsx
  analysis_version: string;
```

- [ ] **Step 2: Add the provisional badge to the fluorescein branch**

Find the fluorescein rendering branch (where `test_type === 'fluorescein'` shows the Oxford grade card). Compute, near the other derived values:
```tsx
  const fluoresceinProvisional =
    (data?.result?.analysis_version ?? '').startsWith('fluorescein-v0');
```
and inside the fluorescein card, next to the grade headline, render when provisional:
```tsx
  {fluoresceinProvisional && (
    <Text className="mt-1 self-start rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
      Provisional — pending validation
    </Text>
  )}
```
(Match the surrounding NativeWind style; place it under the grade value.)

- [ ] **Step 3: Typecheck**

Run: `cd /opt/tearflex/mobile && npm run typecheck`
Expected: PASS (no errors).

- [ ] **Step 4: Manual verification**

With backend + mobile running and an analysed fluorescein capture: open its result and confirm the Oxford grade shows a "Provisional — pending validation" badge, while a NIBUT result shows none, and that manual entry still overrides the grade.

- [ ] **Step 5: Commit**

```bash
cd /opt/tearflex && git add mobile/app/assessment/results.tsx && \
git commit -m "feat(fluorescein): badge the provisional auto staining grade (mobile)"
```

---

## Self-Review

**Spec coverage:**
- Real deterministic break-up timing (reusing NIBUT timing) → Tasks 1, 5. ✓
- Fluorescein-specific dark-hole break-up metric + tear-film ROI (no Placido) → Task 3. ✓
- Provisional Oxford staining-grade heuristic (research seam) → Task 4. ✓
- Pipeline rewired, stub gone, `analysis_version='fluorescein-v0.1'`, severity from break-up time → Task 6. ✓
- Colour-calibration seam (`colour_profile=None` passthrough) → Task 5. ✓
- Honesty: provisional badge derived from `analysis_version`, manual entry retained → Tasks 7, 8. ✓
- No schema change; heatmap reuses `nibut_heatmap` slot via `heatmap_bytes` → Task 6 (consumed by existing `process_capture`). ✓
- DRY: `detect_breakup_times` shared → Task 1. ✓
- Synthetic-fixture testing; real-footage validation deferred → Tasks 2–5. ✓

**Placeholder scan:** No TBD/TODO; every code step has complete code and every test step has real assertions. ✓

**Type consistency:** `detect_breakup_times(distortions, fps, ...)` signature is identical in Task 1 (definition) and its callers in `nibut.py` (Task 1) and `analyse_fluorescein` (Task 5). `analyse_fluorescein` return keys (`first_breakup_seconds`, `mean_breakup_seconds`, `fluorescein_grade`, `grade_provisional`, `heatmap_image`, `confidence`, `frame_metrics`) are exactly those consumed by `_analyse_fluorescein` in Task 6. `detect_tearfilm_roi`/`breakup_metric`/`grade_staining` signatures match between their definitions (Tasks 3–4) and use in `analyse_fluorescein` (Task 5). The web badge keys off `analysis_version` + `fluorescein_grade`, both present on the serialized `TestResult`. ✓

**Note on `process_capture` integration:** Task 6 returns `heatmap_bytes`; the existing `process_capture` task already pops `heatmap_bytes` and saves it to `result.nibut_heatmap`, so no task-layer change is needed (verified against `apps/assessments/tasks.py`). The fluorescein break-up heatmap therefore lands in the existing image field, per the approved field-reuse decision.
