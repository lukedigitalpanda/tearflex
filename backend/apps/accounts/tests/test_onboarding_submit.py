import pytest
from rest_framework.test import APIClient
from django.contrib.auth.models import User

from apps.accounts.models import OnboardingRegistration

URL = '/api/auth/onboarding/'


def _practice_payload(**over):
    data = {
        'registration_type': 'practice',
        'contact_first_name': 'Jo', 'contact_last_name': 'Bloggs',
        'contact_email': 'jo@my-clinic.co.uk', 'password': 'secret123',
        'practice_name': 'My Clinic', 'address_line_1': '1 High St',
        'city': 'Leeds', 'postcode': 'LS1 1AA',
    }
    data.update(over)
    return data


@pytest.mark.django_db
def test_submit_practice_creates_pending_registration():
    resp = APIClient().post(URL, _practice_payload(), format='json')
    assert resp.status_code == 201, resp.data
    reg = OnboardingRegistration.objects.get(contact_email='jo@my-clinic.co.uk')
    assert reg.status == 'pending_verification'
    assert reg.registration_type == 'practice'
    # password stored hashed, not plaintext
    assert reg.password != 'secret123' and reg.password
    # nothing real created yet
    assert User.objects.filter(email='jo@my-clinic.co.uk').count() == 0


@pytest.mark.django_db
def test_chain_requires_chain_name():
    resp = APIClient().post(URL, _practice_payload(registration_type='chain'), format='json')
    assert resp.status_code == 400
    resp2 = APIClient().post(
        URL, _practice_payload(registration_type='chain', chain_name='Specsavers',
                               contact_email='jo2@my-clinic.co.uk'), format='json')
    assert resp2.status_code == 201


@pytest.mark.django_db
def test_existing_active_user_email_is_generic_success_no_registration():
    User.objects.create_user('existing', email='taken@my-clinic.co.uk', password='x', is_active=True)
    resp = APIClient().post(URL, _practice_payload(contact_email='taken@my-clinic.co.uk'), format='json')
    assert resp.status_code == 201  # no leak
    assert OnboardingRegistration.objects.filter(contact_email='taken@my-clinic.co.uk').count() == 0


@pytest.mark.django_db
def test_existing_inactive_user_email_is_generic_success_no_registration():
    """An INACTIVE user (e.g. a pending invite) must also block a new registration."""
    User.objects.create_user('u', email='taken@my-clinic.co.uk', password='x', is_active=False)
    resp = APIClient().post(URL, _practice_payload(contact_email='taken@my-clinic.co.uk'), format='json')
    assert resp.status_code == 201  # generic success, no leak
    assert OnboardingRegistration.objects.filter(contact_email='taken@my-clinic.co.uk').count() == 0
