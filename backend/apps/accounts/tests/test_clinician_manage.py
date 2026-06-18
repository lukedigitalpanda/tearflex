import pytest
from rest_framework.test import APIClient

from conftest import ChainFactory, PracticeFactory, ClinicianFactory


def _client(user):
    c = APIClient()
    c.force_authenticate(user=user)
    return c


def _url(pk):
    return f'/api/auth/clinicians/{pk}/'


@pytest.mark.django_db
def test_practice_admin_edits_details_and_promotes_within_range():
    practice = PracticeFactory()
    admin = ClinicianFactory(practice=practice, role='admin')
    clin = ClinicianFactory(practice=practice, role='clinician')
    resp = _client(admin.user).patch(_url(clin.id), {
        'first_name': 'Renamed', 'role': 'technician', 'title': 'Dr',
    }, format='json')
    assert resp.status_code == 200, resp.data
    clin.refresh_from_db()
    clin.user.refresh_from_db()
    assert clin.user.first_name == 'Renamed' and clin.role == 'technician' and clin.title == 'Dr'


@pytest.mark.django_db
def test_practice_admin_cannot_promote_to_admin():
    practice = PracticeFactory()
    admin = ClinicianFactory(practice=practice, role='admin')
    clin = ClinicianFactory(practice=practice, role='clinician')
    resp = _client(admin.user).patch(_url(clin.id), {'role': 'admin'}, format='json')
    assert resp.status_code == 400


@pytest.mark.django_db
def test_cannot_edit_user_out_of_scope():
    admin = ClinicianFactory(role='admin')
    other = ClinicianFactory(role='clinician')  # different practice
    resp = _client(admin.user).patch(_url(other.id), {'title': 'X'}, format='json')
    assert resp.status_code == 403


@pytest.mark.django_db
def test_cannot_edit_self():
    admin = ClinicianFactory(role='admin')
    resp = _client(admin.user).patch(_url(admin.id), {'title': 'X'}, format='json')
    assert resp.status_code == 403


@pytest.mark.django_db
def test_demoting_last_admin_blocked():
    practice = PracticeFactory()
    a1 = ClinicianFactory(practice=practice, role='admin')
    chain_admin = ClinicianFactory(
        practice=PracticeFactory(chain=ChainFactory()), role='chain_admin')
    # put the lone admin's practice into the chain admin's chain so it's manageable
    a1.practice.chain = chain_admin.practice.chain
    a1.practice.save()
    resp = _client(chain_admin.user).patch(_url(a1.id), {'role': 'clinician'}, format='json')
    assert resp.status_code == 400


@pytest.mark.django_db
def test_chain_admin_moves_user_within_chain():
    chain = ChainFactory()
    home = PracticeFactory(chain=chain)
    sibling = PracticeFactory(chain=chain)
    ca = ClinicianFactory(practice=home, role='chain_admin')
    clin = ClinicianFactory(practice=home, role='clinician')
    resp = _client(ca.user).patch(_url(clin.id), {'practice_id': sibling.id}, format='json')
    assert resp.status_code == 200, resp.data
    clin.refresh_from_db()
    assert clin.practice_id == sibling.id


@pytest.mark.django_db
def test_chain_admin_cannot_move_user_outside_chain():
    chain = ChainFactory()
    home = PracticeFactory(chain=chain)
    outside = PracticeFactory(chain=ChainFactory())
    ca = ClinicianFactory(practice=home, role='chain_admin')
    clin = ClinicianFactory(practice=home, role='clinician')
    resp = _client(ca.user).patch(_url(clin.id), {'practice_id': outside.id}, format='json')
    assert resp.status_code == 400
