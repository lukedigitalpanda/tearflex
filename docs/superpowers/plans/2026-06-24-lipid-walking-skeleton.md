# Lipid Layer Automated Analysis (Walking Skeleton) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the lipid analysis **stub** with a real `apps/analysis/lipid.py` producing a **provisional Guillon grade** (texture + colour heuristic) and a **provisional thickness** (colour→nm heuristic), wired into the existing pipeline, with a "provisional" badge on web + mobile.

**Architecture:** Reuse the entire existing tear-film pipeline (`TestCapture` → `process_capture` → `TestResult`); only `pipeline._analyse_lipid` is rewired. Lipid is a STATIC interference pattern (no break-up over time), so the module picks the sharpest frame and analyses it (no time series). Reuses master's `extract_frames` + `edge_density`. No schema change.

**Tech Stack:** Django 5 + DRF, OpenCV (`cv2`), NumPy (backend); Next.js + Vitest (web); React Native + `tsc` (mobile).

## Global Constraints

- **No schema change.** Reuse `TestCapture` / `TestResult` (`lipid_grade`, `lipid_thickness_nm` fields already exist) and the existing capture/status/detail API.
- `analysis_version = 'lipid-v0.1'` (exact string) — replaces `'lipid-stub-v1'`.
- **Both outputs are provisional heuristics** (research seeds for clinical/professional validation). `analyse_lipid` returns `grade_provisional: True` + `thickness_provisional: True` for in-process clarity; these are **NOT persisted** — the UI derives provisional-ness from `analysis_version` starting `lipid-v0`.
- **Colour-calibration seam:** `analyse_lipid(..., colour_profile=None)` — `None` = passthrough now.
- **Confidence deliberately low** (uncalibrated + unvalidated).
- **Static pattern → best frame** (sharpest by Laplacian variance), NOT a time series.
- Tests are **pure analysis** (no `@pytest.mark.django_db`, no live video) — they run on this branch (off master) without Postgres. Run `pytest` from `/opt/tearflex/backend`; all `git` from `/opt/tearflex`.
- **Scoped commits only** — `git add <explicit paths>`, never `git add .` (untracked `mobile/ios/` and `mobile/android/` dirs are present and must not be committed).
- Branch: `feat/lipid-analysis` (already checked out, off master). Reuse `apps.analysis.utils.extract_frames` and `apps.analysis.utils.edge_density` (both on master).

---

## File Structure

**New:**
- `backend/apps/analysis/lipid.py` — `detect_lipid_roi`, `select_sharpest_frame`, `colour_features`, `grade_lipid`, `thickness_from_colour`, `analyse_lipid`
- `backend/apps/analysis/tests/synthetic_lipid.py` — interference-pattern fixtures
- `backend/apps/analysis/tests/test_lipid.py` — module unit tests

**Modified:**
- `backend/apps/analysis/pipeline.py` — `_analyse_lipid` rewired to the real module
- `backend/apps/analysis/tests/test_pipeline.py` (create if absent) — `_analyse_lipid` wiring test
- `web/src/components/assessments/ResultsDisplay.tsx` (+ `.test.tsx`) — lipid provisional badge
- `mobile/app/assessment/results.tsx` — lipid provisional badge

---

### Task 1: Synthetic lipid interference-pattern fixtures

**Files:**
- Create: `backend/apps/analysis/tests/synthetic_lipid.py`
- Test: `backend/apps/analysis/tests/test_lipid.py` (created here, first test)

**Interfaces:**
- Produces: `make_lipid_pattern(kind: str = 'amorphous', size: int = 200, blur: float = 0.0) -> np.ndarray` (BGR uint8). `kind` ∈ {`'meshwork'` — fine reticular lines, high texture, low colour; `'amorphous'` — smooth disc, low texture, low colour; `'fringes'` — saturated coloured concentric bands, high colour}. Pattern is masked to a central disc on black.

- [ ] **Step 1: Write the failing test**

