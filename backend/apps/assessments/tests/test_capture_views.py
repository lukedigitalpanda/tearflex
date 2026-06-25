import io
import pytest
from unittest.mock import patch
from rest_framework.test import APIClient
from django.core.files.uploadedfile import SimpleUploadedFile
from conftest import AssessmentFactory, ClinicianFactory, PatientFactory


@pytest.mark.django_db
def test_unauthenticated_upload_is_rejected():
    assessment = AssessmentFactory()
    client = APIClient()
    resp = client.post('/api/assessments/captures/', {
        'assessment': assessment.id,
        'test_type': 'nibut',
        'video_file': io.BytesIO(b'fake'),
    }, format='multipart')
    assert resp.status_code == 401


@pytest.mark.django_db
def test_upload_for_other_practice_is_rejected(api, clinician):
    other_patient = PatientFactory()  # different practice
    other_assessment = AssessmentFactory(patient=other_patient)
    resp = api.post('/api/assessments/captures/', {
        'assessment': other_assessment.id,
        'test_type': 'nibut',
        'video_file': io.BytesIO(b'fake'),
    }, format='multipart')
    assert resp.status_code == 403


@pytest.mark.django_db
def test_unauthenticated_detail_is_rejected():
    from apps.assessments.models import TestCapture
    assessment = AssessmentFactory()
    capture = TestCapture.objects.create(
        assessment=assessment, test_type='nibut',
        video_file='captures/test.mp4',
    )
    client = APIClient()
    resp = client.get(f'/api/assessments/captures/{capture.id}/')
    assert resp.status_code == 401


@pytest.mark.django_db
def test_detail_for_other_practice_is_rejected(api):
    from apps.assessments.models import TestCapture
    other_assessment = AssessmentFactory()  # different practice
    other_capture = TestCapture.objects.create(
        assessment=other_assessment, test_type='nibut',
        video_file='captures/test.mp4',
    )
    resp = api.get(f'/api/assessments/captures/{other_capture.id}/')
    assert resp.status_code == 404


def _video():
    return SimpleUploadedFile('capture.mp4', b'fake-bytes', content_type='video/mp4')


@pytest.mark.django_db
def test_upload_with_source_upload_persists_and_triggers_analysis(api, clinician):
    patient = PatientFactory(practice=clinician.practice)
    assessment = AssessmentFactory(patient=patient, clinician=clinician)
    from apps.assessments.models import TestCapture
    with patch('apps.assessments.views.process_capture.delay') as mock_delay:
        mock_delay.return_value.id = 'task-1'
        resp = api.post('/api/assessments/captures/', {
            'assessment': assessment.id, 'test_type': 'nibut',
            'video_file': _video(), 'source': 'upload',
        }, format='multipart')
    assert resp.status_code == 201
    capture = TestCapture.objects.get(pk=resp.data['id'])
    assert capture.source == 'upload'
    assert capture.status == 'processing'
    mock_delay.assert_called_once_with(capture.id)


@pytest.mark.django_db
def test_upload_without_source_defaults_to_mobile(api, clinician):
    patient = PatientFactory(practice=clinician.practice)
    assessment = AssessmentFactory(patient=patient, clinician=clinician)
    from apps.assessments.models import TestCapture
    with patch('apps.assessments.views.process_capture.delay') as mock_delay:
        mock_delay.return_value.id = 'task-2'
        resp = api.post('/api/assessments/captures/', {
            'assessment': assessment.id, 'test_type': 'nibut', 'video_file': _video(),
        }, format='multipart')
    assert resp.status_code == 201
    capture = TestCapture.objects.get(pk=resp.data['id'])
    assert capture.source == 'mobile'


@pytest.mark.django_db
def test_upload_with_source_manual_is_rejected(api, clinician):
    patient = PatientFactory(practice=clinician.practice)
    assessment = AssessmentFactory(patient=patient, clinician=clinician)
    with patch('apps.assessments.views.process_capture.delay') as mock_delay:
        mock_delay.return_value.id = 'task-3'
        resp = api.post('/api/assessments/captures/', {
            'assessment': assessment.id, 'test_type': 'nibut',
            'video_file': _video(), 'source': 'manual',
        }, format='multipart')
    assert resp.status_code == 400


@pytest.mark.django_db
def test_upload_without_video_file_is_rejected(api, clinician):
    patient = PatientFactory(practice=clinician.practice)
    assessment = AssessmentFactory(patient=patient, clinician=clinician)
    resp = api.post('/api/assessments/captures/', {
        'assessment': assessment.id, 'test_type': 'nibut', 'source': 'upload',
    }, format='multipart')
    assert resp.status_code == 400
    assert 'video_file' in resp.data
