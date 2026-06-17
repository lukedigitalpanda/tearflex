import logging
from celery import shared_task
from django.core.exceptions import ObjectDoesNotExist

from .generators import generate_assessment_report

logger = logging.getLogger(__name__)


@shared_task(bind=True, max_retries=None, default_retry_delay=10)
def generate_report_task(self, report_id: int) -> None:
    """Generate a PDF for an existing Report record.

    Bounded by Report.MAX_GENERATION_ATTEMPTS. The attempt counter lives on the
    model (not just Celery's per-call retry count) so the cap holds even when a
    job is redelivered after a worker death (acks_late) rather than via retry().
    """
    from .models import Report
    try:
        report = Report.objects.select_related('assessment').get(pk=report_id)
    except ObjectDoesNotExist:
        logger.error("Report %s not found; aborting generation", report_id)
        return

    if report.status == 'ready':
        # Idempotent: a redelivered duplicate for an already-finished report.
        return

    max_attempts = Report.MAX_GENERATION_ATTEMPTS
    if report.generation_attempts >= max_attempts:
        if report.status != 'failed':
            report.status = 'failed'
            report.save(update_fields=['status'])
        logger.error(
            "Report %s exhausted %d generation attempts; giving up",
            report_id, report.generation_attempts,
        )
        return

    # Count the attempt before rendering, so a worker killed mid-render (and the
    # job then redelivered) still advances the counter toward the cap.
    report.generation_attempts += 1
    report.save(update_fields=['generation_attempts'])
    attempt = report.generation_attempts

    try:
        generate_assessment_report(report)
        logger.info("Report %s generated on attempt %d/%d", report.pk, attempt, max_attempts)
    except Exception as exc:
        logger.exception(
            "Report generation failed for report %s (attempt %d/%d)",
            report_id, attempt, max_attempts,
        )
        if attempt >= max_attempts:
            report.status = 'failed'
            report.save(update_fields=['status'])
            logger.error("Report %s reached max attempts; marked failed", report_id)
            return
        raise self.retry(exc=exc)