Create `backend/apps/analysis/tests/test_lipid.py`:
```python
import cv2
import numpy as np
from apps.analysis.tests.synthetic_lipid import make_lipid_pattern


def _saturation(img):
    return float(cv2.cvtColor(img, cv2.COLOR_BGR2HSV)[..., 1].mean())


def test_lipid_pattern_shapes_and_distinguishable():
    mesh = make_lipid_pattern('meshwork', size=200)
    amor = make_lipid_pattern('amorphous', size=200)
    fringes = make_lipid_pattern('fringes', size=200)
    for im in (mesh, amor, fringes):
        assert im.shape == (200, 200, 3) and im.dtype == np.uint8
    # meshwork has more fine edges than the smooth amorphous patch
    edges = lambda im: int(cv2.Canny(cv2.cvtColor(im, cv2.COLOR_BGR2GRAY), 50, 150).sum())
    assert edges(mesh) > edges(amor)
    # coloured fringes are far more saturated than the greyish meshwork/amorphous
    assert _saturation(fringes) > _saturation(mesh)
    assert _saturation(fringes) > _saturation(amor)
```

- [ ] **Step 2: Run it — expect FAIL (ModuleNotFoundError)**

Run: `cd /opt/tearflex/backend && python3 -m pytest apps/analysis/tests/test_lipid.py -q`
Expected: FAIL — `No module named 'apps.analysis.tests.synthetic_lipid'`.

- [ ] **Step 3: Write the generator**

Create `backend/apps/analysis/tests/synthetic_lipid.py`:
```python
import cv2
import numpy as np

# Saturated BGR band colours for the "coloured fringes" pattern (wide hue spread).
_FRINGE_COLOURS = [(0, 0, 230), (0, 230, 230), (0, 230, 0), (230, 230, 0), (230, 0, 0), (230, 0, 230)]


def make_lipid_pattern(kind: str = 'amorphous', size: int = 200, blur: float = 0.0) -> np.ndarray:
    """Synthetic lipid interference pattern, masked to a central disc.
    'meshwork' = fine reticular grey lines (high texture, low colour);
    'amorphous' = smooth grey disc (low texture, low colour);
    'fringes' = saturated coloured concentric bands (high colour)."""
    img = np.zeros((size, size, 3), dtype=np.uint8)
    cx, cy, r = size // 2, size // 2, size // 3
    cv2.circle(img, (cx, cy), r, (160, 160, 160), -1, cv2.LINE_AA)   # base grey reflection
    if kind == 'meshwork':
        for k in range(0, size, 7):
            cv2.line(img, (k, 0), (k, size), (110, 110, 110), 1, cv2.LINE_AA)
            cv2.line(img, (0, k), (size, k), (110, 110, 110), 1, cv2.LINE_AA)
    elif kind == 'fringes':
        for k in range(1, len(_FRINGE_COLOURS) + 1):
            cv2.circle(img, (cx, cy), int(r * k / (len(_FRINGE_COLOURS) + 1)),
                       _FRINGE_COLOURS[k - 1], 5, cv2.LINE_AA)
    # 'amorphous' leaves the smooth disc as-is.
    mask = np.zeros((size, size), dtype=np.uint8)
    cv2.circle(mask, (cx, cy), r, 255, -1)
    img[mask == 0] = 0
    if blur > 0:
        img = cv2.GaussianBlur(img, (0, 0), blur)
    return img
```

- [ ] **Step 4: Run it — expect PASS**

Run: `cd /opt/tearflex/backend && python3 -m pytest apps/analysis/tests/test_lipid.py -q`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
cd /opt/tearflex && git add backend/apps/analysis/tests/synthetic_lipid.py backend/apps/analysis/tests/test_lipid.py && \
git commit -m "test(lipid): add synthetic interference-pattern fixtures"
```

---

### Task 2: Lipid ROI + sharpest-frame selection

**Files:**
- Create: `backend/apps/analysis/lipid.py`
- Test: `backend/apps/analysis/tests/test_lipid.py` (append)

**Interfaces:**
- Consumes: `make_lipid_pattern` (Task 1).
- Produces: `detect_lipid_roi(frame: np.ndarray) -> tuple[int,int,int,int]` (bbox of the bright specular region; centred fallback); `select_sharpest_frame(frames: list[np.ndarray]) -> int` (index of the highest Laplacian-variance frame; raises `ValueError` on empty list).

- [ ] **Step 1: Write the failing test**

Append to `backend/apps/analysis/tests/test_lipid.py`:
```python
import pytest
from apps.analysis.lipid import detect_lipid_roi, select_sharpest_frame


