import pytest
from apps.calibration.models import DeviceCalibration


@pytest.mark.django_db
def test_device_calibration_defaults(practice):
    cal = DeviceCalibration.objects.create(practice=practice, phone_model_id='iphone16,2')
    assert cal.method == 'reference_object'
    assert cal.calibration_version == 'calib-v0.1'
    assert cal.is_active is True
    assert cal.camera_intrinsics == {}
    assert cal.practice_id == practice.id


@pytest.mark.django_db
def test_device_calibration_stores_json_payloads(practice):
    cal = DeviceCalibration.objects.create(
        practice=practice, phone_model_id='iphone16,2',
        attachment_geometry={'ring_radii_mm': [1.0, 2.0], 'disc_lens_offset_mm': 8.0},
        solve_result={'scale_constant': 1234.5},
    )
    cal.refresh_from_db()
    assert cal.attachment_geometry['disc_lens_offset_mm'] == 8.0
    assert cal.solve_result['scale_constant'] == 1234.5
