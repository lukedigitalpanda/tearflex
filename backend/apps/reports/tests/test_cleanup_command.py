import pytest
from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from django.core.management import call_command

from apps.reports.models import Report
from conftest import AssessmentFactory


@pytest.mark.django_db
def test_cleanup_removes_orphans_keeps_referenced():
    # A real report with a referenced PDF.
    report = Report.objects.create(assessment=AssessmentFactory(), status='ready')
    report.pdf_file.save('tearflex_report_kept.pdf', ContentFile(b'%PDF-1.4 kept'), save=True)
    referenced_name = report.pdf_file.name

    # An orphan file under the reports dir with no DB row pointing at it.
    orphan_name = default_storage.save('reports/2020/01/01/orphan.pdf', ContentFile(b'%PDF-1.4 orphan'))

    assert default_storage.exists(referenced_name)
    assert default_storage.exists(orphan_name)

    call_command('cleanup_orphan_reports')

    assert default_storage.exists(referenced_name)   # referenced file kept
    assert not default_storage.exists(orphan_name)   # orphan removed

    # Cleanup the kept file so the test leaves no artefacts.
    default_storage.delete(referenced_name)


@pytest.mark.django_db
def test_cleanup_dry_run_deletes_nothing():
    orphan_name = default_storage.save('reports/2020/01/01/orphan2.pdf', ContentFile(b'%PDF-1.4 orphan'))
    try:
        call_command('cleanup_orphan_reports', '--dry-run')
        assert default_storage.exists(orphan_name)   # dry-run leaves it in place
    finally:
        default_storage.delete(orphan_name)
