import pytest

from rest_framework.test import APIRequestFactory

from apps.reports.serializers import ReportSerializer
from apps.reports.generators import generate_assessment_report
from apps.reports.models import Report
from conftest import AssessmentFactory, ClinicianFactory


@pytest.mark.django_db
def test_report_serializer_exposes_expected_fields():
    report = Report.objects.create(assessment=AssessmentFactory(), status='pending')
    generate_assessment_report(report)
    data = ReportSerializer(report).data
    assert set(data) >= {'id', 'assessment', 'status', 'created_at'}
    # pdf_file must NOT be exposed: it would render as an internal-host URL.
    assert 'pdf_file' not in data
    assert data['status'] == 'ready'


@pytest.mark.django_db
def test_completed_at_visible_only_to_report_admins():
    report = Report.objects.create(assessment=AssessmentFactory(), status='pending')
    generate_assessment_report(report)
    rf = APIRequestFactory()

    admin_req = rf.get('/')
    admin_req.user = ClinicianFactory(role='admin').user
    assert 'completed_at' in ReportSerializer(report, context={'request': admin_req}).data

    clinician_req = rf.get('/')
    clinician_req.user = ClinicianFactory(role='clinician').user
    assert 'completed_at' not in ReportSerializer(report, context={'request': clinician_req}).data
