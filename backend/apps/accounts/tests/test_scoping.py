import pytest
from django.contrib.auth.models import User
from rest_framework.test import APIClient

from apps.accounts.scoping import accessible_practice_ids, resolve_practice_scope
from conftest import ChainFactory, ClinicianFactory, PracticeFactory, PatientFactory


# --- helper unit tests -------------------------------------------------------

@pytest.mark.django_db
def test_superuser_unrestricted():
    su = User.objects.create_superuser('su', 'su@x.com', 'pw')
    assert accessible_practice_ids(su) is None
    # a ?practice_id is honoured for superusers
    assert resolve_practice_scope(su, '7') == {7}


@pytest.mark.django_db
def test_practice_user_sees_only_own_practice():
    clin = ClinicianFactory(role='admin')
    assert accessible_practice_ids(clin.user) == {clin.practice_id}


@pytest.mark.django_db
def test_chain_admin_sees_all_practices_in_chain():
    chain = ChainFactory()
    home = PracticeFactory(chain=chain)
    sibling = PracticeFactory(chain=chain)
    other_chain = PracticeFactory(chain=ChainFactory())
    unchained = PracticeFactory()
    chain_admin = ClinicianFactory(practice=home, role='chain_admin')

    ids = accessible_practice_ids(chain_admin.user)
    assert ids == {home.id, sibling.id}
    assert other_chain.id not in ids and unchained.id not in ids


@pytest.mark.django_db
def test_chain_admin_without_chain_falls_back_to_own():
    chain_admin = ClinicianFactory(role='chain_admin')  # home practice has no chain
    assert accessible_practice_ids(chain_admin.user) == {chain_admin.practice_id}


@pytest.mark.django_db
def test_requested_practice_outside_scope_is_denied():
    chain = ChainFactory()
    home = PracticeFactory(chain=chain)
    outside = PracticeFactory()
    chain_admin = ClinicianFactory(practice=home, role='chain_admin')

    assert resolve_practice_scope(chain_admin.user, str(home.id)) == {home.id}
    assert resolve_practice_scope(chain_admin.user, str(outside.id)) == set()


# --- cross-tenant API isolation ---------------------------------------------

@pytest.mark.django_db
def test_chain_admin_patient_list_is_chain_scoped():
    chain = ChainFactory()
    home = PracticeFactory(chain=chain)
    sibling = PracticeFactory(chain=chain)
    foreign = PracticeFactory()  # different/no chain

    p_home = PatientFactory(practice=home)
    p_sibling = PatientFactory(practice=sibling)
    p_foreign = PatientFactory(practice=foreign)

    chain_admin = ClinicianFactory(practice=home, role='chain_admin')
    client = APIClient()
    client.force_authenticate(user=chain_admin.user)

    ids = {p['id'] for p in client.get('/api/patients/').data['results']}
    assert {p_home.id, p_sibling.id} <= ids
    assert p_foreign.id not in ids

    # ?practice_id within the chain is allowed...
    in_chain = client.get(f'/api/patients/?practice_id={sibling.id}')
    assert {p['id'] for p in in_chain.data['results']} == {p_sibling.id}
    # ...but a practice outside the chain returns nothing (not foreign patients).
    out = client.get(f'/api/patients/?practice_id={foreign.id}')
    assert out.data['results'] == []


@pytest.mark.django_db
def test_chain_admin_cannot_open_foreign_patient_detail():
    chain = ChainFactory()
    home = PracticeFactory(chain=chain)
    foreign_patient = PatientFactory(practice=PracticeFactory())
    chain_admin = ClinicianFactory(practice=home, role='chain_admin')
    client = APIClient()
    client.force_authenticate(user=chain_admin.user)

    assert client.get(f'/api/patients/{foreign_patient.id}/').status_code == 404
