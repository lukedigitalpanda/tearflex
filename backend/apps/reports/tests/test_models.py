import pytest

from apps.reports.models import Report
from conftest import AssessmentFactory


@pytest.mark.django_db
def test_report_defaults_to_pending():
    assessment = AssessmentFactory()
    report = Report.objects.create(assessment=assessment, generated_by=assessment.clinician)
    assert report.status == 'pending'
    assert report.created_at is not None
    assert str(report).startswith('Report')
