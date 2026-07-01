# Capture/Upload Backend (auto-or-manual + stills) — Design Spec

**Date:** 2026-06-25
**Status:** Approved (pending written-spec review)
**Sub-project:** A of the "Video upload + review" feature

---

## Context

TearFlex is adding the ability to **upload** a tear-film video (not just capture it
in-app) when starting an assessment, on mobile and web. The user decided that **capture
and upload converge**: once a video exists (camera OR file picker), both go through the
same review screen → the same auto-analyse-or-manual choice → the same processing →
results. The provenance differs only via a `source` field.

This sub-project (A) is the **backend** that makes that converged flow possible. It
unblocks the API contract that the web flow (D) and mobile flow (C) will call. The
shared video review player (B, web) is already built and merged; it emits captured
still frames via a callback — this slice gives those stills a home.

### Current backend (before this slice)

`backend/apps/assessments/`:

- `POST /api/assessments/captures/` → `CaptureUploadView` (CreateAPIView). Serializer
  `TestCaptureUploadSerializer` accepts `assessment, test_type, video_file,
  device_model`. Requires `video_file`. Triggers `process_capture.delay`, sets
  `status='processing'`. **Hardcodes `source='mobile'`** (the model default; not settable).
- `POST /api/assessments/captures/manual/` → `ManualCaptureCreateView`. Serializer
  `ManualCaptureSerializer` (JSON result fields). Creates a capture with
  **`source='manual'`, no video**, `status='analysed'`, plus a `TestResult`; computes
  `dry_eye_severity` from `nibut_first_breakup_seconds` and the practice thresholds
  (`practice.nibut_normal_threshold` / `nibut_borderline_threshold`). No Celery.
- `GET /api/assessments/captures/{id}/` → `CaptureDetailView`.
- `GET /api/assessments/captures/{id}/status/` → `capture_status` poll.
- `TestCapture.source` choices today: `[('mobile','Mobile'), ('manual','Manual')]`,
  default `'mobile'`; `source` is **read-only** in `TestCaptureSerializer`.
- Practice scoping helpers in `apps/accounts/scoping.py`: `scope_queryset(qs, user,
  path, practice_id=None)` and `accessible_practice_ids(user)`. The views use
  `_require_assessment_access(user, assessment)` for write paths.

### Problem this slice solves

1. The auto endpoint can't record provenance — an uploaded video would be mislabelled
   `mobile`.
2. The manual endpoint discards the video — a clinician who reviews a real video and
   then grades it by hand loses the footage.
3. There is nowhere to persist the stills the player's capture-frame button produces,
   even though they are intended as a **frequently-read analysis input**.

---

## Goal

Extend the assessments backend so that:

- A video capture records its **provenance** (`mobile` camera vs `upload` file picker).
- The **manual** path can optionally **attach the reviewed video**.
- Clinician-selected **still frames** are persisted as a first-class, query-friendly
  resource that later analysis can read cheaply and often.

All endpoints remain **practice-scoped**. No analysis-pipeline logic changes in this
slice (the Celery `process_capture` task is untouched).

---

## Design

### 1. `source` becomes pure provenance

`TestCapture.source` choices become:

```python
SOURCE_CHOICES = [
    ('mobile', 'Mobile camera'),
    ('upload', 'Uploaded file'),
    ('manual', 'Manual entry (no video)'),
]
```

- `mobile` — video recorded by the in-app camera.
- `upload` — video chosen from a file picker.
- `manual` — no video; results hand-entered (the legacy/quick web path, retained).

"Where the video came from" is now independent of "auto-analysed vs manually graded."
A `mobile` or `upload` capture may be auto-analysed OR manually graded; only `manual`
implies no video.

Migration: add the `upload` choice (a choices change is a no-op at the DB level for a
`CharField`, but a migration is generated for state consistency).

### 2. Auto path — accept `source`

`TestCaptureUploadSerializer` gains a writable `source` field:

