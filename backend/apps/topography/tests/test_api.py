import cv2
import pytest
from unittest.mock import patch
from django.core.files.uploadedfile import SimpleUploadedFile
from conftest import AssessmentFactory
from apps.topography.models import TopographyScan, TopographyResult
from apps.analysis.topography.tests.synthetic import make_ring_image


def _png(name='s.png'):
    img, _ = make_ring_image(size=300, n_rings=5)
    ok, buf = cv2.imencode('.png', img)
    return SimpleUploadedFile(name, buf.tobytes(), content_type='image/png')


@pytest.mark.django_db
def test_create_scan_kicks_processing(api, clinician):
    assessment = AssessmentFactory(patient__practice=clinician.practice)
    with patch('apps.topography.views.process_topography_scan.delay') as delay:
        delay.return_value.id = 'task-123'
        resp = api.post('/api/topography/scans/', {
            'assessment': assessment.id,
            'device_model': 'iPhone 15 Pro',
            'stills': [_png('a.png'), _png('b.png')],
        }, format='multipart')
    assert resp.status_code == 201, resp.content
    scan = TopographyScan.objects.get(id=resp.data['id'])
    assert scan.status == 'processing'
    assert scan.celery_task_id == 'task-123'
    assert scan.stills.count() == 2
    delay.assert_called_once_with(scan.id)


@pytest.mark.django_db
def test_create_scan_other_practice_forbidden(api):
    other = AssessmentFactory()
    with patch('apps.topography.views.process_topography_scan.delay'):
        resp = api.post('/api/topography/scans/', {
            'assessment': other.id, 'stills': [_png()],
        }, format='multipart')
    assert resp.status_code == 403


@pytest.mark.django_db
def test_status_returns_result_when_analysed(api, clinician):
    assessment = AssessmentFactory(patient__practice=clinician.practice)
    scan = TopographyScan.objects.create(assessment=assessment, status='analysed')
    TopographyResult.objects.create(scan=scan, sim_k_steep=44.2, sim_k_flat=42.1,
                                    algorithm_version='topo-v0.1', calibration_state='uncalibrated')
    resp = api.get(f'/api/topography/scans/{scan.id}/status/')
    assert resp.status_code == 200
    assert resp.data['status'] == 'analysed'
    assert resp.data['result']['sim_k_steep'] == 44.2


@pytest.mark.django_db
def test_detail_scoped_to_practice(api):
    other = AssessmentFactory()
    scan = TopographyScan.objects.create(assessment=other, status='uploaded')
    resp = api.get(f'/api/topography/scans/{scan.id}/')
    assert resp.status_code == 404


@pytest.mark.django_db
def test_create_scan_rejects_too_many_stills(api, clinician):
    assessment = AssessmentFactory(patient__practice=clinician.practice)
    with patch('apps.topography.views.process_topography_scan.delay'):
        resp = api.post('/api/topography/scans/', {
            'assessment': assessment.id,
            'stills': [_png(f's{i}.png') for i in range(21)],
        }, format='multipart')
    assert resp.status_code == 400


@pytest.mark.django_db
def test_list_scans_filtered_by_assessment(api, clinician):
    a1 = AssessmentFactory(patient__practice=clinician.practice)
    a2 = AssessmentFactory(patient__practice=clinician.practice)
    s1 = TopographyScan.objects.create(assessment=a1, status='analysed')
    TopographyScan.objects.create(assessment=a2, status='analysed')
    resp = api.get(f'/api/topography/scans/?assessment={a1.id}')
    assert resp.status_code == 200
    ids = [row['id'] for row in resp.data['results']]
    assert ids == [s1.id]


@pytest.mark.django_db
def test_list_scans_scoped_to_practice(api):
    other = AssessmentFactory()
    TopographyScan.objects.create(assessment=other, status='analysed')
    resp = api.get(f'/api/topography/scans/?assessment={other.id}')
    assert resp.status_code == 200
    assert resp.data['results'] == []
