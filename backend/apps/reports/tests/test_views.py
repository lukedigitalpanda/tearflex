import pytest

from conftest import AssessmentFactory, PatientFactory


@pytest.mark.django_db
def test_generate_then_list_and_download(api, clinician):
    assessment = AssessmentFactory(patient=PatientFactory(practice=clinician.practice))

    gen = api.post('/api/reports/generate/', {'assessment': assessment.id}, format='json')
    assert gen.status_code == 201
    report_id = gen.data['id']
    assert gen.data['status'] == 'ready'

    lst = api.get('/api/reports/')
    assert lst.status_code == 200
    assert any(r['id'] == report_id for r in lst.data['results'])

    dl = api.get(f'/api/reports/{report_id}/download/')
    assert dl.status_code == 200
    assert dl['Content-Type'] == 'application/pdf'


@pytest.mark.django_db
def test_cannot_generate_for_other_practice(api):
    other = AssessmentFactory()  # different practice
    resp = api.post('/api/reports/generate/', {'assessment': other.id}, format='json')
    assert resp.status_code == 404