def test_detect_lipid_roi_bounds_the_disc():
    img = make_lipid_pattern('amorphous', size=200)
    x, y, w, h = detect_lipid_roi(img)
    assert 40 < w < 200 and 40 < h < 200


def test_select_sharpest_frame_picks_crisp():
    crisp = make_lipid_pattern('meshwork', size=200, blur=0.0)
    soft = make_lipid_pattern('meshwork', size=200, blur=4.0)
    assert select_sharpest_frame([soft, crisp, soft]) == 1


def test_select_sharpest_frame_empty_raises():
    with pytest.raises(ValueError):
        select_sharpest_frame([])
```

- [ ] **Step 2: Run it — expect FAIL (ImportError)**

Run: `cd /opt/tearflex/backend && python3 -m pytest apps/analysis/tests/test_lipid.py -q -k "roi or sharpest"`
Expected: FAIL — `cannot import name 'detect_lipid_roi'`.

- [ ] **Step 3: Write the implementation**

Create `backend/apps/analysis/lipid.py`:
```python
import cv2
import numpy as np
from .utils import edge_density

LIPID_BRIGHT_PERCENTILE = 70.0   # the specular reflection is the brighter region


def detect_lipid_roi(frame: np.ndarray) -> tuple[int, int, int, int]:
    """Bounding box of the bright specular/interference region; centred fallback."""
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    h, w = gray.shape
    thresh = np.percentile(gray, LIPID_BRIGHT_PERCENTILE)
    mask = gray >= max(thresh, 1)
    ys, xs = np.nonzero(mask)
    if xs.size == 0:
        cx, cy, r = w // 2, h // 2, min(h, w) // 4
        return (cx - r, cy - r, 2 * r, 2 * r)
    x1, x2 = int(xs.min()), int(xs.max())
    y1, y2 = int(ys.min()), int(ys.max())
    return (x1, y1, max(1, x2 - x1), max(1, y2 - y1))


def select_sharpest_frame(frames: list[np.ndarray]) -> int:
    """Index of the sharpest frame (max Laplacian variance). Lipid is a static pattern."""
    if not frames:
        raise ValueError("No frames to select from")
    scores = [cv2.Laplacian(cv2.cvtColor(f, cv2.COLOR_BGR2GRAY), cv2.CV_64F).var() for f in frames]
    return int(np.argmax(scores))
```

- [ ] **Step 4: Run it — expect PASS**

Run: `cd /opt/tearflex/backend && python3 -m pytest apps/analysis/tests/test_lipid.py -q -k "roi or sharpest"`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
cd /opt/tearflex && git add backend/apps/analysis/lipid.py backend/apps/analysis/tests/test_lipid.py && \
git commit -m "feat(lipid): specular ROI detection and sharpest-frame selection"
```

---

### Task 3: Colour features

**Files:**
- Modify: `backend/apps/analysis/lipid.py`
- Test: `backend/apps/analysis/tests/test_lipid.py` (append)

**Interfaces:**
- Produces: `colour_features(roi_bgr: np.ndarray) -> dict` with float keys `mean_saturation` (0–255), `hue_spread` (std of hue over the bright pixels), `dominant_hue` (median hue). Computed over reasonably-bright pixels (`V > 40`); all-dark ROI → zeros.

- [ ] **Step 1: Write the failing test**

Append to `backend/apps/analysis/tests/test_lipid.py`:
```python
from apps.analysis.lipid import colour_features


def _roi(img):
    x, y, w, h = detect_lipid_roi(img)
    return img[y:y + h, x:x + w]


def test_colour_features_fringes_more_saturated_than_meshwork():
    f_mesh = colour_features(_roi(make_lipid_pattern('meshwork')))
    f_fringes = colour_features(_roi(make_lipid_pattern('fringes')))
    assert f_fringes['mean_saturation'] > f_mesh['mean_saturation']
    assert f_fringes['hue_spread'] >= f_mesh['hue_spread']


def test_colour_features_all_dark_returns_zero():
    f = colour_features(np.zeros((10, 10, 3), dtype=np.uint8))
    assert f['mean_saturation'] == 0.0
```

- [ ] **Step 2: Run it — expect FAIL (ImportError)**

