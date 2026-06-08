import logging

from django.core.files.base import ContentFile
from django.template.loader import render_to_string

from .models import Report

logger = logging.getLogger(__name__)


def generate_assessment_report(assessment) -> Report:
    """Render an assessment to a PDF and persist it as a ready Report."""
    report = Report.objects.create(
        assessment=assessment,
        generated_by=assessment.clinician,
    )
    try:
        captures = list(assessment.captures.select_related('result').all())
        html = render_to_string(
            'reports/assessment_report.html',
            {
                'assessment': assessment,
                'patient': assessment.patient,
                'practice': assessment.patient.practice,
                'captures': captures,
            },
        )
        from weasyprint import HTML  # imported lazily; native deps isolated here

        pdf_bytes = HTML(string=html).write_pdf()
        report.pdf_file.save(f'assessment_{assessment.id}_report_{report.id}.pdf',
                             ContentFile(pdf_bytes), save=False)
        report.status = 'ready'
    except Exception:
        logger.exception('Failed to generate PDF for assessment %s (report %s)', assessment.id, report.id)
        report.status = 'failed'
    report.save()
    return report
