import factory
import pytest
from django.contrib.auth.models import User
from rest_framework.test import APIClient

from apps.accounts.models import Clinician, Practice
from apps.patients.models import Patient
from apps.assessments.models import Assessment


class PracticeFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = Practice

    name = factory.Sequence(lambda n: f'Practice {n}')
    address_line_1 = '1 Test Street'
    city = 'London'
    postcode = 'SW1A 1AA'


class UserFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = User

    username = factory.Sequence(lambda n: f'user{n}')
    first_name = 'Test'
    last_name = 'Clinician'
    email = factory.LazyAttribute(lambda o: f'{o.username}@example.com')


class ClinicianFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = Clinician

    user = factory.SubFactory(UserFactory)
    practice = factory.SubFactory(PracticeFactory)
    role = 'clinician'


class PatientFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = Patient

    practice = factory.SubFactory(PracticeFactory)
    first_name = factory.Sequence(lambda n: f'Patient{n}')
    last_name = factory.Sequence(lambda n: f'Doe{n}')
    date_of_birth = '1980-01-01'


class AssessmentFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = Assessment

    patient = factory.SubFactory(PatientFactory)
    clinician = factory.SubFactory(ClinicianFactory, practice=factory.SelfAttribute('..patient.practice'))
    eye = 'right'


@pytest.fixture
def practice(db):
    return PracticeFactory()


@pytest.fixture
def clinician(db, practice):
    return ClinicianFactory(practice=practice, role='admin')


@pytest.fixture
def api(clinician):
    """An APIClient authenticated as `clinician` (practice admin)."""
    client = APIClient()
    client.force_authenticate(user=clinician.user)
    return client


@pytest.fixture(autouse=True)
def _isolate_media(tmp_path, settings):
    """Point file storage at a per-test temp dir so tests never read or write
    the real media volume (e.g. when run inside the backend container)."""
    settings.MEDIA_ROOT = str(tmp_path / 'media')
