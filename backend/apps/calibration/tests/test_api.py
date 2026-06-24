import pytest
from apps.calibration.models import DeviceCalibration


@pytest.mark.django_db
def test_create_calibration_attaches_callers_practice(api, clinician):
    resp = api.post('/api/calibration/devices/', {
        'phone_model_id': 'iphone16,2', 'device_model': 'iPhone 16 Pro',
        'attachment_geometry': {'disc_lens_offset_mm': 8.0},
    }, format='json')
    assert resp.status_code == 201, resp.content
    cal = DeviceCalibration.objects.get(id=resp.data['id'])
    assert cal.practice_id == clinician.practice_id
    assert cal.calibration_version == 'calib-v0.1'


@pytest.mark.django_db
def test_list_calibrations_scoped_and_filterable(api, clinician):
    DeviceCalibration.objects.create(practice=clinician.practice, phone_model_id='iphone16,2')
    DeviceCalibration.objects.create(practice=clinician.practice, phone_model_id='pixel9')
    resp = api.get('/api/calibration/devices/?phone_model_id=iphone16,2')
    assert resp.status_code == 200
    ids = [r['phone_model_id'] for r in resp.data['results']]
    assert ids == ['iphone16,2']


@pytest.mark.django_db
def test_list_excludes_other_practice(api, clinician):
    from conftest import PracticeFactory
    mine = DeviceCalibration.objects.create(practice=clinician.practice, phone_model_id='iphone16,2')
    DeviceCalibration.objects.create(practice=PracticeFactory(), phone_model_id='iphone16,2')
    resp = api.get('/api/calibration/devices/')
    assert resp.status_code == 200
    assert [r['id'] for r in resp.data['results']] == [mine.id]


@pytest.mark.django_db
def test_detail_other_practice_404(api):
    from conftest import PracticeFactory
    other = DeviceCalibration.objects.create(practice=PracticeFactory(), phone_model_id='x')
    resp = api.get(f'/api/calibration/devices/{other.id}/')
    assert resp.status_code == 404
