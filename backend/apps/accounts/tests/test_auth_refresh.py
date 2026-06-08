import pytest
from rest_framework.test import APIClient

from conftest import UserFactory


@pytest.mark.django_db
def test_refresh_rotates_and_returns_new_pair():
    user = UserFactory()
    user.set_password('pw12345!')
    user.save()
    client = APIClient()
    login = client.post('/api/auth/login/', {'username': user.username, 'password': 'pw12345!'}, format='json')
    assert login.status_code == 200
    refresh = login.data['refresh']

    resp = client.post('/api/auth/refresh/', {'refresh': refresh}, format='json')
    assert resp.status_code == 200
    assert 'access' in resp.data
    # Rotation is on, so a new refresh token is returned
    assert 'refresh' in resp.data
