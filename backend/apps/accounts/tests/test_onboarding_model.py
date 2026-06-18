import pytest
from apps.accounts.models import OnboardingRegistration


@pytest.mark.django_db
def test_registration_defaults_and_token():
    reg = OnboardingRegistration.objects.create(
        registration_type='practice',
        contact_first_name='A', contact_last_name='B', contact_email='a@x.com',
        password='hashed', practice_name='P', address_line_1='1 St',
        city='Leeds', postcode='LS1 1AA',
    )
    assert reg.status == 'pending_verification'
    assert reg.email_token  # auto-generated
    assert reg.email_verified_at is None
