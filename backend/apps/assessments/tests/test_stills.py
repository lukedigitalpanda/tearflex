import io

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from PIL import Image

from conftest import AssessmentFactory, PatientFactory


@pytest.mark.django_db
def test_capture_still_orders_by_timestamp():
    from apps.assessments.models import CaptureStill, TestCapture
    assessment = AssessmentFactory()
    capture = TestCapture.objects.create(assessment=assessment, test_type='nibut')
    later = CaptureStill.objects.create(capture=capture, image='stills/b.jpg', timestamp_seconds=8.2)
    earlier = CaptureStill.objects.create(capture=capture, image='stills/a.jpg', timestamp_seconds=2.0)
    assert list(capture.stills.all()) == [earlier, later]


@pytest.mark.django_db
def test_capture_still_str():
    from apps.assessments.models import CaptureStill, TestCapture
    assessment = AssessmentFactory()
    capture = TestCapture.objects.create(assessment=assessment, test_type='nibut')
    still = CaptureStill.objects.create(capture=capture, image='stills/a.jpg', timestamp_seconds=8.2)
    assert str(still).startswith('Still @ 8.20s')


def _image_upload(name='frame.png'):
    buf = io.BytesIO()
    Image.new('RGB', (4, 4), 'white').save(buf, format='PNG')
    return SimpleUploadedFile(name, buf.getvalue(), content_type='image/png')


def _capture_in(clinician):
    patient = PatientFactory(practice=clinician.practice)
    assessment = AssessmentFactory(patient=patient, clinician=clinician)
    from apps.assessments.models import TestCapture
    return TestCapture.objects.create(assessment=assessment, test_type='nibut')


@pytest.mark.django_db
def test_post_still_creates_row(api, clinician):
    from apps.assessments.models import CaptureStill
    capture = _capture_in(clinician)
    resp = api.post(f'/api/assessments/captures/{capture.id}/stills/', {
        'image': _image_upload(), 'timestamp_seconds': 8.2, 'label': 'first_breakup',
    }, format='multipart')
    assert resp.status_code == 201
    still = CaptureStill.objects.get(pk=resp.data['id'])
    assert still.capture == capture
    assert still.timestamp_seconds == pytest.approx(8.2)
    assert still.label == 'first_breakup'


@pytest.mark.django_db
def test_list_stills_ordered_by_timestamp(api, clinician):
    from apps.assessments.models import CaptureStill
    capture = _capture_in(clinician)
    CaptureStill.objects.create(capture=capture, image='stills/b.jpg', timestamp_seconds=8.2)
    CaptureStill.objects.create(capture=capture, image='stills/a.jpg', timestamp_seconds=2.0)
    resp = api.get(f'/api/assessments/captures/{capture.id}/stills/')
    assert resp.status_code == 200
    stamps = [s['timestamp_seconds'] for s in resp.data]
    assert stamps == [2.0, 8.2]


@pytest.mark.django_db
def test_post_still_requires_image(api, clinician):
    capture = _capture_in(clinician)
    resp = api.post(f'/api/assessments/captures/{capture.id}/stills/', {
        'timestamp_seconds': 1.0,
    }, format='multipart')
    assert resp.status_code == 400


@pytest.mark.django_db
def test_post_still_requires_timestamp(api, clinician):
    capture = _capture_in(clinician)
    resp = api.post(f'/api/assessments/captures/{capture.id}/stills/', {
        'image': _image_upload(),
    }, format='multipart')
    assert resp.status_code == 400


@pytest.mark.django_db
def test_post_still_rejects_negative_timestamp(api, clinician):
    capture = _capture_in(clinician)
    resp = api.post(f'/api/assessments/captures/{capture.id}/stills/', {
        'image': _image_upload(), 'timestamp_seconds': -1.0,
    }, format='multipart')
    assert resp.status_code == 400


@pytest.mark.django_db
def test_stills_cross_practice_is_404(api, clinician):
    from apps.assessments.models import TestCapture
    other_assessment = AssessmentFactory()  # different practice
    other_capture = TestCapture.objects.create(assessment=other_assessment, test_type='nibut')
    get_resp = api.get(f'/api/assessments/captures/{other_capture.id}/stills/')
    assert get_resp.status_code == 404
    post_resp = api.post(f'/api/assessments/captures/{other_capture.id}/stills/', {
        'image': _image_upload(), 'timestamp_seconds': 1.0,
    }, format='multipart')
    assert post_resp.status_code == 404


@pytest.mark.django_db
def test_stills_appear_in_capture_serializer(api, clinician):
    from apps.assessments.models import CaptureStill
    capture = _capture_in(clinician)
    CaptureStill.objects.create(capture=capture, image='stills/a.jpg', timestamp_seconds=3.0, label='x')
    resp = api.get(f'/api/assessments/captures/{capture.id}/')
    assert resp.status_code == 200
    assert len(resp.data['stills']) == 1
    assert resp.data['stills'][0]['label'] == 'x'