Run: `cd /opt/tearflex/backend && python3 -m pytest apps/analysis/tests/test_lipid.py -q -k colour_features`
Expected: FAIL — `cannot import name 'colour_features'`.

- [ ] **Step 3: Write the implementation**

Append to `backend/apps/analysis/lipid.py`:
```python
def colour_features(roi_bgr: np.ndarray) -> dict:
    """Interference-colour features over the bright ROI pixels."""
    if roi_bgr.size == 0:
        return {'mean_saturation': 0.0, 'hue_spread': 0.0, 'dominant_hue': 0.0}
    hsv = cv2.cvtColor(roi_bgr, cv2.COLOR_BGR2HSV)
    h, s, v = hsv[..., 0], hsv[..., 1], hsv[..., 2]
    bright = v > 40
    if not bright.any():
        return {'mean_saturation': 0.0, 'hue_spread': 0.0, 'dominant_hue': 0.0}
    return {
        'mean_saturation': float(s[bright].mean()),
        'hue_spread': float(h[bright].std()),
        'dominant_hue': float(np.median(h[bright])),
    }
```

- [ ] **Step 4: Run it — expect PASS**

Run: `cd /opt/tearflex/backend && python3 -m pytest apps/analysis/tests/test_lipid.py -q -k colour_features`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
cd /opt/tearflex && git add backend/apps/analysis/lipid.py backend/apps/analysis/tests/test_lipid.py && \
git commit -m "feat(lipid): interference-colour feature extraction"
```

---

### Task 4: Provisional Guillon grade + thickness heuristics

**Files:**
- Modify: `backend/apps/analysis/lipid.py`
- Test: `backend/apps/analysis/tests/test_lipid.py` (append)

**Interfaces:**
- Consumes: `colour_features` (Task 3), `edge_density` (utils), `detect_lipid_roi` (Task 2).
- Produces: `grade_lipid(roi_bgr: np.ndarray) -> int` (provisional Guillon 1–5; **high texture + low colour → meshwork = low grade; smooth → amorphous = grade 4; high saturation → coloured fringes = 5**). `thickness_from_colour(roi_bgr: np.ndarray) -> float` (provisional nm, rising with interference colour saturation, clamped ~[10,120]). Both research seams.

- [ ] **Step 1: Write the failing test**

Append to `backend/apps/analysis/tests/test_lipid.py`:
```python
from apps.analysis.lipid import grade_lipid, thickness_from_colour


def test_grade_lipid_orders_meshwork_below_amorphous_below_fringes():
    g_mesh = grade_lipid(_roi(make_lipid_pattern('meshwork')))
    g_amor = grade_lipid(_roi(make_lipid_pattern('amorphous')))
    g_fringes = grade_lipid(_roi(make_lipid_pattern('fringes')))
    assert 1 <= g_mesh <= 5 and 1 <= g_amor <= 5 and 1 <= g_fringes <= 5
    assert g_mesh < g_amor < g_fringes
    assert g_fringes == 5


def test_thickness_rises_with_colour():
    t_mesh = thickness_from_colour(_roi(make_lipid_pattern('meshwork')))
    t_fringes = thickness_from_colour(_roi(make_lipid_pattern('fringes')))
    assert 10 <= t_mesh <= 120 and 10 <= t_fringes <= 120
    assert t_fringes > t_mesh
```

- [ ] **Step 2: Run it — expect FAIL (ImportError)**

Run: `cd /opt/tearflex/backend && python3 -m pytest apps/analysis/tests/test_lipid.py -q -k "grade_lipid or thickness"`
Expected: FAIL — `cannot import name 'grade_lipid'`.

- [ ] **Step 3: Write the implementation**

Append to `backend/apps/analysis/lipid.py`:
```python
# Provisional thresholds (research seeds — replaced by the ML grader / colour calibration).
_SAT_FRINGES = 60.0      # mean saturation above this => coloured fringes (grade 5)
_TEX_OPEN = 0.12         # edge density above this => open meshwork (grade 1)
_TEX_CLOSED = 0.06       # => closed meshwork (grade 2)
_TEX_WAVE = 0.02         # => wave/flow (grade 3); below => amorphous (grade 4)


