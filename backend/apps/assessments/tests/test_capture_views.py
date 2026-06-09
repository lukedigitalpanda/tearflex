import io
import pytest
from rest_framework.test import APIClient
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
    assert resp.status_code in (403, 404)


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
