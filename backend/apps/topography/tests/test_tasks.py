import cv2
import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from conftest import AssessmentFactory
from apps.topography.models import TopographyScan, TopographyStill
from apps.topography.tasks import process_topography_scan
from apps.analysis.topography.tests.synthetic import make_ring_image


def _png(name, blur):
    img, _ = make_ring_image(size=400, n_rings=6, blur=blur)
    ok, buf = cv2.imencode('.png', img)
    return SimpleUploadedFile(name, buf.tobytes(), content_type='image/png')


@pytest.mark.django_db
def test_process_scan_creates_result_and_marks_selected():
    scan = TopographyScan.objects.create(assessment=AssessmentFactory(), status='uploaded')
    TopographyStill.objects.create(scan=scan, image=_png('soft.png', 5.0), index=0)
    TopographyStill.objects.create(scan=scan, image=_png('crisp.png', 1.0), index=1)

    process_topography_scan(scan.id)

    scan.refresh_from_db()
    assert scan.status == 'analysed'
    assert scan.result.algorithm_version == 'topo-v0.1'
    assert scan.result.calibration_state == 'uncalibrated'
    assert scan.result.axial_map
    assert scan.result.ring_overlay
    selected = scan.stills.filter(is_selected=True)
    assert selected.count() == 1
    assert selected.first().index == 1


@pytest.mark.django_db
def test_process_scan_no_stills_sets_failed():
    scan = TopographyScan.objects.create(assessment=AssessmentFactory(), status='uploaded')
    with pytest.raises(Exception):
        process_topography_scan(scan.id)
    scan.refresh_from_db()
    assert scan.status == 'failed'
