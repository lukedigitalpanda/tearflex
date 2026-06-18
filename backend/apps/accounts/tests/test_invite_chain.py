import pytest
from rest_framework.test import APIClient

from apps.accounts.models import Clinician
from conftest import ChainFactory, PracticeFactory, ClinicianFactory

URL = '/api/auth/practice/clinicians/invite/'


def _client(user):
    c = APIClient()
    c.force_authenticate(user=user)
    return c


def _payload(email, role):
    return {'email': email, 'first_name': 'A', 'last_name': 'B', 'role': role}


@pytest.mark.django_db
def test_chain_admin_can_invite_admin_to_sibling_practice():
    chain = ChainFactory()
    home = PracticeFactory(chain=chain)
    sibling = PracticeFactory(chain=chain)
    admin = ClinicianFactory(practice=home, role='chain_admin')
    resp = _client(admin.user).post(
        f'{URL}?practice_id={sibling.id}', _payload('a@x.com', 'admin'), format='json')
    assert resp.status_code == 201, resp.data
    new = Clinician.objects.get(user__email='a@x.com')
    assert new.practice_id == sibling.id and new.role == 'admin'


@pytest.mark.django_db
def test_chain_admin_can_invite_clinician():
    chain = ChainFactory()
    home = PracticeFactory(chain=chain)
    admin = ClinicianFactory(practice=home, role='chain_admin')
    resp = _client(admin.user).post(URL, _payload('c@x.com', 'clinician'), format='json')
    assert resp.status_code == 201


@pytest.mark.django_db
def test_chain_admin_cannot_invite_to_practice_outside_chain():
    chain = ChainFactory()
    home = PracticeFactory(chain=chain)
    outside = PracticeFactory(chain=ChainFactory())
    admin = ClinicianFactory(practice=home, role='chain_admin')
    resp = _client(admin.user).post(
        f'{URL}?practice_id={outside.id}', _payload('a@x.com', 'admin'), format='json')
    assert resp.status_code == 403


@pytest.mark.django_db
def test_practice_admin_cannot_invite_admin_role():
    admin = ClinicianFactory(role='admin')
    resp = _client(admin.user).post(URL, _payload('a@x.com', 'admin'), format='json')
    assert resp.status_code == 400


@pytest.mark.django_db
def test_practice_admin_can_invite_technician():
    admin = ClinicianFactory(role='admin')
    resp = _client(admin.user).post(URL, _payload('t@x.com', 'technician'), format='json')
    assert resp.status_code == 201


@pytest.mark.django_db
def test_nobody_can_invite_chain_admin_role():
    admin = ClinicianFactory(role='admin')
    resp = _client(admin.user).post(URL, _payload('a@x.com', 'chain_admin'), format='json')
    assert resp.status_code == 400


@pytest.mark.django_db
def test_practice_admin_cannot_target_other_practice():
    admin = ClinicianFactory(role='admin')
    other = PracticeFactory()
    resp = _client(admin.user).post(
        f'{URL}?practice_id={other.id}', _payload('a@x.com', 'clinician'), format='json')
    assert resp.status_code == 403
