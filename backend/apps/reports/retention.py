import logging
from datetime import timedelta

from django.utils import timezone

from .models import Report

logger = logging.getLogger(__name__)


def purge_expired_reports() -> int:
    """Permanently delete reports soft-deleted more than RETENTION_DAYS ago,
    removing their stored PDF too. Returns the number purged."""
    cutoff = timezone.now() - timedelta(days=Report.RETENTION_DAYS)
    expired = Report.objects.filter(deleted_at__isnull=False, deleted_at__lt=cutoff)
    purged = 0
    for report in expired:
        if report.pdf_file:
            report.pdf_file.delete(save=False)
        logger.info("Purging soft-deleted report %s (deleted_at=%s)", report.pk, report.deleted_at)
        report.delete()
        purged += 1
    return purged
