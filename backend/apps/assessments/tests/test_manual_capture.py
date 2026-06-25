import pytest
from rest_framework.test import APIClient
from unittest.mock import patch
from django.core.files.uploadedfile import SimpleUploadedFile

from conftest import AssessmentFactory, PatientFactory


def _video():
    return SimpleUploadedFile('capture.mp4', b'fake-bytes', content_type='video/mp4')


@pytest.mark.django_db
def test_manual_nibut_creates_capture_and_result(api, clinician):
    from apps.assessments.models import TestCapture, TestResult
    patient = PatientFactory(practice=clinician.practice)
    assessment = AssessmentFactory(patient=patient, clinician=clinician)

    resp = api.post('/api/assessments/captures/manual/', {
        'assessment': assessment.id,
        'test_type': 'nibut',
        'nibut_first_breakup_seconds': 7.2,
        'nibut_mean_breakup_seconds': 8.1,
    }, format='json')

    assert resp.status_code == 201
    capture = TestCapture.objects.get(pk=resp.data['id'])
    assert capture.source == 'manual'
    assert capture.status == 'analysed'
    assert not capture.video_file
    result = TestResult.objects.get(capture=capture)
    assert result.nibut_first_breakup_seconds == pytest.approx(7.2)
    assert result.nibut_mean_breakup_seconds == pytest.approx(8.1)
    assert result.dry_eye_severity == 'mild'  # 7.2 is between defaults (5–10)


@pytest.mark.django_db
def test_nibut_normal_severity(api, clinician):
    from apps.assessments.models import TestResult
    patient = PatientFactory(practice=clinician.practice)
    assessment = AssessmentFactory(patient=patient, clinician=clinician)

    resp = api.post('/api/assessments/captures/manual/', {
        'assessment': assessment.id,
        'test_type': 'nibut',
        'nibut_first_breakup_seconds': 12.0,
    }, format='json')

    assert resp.status_code == 201
    assert TestResult.objects.get(capture_id=resp.data['id']).dry_eye_severity == 'normal'


@pytest.mark.django_db
def test_nibut_moderate_severity(api, clinician):
    from apps.assessments.models import TestResult
    patient = PatientFactory(practice=clinician.practice)
    assessment = AssessmentFactory(patient=patient, clinician=clinician)

    resp = api.post('/api/assessments/captures/manual/', {
        'assessment': assessment.id,
        'test_type': 'nibut',
        'nibut_first_breakup_seconds': 3.0,
    }, format='json')

    assert resp.status_code == 201
    assert TestResult.objects.get(capture_id=resp.data['id']).dry_eye_severity == 'moderate'


@pytest.mark.django_db
def test_fluorescein_capture_no_nibut_severity(api, clinician):
    from apps.assessments.models import TestResult
    patient = PatientFactory(practice=clinician.practice)
    assessment = AssessmentFactory(patient=patient, clinician=clinician)

    resp = api.post('/api/assessments/captures/manual/', {
        'assessment': assessment.id,
        'test_type': 'fluorescein',
        'fluorescein_grade': 2,
    }, format='json')

    assert resp.status_code == 201
    assert TestResult.objects.get(capture_id=resp.data['id']).dry_eye_severity is None


@pytest.mark.django_db
def test_manual_capture_rejects_other_practice(api):
    patient = PatientFactory()  # different practice
    assessment = AssessmentFactory(patient=patient)

    resp = api.post('/api/assessments/captures/manual/', {
        'assessment': assessment.id,
        'test_type': 'nibut',
        'nibut_first_breakup_seconds': 7.2,
    }, format='json')

    assert resp.status_code == 403


@pytest.mark.django_db
def test_manual_capture_unauthenticated():
    patient = PatientFactory()
    assessment = AssessmentFactory(patient=patient)
    client = APIClient()

    resp = client.post('/api/assessments/captures/manual/', {
        'assessment': assessment.id,
        'test_type': 'nibut',
        'nibut_first_breakup_seconds': 7.2,
    }, format='json')

    assert resp.status_code == 401


@pytest.mark.django_db
def test_manual_with_video_attaches_and_skips_analysis(api, clinician):
    from apps.assessments.models import TestCapture, TestResult
    patient = PatientFactory(practice=clinician.practice)
    assessment = AssessmentFactory(patient=patient, clinician=clinician)
    with patch('apps.assessments.views.process_capture.delay') as mock_delay:
        resp = api.post('/api/assessments/captures/manual/', {
            'assessment': assessment.id, 'test_type': 'nibut',
            'nibut_first_breakup_seconds': 7.2,
            'video_file': _video(), 'source': 'upload',
        }, format='multipart')
    assert resp.status_code == 201
    capture = TestCapture.objects.get(pk=resp.data['id'])
    assert capture.source == 'upload'
    assert bool(capture.video_file) is True
    assert capture.status == 'analysed'
    mock_delay.assert_not_called()
    assert TestResult.objects.filter(capture=capture).exists()


@pytest.mark.django_db
def test_manual_with_video_missing_source_is_rejected(api, clinician):
    patient = PatientFactory(practice=clinician.practice)
    assessment = AssessmentFactory(patient=patient, clinician=clinician)
    resp = api.post('/api/assessments/captures/manual/', {
        'assessment': assessment.id, 'test_type': 'nibut',
        'nibut_first_breakup_seconds': 7.2, 'video_file': _video(),
    }, format='multipart')
    assert resp.status_code == 400
    assert 'source' in resp.data


@pytest.mark.django_db
def test_manual_source_upload_without_video_is_rejected(api, clinician):
    patient = PatientFactory(practice=clinician.practice)
    assessment = AssessmentFactory(patient=patient, clinician=clinician)
    resp = api.post('/api/assessments/captures/manual/', {
        'assessment': assessment.id, 'test_type': 'nibut',
        'nibut_first_breakup_seconds': 7.2, 'source': 'upload',
    }, format='json')
    assert resp.status_code == 400
    assert 'source' in resp.data