def grade_lipid(roi_bgr: np.ndarray) -> int:
    """Provisional Guillon grade 1..5. SEAM: heuristic, not clinically validated.
    High texture + low colour => meshwork (low grade); smooth => amorphous (4);
    high saturation => coloured fringes (5)."""
    if roi_bgr.size == 0:
        return 1
    sat = colour_features(roi_bgr)['mean_saturation']
    if sat >= _SAT_FRINGES:
        return 5
    gray = cv2.cvtColor(roi_bgr, cv2.COLOR_BGR2GRAY)
    tex = edge_density(gray)
    if tex >= _TEX_OPEN:
        return 1
    if tex >= _TEX_CLOSED:
        return 2
    if tex >= _TEX_WAVE:
        return 3
    return 4


def thickness_from_colour(roi_bgr: np.ndarray) -> float:
    """Provisional lipid thickness (nm) from interference-colour saturation.
    SEAM: uncalibrated — not metrically valid until colour calibration (subsystem A)."""
    if roi_bgr.size == 0:
        return 10.0
    sat = colour_features(roi_bgr)['mean_saturation']
    nm = 15.0 + (sat / 255.0) * 90.0     # greyish (thin) -> ~15nm; saturated -> ~105nm
    return float(np.clip(round(nm, 1), 10.0, 120.0))
```

- [ ] **Step 4: Run it — expect PASS**

Run: `cd /opt/tearflex/backend && python3 -m pytest apps/analysis/tests/test_lipid.py -q -k "grade_lipid or thickness"`
Expected: PASS (2 tests). If `g_mesh < g_amor` is marginal, the synthetic meshwork's reticular lines give it edge density above `_TEX_CLOSED` (grade ≤2) while the smooth amorphous disc falls below `_TEX_WAVE` (grade 4); the ordering holds with comfortable margin.

- [ ] **Step 5: Commit**

```bash
cd /opt/tearflex && git add backend/apps/analysis/lipid.py backend/apps/analysis/tests/test_lipid.py && \
git commit -m "feat(lipid): provisional Guillon grade + thickness heuristics (research seams)"
```

---

### Task 5: Orchestrator (`analyse_lipid`)

**Files:**
- Modify: `backend/apps/analysis/lipid.py`
- Test: `backend/apps/analysis/tests/test_lipid.py` (append)

**Interfaces:**
- Consumes: `select_sharpest_frame`, `detect_lipid_roi`, `grade_lipid`, `thickness_from_colour`, `colour_features` (this module).
- Produces: `analyse_lipid(frames: list[np.ndarray], fps: float = 10.0, colour_profile=None) -> dict` with keys `lipid_grade`, `lipid_thickness_nm`, `grade_provisional` (True), `thickness_provisional` (True), `confidence`, `features`. Picks the sharpest frame; `colour_profile` is the passthrough calibration seam. `fps` is accepted for signature parity with the other analysers but unused (static pattern).

- [ ] **Step 1: Write the failing test**

Append to `backend/apps/analysis/tests/test_lipid.py`:
```python
from apps.analysis.lipid import analyse_lipid


def test_analyse_lipid_returns_full_provisional_result():
    frames = [make_lipid_pattern('fringes', size=200, blur=3.0),
              make_lipid_pattern('fringes', size=200, blur=0.0)]   # 2nd is sharpest
    res = analyse_lipid(frames, fps=10.0)
    for key in ('lipid_grade', 'lipid_thickness_nm', 'grade_provisional',
                'thickness_provisional', 'confidence', 'features'):
        assert key in res
    assert res['grade_provisional'] is True and res['thickness_provisional'] is True
    assert 1 <= res['lipid_grade'] <= 5
    assert 10 <= res['lipid_thickness_nm'] <= 120
    assert 0.0 <= res['confidence'] <= 1.0


def test_analyse_lipid_empty_raises():
    with pytest.raises(ValueError):
        analyse_lipid([], fps=10.0)
```

- [ ] **Step 2: Run it — expect FAIL (ImportError)**

Run: `cd /opt/tearflex/backend && python3 -m pytest apps/analysis/tests/test_lipid.py -q -k analyse_lipid`
Expected: FAIL — `cannot import name 'analyse_lipid'`.

- [ ] **Step 3: Write the implementation**

Append to `backend/apps/analysis/lipid.py`:
```python
# Deliberately low: this slice is uncalibrated + unvalidated (see spec honesty model).
_BASE_CONFIDENCE = 0.2


