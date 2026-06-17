import pytest

from apps.reports.serializers import ReportSerializer
from apps.reports.generators import generate_assessment_report
from apps.reports.models import Report
from conftest import AssessmentFactory


@pytest.mark.django_db
def test_report_serializer_exposes_expected_fields():
    report = Report.objects.create(assessment=AssessmentFactory(), status='pending')
    generate_assessment_report(report)
    data = ReportSerializer(report).data
    assert set(data) >= {'id', 'assessment', 'status', 'created_at'}
    # pdf_file must NOT be exposed: it would render as an internal-host URL.
    assert 'pdf_file' not in data
    assert data['status'] == 'ready'
