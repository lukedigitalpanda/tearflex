import pytest
from rest_framework.test import APIClient

from apps.accounts.models import PasswordResetToken
from conftest import ChainFactory, PracticeFactory, ClinicianFactory


def _client(user):
    c = APIClient()
    c.force_authenticate(user=user)
    return c


def _url(pk):
    return f'/api/auth/clinicians/{pk}/reset-password/'


@pytest.mark.django_db
def test_chain_admin_resets_clinician_in_chain():
    chain = ChainFactory()
    home = PracticeFactory(chain=chain)
    sibling = PracticeFactory(chain=chain)
    ca = ClinicianFactory(practice=home, role='chain_admin')
    clin = ClinicianFactory(practice=sibling, role='clinician')
    resp = _client(ca.user).post(_url(clin.id), {}, format='json')
    assert resp.status_code == 201, resp.data
    assert resp.data['reset_url'] == f"/reset-password?token={resp.data['token']}"
    token = PasswordResetToken.objects.get(token=resp.data['token'])
    assert token.user_id == clin.user_id and token.is_valid()


@pytest.mark.django_db
def test_practice_admin_resets_own_clinician():
    practice = PracticeFactory()
    admin = ClinicianFactory(practice=practice, role='admin')
    clin = ClinicianFactory(practice=practice, role='clinician')
    resp = _client(admin.user).post(_url(clin.id), {}, format='json')
    assert resp.status_code == 201


@pytest.mark.django_db
def test_practice_admin_cannot_reset_peer_admin():
    practice = PracticeFactory()
    admin = ClinicianFactory(practice=practice, role='admin')
    peer = ClinicianFactory(practice=practice, role='admin')
    resp = _client(admin.user).post(_url(peer.id), {}, format='json')
    assert resp.status_code == 403


@pytest.mark.django_db
def test_cannot_reset_out_of_scope_user():
    admin = ClinicianFactory(role='admin')
    other = ClinicianFactory(role='clinician')
    resp = _client(admin.user).post(_url(other.id), {}, format='json')
    assert resp.status_code == 403


@pytest.mark.django_db
def test_cannot_reset_self_via_admin_endpoint():
    admin = ClinicianFactory(role='admin')
    resp = _client(admin.user).post(_url(admin.id), {}, format='json')
    assert resp.status_code == 403


@pytest.mark.django_db
def test_minting_link_does_not_change_current_password():
    practice = PracticeFactory()
    admin = ClinicianFactory(practice=practice, role='admin')
    clin = ClinicianFactory(practice=practice, role='clinician')
    clin.user.set_password('original123')
    clin.user.save()
    _client(admin.user).post(_url(clin.id), {}, format='json')
    clin.user.refresh_from_db()
    assert clin.user.check_password('original123') is True