- Allowed values on this endpoint: `mobile` or `upload` only. `manual` is rejected
  (a manual capture has no video and must use the manual endpoint).
- Default: `mobile` (preserves existing mobile-camera callers that send no `source`).
- `video_file` remains **required**.

`CaptureUploadView.perform_create` is otherwise unchanged: scope check, save, trigger
`process_capture.delay`, set `status='processing'`.

### 3. Manual path — optionally attach the video

`ManualCaptureSerializer` gains:

- `video_file` — optional (`required=False, allow_null=True`).
- `source` — optional choice. Validation:
  - If `video_file` is provided, `source` must be `mobile` or `upload` (default
    `mobile` if omitted but a video is present? No — require it explicitly when a video
    is present, to avoid silent mislabelling). **Rule: video present ⇒ `source` required
    and ∈ {mobile, upload}; video absent ⇒ `source` forced to `manual`** (any provided
    value other than `manual` is rejected).

`ManualCaptureCreateView.post` is updated to pass `video_file` and the resolved
`source` into `TestCapture.objects.create(...)`. Everything else stays: `status=
'analysed'`, `TestResult` created in the same `transaction.atomic()`, severity computed
from nibut + practice thresholds, no Celery. The existing NIBUT-required validation
(`nibut_first_breakup_seconds` required when `test_type == 'nibut'`) is retained.

### 4. `CaptureStill` model

A new model in `apps/assessments/models.py`:

```python
class CaptureStill(models.Model):
    """A clinician-selected still frame extracted from a capture's video."""
    capture = models.ForeignKey(
        TestCapture, on_delete=models.CASCADE, related_name='stills',
    )
    image = models.ImageField(upload_to='stills/%Y/%m/%d/')
    timestamp_seconds = models.FloatField()   # position in the source video
    label = models.CharField(max_length=50, blank=True)  # e.g. 'first_breakup'
    width = models.IntegerField(null=True, blank=True)
    height = models.IntegerField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['timestamp_seconds']

    def __str__(self):
        return f'Still @ {self.timestamp_seconds:.2f}s of {self.capture}'
```

Read-heavy rationale: image bytes live in S3-style storage; the row carries
`timestamp_seconds`, `label`, and dimensions so an analysis caller can select the
correct frame from metadata alone, without opening any image. The `capture` FK is
indexed (Django indexes FKs by default); rows are ordered by `timestamp_seconds`. No
caching layer is built now (YAGNI); the shape supports adding one later.

### 5. Stills endpoints

- `POST /api/assessments/captures/{id}/stills/` — attach a still.
  Multipart: `image` (required), `timestamp_seconds` (required, float ≥ 0),
  `label` (optional), `width`/`height` (optional). Returns the created still (201).
- `GET /api/assessments/captures/{id}/stills/` — list the capture's stills (metadata +
  image URL), ordered by `timestamp_seconds`.

Both resolve the parent capture through a practice-scoped queryset
(`scope_queryset(TestCapture.objects.all(), user, 'assessment__patient__practice')`); a
capture the user may not access returns **404** (consistent with `capture_status`).
A single `CaptureStillListCreateView` (ListCreateAPIView) backs both, with
`get_queryset` filtering `CaptureStill` by the scoped parent capture.

Serializer `CaptureStillSerializer` (ModelSerializer): fields `id, capture, image,
timestamp_seconds, label, width, height, created_at`; read-only `id, capture,
created_at`. `capture` is taken from the URL, not the body.

### 6. Stills in capture serialization

`TestCaptureSerializer` gains `stills = CaptureStillSerializer(many=True,
read_only=True)` so assessment/results/review payloads carry the stills. (`source` is
already serialized and stays read-only on `TestCaptureSerializer` — it is set via the
upload/manual write serializers, never client-bindable on the generic capture
serializer.)

---

## Data flow (the four converged cases)

