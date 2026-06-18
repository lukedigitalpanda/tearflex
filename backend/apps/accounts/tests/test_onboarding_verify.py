import pytest
from rest_framework.test import APIClient
from django.contrib.auth.models import User
from django.contrib.auth.hashers import make_password

from apps.accounts.models import OnboardingRegistration, Practice, Clinician, Chain

URL = '/api/auth/onboarding/verify/'


def _reg(**over):
    data = dict(
        registration_type='practice', contact_first_name='Jo', contact_last_name='B',
        contact_email='jo@my-clinic.co.uk', password=make_password('secret123'),
        practice_name='My Clinic', address_line_1='1 St', city='Leeds', postcode='LS1 1AA',
    )
    data.update(over)
    return OnboardingRegistration.objects.create(**data)


@pytest.mark.django_db
def test_verify_professional_email_provisions_practice_admin():
    reg = _reg()
    resp = APIClient().post(URL, {'token': reg.email_token}, format='json')
    assert resp.status_code == 200, resp.data
    assert resp.data['status'] == 'provisioned'
    assert 'access' not in resp.data and 'refresh' not in resp.data  # no auto-login
    user = User.objects.get(email='jo@my-clinic.co.uk')
    assert user.is_active and user.check_password('secret123')
    clin = Clinician.objects.get(user=user)
    assert clin.role == 'admin' and clin.practice.name == 'My Clinic'
    assert clin.practice.chain is None
    reg.refresh_from_db()
    assert reg.status == 'provisioned'


@pytest.mark.django_db
def test_verify_chain_provisions_chain_admin():
    reg = _reg(registration_type='chain', chain_name='Specsavers',
               contact_email='boss@brand-clinics.com')
    resp = APIClient().post(URL, {'token': reg.email_token}, format='json')
    assert resp.status_code == 200 and resp.data['status'] == 'provisioned'
    clin = Clinician.objects.get(user__email='boss@brand-clinics.com')
    assert clin.role == 'chain_admin'
    assert clin.practice.chain is not None and clin.practice.chain.name == 'Specsavers'


@pytest.mark.django_db
def test_verify_free_email_awaits_approval_creates_nothing():
    reg = _reg(contact_email='someone@gmail.com')
    resp = APIClient().post(URL, {'token': reg.email_token}, format='json')
    assert resp.status_code == 200 and resp.data['status'] == 'awaiting_approval'
    assert User.objects.filter(email='someone@gmail.com').count() == 0
    assert Practice.objects.filter(name='My Clinic').count() == 0
    reg.refresh_from_db()
    assert reg.status == 'awaiting_approval' and reg.email_verified_at is not None


@pytest.mark.django_db
def test_invalid_token_400():
    resp = APIClient().post(URL, {'token': 'nope'}, format='json')
    assert resp.status_code == 400


@pytest.mark.django_db
def test_already_provisioned_token_400_no_double_provision():
    reg = _reg()
    APIClient().post(URL, {'token': reg.email_token}, format='json')
    resp = APIClient().post(URL, {'token': reg.email_token}, format='json')
    assert resp.status_code == 400
    assert User.objects.filter(email='jo@my-clinic.co.uk').count() == 1


@pytest.mark.django_db
def test_verify_blocked_when_inactive_user_has_same_email():
    """provision_registration must refuse (400, not 500) when an INACTIVE user
    already holds the registration email — e.g. a pending clinician invite."""
    reg = _reg(contact_email='jo@my-clinic.co.uk')
    # Simulate an existing inactive user (e.g. a pending invite) with the same email.
    inactive = User.objects.create_user(
        'existing_invite', email='jo@my-clinic.co.uk', password='x', is_active=False
    )
    resp = APIClient().post(URL, {'token': reg.email_token}, format='json')
    assert resp.status_code == 400  # provision refused, not a 500
    # No new active user or practice should have been created.
    assert User.objects.filter(email='jo@my-clinic.co.uk', is_active=True).count() == 0
    assert Practice.objects.filter(name='My Clinic').count() == 0
    # The pre-existing inactive user remains untouched.
    inactive.refresh_from_db()
    assert not inactive.is_active
