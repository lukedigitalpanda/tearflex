# PDF Report Enhancement & Mobile Share Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enhance the existing PDF report with all result fields and an embedded heatmap image; make report generation asynchronous via a Celery task; add a PDF share button to the mobile results screen.

**Architecture:** The report infrastructure (model, views, serializers, WeasyPrint template, API endpoints) already exists and works. This plan enhances the HTML template, makes generation non-blocking, and adds mobile share. No new endpoints needed.

**Tech Stack:** Backend — WeasyPrint (already installed), Celery (already running), Django template engine. Mobile — `expo-sharing` (React Native share sheet) and `expo-file-system` (to download PDF to device temp dir before sharing).

---

## Context: What Already Exists

Read these before starting any task:
- `backend/apps/reports/generators.py` — synchronous `generate_assessment_report(assessment)` function
- `backend/apps/reports/templates/reports/assessment_report.html` — current HTML template (basic A4, NIBUT only)
- `backend/apps/reports/views.py` — `GenerateReportView` (POST), `DownloadReportView` (GET), `ReportListView` (GET)
- `backend/apps/reports/models.py` — `Report` model (assessment FK, pdf_file, status: pending/ready/failed)
- `backend/apps/reports/tests/` — existing test suite (keep passing)
- `mobile/app/assessment/results.tsx` — results screen (has "Done" button, needs PDF share added)
- `mobile/lib/api.ts` — API client

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `backend/apps/reports/templates/reports/assessment_report.html` | Modify | Full result data, embedded heatmap, better A4 layout |
| `backend/apps/reports/tasks.py` | Create | Celery task wrapping `generate_assessment_report` |
| `backend/apps/reports/generators.py` | Modify | Expose `generate_assessment_report_async` entry point |
| `backend/apps/reports/views.py` | Modify | `GenerateReportView` triggers Celery task, returns immediately |
| `backend/apps/reports/tests/test_tasks.py` | Create | Test the Celery task wiring |
| `mobile/app/assessment/results.tsx` | Modify | Add "Share PDF" button |
| `mobile/hooks/useReports.ts` | Create | `useGenerateReport` mutation + `useReportStatus` poller |

---

## Task 1: Enhance the PDF HTML template

**Files:**
- Modify: `backend/apps/reports/templates/reports/assessment_report.html`

- [ ] **Step 1: Read the current template**

Read `backend/apps/reports/templates/reports/assessment_report.html` in full.

Also read `backend/apps/assessments/models.py` to understand the `TestCapture` and `TestResult` fields passed into the template.

- [ ] **Step 2: Read the generators.py to see what context is passed to the template**

Read `backend/apps/reports/generators.py` in full. Note what variables are available in the template context.

- [ ] **Step 3: Update generators.py to pass richer context**

Modify `generate_assessment_report(assessment)` in `generators.py` to pass all needed data to the template. Replace the template rendering call with richer context:

```python
import base64
from io import BytesIO

def _heatmap_data_uri(result) -> str | None:
    """Convert a TestResult's nibut_heatmap to a base64 data URI for embedding in HTML."""
    if not result or not result.nibut_heatmap:
        return None
    try:
        result.nibut_heatmap.open('rb')
        data = result.nibut_heatmap.read()
        result.nibut_heatmap.close()
        encoded = base64.b64encode(data).decode('ascii')
        return f"data:image/png;base64,{encoded}"
    except Exception:
        return None

def generate_assessment_report(assessment) -> 'Report':
    from .models import Report
    report = Report.objects.create(assessment=assessment, status='pending')
    try:
        captures_with_results = []
        for capture in assessment.captures.select_related('result').order_by('captured_at'):
            result = getattr(capture, 'result', None)
            captures_with_results.append({
                'capture': capture,
                'result': result,
                'heatmap_uri': _heatmap_data_uri(result),
            })

        context = {
            'assessment': assessment,
            'patient': assessment.patient,
            'practice': assessment.clinician.practice if assessment.clinician else None,
            'clinician': assessment.clinician,
            'captures': captures_with_results,
        }

        html = render_to_string('reports/assessment_report.html', context)
        pdf_bytes = HTML(string=html).write_pdf()

        filename = f'tearflex_report_{assessment.id}.pdf'
        report.pdf_file.save(filename, ContentFile(pdf_bytes), save=False)
        report.status = 'ready'
        report.save(update_fields=['pdf_file', 'status'])
    except Exception:
        logger.exception("PDF generation failed for assessment %s", assessment.id)
        report.status = 'failed'
        report.save(update_fields=['status'])

    return report
```

