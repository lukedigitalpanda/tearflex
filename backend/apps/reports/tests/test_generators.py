import pytest

from apps.reports.generators import generate_assessment_report
from apps.reports.models import Report
from conftest import AssessmentFactory


@pytest.mark.django_db
def test_generate_produces_ready_report_with_pdf():
    assessment = AssessmentFactory()
    report = generate_assessment_report(assessment)
    assert isinstance(report, Report)
    assert report.status == 'ready'
    assert report.pdf_file.name.endswith('.pdf')
    report.pdf_file.open('rb')
    head = report.pdf_file.read(5)
    report.pdf_file.close()
    assert head == b'%PDF-'
