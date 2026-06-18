import pytest
from django.contrib.auth.models import User

from apps.accounts.management import manageable_roles, can_manage, is_last_active_admin
from conftest import ChainFactory, PracticeFactory, ClinicianFactory


@pytest.mark.django_db
def test_manageable_roles_per_actor():
    su = User.objects.create_superuser('su', 'su@x.com', 'pw')
    assert manageable_roles(su) == {'chain_admin', 'admin', 'clinician', 'technician'}
    ca = ClinicianFactory(role='chain_admin')
    assert manageable_roles(ca.user) == {'admin', 'clinician', 'technician'}
    pa = ClinicianFactory(role='admin')
    assert manageable_roles(pa.user) == {'clinician', 'technician'}
    tech = ClinicianFactory(role='technician')
    assert manageable_roles(tech.user) == set()


@pytest.mark.django_db
def test_practice_admin_can_manage_own_lower_roles_only():
    chain = ChainFactory()
    practice = PracticeFactory(chain=chain)
    admin = ClinicianFactory(practice=practice, role='admin')
    clin = ClinicianFactory(practice=practice, role='clinician')
    other_admin = ClinicianFactory(practice=practice, role='admin')
    elsewhere = ClinicianFactory(role='clinician')  # different practice
    assert can_manage(admin.user, clin) is True
    assert can_manage(admin.user, other_admin) is False  # equal tier
    assert can_manage(admin.user, elsewhere) is False     # out of scope
    assert can_manage(admin.user, admin) is False          # self


@pytest.mark.django_db
def test_chain_admin_can_manage_lower_roles_across_chain_only():
    chain = ChainFactory()
    home = PracticeFactory(chain=chain)
    sibling = PracticeFactory(chain=chain)
    outside = PracticeFactory(chain=ChainFactory())
    ca = ClinicianFactory(practice=home, role='chain_admin')
    sib_admin = ClinicianFactory(practice=sibling, role='admin')
    sib_clin = ClinicianFactory(practice=sibling, role='clinician')
    outside_clin = ClinicianFactory(practice=outside, role='clinician')
    other_ca = ClinicianFactory(practice=sibling, role='chain_admin')
    assert can_manage(ca.user, sib_admin) is True
    assert can_manage(ca.user, sib_clin) is True
    assert can_manage(ca.user, outside_clin) is False
    assert can_manage(ca.user, other_ca) is False  # equal tier


@pytest.mark.django_db
def test_superuser_can_manage_anyone_but_not_self_is_irrelevant():
    su = User.objects.create_superuser('su', 'su@x.com', 'pw')
    ca = ClinicianFactory(role='chain_admin')
    assert can_manage(su, ca) is True


@pytest.mark.django_db
def test_is_last_active_admin():
    practice = PracticeFactory()
    a1 = ClinicianFactory(practice=practice, role='admin')
    clin = ClinicianFactory(practice=practice, role='clinician')
    assert is_last_active_admin(a1) is True
    assert is_last_active_admin(clin) is False
    a2 = ClinicianFactory(practice=practice, role='admin')
    assert is_last_active_admin(a1) is False  # another admin exists
    a2.user.is_active = False
    a2.user.save()
    assert is_last_active_admin(a1) is True  # the other admin is inactive
