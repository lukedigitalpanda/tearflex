import pytest
from rest_framework.test import APIClient
from django.contrib.auth.models import User

from apps.accounts.models import Practice
from conftest import ChainFactory, PracticeFactory, ClinicianFactory

URL = '/api/auth/practices/'


def _client(user):
    c = APIClient()
    c.force_authenticate(user=user)
    return c


@pytest.mark.django_db
def test_chain_admin_creates_practice_joined_to_their_chain():
    chain = ChainFactory()
    home = PracticeFactory(chain=chain)
    admin = ClinicianFactory(practice=home, role='chain_admin')
    resp = _client(admin.user).post(URL, {
        'name': 'New Branch', 'address_line_1': '2 High St',
        'city': 'Leeds', 'postcode': 'LS1 1AA',
    }, format='json')
    assert resp.status_code == 201, resp.data
    created = Practice.objects.get(id=resp.data['id'])
    assert created.chain_id == chain.id
    assert created.name == 'New Branch'


@pytest.mark.django_db
def test_chain_admin_supplied_chain_is_ignored():
    chain = ChainFactory()
    other = ChainFactory()
    home = PracticeFactory(chain=chain)
    admin = ClinicianFactory(practice=home, role='chain_admin')
    resp = _client(admin.user).post(URL, {
        'name': 'B', 'address_line_1': 'x', 'city': 'y', 'postcode': 'z',
        'chain': other.id,
    }, format='json')
    assert resp.status_code == 201
    assert Practice.objects.get(id=resp.data['id']).chain_id == chain.id


@pytest.mark.django_db
def test_chain_admin_without_chain_cannot_create():
    admin = ClinicianFactory(role='chain_admin')  # home practice has no chain
    resp = _client(admin.user).post(URL, {
        'name': 'B', 'address_line_1': 'x', 'city': 'y', 'postcode': 'z',
    }, format='json')
    assert resp.status_code == 400


@pytest.mark.django_db
def test_practice_admin_cannot_create():
    admin = ClinicianFactory(role='admin')
    resp = _client(admin.user).post(URL, {
        'name': 'B', 'address_line_1': 'x', 'city': 'y', 'postcode': 'z',
    }, format='json')
    assert resp.status_code == 403


@pytest.mark.django_db
def test_superuser_can_create_practice():
    su = User.objects.create_superuser('su', 'su@x.com', 'pw')
    resp = _client(su).post(URL, {
        'name': 'B', 'address_line_1': 'x', 'city': 'y', 'postcode': 'z',
    }, format='json')
    assert resp.status_code == 201
    assert Practice.objects.get(id=resp.data['id']).chain_id is None


@pytest.mark.django_db
def test_list_still_works_for_practice_admin():
    admin = ClinicianFactory(role='admin')
    resp = _client(admin.user).get(URL)
    assert resp.status_code == 200
