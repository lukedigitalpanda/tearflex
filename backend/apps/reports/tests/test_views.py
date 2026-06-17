import pytest
from unittest.mock import patch

from conftest import AssessmentFactory, PatientFactory, ClinicianFactory
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
@patch('apps.reports.views.generate_report_task')
def test_regenerate_reuses_single_report(mock_task, api, clinician):
    assessment = AssessmentFactory(patient=PatientFactory(practice=clinician.practice))

    first = api.post('/api/reports/generate/', {'assessment': assessment.id}, format='json')
    second = api.post('/api/reports/generate/', {'assessment': assessment.id}, format='json')

    assert first.status_code == 202 and second.status_code == 202
    # Same report row reused, not duplicated.
    assert first.data['id'] == second.data['id']
    assert Report.objects.filter(assessment=assessment).count() == 1


@pytest.mark.django_db
def test_html_view_returns_report_html(api, clinician):
    from apps.reports.generators import generate_assessment_report

    report = generate_assessment_report(Report.objects.create(
        assessment=AssessmentFactory(patient=PatientFactory(practice=clinician.practice)),
        status='pending',
    ))
    resp = api.get(f'/api/reports/{report.id}/html/')
    assert resp.status_code == 200
    assert resp['Content-Type'].startswith('text/html')
    assert b'Tear Film Assessment Report' in resp.content


@pytest.mark.django_db
def test_cannot_generate_for_other_practice(api):
    other = AssessmentFactory()  # different practice
    resp = api.post('/api/reports/generate/', {'assessment': other.id}, format='json')
    assert resp.status_code == 404


@pytest.mark.django_db
def test_delete_is_soft_and_restorable(api, clinician):
    from django.core.files.base import ContentFile

    assessment = AssessmentFactory(patient=PatientFactory(practice=clinician.practice))
    report = Report.objects.create(assessment=assessment, status='ready')
    report.pdf_file.save('r.pdf', ContentFile(b'%PDF-1.4 x'), save=True)
    pid = assessment.patient_id

    # Soft delete: row survives, PDF kept, dropped from the normal list.
    assert api.delete(f'/api/reports/{report.id}/').status_code == 204
    report.refresh_from_db()
    assert report.deleted_at is not None
    assert report.pdf_file
    assert all(r['id'] != report.id for r in api.get(f'/api/reports/?patient={pid}').data['results'])

    # Visible in the deleted list, and restorable.
    deleted = api.get(f'/api/reports/?patient={pid}&deleted=true').data['results']
    assert any(r['id'] == report.id for r in deleted)
    assert api.post(f'/api/reports/{report.id}/restore/').status_code == 200
    report.refresh_from_db()
    assert report.deleted_at is None
    assert any(r['id'] == report.id for r in api.get(f'/api/reports/?patient={pid}').data['results'])


@pytest.mark.django_db
def test_non_admin_cannot_see_or_restore_deleted(clinician):
    from django.utils import timezone
    from rest_framework.test import APIClient

    report = Report.objects.create(
        assessment=AssessmentFactory(patient=PatientFactory(practice=clinician.practice)),
        status='ready', deleted_at=timezone.now(),
    )
    tech = ClinicianFactory(practice=clinician.practice, role='technician')
    client = APIClient()
    client.force_authenticate(user=tech.user)

    # ?deleted=true is ignored for non-admins (no deleted reports returned).
    assert client.get('/api/reports/?deleted=true').data['results'] == []
    assert client.post(f'/api/reports/{report.id}/restore/').status_code == 403
