import pytest

from apps.reports.serializers import ReportSerializer
from apps.reports.generators import generate_assessment_report
from conftest import AssessmentFactory


@pytest.mark.django_db
def test_report_serializer_exposes_expected_fields():
    report = generate_assessment_report(AssessmentFactory())
    data = ReportSerializer(report).data
    assert set(data) >= {'id', 'assessment', 'status', 'created_at', 'pdf_file'}
    assert data['status'] == 'ready'
