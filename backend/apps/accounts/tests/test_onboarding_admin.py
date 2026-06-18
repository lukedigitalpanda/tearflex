import pytest
from django.contrib.admin.sites import AdminSite
from django.contrib.auth.models import User
from django.contrib.auth.hashers import make_password
from django.test import RequestFactory

from apps.accounts.admin import OnboardingRegistrationAdmin
from apps.accounts.models import OnboardingRegistration, Clinician


def _su_request():
    req = RequestFactory().post('/admin/')
    req.user = User.objects.create_superuser('su', 'su@x.com', 'pw')
    # message framework needs storage on the request
    from django.contrib.messages.storage.fallback import FallbackStorage
    setattr(req, 'session', {})
    setattr(req, '_messages', FallbackStorage(req))
    return req


def _awaiting_reg():
    return OnboardingRegistration.objects.create(
        registration_type='practice', contact_first_name='Jo', contact_last_name='B',
        contact_email='someone@gmail.com', password=make_password('secret123'),
        practice_name='My Clinic', address_line_1='1 St', city='Leeds', postcode='LS1 1AA',
        status='awaiting_approval',
    )


@pytest.mark.django_db
def test_approve_action_provisions():
    reg = _awaiting_reg()
    admin = OnboardingRegistrationAdmin(OnboardingRegistration, AdminSite())
    admin.approve(_su_request(), OnboardingRegistration.objects.filter(pk=reg.pk))
    reg.refresh_from_db()
    assert reg.status == 'provisioned'
    assert Clinician.objects.filter(user__email='someone@gmail.com').exists()


@pytest.mark.django_db
def test_reject_action_sets_status():
    reg = _awaiting_reg()
    admin = OnboardingRegistrationAdmin(OnboardingRegistration, AdminSite())
    admin.reject(_su_request(), OnboardingRegistration.objects.filter(pk=reg.pk))
    reg.refresh_from_db()
    assert reg.status == 'rejected'
    assert not User.objects.filter(email='someone@gmail.com').exists()