def analyse_lipid(frames: list[np.ndarray], fps: float = 10.0, colour_profile=None) -> dict:
    """Provisional lipid Guillon grade + thickness from the sharpest frame.

    `colour_profile` is the calibration seam (None = passthrough); the shared
    calibration foundation will supply a white-balance transform here later.
    `fps` is unused (static pattern) — accepted for analyser-signature parity.
    """
    if not frames:
        raise ValueError("No frames for lipid analysis")
    if colour_profile is not None:
        frames = [colour_profile.apply(f) for f in frames]

    best = select_sharpest_frame(frames)
    frame = frames[best]
    x, y, w, h = detect_lipid_roi(frame)
    roi = frame[y:y + h, x:x + w]

    feats = colour_features(roi)
    grade = grade_lipid(roi)
    thickness = thickness_from_colour(roi)

    # Confidence stays low and drops further on an ambiguous (near-grey, low-texture) ROI.
    gray = cv2.cvtColor(roi, cv2.COLOR_BGR2GRAY) if roi.size else np.zeros((1, 1), np.uint8)
    tex = edge_density(gray)
    informative = min(1.0, feats['mean_saturation'] / 80.0 + tex / 0.1)
    confidence = float(np.clip(_BASE_CONFIDENCE * informative, 0.05, 0.5))

    return {
        'lipid_grade': grade,
        'lipid_thickness_nm': thickness,
        'grade_provisional': True,
        'thickness_provisional': True,
        'confidence': round(confidence, 3),
        'features': {k: round(v, 3) for k, v in feats.items()},
    }
```

- [ ] **Step 4: Run it — expect PASS, then the whole lipid module suite**

Run: `cd /opt/tearflex/backend && python3 -m pytest apps/analysis/tests/test_lipid.py -q`
Expected: PASS (all lipid tests).

- [ ] **Step 5: Commit**

```bash
cd /opt/tearflex && git add backend/apps/analysis/lipid.py backend/apps/analysis/tests/test_lipid.py && \
git commit -m "feat(lipid): analyse_lipid orchestrator (best-frame, low confidence)"
```

---

### Task 6: Rewire the pipeline to the real module

**Files:**
- Modify: `backend/apps/analysis/pipeline.py`
- Test: `backend/apps/analysis/tests/test_pipeline.py` (create if absent, else append)

**Interfaces:**
- Consumes: `analyse_lipid` (Task 5), `extract_frames` (utils).
- Produces: `_analyse_lipid(video_path) -> dict` with keys `lipid_grade`, `lipid_thickness_nm`, `dry_eye_severity`, `confidence_score`, `analysis_version='lipid-v0.1'`, `raw_output`.

- [ ] **Step 1: Write the failing test**

Append to (or create) `backend/apps/analysis/tests/test_pipeline.py`:
```python
from unittest.mock import patch
from apps.analysis import pipeline
from apps.analysis.tests.synthetic_lipid import make_lipid_pattern


def test_analyse_lipid_pipeline_returns_real_result():
    frames = [make_lipid_pattern('fringes', size=200, blur=0.0)]
    with patch('apps.analysis.pipeline.extract_frames', return_value=frames):
        out = pipeline._analyse_lipid('ignored.mp4')
    assert out['analysis_version'] == 'lipid-v0.1'
    assert 1 <= out['lipid_grade'] <= 5
    assert 10 <= out['lipid_thickness_nm'] <= 120
    assert out['dry_eye_severity'] in ('normal', 'mild', 'moderate', 'severe')
    assert out['raw_output']['grade_provisional'] is True
    assert out['raw_output']['thickness_provisional'] is True
