import logging
from celery import shared_task
from django.core.exceptions import ObjectDoesNotExist

from apps.assessments.models import Assessment
from .generators import generate_assessment_report

logger = logging.getLogger(__name__)


@shared_task(bind=True, max_retries=2, default_retry_delay=10)
def generate_report_task(self, assessment_id: int) -> None:
    """Generate a PDF report for an assessment in the background."""
    try:
        assessment = Assessment.objects.get(pk=assessment_id)
    except ObjectDoesNotExist:
        logger.error("Assessment %s not found; aborting report generation", assessment_id)
        return

    try:
        report = generate_assessment_report(assessment)
        logger.info(
            "Report %s generated (status=%s) for assessment %s",
            report.pk, report.status, assessment_id,
        )
    except Exception as exc:
        logger.exception("Report generation failed for assessment %s", assessment_id)
        raise self.retry(exc=exc)


