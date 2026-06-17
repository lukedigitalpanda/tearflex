import logging

from django.core.files.storage import default_storage
from django.core.management.base import BaseCommand

from apps.reports.models import Report

logger = logging.getLogger(__name__)

# Matches Report.pdf_file's upload_to prefix.
REPORTS_DIR = 'reports'


class Command(BaseCommand):
    help = (
        "Delete report PDF files in storage that are no longer referenced by any "
        "Report row (e.g. left behind when duplicates were removed or reports "
        "regenerated). Use --dry-run to preview."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run', action='store_true',
            help="List the orphaned files that would be deleted, without deleting them.",
        )

    def _walk(self, path):
        """Yield every file path under `path` in default_storage, recursively."""
        try:
            dirs, files = default_storage.listdir(path)
        except FileNotFoundError:
            return
        for name in files:
            yield f"{path}/{name}" if path else name
        for d in dirs:
            yield from self._walk(f"{path}/{d}" if path else d)

    def handle(self, *args, **options):
        dry_run = options['dry_run']

        referenced = set(
            Report.objects.exclude(pdf_file='').values_list('pdf_file', flat=True)
        )
        orphans = [p for p in self._walk(REPORTS_DIR) if p not in referenced]

        if not orphans:
            self.stdout.write("No orphaned report files found.")
            return

        for path in orphans:
            if dry_run:
                self.stdout.write(f"[dry-run] would delete: {path}")
            else:
                default_storage.delete(path)
                logger.info("Deleted orphaned report file: %s", path)
                self.stdout.write(f"deleted: {path}")

        verb = "Would delete" if dry_run else "Deleted"
        self.stdout.write(self.style.SUCCESS(f"{verb} {len(orphans)} orphaned report file(s)."))
