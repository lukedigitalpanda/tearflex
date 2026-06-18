"""Shared provisioning for self-onboarding — used by both the auto-provision
(professional email) path and the superadmin-approval path."""
from django.contrib.auth.models import User
from django.db import transaction
from django.utils import timezone

from .models import Chain, Clinician, Practice


class OnboardingError(Exception):
    pass


@transaction.atomic
def provision_registration(registration, decided_by=None):
    """Materialise the Chain/Practice/User/Clinician for a verified registration."""
    if registration.status == 'provisioned':
        raise OnboardingError('This registration has already been provisioned.')
    if User.objects.filter(email__iexact=registration.contact_email).exists():
        raise OnboardingError('An account already exists for this email.')

    chain = None
    if registration.registration_type == 'chain':
        chain = Chain.objects.create(name=registration.chain_name)

    practice = Practice.objects.create(
        name=registration.practice_name,
        address_line_1=registration.address_line_1,
        address_line_2=registration.address_line_2,
        city=registration.city,
        postcode=registration.postcode,
        phone=registration.phone,
        email=registration.practice_email,
        chain=chain,
    )

    base_username = registration.contact_email.split('@')[0]
    username = base_username
    i = 1
    while User.objects.filter(username=username).exists():
        username = f'{base_username}{i}'
        i += 1
    user = User(
        username=username, email=registration.contact_email,
        first_name=registration.contact_first_name,
        last_name=registration.contact_last_name, is_active=True,
    )
    user.password = registration.password  # already a make_password hash
    user.save()

    clinician = Clinician.objects.create(
        user=user, practice=practice,
        role='chain_admin' if chain else 'admin',
        title=registration.contact_title,
        professional_registration=registration.professional_registration,
    )

    registration.status = 'provisioned'
    registration.provisioned_practice = practice
    registration.provisioned_clinician = clinician
    registration.decided_by = decided_by
    registration.decided_at = timezone.now()
    registration.save()
    return clinician
