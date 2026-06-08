import pytest

from apps.accounts.permissions import IsPracticeAdmin
from conftest import ClinicianFactory


class _Req:
    def __init__(self, user):
        self.user = user


@pytest.mark.django_db
def test_admin_allowed_non_admin_denied():
    admin = ClinicianFactory(role='admin')
    tech = ClinicianFactory(role='technician')
    perm = IsPracticeAdmin()
    assert perm.has_permission(_Req(admin.user), None) is True
    assert perm.has_permission(_Req(tech.user), None) is False
