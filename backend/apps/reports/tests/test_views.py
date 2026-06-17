import pytest
from unittest.mock import patch

from conftest import AssessmentFactory, PatientFactory
from apps.reports.models import Report


@pytest.mark.django_db
@patch('apps.reports.views.generate_report_task')
def test_generate_report_returns_202_pending(mock_task, api, clinician):
    assessment = AssessmentFactory(patient=PatientFactory(practice=clinician.practice))

    gen = api.post('/api/reports/generate/', {'assessment': assessment.id}, format='json')

    assert gen.status_code == 202
    report_id = gen.data['id']
    assert gen.data['status'] == 'pending'
    mock_task.delay.assert_called_once_with(report_id=report_id)

    lst = api.get('/api/reports/')
    assert lst.status_code == 200
    assert any(r['id'] == report_id for r in lst.data['results'])


@pytest.mark.django_db
def test_download_ready_report(api, clinician):
    from django.core.files.base import ContentFile

    assessment = AssessmentFactory(patient=PatientFactory(practice=clinician.practice))
    report = Report.objects.create(assessment=assessment, status='ready')
    report.pdf_file.save(
        f'tearflex_report_{assessment.id}.pdf',
        ContentFile(b'%PDF-1.4 fake pdf content'),
        save=True,
    )

    dl = api.get(f'/api/reports/{report.id}/download/')
    assert dl.status_code == 200
    assert dl['Content-Type'] == 'application/pdf'


@pytest.mark.django_db
def test_cannot_generate_for_other_practice(api):
    other = AssessmentFactory()  # different practice
    resp = api.post('/api/reports/generate/', {'assessment': other.id}, format='json')
    assert resp.status_code == 404
