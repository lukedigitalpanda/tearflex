import pytest
from django.contrib.auth.models import User

from apps.accounts.models import Clinician, ClinicianInvite
from conftest import ClinicianFactory
from rest_framework.test import APIClient


@pytest.mark.django_db
def test_admin_can_invite_creates_inactive_clinician_and_token(api, clinician):
    payload = {'email': 'new@example.com', 'first_name': 'New', 'last_name': 'Person', 'role': 'clinician'}
    resp = api.post('/api/auth/practice/clinicians/invite/', payload, format='json')
    assert resp.status_code == 201
    assert resp.data['token']
    user = User.objects.get(email='new@example.com')
    assert user.is_active is False
    new_clin = Clinician.objects.get(user=user)
    assert new_clin.practice_id == clinician.practice_id
    assert ClinicianInvite.objects.filter(clinician=new_clin).exists()


@pytest.mark.django_db
def test_non_admin_cannot_invite():
    tech = ClinicianFactory(role='technician')
    client = APIClient()
    client.force_authenticate(user=tech.user)
    resp = client.post('/api/auth/practice/clinicians/invite/',
                       {'email': 'x@example.com', 'first_name': 'X', 'last_name': 'Y'}, format='json')
    assert resp.status_code == 403
