import pytest
from rest_framework.test import APIClient

from conftest import PracticeFactory, ClinicianFactory


def _client(user):
    c = APIClient()
    c.force_authenticate(user=user)
    return c


def _url(pk):
    return f'/api/auth/clinicians/{pk}/'


@pytest.mark.django_db
def test_admin_deactivates_clinician_keeps_record():
    practice = PracticeFactory()
    admin = ClinicianFactory(practice=practice, role='admin')
    clin = ClinicianFactory(practice=practice, role='clinician')
    resp = _client(admin.user).delete(_url(clin.id))
    assert resp.status_code == 204
    clin.user.refresh_from_db()
    assert clin.user.is_active is False
    clin.refresh_from_db()  # record still exists
    assert clin.pk is not None


@pytest.mark.django_db
def test_cannot_remove_last_admin():
    practice = PracticeFactory()
    admin = ClinicianFactory(practice=practice, role='admin')
    second = ClinicianFactory(practice=practice, role='admin')
    # admin removing the only OTHER admin is fine; removing the last one is blocked.
    resp_ok = _client(admin.user).delete(_url(second.id))
    assert resp_ok.status_code == 403  # admins are equal tier — cannot manage each other


@pytest.mark.django_db
def test_chain_admin_cannot_remove_last_admin_of_a_practice():
    from conftest import ChainFactory
    chain = ChainFactory()
    practice = PracticeFactory(chain=chain)
    home = PracticeFactory(chain=chain)
    ca = ClinicianFactory(practice=home, role='chain_admin')
    lone_admin = ClinicianFactory(practice=practice, role='admin')
    resp = _client(ca.user).delete(_url(lone_admin.id))
    assert resp.status_code == 400


@pytest.mark.django_db
def test_cannot_remove_out_of_scope_user():
    admin = ClinicianFactory(role='admin')
    other = ClinicianFactory(role='clinician')
    resp = _client(admin.user).delete(_url(other.id))
    assert resp.status_code == 403


@pytest.mark.django_db
def test_removed_user_drops_off_clinician_list():
    practice = PracticeFactory()
    admin = ClinicianFactory(practice=practice, role='admin')
    clin = ClinicianFactory(practice=practice, role='clinician')
    _client(admin.user).delete(_url(clin.id))
    resp = _client(admin.user).get('/api/auth/practice/clinicians/')
    ids = [c['id'] for c in resp.data['results']]
    assert clin.id not in ids
