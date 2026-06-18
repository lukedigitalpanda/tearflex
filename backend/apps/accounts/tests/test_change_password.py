import pytest
from rest_framework.test import APIClient

from conftest import ClinicianFactory

URL = '/api/auth/password/change/'


def _auth_client(user):
    c = APIClient()
    c.force_authenticate(user=user)
    return c


@pytest.mark.django_db
def test_change_password_with_correct_current():
    clin = ClinicianFactory(role='clinician')
    clin.user.set_password('oldpass123')
    clin.user.save()
    resp = _auth_client(clin.user).post(
        URL, {'current_password': 'oldpass123', 'new_password': 'newpass456'}, format='json')
    assert resp.status_code == 204, resp.data
    clin.user.refresh_from_db()
    assert clin.user.check_password('newpass456') is True
    assert clin.user.check_password('oldpass123') is False


@pytest.mark.django_db
def test_change_password_wrong_current_rejected():
    clin = ClinicianFactory(role='clinician')
    clin.user.set_password('oldpass123')
    clin.user.save()
    resp = _auth_client(clin.user).post(
        URL, {'current_password': 'WRONG', 'new_password': 'newpass456'}, format='json')
    assert resp.status_code == 400
    clin.user.refresh_from_db()
    assert clin.user.check_password('oldpass123') is True


@pytest.mark.django_db
def test_change_password_too_short_rejected():
    clin = ClinicianFactory(role='clinician')
    clin.user.set_password('oldpass123')
    clin.user.save()
    resp = _auth_client(clin.user).post(
        URL, {'current_password': 'oldpass123', 'new_password': 'short'}, format='json')
    assert resp.status_code == 400


@pytest.mark.django_db
def test_change_password_requires_auth():
    resp = APIClient().post(
        URL, {'current_password': 'x', 'new_password': 'newpass456'}, format='json')
    assert resp.status_code == 401
