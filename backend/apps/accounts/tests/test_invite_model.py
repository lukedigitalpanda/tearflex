import pytest

from apps.accounts.models import ClinicianInvite
from conftest import ClinicianFactory


@pytest.mark.django_db
def test_invite_generates_token_and_defaults_unaccepted():
    inviter = ClinicianFactory(role='admin')
    invite = ClinicianInvite.objects.create(
        practice=inviter.practice, email='new@example.com', invited_by=inviter
    )
    assert invite.token  # auto-populated, non-empty
    assert invite.accepted_at is None