Make sure all imports at the top of `generators.py` include:
```python
import base64
import logging
from django.template.loader import render_to_string
from django.core.files.base import ContentFile
from weasyprint import HTML

logger = logging.getLogger(__name__)
```

- [ ] **Step 4: Write the enhanced HTML template**

Replace `backend/apps/reports/templates/reports/assessment_report.html` with:

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<style>
  @page {
    size: A4;
    margin: 2cm;
  }
  body {
    font-family: Arial, Helvetica, sans-serif;
    font-size: 10pt;
    color: #1e293b;
    margin: 0;
  }
  .header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    border-bottom: 2px solid #0E7C7B;
    padding-bottom: 12px;
    margin-bottom: 20px;
  }
  .practice-name {
    font-size: 16pt;
    font-weight: bold;
    color: #0E7C7B;
  }
  .practice-address {
    font-size: 9pt;
    color: #475569;
    margin-top: 2px;
  }
  .report-title {
    font-size: 12pt;
    font-weight: bold;
    text-align: right;
  }
  .report-date {
    font-size: 9pt;
    color: #475569;
    text-align: right;
  }
  .section {
    margin-bottom: 18px;
  }
  .section-title {
    font-size: 9pt;
    font-weight: bold;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: #475569;
    border-bottom: 1px solid #e2e8f0;
    padding-bottom: 4px;
    margin-bottom: 10px;
  }
  .patient-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }
  .field-label {
    font-size: 8pt;
    color: #64748b;
    text-transform: uppercase;
    letter-spacing: 0.3px;
  }
  .field-value {
    font-size: 10pt;
    font-weight: 600;
    margin-top: 1px;
  }
  .capture-block {
    margin-bottom: 24px;
    border: 1px solid #e2e8f0;
    border-radius: 6px;
    overflow: hidden;
  }
  .capture-header {
    background: #f8fafc;
    padding: 8px 12px;
    font-size: 9pt;
    font-weight: bold;
    color: #334155;
    text-transform: capitalize;
  }
  .capture-body {
    padding: 12px;
  }
  .metrics-row {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 12px;
    margin-bottom: 12px;
  }
  .metric-tile {
    background: #f8fafc;
    border-radius: 4px;
    padding: 8px 10px;
  }
  .metric-value {
    font-size: 16pt;
    font-weight: bold;
    color: #0f172a;
    line-height: 1;
  }
  .metric-unit {
    font-size: 9pt;
    color: #64748b;
  }
  .metric-label {
    font-size: 8pt;
    color: #64748b;
    margin-top: 3px;
  }
  .severity-badge {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 12px;
    font-size: 8pt;
    font-weight: bold;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  .severity-normal   { background: #dcfce7; color: #166534; }
  .severity-mild     { background: #fef3c7; color: #92400e; }
  .severity-moderate { background: #fee2e2; color: #991b1b; }
  .severity-severe   { background: #fce7f3; color: #831843; }
  .heatmap-section {
    margin-top: 10px;
  }
  .heatmap-img {
    max-width: 240px;
    height: auto;
    border-radius: 4px;
    border: 1px solid #e2e8f0;
  }
  .heatmap-caption {
    font-size: 8pt;
    color: #64748b;
    margin-top: 4px;
  }
  .no-result {
    color: #94a3b8;
    font-style: italic;
    font-size: 9pt;
  }
  .footer {
    border-top: 1px solid #e2e8f0;
    padding-top: 8px;
    margin-top: 24px;
    font-size: 8pt;
    color: #94a3b8;
    display: flex;
    justify-content: space-between;
  }
  .thresholds-note {
    font-size: 8pt;
    color: #64748b;
    margin-top: 10px;
    padding: 6px 10px;
    background: #f1f5f9;
    border-radius: 4px;
  }
</style>
</head>
<body>

<div class="header">
  <div>
    {% if practice %}
    <div class="practice-name">{{ practice.name }}</div>
    <div class="practice-address">{{ practice.city }}{% if practice.postcode %}, {{ practice.postcode }}{% endif %}</div>
    {% else %}
    <div class="practice-name">TearFlex Report</div>
    {% endif %}
  </div>
  <div>
    <div class="report-title">Tear Film Assessment Report</div>
    <div class="report-date">{{ assessment.assessed_at|date:"j F Y" }}</div>
  </div>
</div>

<!-- Patient Details -->
<div class="section">
  <div class="section-title">Patient</div>
  <div class="patient-grid">
    <div>
      <div class="field-label">Full name</div>
      <div class="field-value">{{ patient.first_name }} {{ patient.last_name }}</div>
    </div>
    <div>
      <div class="field-label">Date of birth</div>
      <div class="field-value">{{ patient.date_of_birth|date:"j M Y" }}</div>
    </div>
    {% if patient.nhs_number %}
    <div>
      <div class="field-label">NHS number</div>
      <div class="field-value">{{ patient.nhs_number }}</div>
    </div>
    {% endif %}
    <div>
      <div class="field-label">Eye assessed</div>
      <div class="field-value">{{ assessment.get_eye_display }}</div>
    </div>
    {% if clinician %}
    <div>
      <div class="field-label">Clinician</div>
      <div class="field-value">{{ clinician.user.get_full_name }}</div>
    </div>
    {% endif %}
  </div>
</div>

<!-- Assessment Notes -->
{% if assessment.notes %}
<div class="section">
  <div class="section-title">Notes</div>
  <p style="margin:0; font-size:10pt;">{{ assessment.notes }}</p>
</div>
{% endif %}

<!-- Test Results -->
<div class="section">
  <div class="section-title">Test Results</div>

  {% for item in captures %}
  {% with capture=item.capture result=item.result %}
  <div class="capture-block">
    <div class="capture-header">
      {{ capture.get_test_type_display }}
      &nbsp;&middot;&nbsp;
      {{ capture.captured_at|date:"H:i" }}
      &nbsp;&middot;&nbsp;
      {% if result and result.dry_eye_severity %}
        <span class="severity-badge severity-{{ result.dry_eye_severity }}">
          {{ result.dry_eye_severity|title }}
        </span>
      {% else %}
        <span class="no-result">Pending</span>
      {% endif %}
    </div>

    <div class="capture-body">
      {% if result %}
        {% if capture.test_type == 'nibut' %}
        <div class="metrics-row">
          <div class="metric-tile">
            <div class="metric-value">
              {% if result.nibut_first_breakup_seconds %}{{ result.nibut_first_breakup_seconds|floatformat:1 }}{% else %}—{% endif %}
              <span class="metric-unit">s</span>
            </div>
            <div class="metric-label">First break-up time</div>
          </div>
          <div class="metric-tile">
            <div class="metric-value">
              {% if result.nibut_mean_breakup_seconds %}{{ result.nibut_mean_breakup_seconds|floatformat:1 }}{% else %}—{% endif %}
              <span class="metric-unit">s</span>
            </div>
            <div class="metric-label">Mean break-up time</div>
          </div>
          <div class="metric-tile">
            <div class="metric-value">
              {% if result.confidence_score %}{{ result.confidence_score|floatformat:0 }}{% else %}—{% endif %}
              <span class="metric-unit">%</span>
            </div>
            <div class="metric-label">Analysis confidence</div>
          </div>
        </div>
        {% if item.heatmap_uri %}
        <div class="heatmap-section">
          <img class="heatmap-img" src="{{ item.heatmap_uri }}" alt="Tear film heatmap">
          <div class="heatmap-caption">Tear film break-up heatmap (red = high distortion)</div>
        </div>
        {% endif %}
        {% endif %}

        {% if capture.test_type == 'fluorescein' %}
        <div class="metrics-row">
          <div class="metric-tile">
            <div class="metric-value">
              {% if result.fluorescein_grade is not None %}{{ result.fluorescein_grade }}/5{% else %}—{% endif %}
            </div>
            <div class="metric-label">Oxford grade</div>
          </div>
          <div class="metric-tile">
            <div class="metric-value">
              {% if result.fluorescein_breakup_seconds %}{{ result.fluorescein_breakup_seconds|floatformat:1 }}{% else %}—{% endif %}
              <span class="metric-unit">s</span>
            </div>
            <div class="metric-label">Break-up time</div>
          </div>
        </div>
        {% endif %}

        {% if capture.test_type == 'lipid' %}
        <div class="metrics-row">
          <div class="metric-tile">
            <div class="metric-value">
              {% if result.lipid_grade is not None %}{{ result.lipid_grade }}/5{% else %}—{% endif %}
            </div>
            <div class="metric-label">Guillon grade</div>
          </div>
          <div class="metric-tile">
            <div class="metric-value">
              {% if result.lipid_thickness_nm %}{{ result.lipid_thickness_nm|floatformat:0 }}{% else %}—{% endif %}
              <span class="metric-unit">nm</span>
            </div>
            <div class="metric-label">Est. thickness</div>
          </div>
        </div>
        {% endif %}

        {% if result.tear_meniscus_height_mm is not None %}
        <div style="margin-top: 8px; font-size: 9pt;">
          <strong>Tear meniscus height:</strong> {{ result.tear_meniscus_height_mm|floatformat:2 }} mm
        </div>
        {% endif %}

      {% else %}
        <p class="no-result">Analysis not yet complete for this capture.</p>
      {% endif %}
    </div>
  </div>
  {% endwith %}
  {% empty %}
  <p class="no-result">No test captures for this assessment.</p>
  {% endfor %}
</div>

<!-- Clinical Reference -->
<div class="thresholds-note">
  <strong>NIBUT reference values (TFOS DEWS II):</strong>
  Normal ≥ 10s &nbsp;|&nbsp; Borderline 5–9.9s &nbsp;|&nbsp; Concern &lt; 5s
</div>

<div class="footer">
  <span>Generated by TearFlex &middot; tearflex.mydryeyeapp.co.uk</span>
  <span>{{ assessment.assessed_at|date:"j F Y" }}</span>
</div>

</body>
</html>
```

- [ ] **Step 5: Run existing report tests**

```bash
cd /opt/tearflex
docker compose -f docker-compose.prod.yml exec backend \
    python -m pytest apps/reports/tests/ -v 2>&1 | tail -20
```

Expected: all existing tests pass. If any fail due to the context changes, fix them before continuing.

- [ ] **Step 6: Commit**

```bash
git add backend/apps/reports/templates/reports/assessment_report.html \
        backend/apps/reports/generators.py
git commit -m "feat: enhance PDF report template — all result fields, embedded heatmap, NIBUT reference values"
```

---

## Task 2: Make report generation asynchronous (Celery task)

**Files:**
- Create: `backend/apps/reports/tasks.py`
- Modify: `backend/apps/reports/views.py`
- Create: `backend/apps/reports/tests/test_tasks.py`

The current `GenerateReportView` calls `generate_assessment_report(assessment)` synchronously in the request handler. This blocks the HTTP request for the full WeasyPrint rendering time (1–3s). Fix: create a Celery task, return 202 immediately, let the task run in the background.

- [ ] **Step 1: Write failing test for the Celery task**

Create `backend/apps/reports/tests/test_tasks.py`:

```python
from unittest.mock import patch, MagicMock
import pytest
from django.test import TestCase
from apps.reports.tasks import generate_report_task


class GenerateReportTaskTest(TestCase):

    @patch('apps.reports.tasks.generate_assessment_report')
    def test_task_calls_generate_with_correct_assessment(self, mock_generate):
        """generate_report_task should call generate_assessment_report with the right Assessment."""
        from apps.reports.models import Report
        mock_report = MagicMock(spec=Report)
        mock_generate.return_value = mock_report

        # We need a real Assessment to test with; patch the DB lookup
        with patch('apps.reports.tasks.Assessment.objects.get') as mock_get:
            mock_assessment = MagicMock()
            mock_get.return_value = mock_assessment
            generate_report_task(assessment_id=42)
            mock_get.assert_called_once_with(pk=42)
            mock_generate.assert_called_once_with(mock_assessment)

    @patch('apps.reports.tasks.generate_assessment_report')
    @patch('apps.reports.tasks.Assessment.objects.get')
    def test_task_handles_missing_assessment(self, mock_get, mock_generate):
        """generate_report_task should not raise if assessment is missing."""
        from django.core.exceptions import ObjectDoesNotExist
        mock_get.side_effect = ObjectDoesNotExist()
        # Should not raise — just log and return
        generate_report_task(assessment_id=999)
        mock_generate.assert_not_called()
```

- [ ] **Step 2: Run test to confirm failure**

```bash
cd /opt/tearflex
docker compose -f docker-compose.prod.yml exec backend \
    python -m pytest apps/reports/tests/test_tasks.py -v 2>&1 | tail -15
```

Expected: ImportError — `apps.reports.tasks` doesn't exist yet.

- [ ] **Step 3: Create `backend/apps/reports/tasks.py`**

```python
import logging
from celery import shared_task
from django.core.exceptions import ObjectDoesNotExist

logger = logging.getLogger(__name__)


@shared_task(bind=True, max_retries=2, default_retry_delay=10)
def generate_report_task(self, assessment_id: int) -> None:
    """Celery task: generate a PDF report for an assessment."""
    from apps.assessments.models import Assessment
    from .generators import generate_assessment_report

    try:
        assessment = Assessment.objects.get(pk=assessment_id)
    except ObjectDoesNotExist:
        logger.error("Assessment %s not found; cannot generate report", assessment_id)
        return

    try:
        report = generate_assessment_report(assessment)
        logger.info("Report %s generated for assessment %s", report.pk, assessment_id)
    except Exception as exc:
        logger.exception("Report generation failed for assessment %s", assessment_id)
        raise self.retry(exc=exc)
```

- [ ] **Step 4: Update `GenerateReportView` to dispatch Celery task**

Read `backend/apps/reports/views.py` in full, then modify `GenerateReportView` to:
1. Create a `Report` record in `pending` status immediately
2. Fire the Celery task
3. Return HTTP 202 with the new report's ID

```python
# In GenerateReportView.post():
from .tasks import generate_report_task
from .models import Report

assessment_id = serializer.validated_data['assessment_id']
# Validate practice scope (existing logic — keep it)
assessment = get_object_or_404(
    Assessment.objects.filter(patient__practice=request.user.clinician.practice),
    pk=assessment_id,
)

# Create pending report immediately so client can poll
report = Report.objects.create(
    assessment=assessment,
    generated_by=request.user.clinician,
    status='pending',
)

# Enqueue background generation
generate_report_task.delay(assessment_id=assessment.pk)

return Response(
    ReportSerializer(report).data,
    status=status.HTTP_202_ACCEPTED,
)
```

- [ ] **Step 5: Run all report tests**

```bash
cd /opt/tearflex
docker compose -f docker-compose.prod.yml exec backend \
    python -m pytest apps/reports/tests/ -v 2>&1 | tail -20
```

Expected: all tests pass, including the new task tests.

- [ ] **Step 6: Commit**

```bash
git add backend/apps/reports/tasks.py \
        backend/apps/reports/views.py \
        backend/apps/reports/tests/test_tasks.py
git commit -m "feat: async report generation via Celery task; view returns 202 immediately"
```

---

## Task 3: Add PDF share button to mobile results screen

**Files:**
- Create: `mobile/hooks/useReports.ts`
- Modify: `mobile/app/assessment/results.tsx`

The mobile results screen currently has a "Done" button (navigates home) and "Repeat test" button. Add a "Share PDF" button that:
1. Calls `POST /api/reports/generate/` with the assessment ID
2. Polls until status is `'ready'`
3. Downloads the PDF to a temp file
4. Opens the native share sheet

- [ ] **Step 1: Check expo-sharing is available**

```bash
cd /opt/tearflex/mobile && cat package.json | grep -E "expo-sharing|expo-file-system"
```

If either package is missing, install:
```bash
cd /opt/tearflex/mobile && npx expo install expo-sharing expo-file-system
```

- [ ] **Step 2: Read the current results.tsx**

Read `mobile/app/assessment/results.tsx` in full. Note the current action bar structure and route params (specifically: `captureId` and `testType` are available, but `assessmentId` is not — we need to fetch it from the capture detail, which returns the `assessment` ID).

Also read `mobile/lib/api.ts` to understand the `get` and `post` signatures.

- [ ] **Step 3: Create `mobile/hooks/useReports.ts`**

```ts
import { useState } from 'react';
import { api } from '@/lib/api';

interface ReportStatus {
  id: number;
  status: 'pending' | 'ready' | 'failed';
  pdf_file: string | null;
}

export function useGeneratePDFReport() {
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generateAndShare(assessmentId: number): Promise<string | null> {
    setIsGenerating(true);
    setError(null);
    try {
      // Trigger generation
      const report = await api.post<ReportStatus>('reports/generate/', {
        assessment_id: assessmentId,
      });

      // Poll until ready (max 30 attempts × 2s = 60s)
      for (let i = 0; i < 30; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        const status = await api.get<ReportStatus>(`reports/${report.id}/`);
        if (status.status === 'ready' && status.pdf_file) {
          return status.pdf_file;  // absolute URL to download
        }
        if (status.status === 'failed') {
          throw new Error('Report generation failed on server');
        }
      }
      throw new Error('Report generation timed out');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not generate report');
      return null;
    } finally {
      setIsGenerating(false);
    }
  }

  return { generateAndShare, isGenerating, error };
}
```

Note: `api.post` needs to accept a body. Check `mobile/lib/api.ts` — if it only accepts `postMultipart`, add a `post` method or use `postMultipart` with JSON. Adapt as needed.

- [ ] **Step 4: Modify `mobile/app/assessment/results.tsx` to add Share PDF button**

Read the file first. The `data` object from `useQuery` contains `CaptureDetail` which has an `assessment` field (the assessment ID). Verify the API returns this; if not, the `assessmentId` may need to come from a different source.

The `CaptureDetail` interface needs an `assessment` field if not already present:
```ts
interface CaptureDetail {
  id: number;
  assessment: number;  // add this if missing
  test_type: 'nibut' | 'fluorescein' | 'lipid';
  status: 'uploaded' | 'processing' | 'analysed' | 'failed';
  captured_at: string;
  result: CaptureResult | null;
}
```

Add the share button to the action bar, between "Done" and "Repeat test":

```tsx
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';
import { useGeneratePDFReport } from '@/hooks/useReports';

// Inside the component:
const { generateAndShare, isGenerating } = useGeneratePDFReport();

async function handleSharePDF() {
  if (!data?.assessment) return;
  const pdfUrl = await generateAndShare(data.assessment);
  if (!pdfUrl) return;

  // Download to device temp storage
  const localUri = FileSystem.cacheDirectory + `report_${data.assessment}.pdf`;
  await FileSystem.downloadAsync(pdfUrl, localUri);

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(localUri, {
      mimeType: 'application/pdf',
      dialogTitle: 'Share tear film report',
    });
  }
}
```

Add the button in the action bar (between "Done" and "Repeat test"):

```tsx
<TouchableOpacity
  style={[styles.secondaryButton, isGenerating && { opacity: 0.5 }]}
  activeOpacity={0.8}
  onPress={handleSharePDF}
  disabled={isGenerating}
>
  <Text style={styles.secondaryButtonText}>
    {isGenerating ? 'Generating PDF…' : 'Share PDF'}
  </Text>
</TouchableOpacity>
```

- [ ] **Step 5: Run typecheck**

```bash
cd /opt/tearflex/mobile && npm run typecheck 2>&1 | tail -10
```

Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
git add mobile/hooks/useReports.ts mobile/app/assessment/results.tsx
git commit -m "feat: mobile PDF share — generate report and open native share sheet"
```

---

## Task 4: Verify end-to-end rebuild and test

- [ ] **Step 1: Rebuild and restart all containers**

```bash
cd /opt/tearflex
docker compose -f docker-compose.prod.yml up --build -d
```

- [ ] **Step 2: Run full backend test suite**

```bash
docker compose -f docker-compose.prod.yml exec backend \
    python -m pytest -v 2>&1 | tail -30
```

Expected: all tests pass.

- [ ] **Step 3: Smoke test report generation via API**

```bash
# Get a JWT token (replace credentials):
TOKEN=$(curl -s -X POST https://tearflex.mydryeyeapp.co.uk/api/auth/login/ \
    -H 'Content-Type: application/json' \
    -d '{"username":"admin","password":"yourpassword"}' | python3 -c "import sys,json; print(json.load(sys.stdin)['access'])")

# Trigger report generation for assessment 1 (adjust ID as needed):
curl -s -X POST https://tearflex.mydryeyeapp.co.uk/api/reports/generate/ \
    -H "Authorization: Bearer $TOKEN" \
    -H 'Content-Type: application/json' \
    -d '{"assessment_id": 1}' | python3 -m json.tool
```

Expected: HTTP 202 with `{"id": N, "status": "pending", ...}`

- [ ] **Step 4: Check report status after 5 seconds**

```bash
sleep 5
curl -s https://tearflex.mydryeyeapp.co.uk/api/reports/1/ \
    -H "Authorization: Bearer $TOKEN" | python3 -m json.tool
```

Expected: `"status": "ready"` and `pdf_file` URL present.

- [ ] **Step 5: Final commit if any fixes applied**

```bash
git add -A
git commit -m "chore: end-to-end verification of PDF report generation"
```

---

## Self-Review Checklist

- [x] **Template**: All result types (NIBUT, fluorescein, lipid), embedded heatmap (base64 data URI), patient/practice/clinician info, clinical reference values, footer
- [x] **generators.py**: `_heatmap_data_uri` helper, rich context passed to template, existing interface preserved
- [x] **Async generation**: Celery task with retry; view returns 202 immediately; Report starts as `pending`
- [x] **Mobile share**: `useGeneratePDFReport` hook polls until ready, downloads to cache, calls `expo-sharing`
- [x] **`CaptureDetail` interface**: `assessment` field added if missing so mobile can get the assessment ID
- [x] **Existing tests**: preserved and passing throughout
- [x] **No placeholders**: all template HTML, Python, and TypeScript code is complete
