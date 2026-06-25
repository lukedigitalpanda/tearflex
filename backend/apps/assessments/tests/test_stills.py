import pytest

from conftest import AssessmentFactory


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