| Acquisition | Choice | Endpoint | source | video | analysis |
|-------------|--------|----------|--------|-------|----------|
| Camera | Auto | `POST /captures/` | `mobile` | yes | Celery |
| Upload | Auto | `POST /captures/` | `upload` | yes | Celery |
| Camera | Manual | `POST /captures/manual/` | `mobile` | yes | none (status=analysed) |
| Upload | Manual | `POST /captures/manual/` | `upload` | yes | none (status=analysed) |
| (legacy) none | Manual | `POST /captures/manual/` | `manual` | no | none |

Stills, when the clinician captures frames, are attached separately via
`POST /captures/{id}/stills/` after the capture row exists.

---

## Error handling

- Auto endpoint with `source='manual'` → 400 (validation error: manual has no video).
- Auto endpoint without `video_file` → 400 (unchanged: required).
- Manual endpoint with `video_file` but no/invalid `source` → 400.
- Manual endpoint with `source ∈ {mobile, upload}` but no `video_file` → 400 (provenance
  claims a video that isn't there).
- Manual endpoint, no video, `source` omitted → accepted, `source='manual'`.
- Stills POST with no `image` or missing `timestamp_seconds` → 400.
- Stills POST/GET on a capture outside the user's practice → 404.
- Stills POST with `timestamp_seconds < 0` → 400.

---

## Testing

New/updated tests in `apps/assessments/tests/` (pytest + DRF APIClient; reuse existing
`conftest` practice/clinician/api fixtures; DB tests — Postgres default, SQLite opt-in
via `USE_SQLITE_TESTS=1` per the existing convention).

**Source on auto path** (`test_capture_views.py`):
- Upload with `source='upload'` persists `source='upload'` and triggers analysis (mock
  `process_capture.delay`).
- Upload with no `source` defaults to `mobile` (back-compat).
- Upload with `source='manual'` → 400.

**Manual path with video** (`test_manual_capture.py`):
- Manual with `video_file` + `source='upload'` → capture has the video, `source=
  'upload'`, `status='analysed'`, a `TestResult`, and **no** Celery call.
- Manual with `video_file` + `source='mobile'` → analogous.
- Manual with `video_file` and missing/invalid `source` → 400.
- Manual with `source='mobile'` but no `video_file` → 400.
- Manual with no video, no source → `source='manual'` (existing behaviour preserved).
- Existing manual NIBUT-required validation still holds.

**Stills** (`test_stills.py`, new):
- POST a still to a capture → 201, row created with `timestamp_seconds`, `label`.
- GET lists stills ordered by `timestamp_seconds`.
- POST without `image` → 400; without `timestamp_seconds` → 400; negative timestamp → 400.
- POST/GET on a capture in another practice → 404 (cross-practice isolation).
- A capture's stills appear in `TestCaptureSerializer` output (e.g. via capture detail).

---

## Out of scope (later sub-projects / slices)

- The review screen, file picker, take/upload branch, manual-entry UI — **C/D**.
- Web/mobile multipart upload of stills from the player — **C/D** wire the player's
  `onCaptureFrame` to `POST /captures/{id}/stills/`.
- Using stills as an analysis input (the pipeline reading them) — a future analysis
  slice; this slice only persists and serves them.
- Video metadata extraction (duration/resolution/fps) — unchanged; still client-supplied
  or null.
- Any change to the Celery `process_capture` task or the analysis modules.

---

## Self-review notes

- Placeholders: none.
- Consistency: `source` semantics (provenance) consistent across model, both write
  serializers, and the data-flow table. Manual-with-video keeps `status='analysed'`,
  matching the existing manual path; auto path untouched except `source`.
- Scope: single slice — assessments app only; no analysis/pipeline changes; one new
  model + one new endpoint pair + two serializer extensions + one choices addition.
- Ambiguity resolved: when a manual submission includes a video, `source` is **required**
  and must be `mobile`/`upload` (no silent default), preventing mislabelled provenance.
