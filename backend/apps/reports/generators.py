import base64
import logging
from django.template.loader import render_to_string
from django.core.files.base import ContentFile
from weasyprint import HTML

logger = logging.getLogger(__name__)


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


def generate_assessment_report(assessment) -> 'Report':
    """
    Generate a PDF report for an assessment.
    Creates a Report record, renders the HTML template, converts to PDF with WeasyPrint,
    and saves to the report's pdf_file field.
    """
    from .models import Report

    report = Report.objects.create(assessment=assessment, status='pending')
    try:
        captures_with_results = []
        for capture in assessment.captures.select_related('result').order_by('captured_at'):
            result = getattr(capture, 'result', None)
            confidence_pct = None
            if result and result.confidence_score is not None:
                confidence_pct = round(result.confidence_score * 100)
            captures_with_results.append({
                'capture': capture,
                'result': result,
                'heatmap_uri': _heatmap_data_uri(result),
                'confidence_pct': confidence_pct,
            })

        context = {
            'assessment': assessment,
            'patient': assessment.patient,
            'practice': assessment.clinician.practice if assessment.clinician else None,
            'clinician': assessment.clinician,
            'captures': captures_with_results,
        }

        html_string = render_to_string('reports/assessment_report.html', context)
        pdf_bytes = HTML(string=html_string).write_pdf()

        filename = f'tearflex_report_{assessment.id}.pdf'
        report.pdf_file.save(filename, ContentFile(pdf_bytes), save=False)
        report.status = 'ready'
        report.save(update_fields=['pdf_file', 'status'])
    except Exception:
        logger.exception("PDF generation failed for assessment %s", assessment.id)
        report.status = 'failed'
        report.save(update_fields=['status'])

    return report
