import pytest

from apps.reports.generators import generate_assessment_report
from apps.reports.models import Report
from conftest import AssessmentFactory


@pytest.mark.django_db
def test_generate_produces_ready_report_with_pdf():
    report = Report.objects.create(assessment=AssessmentFactory(), status='pending')
    generate_assessment_report(report)
    assert isinstance(report, Report)
    assert report.status == 'ready'
    assert report.pdf_file.name.endswith('.pdf')
    report.pdf_file.open('rb')
    head = report.pdf_file.read(5)
    report.pdf_file.close()
    assert head == b'%PDF-'


@pytest.mark.django_db
def test_regenerate_swaps_pdf_and_removes_old_file():
    from django.core.files.storage import default_storage

    report = Report.objects.create(assessment=AssessmentFactory(), status='pending')
    generate_assessment_report(report)
    first_name = report.pdf_file.name
    assert default_storage.exists(first_name)

    # Regenerate: a new PDF replaces the old, which is cleaned up.
    report.status = 'pending'
    report.save(update_fields=['status'])
    generate_assessment_report(report)
    second_name = report.pdf_file.name

    assert second_name != first_name
    assert default_storage.exists(second_name)        # report always has a valid file
    assert not default_storage.exists(first_name)     # old file removed, no orphan
    default_storage.delete(second_name)