```
(If `test_pipeline.py` already exists from another module, append this function and its imports without disturbing existing tests.)

- [ ] **Step 2: Run it — expect FAIL (stub version mismatch)**

Run: `cd /opt/tearflex/backend && python3 -m pytest apps/analysis/tests/test_pipeline.py -q -k lipid`
Expected: FAIL — `assert 'lipid-stub-v1' == 'lipid-v0.1'`.

- [ ] **Step 3: Rewire `_analyse_lipid`**

In `backend/apps/analysis/pipeline.py`:
- Add to the imports at the top: `from .lipid import analyse_lipid`
- Replace the entire stub `_analyse_lipid` function with:
```python
def _analyse_lipid(video_path: str) -> dict:
    """Run lipid analysis pipeline. Returns TestResult field dict (provisional)."""
    frames = extract_frames(video_path, target_fps=10.0)
    result = analyse_lipid(frames, fps=10.0)

    # A thicker/normal lipid layer (higher Guillon grade) maps to lower dry-eye severity;
    # a very thin layer (grade 1) maps to higher severity. Provisional mapping.
    grade = result['lipid_grade']
    if grade >= 4:
        severity = 'normal'
    elif grade == 3:
        severity = 'mild'
    elif grade == 2:
        severity = 'moderate'
    else:
        severity = 'severe'

    return {
        'lipid_grade': result['lipid_grade'],
        'lipid_thickness_nm': result['lipid_thickness_nm'],
        'dry_eye_severity': severity,
        'confidence_score': result['confidence'],
        'analysis_version': 'lipid-v0.1',
        'raw_output': {
            'grade_provisional': result['grade_provisional'],
            'thickness_provisional': result['thickness_provisional'],
            'features': result['features'],
        },
    }
```
(Leave `_analyse_nibut` and `_analyse_fluorescein` unchanged.)

- [ ] **Step 4: Run tests — expect PASS (pipeline + full analysis suite)**

Run: `cd /opt/tearflex/backend && python3 -m pytest apps/analysis/tests -q`
Expected: PASS (lipid + pipeline + nibut + utils all green).

- [ ] **Step 5: Commit**

```bash
cd /opt/tearflex && git add backend/apps/analysis/pipeline.py backend/apps/analysis/tests/test_pipeline.py && \
git commit -m "feat(lipid): wire real analysis into the pipeline (lipid-v0.1)"
```

---

### Task 7: Web — provisional badge on the lipid grade

**Files:**
- Modify: `web/src/components/assessments/ResultsDisplay.tsx`
- Test: `web/src/components/assessments/ResultsDisplay.test.tsx` (append)

**Interfaces:**
- Consumes: `result.analysis_version`, `result.lipid_grade` (existing `TestResult` shape).
- Produces: a "Provisional" badge next to the Lipid-grade metric when `analysis_version` starts `lipid-v0` and a grade is present.

- [ ] **Step 1: Write the failing test**

Append to `web/src/components/assessments/ResultsDisplay.test.tsx`:
```tsx
const lipidProvisional = {
  nibut_first_breakup_seconds: null, nibut_mean_breakup_seconds: null, nibut_heatmap: null,
  fluorescein_grade: null, fluorescein_breakup_seconds: null,
  lipid_grade: 3, lipid_thickness_nm: 60, tear_meniscus_height_mm: null,
  dry_eye_severity: 'mild' as const, confidence_score: 0.2, analysis_version: 'lipid-v0.1',
}

