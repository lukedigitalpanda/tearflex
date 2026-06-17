from django.core.management.base import BaseCommand

from apps.reports.models import Report
from apps.reports.retention import purge_expired_reports


class Command(BaseCommand):
    help = (
        f"Permanently delete reports that were soft-deleted more than "
        f"{Report.RETENTION_DAYS} days ago (removing their stored PDFs). "
        "Intended to be run on a schedule (e.g. daily cron)."
    )

    def handle(self, *args, **options):
        purged = purge_expired_reports()
        self.stdout.write(self.style.SUCCESS(f"Purged {purged} expired report(s)."))
