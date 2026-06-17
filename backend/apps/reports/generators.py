import base64
import logging
from django.template.loader import render_to_string
from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from django.utils import timezone
from weasyprint import HTML

logger = logging.getLogger(__name__)

# Fixed clinical order so reports (and side-by-side comparisons) always list
# tests in the same order regardless of capture time.
TEST_TYPE_ORDER = {'nibut': 0, 'fluorescein': 1, 'lipid': 2}

OXFORD_LABELS = ['Absent', 'Minimal', 'Mild', 'Moderate', 'Marked', 'Severe']
GUILLON_LABELS = [
    'Open meshwork (~15nm)',
    'Closed meshwork (~30nm)',
    'Wave / flow (~60nm)',
    'Amorphous (~80nm)',
    'Coloured fringes (>90nm)',
]


def _nibut_band(seconds, normal_threshold, borderline_threshold):
    if seconds is None:
        return None
    if seconds >= normal_threshold:
        return {'label': 'Normal', 'css': 'band-normal'}
    if seconds >= borderline_threshold:
        return {'label': 'Borderline', 'css': 'band-borderline'}
    return {'label': 'Concern', 'css': 'band-concern'}


def _heatmap_data_uri(result) -> str | None:
    """Convert a TestResult's nibut_heatmap to a base64 data URI for HTML embedding."""
    if not result or not result.nibut_heatmap:
        return None
    try:
        result.nibut_heatmap.open('rb')
        data = result.nibut_heatmap.read()
        result.nibut_heatmap.close()
        encoded = base64.b64encode(data).decode('ascii')
        return f"data:image/png;base64,{encoded}"
    except Exception:
        logger.warning("Could not read heatmap for result %s", getattr(result, 'pk', '?'), exc_info=True)
        return None


def build_report_context(report) -> dict:
    """Assemble the template context for an assessment report (shared by the
    PDF and the in-app HTML view, so both render identical content)."""
    assessment = report.assessment
    practice = assessment.clinician.practice if assessment.clinician else None
    normal_t = getattr(practice, 'nibut_normal_threshold', None) or 10
    borderline_t = getattr(practice, 'nibut_borderline_threshold', None) or 5

    captures_with_results = []
    ordered_captures = sorted(
        assessment.captures.select_related('result'),
        key=lambda c: (TEST_TYPE_ORDER.get(c.test_type, 99), c.captured_at),
    )
    for capture in ordered_captures:
        result = getattr(capture, 'result', None)
        confidence_pct = None
        if result and result.confidence_score is not None:
            confidence_pct = round(result.confidence_score * 100)

        item = {
            'capture': capture,
            'result': result,
            'heatmap_uri': _heatmap_data_uri(result),
            'confidence_pct': confidence_pct,
        }

        if capture.test_type == 'nibut' and result:
            item['nibut_band'] = _nibut_band(result.nibut_first_breakup_seconds, normal_t, borderline_t)

        if capture.test_type == 'fluorescein' and result and result.fluorescein_grade is not None:
            idx = result.fluorescein_grade
            item['fluorescein_grade_label'] = OXFORD_LABELS[idx] if 0 <= idx <= 5 else ''

        if capture.test_type == 'lipid' and result and result.lipid_grade is not None:
            idx = result.lipid_grade - 1
            item['lipid_grade_label'] = GUILLON_LABELS[idx] if 0 <= idx <= 4 else ''

        captures_with_results.append(item)

    return {
        'assessment': assessment,
        'patient': assessment.patient,
        'practice': practice,
        'clinician': assessment.clinician,
        'captures': captures_with_results,
    }


def render_report_html(report, dark: bool = False) -> str:
    """Render the report as an HTML document string. `dark` switches the
    on-screen view to the dark theme (PDF generation always renders light)."""
    context = build_report_context(report)
    context['dark'] = dark
    return render_to_string('reports/assessment_report.html', context)


def generate_assessment_report(report) -> 'Report':
    """
    Generate a PDF for an existing Report record.
    Renders the HTML template, converts to PDF with WeasyPrint,
    and saves to the report's pdf_file field.
    """
    assessment = report.assessment
    # Keep any existing PDF until the new one is safely stored, then remove it.
    # (We never blank pdf_file before this point, so a failed/in-flight
    # regeneration still leaves the previous report downloadable.)
    old_file_name = report.pdf_file.name or None
    try:
        html_string = render_report_html(report)
        pdf_bytes = HTML(string=html_string).write_pdf()

        filename = f'tearflex_report_{assessment.id}.pdf'
        report.pdf_file.save(filename, ContentFile(pdf_bytes), save=False)
        report.status = 'ready'
        report.completed_at = timezone.now()
        report.save(update_fields=['pdf_file', 'status', 'completed_at'])
        # New PDF is stored; drop the superseded one so files don't accumulate.
        if old_file_name and old_file_name != report.pdf_file.name:
            default_storage.delete(old_file_name)
    except Exception:
        # Re-raise so the Celery task can apply its retry/attempt-cap policy.
        # The caller is responsible for marking the report 'failed'.
        logger.exception("PDF generation failed for assessment %s", assessment.id)
        raise

    return report