describe('ResultsDisplay lipid provisional badge', () => {
  it('badges the auto lipid grade as provisional', () => {
    render(<ResultsDisplay result={lipidProvisional as never} thresholds={{ normal: 10, borderline: 5 }} />)
    expect(screen.getByText(/provisional/i)).toBeInTheDocument()
  })
  it('does not badge a NIBUT result as provisional', () => {
    render(<ResultsDisplay result={{ ...lipidProvisional, analysis_version: 'nibut-v1', lipid_grade: null } as never} thresholds={{ normal: 10, borderline: 5 }} />)
    expect(screen.queryByText(/provisional/i)).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run it — expect FAIL**

Run: `cd /opt/tearflex/web && npx vitest run src/components/assessments/ResultsDisplay.test.tsx`
Expected: FAIL — no "provisional" text for the lipid case.

- [ ] **Step 3: Add the badge**

In `web/src/components/assessments/ResultsDisplay.tsx`, after the existing `const lipidValue = ...` block, add:
```tsx
  const lipidProvisional =
    result.lipid_grade != null && (result.analysis_version ?? '').startsWith('lipid-v0')
```
Then replace the existing lipid metric line:
```tsx
        <Metric label="Lipid grade" value={lipidValue} />
```
with the labelled variant that appends the badge:
```tsx
        <div>
          <div className="text-xs uppercase text-muted-foreground">
            Lipid grade
            {lipidProvisional && (
              <span className="ml-1 rounded bg-amber-100 px-1 py-0.5 text-[10px] font-medium text-amber-800">
                Provisional
              </span>
            )}
          </div>
          <div className="font-medium tabular-nums">{lipidValue}</div>
        </div>
```

- [ ] **Step 4: Run test + typecheck — expect PASS**

Run: `cd /opt/tearflex/web && npx vitest run src/components/assessments/ResultsDisplay.test.tsx && npm run typecheck`
Expected: PASS (new tests + existing ResultsDisplay tests; typecheck clean).

- [ ] **Step 5: Commit**

```bash
cd /opt/tearflex && git add web/src/components/assessments/ResultsDisplay.tsx web/src/components/assessments/ResultsDisplay.test.tsx && \
git commit -m "feat(lipid): badge the provisional auto lipid grade (web)"
```

---

### Task 8: Mobile — provisional badge on the lipid result

**Files:**
- Modify: `mobile/app/assessment/results.tsx`

**Interfaces:**
- Consumes: the screen's `CaptureResult` (extend with `analysis_version` if absent) + `lipid_grade`.
- Produces: a "Provisional — pending validation" badge in the lipid results branch when `analysis_version` starts `lipid-v0`.

- [ ] **Step 1: Ensure `analysis_version` is on the result type**

In `mobile/app/assessment/results.tsx`, in the local `interface CaptureResult { ... }`, add the field if it is not already present:
```tsx
  analysis_version: string;
```

- [ ] **Step 2: Add the provisional badge to the lipid branch**

Find the lipid rendering branch (where `test_type === 'lipid'` shows the Guillon grade card). Compute, near the other derived values:
```tsx
  const lipidProvisional =
    (data?.result?.analysis_version ?? '').startsWith('lipid-v0');
```
and inside the lipid card, next to the grade headline, render when provisional:
```tsx
  {lipidProvisional && (
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

With backend + mobile running and an analysed lipid capture: open its result and confirm the Guillon grade shows a "Provisional — pending validation" badge, while a NIBUT result shows none, and that manual entry still overrides the grade.

- [ ] **Step 5: Commit**

```bash
cd /opt/tearflex && git add mobile/app/assessment/results.tsx && \
git commit -m "feat(lipid): badge the provisional auto lipid grade (mobile)"
```

---

## Self-Review

**Spec coverage:**
- Provisional Guillon grade from texture + colour → Task 4. ✓
- Provisional thickness from interference colour → Task 4. ✓
- Static pattern → best-frame selection → Task 2, 5. ✓
- Colour-calibration seam (`colour_profile=None` passthrough) → Task 5. ✓
- Pipeline rewired, stub gone, `analysis_version='lipid-v0.1'`, severity from grade → Task 6. ✓
- Honesty: provisional badge derived from `analysis_version`, manual entry retained → Tasks 7, 8. ✓
- Low confidence → Task 5. ✓
- No schema change; reuse `extract_frames`/`edge_density` → Tasks 2, 4, 6. ✓
- Synthetic-fixture testing, relative ordering → Tasks 1, 4. ✓

**Placeholder scan:** No TBD/TODO; every code step has complete code; every test step has real assertions. ✓

**Type consistency:** `detect_lipid_roi`/`select_sharpest_frame`/`colour_features`/`grade_lipid`/`thickness_from_colour` signatures match between their definitions (Tasks 2–4) and use in `analyse_lipid` (Task 5). `analyse_lipid` return keys (`lipid_grade`, `lipid_thickness_nm`, `grade_provisional`, `thickness_provisional`, `confidence`, `features`) are exactly those consumed by `_analyse_lipid` in Task 6. The web/mobile badge keys off `analysis_version` + `lipid_grade`, both on the serialized `TestResult`. ✓

**Note:** Lipid produces no heatmap (static pattern, no break-up), so `_analyse_lipid` returns no `heatmap_bytes` — consistent with the existing stub (which also returned none) and the `process_capture` task (which `.pop`s `heatmap_bytes` with a `None` default). No task-layer change needed.
