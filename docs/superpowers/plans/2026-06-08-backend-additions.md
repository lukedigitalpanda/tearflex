# Backend Additions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the two backend features the web client depends on — a `reports` app (assessment → PDF via WeasyPrint, with generate/download/list endpoints) and an admin-gated clinician-invite endpoint — plus the JWT/refresh fix the cookie-based web auth needs.

**Architecture:** Follow the existing `apps/*` Django layout (model → serializer → view → url, practice-scoped via queryset filtering). Reports render an HTML template to PDF synchronously through an isolated `generators.py` so the native WeasyPrint dependency stays off every other code path. Invites create an inactive `User`+`Clinician` and a single-use `ClinicianInvite` token. Tests use pytest-django + factory-boy against the Dockerised Postgres.

**Tech Stack:** Django 5.1, DRF, djangorestframework-simplejwt, WeasyPrint, pytest-django, factory-boy.

---

## Prerequisites

- Infrastructure up: from `backend/`, `docker-compose up -d` (Postgres + Redis).
- Virtualenv active with `pip install -r requirements/dev.txt` already run.
- All commands below run from the `backend/` directory unless stated otherwise.
- `DJANGO_SETTINGS_MODULE` resolves to `tearflex.settings` (via `settings/__init__.py`).

---

## File Structure

| File | Responsibility |
|---|---|
| `backend/pytest.ini` | pytest-django config (settings module, test discovery) |
| `backend/conftest.py` | Shared factories + an authenticated API client fixture |
| `backend/apps/reports/models.py` | `Report` model |
| `backend/apps/reports/serializers.py` | `ReportSerializer`, `GenerateReportSerializer` |
| `backend/apps/reports/generators.py` | `generate_assessment_report()` — HTML→PDF |
| `backend/apps/reports/templates/reports/assessment_report.html` | PDF template |
| `backend/apps/reports/views.py` | generate / download / list views (practice-scoped) |
| `backend/apps/reports/urls.py` | report routes |
| `backend/apps/reports/admin.py` | `Report` admin |
| `backend/apps/reports/tests/` | report tests |
| `backend/apps/accounts/models.py` | add `ClinicianInvite` model |
| `backend/apps/accounts/permissions.py` | `IsPracticeAdmin` |
| `backend/apps/accounts/serializers.py` | add `ClinicianInviteSerializer` |
| `backend/apps/accounts/views.py` | add `ClinicianInviteView` |
| `backend/apps/accounts/urls.py` | add invite route |
| `backend/apps/accounts/tests/` | invite tests |
| `backend/tearflex/settings/base.py` | add `token_blacklist` app + JWT note |
| `backend/requirements/base.txt` | add `weasyprint` |

---

## Task 1: Test infrastructure (pytest + factories)

**Files:**
- Create: `backend/pytest.ini`
- Create: `backend/conftest.py`

- [ ] **Step 1: Create `backend/pytest.ini`**

```ini
[pytest]
DJANGO_SETTINGS_MODULE = tearflex.settings
python_files = tests.py test_*.py *_tests.py
addopts = -ra
```

- [ ] **Step 2: Create `backend/conftest.py` with factories and an auth fixture**

```python
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
    first_name = 'Jane'
    last_name = factory.Sequence(lambda n: f'Doe{n}')
    date_of_birth = '1980-01-01'


class AssessmentFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = Assessment

    patient = factory.SubFactory(PatientFactory)
    clinician = factory.SubFactory(ClinicianFactory)
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
```

- [ ] **Step 3: Verify the harness collects with no tests yet**

Run: `pytest --collect-only -q`
Expected: exits 0, "no tests ran" (collection succeeds, factories import cleanly).

- [ ] **Step 4: Commit**

```bash
git add backend/pytest.ini backend/conftest.py
git commit -m "test: add pytest-django config and shared factories"
```

---

## Task 2: Fix JWT refresh (token blacklist app)

`ROTATE_REFRESH_TOKENS=True` + `BLACKLIST_AFTER_ROTATION=True` require the blacklist app, or `/api/auth/refresh/` raises. Install it.

**Files:**
- Modify: `backend/tearflex/settings/base.py` (INSTALLED_APPS)
- Test: `backend/apps/accounts/tests/test_auth_refresh.py`

- [ ] **Step 1: Write the failing test**

Create `backend/apps/accounts/tests/__init__.py` (empty) and `backend/apps/accounts/tests/test_auth_refresh.py`:

```python
import pytest
from rest_framework.test import APIClient

from conftest import UserFactory


@pytest.mark.django_db
def test_refresh_rotates_and_returns_new_pair():
    user = UserFactory()
    user.set_password('pw12345!')
    user.save()
    client = APIClient()
    login = client.post('/api/auth/login/', {'username': user.username, 'password': 'pw12345!'}, format='json')
    assert login.status_code == 200
    refresh = login.data['refresh']

    resp = client.post('/api/auth/refresh/', {'refresh': refresh}, format='json')
    assert resp.status_code == 200
    assert 'access' in resp.data
    # Rotation is on, so a new refresh token is returned
    assert 'refresh' in resp.data
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `pytest apps/accounts/tests/test_auth_refresh.py -v`
Expected: FAIL — refresh errors because `token_blacklist` isn't installed (or no `refresh` returned).

- [ ] **Step 3: Add the blacklist app**

In `backend/tearflex/settings/base.py`, add to `INSTALLED_APPS` under the third-party block:

```python
    'rest_framework_simplejwt',
    'rest_framework_simplejwt.token_blacklist',
```

- [ ] **Step 4: Make the migration apply (create the blacklist tables)**

Run: `python manage.py migrate`
Expected: applies `token_blacklist` migrations.

- [ ] **Step 5: Run the test to confirm it passes**

Run: `pytest apps/accounts/tests/test_auth_refresh.py -v`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/tearflex/settings/base.py backend/apps/accounts/tests/
git commit -m "fix: install simplejwt token_blacklist for refresh rotation"
```

---

## Task 3: Report model

**Files:**
- Create: `backend/apps/reports/models.py`
- Test: `backend/apps/reports/tests/test_models.py`

- [ ] **Step 1: Write the failing test**

Create `backend/apps/reports/tests/__init__.py` (empty) and `backend/apps/reports/tests/test_models.py`:

```python
import pytest

from apps.reports.models import Report
from conftest import AssessmentFactory, ClinicianFactory


@pytest.mark.django_db
def test_report_defaults_to_pending():
    assessment = AssessmentFactory()
    report = Report.objects.create(assessment=assessment, generated_by=assessment.clinician)
    assert report.status == 'pending'
    assert report.created_at is not None
    assert str(report).startswith('Report')
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `pytest apps/reports/tests/test_models.py -v`
Expected: FAIL — `Report` does not exist.

- [ ] **Step 3: Implement the model**

Create `backend/apps/reports/models.py`:

```python
from django.db import models


class Report(models.Model):
    """A generated PDF report for an assessment."""
    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('ready', 'Ready'),
        ('failed', 'Failed'),
    ]

    assessment = models.ForeignKey(
        'assessments.Assessment', on_delete=models.CASCADE, related_name='reports'
    )
    generated_by = models.ForeignKey(
        'accounts.Clinician', on_delete=models.SET_NULL, null=True, blank=True
    )
    pdf_file = models.FileField(upload_to='reports/%Y/%m/%d/', blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f'Report #{self.pk} for assessment {self.assessment_id}'
```

- [ ] **Step 4: Create and apply the migration**

Run: `python manage.py makemigrations reports && python manage.py migrate`
Expected: creates `reports/migrations/0001_initial.py`, applies cleanly.

- [ ] **Step 5: Run the test to confirm it passes**

Run: `pytest apps/reports/tests/test_models.py -v`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/apps/reports/models.py backend/apps/reports/migrations/ backend/apps/reports/tests/
git commit -m "feat: add Report model"
```

---

## Task 4: PDF generator + template

`generators.py` imports WeasyPrint lazily inside the function so a missing native lib only breaks report generation, not module import.

**Files:**
- Create: `backend/apps/reports/generators.py`
- Create: `backend/apps/reports/templates/reports/assessment_report.html`
- Modify: `backend/requirements/base.txt`
- Test: `backend/apps/reports/tests/test_generators.py`

- [ ] **Step 1: Add the dependency**

Append to `backend/requirements/base.txt`:

```text
weasyprint>=62,<63
```

Then run: `pip install -r requirements/dev.txt`
Expected: WeasyPrint installs (inside the Docker/Linux image if native libs are missing locally — see plan note).

- [ ] **Step 2: Write the failing test**

Create `backend/apps/reports/tests/test_generators.py`:

```python
import pytest

from apps.reports.generators import generate_assessment_report
from apps.reports.models import Report
from conftest import AssessmentFactory


@pytest.mark.django_db
def test_generate_produces_ready_report_with_pdf():
    assessment = AssessmentFactory()
    report = generate_assessment_report(assessment)
    assert isinstance(report, Report)
    assert report.status == 'ready'
    assert report.pdf_file.name.endswith('.pdf')
    report.pdf_file.open('rb')
    head = report.pdf_file.read(5)
    report.pdf_file.close()
    assert head == b'%PDF-'
```

- [ ] **Step 3: Run it to confirm it fails**

Run: `pytest apps/reports/tests/test_generators.py -v`
Expected: FAIL — `generators` module / function missing.

- [ ] **Step 4: Create the template**

Create `backend/apps/reports/templates/reports/assessment_report.html`:

```html
<!DOCTYPE html>
<html lang="en-gb">
<head>
  <meta charset="utf-8" />
  <style>
    @page { size: A4; margin: 2cm; }
    body { font-family: sans-serif; color: #0F172A; font-size: 12px; }
    h1 { color: #0E7C7B; font-size: 22px; margin-bottom: 0; }
    .practice { color: #475569; margin-bottom: 24px; }
    .section { margin-bottom: 20px; }
    .label { color: #475569; font-size: 10px; text-transform: uppercase; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; }
    th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid #CBD5E1; }
    .severity { font-weight: 600; }
    .normal { color: #16a34a; } .mild { color: #d97706; }
    .moderate { color: #ea580c; } .severe { color: #dc2626; }
  </style>
</head>
<body>
  <h1>Tear Film Assessment Report</h1>
  <div class="practice">{{ practice.name }} — {{ practice.city }}</div>

  <div class="section">
    <div class="label">Patient</div>
    <div>{{ patient.full_name }} · DOB {{ patient.date_of_birth }}</div>
    <div class="label" style="margin-top:8px;">Assessment</div>
    <div>{{ assessment.get_eye_display }} eye · {{ assessment.assessed_at|date:"d/m/Y H:i" }}</div>
  </div>

  <div class="section">
    <div class="label">Results</div>
    <table>
      <thead>
        <tr><th>Test</th><th>NIBUT (first)</th><th>NIBUT (mean)</th><th>Severity</th></tr>
      </thead>
      <tbody>
        {% for capture in captures %}
        <tr>
          <td>{{ capture.get_test_type_display }}</td>
          <td>{{ capture.result.nibut_first_breakup_seconds|default:"—" }}</td>
          <td>{{ capture.result.nibut_mean_breakup_seconds|default:"—" }}</td>
          <td class="severity {{ capture.result.dry_eye_severity }}">
            {{ capture.result.get_dry_eye_severity_display|default:"Not assessed" }}
          </td>
        </tr>
        {% empty %}
        <tr><td colspan="4">No captures recorded.</td></tr>
        {% endfor %}
      </tbody>
    </table>
  </div>
</body>
</html>
```

- [ ] **Step 5: Implement the generator**

Create `backend/apps/reports/generators.py`:

```python
from django.core.files.base import ContentFile
from django.template.loader import render_to_string

from .models import Report


def generate_assessment_report(assessment) -> Report:
    """Render an assessment to a PDF and persist it as a ready Report."""
    report = Report.objects.create(
        assessment=assessment,
        generated_by=assessment.clinician,
    )
    captures = list(assessment.captures.select_related('result').all())
    html = render_to_string(
        'reports/assessment_report.html',
        {
            'assessment': assessment,
            'patient': assessment.patient,
            'practice': assessment.patient.practice,
            'captures': captures,
        },
    )
    try:
        from weasyprint import HTML  # imported lazily; native deps isolated here

        pdf_bytes = HTML(string=html).write_pdf()
        report.pdf_file.save(f'assessment_{assessment.id}_report_{report.id}.pdf',
                             ContentFile(pdf_bytes), save=False)
        report.status = 'ready'
    except Exception:
        report.status = 'failed'
    report.save()
    return report
```

- [ ] **Step 6: Run the test to confirm it passes**

Run: `pytest apps/reports/tests/test_generators.py -v`
Expected: PASS (produces a `%PDF-` file, status `ready`).

- [ ] **Step 7: Commit**

```bash
git add backend/apps/reports/generators.py backend/apps/reports/templates/ backend/requirements/base.txt backend/apps/reports/tests/test_generators.py
git commit -m "feat: render assessment reports to PDF via WeasyPrint"
```

---

## Task 5: Report serializers

**Files:**
- Create: `backend/apps/reports/serializers.py`
- Test: `backend/apps/reports/tests/test_serializers.py`

- [ ] **Step 1: Write the failing test**

Create `backend/apps/reports/tests/test_serializers.py`:

```python
import pytest

from apps.reports.serializers import ReportSerializer
from apps.reports.generators import generate_assessment_report
from conftest import AssessmentFactory


@pytest.mark.django_db
def test_report_serializer_exposes_expected_fields():
    report = generate_assessment_report(AssessmentFactory())
    data = ReportSerializer(report).data
    assert set(data) >= {'id', 'assessment', 'status', 'created_at', 'pdf_file'}
    assert data['status'] == 'ready'
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `pytest apps/reports/tests/test_serializers.py -v`
Expected: FAIL — serializers module missing.

- [ ] **Step 3: Implement the serializers**

Create `backend/apps/reports/serializers.py`:

```python
from rest_framework import serializers

from .models import Report


class ReportSerializer(serializers.ModelSerializer):
    class Meta:
        model = Report
        fields = ['id', 'assessment', 'generated_by', 'pdf_file', 'status', 'created_at']
        read_only_fields = ['id', 'generated_by', 'pdf_file', 'status', 'created_at']


class GenerateReportSerializer(serializers.Serializer):
    """Input for POST /api/reports/generate/."""
    assessment = serializers.IntegerField()
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `pytest apps/reports/tests/test_serializers.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/apps/reports/serializers.py backend/apps/reports/tests/test_serializers.py
git commit -m "feat: add report serializers"
```

---

## Task 6: Report views + URLs (practice-scoped)

**Files:**
- Create: `backend/apps/reports/views.py`
- Modify: `backend/apps/reports/urls.py`
- Test: `backend/apps/reports/tests/test_views.py`

- [ ] **Step 1: Write the failing test**

Create `backend/apps/reports/tests/test_views.py`:

```python
import pytest

from conftest import AssessmentFactory, PatientFactory


@pytest.mark.django_db
def test_generate_then_list_and_download(api, clinician):
    assessment = AssessmentFactory(patient=PatientFactory(practice=clinician.practice))

    gen = api.post('/api/reports/generate/', {'assessment': assessment.id}, format='json')
    assert gen.status_code == 201
    report_id = gen.data['id']
    assert gen.data['status'] == 'ready'

    lst = api.get('/api/reports/')
    assert lst.status_code == 200
    assert any(r['id'] == report_id for r in lst.data['results'])

    dl = api.get(f'/api/reports/{report_id}/download/')
    assert dl.status_code == 200
    assert dl['Content-Type'] == 'application/pdf'


@pytest.mark.django_db
def test_cannot_generate_for_other_practice(api):
    other = AssessmentFactory()  # different practice
    resp = api.post('/api/reports/generate/', {'assessment': other.id}, format='json')
    assert resp.status_code == 404
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `pytest apps/reports/tests/test_views.py -v`
Expected: FAIL — views/urls not implemented.

- [ ] **Step 3: Implement the views**

Create `backend/apps/reports/views.py`:

```python
from django.http import FileResponse
from rest_framework import generics, status
from rest_framework.response import Response

from apps.assessments.models import Assessment
from .generators import generate_assessment_report
from .models import Report
from .serializers import GenerateReportSerializer, ReportSerializer


class PracticeScopedReportMixin:
    def get_queryset(self):
        practice = self.request.user.clinician.practice
        return Report.objects.filter(assessment__patient__practice=practice)


class ReportListView(PracticeScopedReportMixin, generics.ListAPIView):
    serializer_class = ReportSerializer


class GenerateReportView(generics.GenericAPIView):
    serializer_class = GenerateReportSerializer

    def post(self, request):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        practice = request.user.clinician.practice
        try:
            assessment = Assessment.objects.get(
                pk=serializer.validated_data['assessment'],
                patient__practice=practice,
            )
        except Assessment.DoesNotExist:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        report = generate_assessment_report(assessment)
        return Response(ReportSerializer(report).data, status=status.HTTP_201_CREATED)


class DownloadReportView(PracticeScopedReportMixin, generics.GenericAPIView):
    serializer_class = ReportSerializer

    def get(self, request, pk):
        report = self.get_queryset().filter(pk=pk).first()
        if report is None or not report.pdf_file:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        return FileResponse(
            report.pdf_file.open('rb'),
            content_type='application/pdf',
            as_attachment=True,
            filename=f'tearflex_report_{report.id}.pdf',
        )
```

- [ ] **Step 4: Wire the URLs**

Replace `backend/apps/reports/urls.py` with:

```python
from django.urls import path

from . import views

urlpatterns = [
    path('', views.ReportListView.as_view(), name='report-list'),
    path('generate/', views.GenerateReportView.as_view(), name='report-generate'),
    path('<int:pk>/download/', views.DownloadReportView.as_view(), name='report-download'),
]
```

- [ ] **Step 5: Run the test to confirm it passes**

Run: `pytest apps/reports/tests/test_views.py -v`
Expected: PASS (both tests).

- [ ] **Step 6: Commit**

```bash
git add backend/apps/reports/views.py backend/apps/reports/urls.py backend/apps/reports/tests/test_views.py
git commit -m "feat: add report generate/list/download endpoints"
```

---

## Task 7: Report admin

**Files:**
- Modify: `backend/apps/reports/admin.py`

- [ ] **Step 1: Implement the admin (no test — Django admin registration)**

Replace `backend/apps/reports/admin.py` with:

```python
from django.contrib import admin

from .models import Report


@admin.register(Report)
class ReportAdmin(admin.ModelAdmin):
    list_display = ['id', 'assessment', 'status', 'created_at']
    list_filter = ['status']
    readonly_fields = ['created_at']
```

- [ ] **Step 2: Verify the app check passes**

Run: `python manage.py check`
Expected: "System check identified no issues".

- [ ] **Step 3: Commit**

```bash
git add backend/apps/reports/admin.py
git commit -m "feat: register Report in admin"
```

---

## Task 8: ClinicianInvite model

**Files:**
- Modify: `backend/apps/accounts/models.py`
- Test: `backend/apps/accounts/tests/test_invite_model.py`

- [ ] **Step 1: Write the failing test**

Create `backend/apps/accounts/tests/test_invite_model.py`:

```python
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
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `pytest apps/accounts/tests/test_invite_model.py -v`
Expected: FAIL — `ClinicianInvite` does not exist.

- [ ] **Step 3: Implement the model**

Append to `backend/apps/accounts/models.py`:

```python
import secrets


class ClinicianInvite(models.Model):
    """A single-use invite for a new clinician to join a practice."""
    practice = models.ForeignKey(Practice, on_delete=models.CASCADE, related_name='invites')
    email = models.EmailField()
    role = models.CharField(max_length=20, choices=Clinician.ROLE_CHOICES, default='clinician')
    token = models.CharField(max_length=64, unique=True, blank=True)
    invited_by = models.ForeignKey(Clinician, on_delete=models.SET_NULL, null=True, blank=True)
    clinician = models.OneToOneField(
        Clinician, on_delete=models.SET_NULL, null=True, blank=True, related_name='invite'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    accepted_at = models.DateTimeField(null=True, blank=True)

    def save(self, *args, **kwargs):
        if not self.token:
            self.token = secrets.token_urlsafe(32)
        super().save(*args, **kwargs)

    def __str__(self):
        return f'Invite for {self.email} → {self.practice.name}'
```

- [ ] **Step 4: Create and apply the migration**

Run: `python manage.py makemigrations accounts && python manage.py migrate`
Expected: creates an accounts migration, applies cleanly.

- [ ] **Step 5: Run the test to confirm it passes**

Run: `pytest apps/accounts/tests/test_invite_model.py -v`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/apps/accounts/models.py backend/apps/accounts/migrations/ backend/apps/accounts/tests/test_invite_model.py
git commit -m "feat: add ClinicianInvite model"
```

---

## Task 9: Admin-only permission

**Files:**
- Create: `backend/apps/accounts/permissions.py`
- Test: `backend/apps/accounts/tests/test_permissions.py`

- [ ] **Step 1: Write the failing test**

Create `backend/apps/accounts/tests/test_permissions.py`:

```python
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
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `pytest apps/accounts/tests/test_permissions.py -v`
Expected: FAIL — permissions module missing.

- [ ] **Step 3: Implement the permission**

Create `backend/apps/accounts/permissions.py`:

```python
from rest_framework import permissions


class IsPracticeAdmin(permissions.BasePermission):
    """Allow only authenticated clinicians with the practice-admin role."""
    message = 'Practice admin role required.'

    def has_permission(self, request, view):
        clinician = getattr(request.user, 'clinician', None)
        return bool(clinician and clinician.role == 'admin')
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `pytest apps/accounts/tests/test_permissions.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/apps/accounts/permissions.py backend/apps/accounts/tests/test_permissions.py
git commit -m "feat: add IsPracticeAdmin permission"
```

---

## Task 10: Invite serializer + endpoint

Creates an inactive `User` + `Clinician` and a `ClinicianInvite`, returns the invite token/link. Admin-gated.

**Files:**
- Modify: `backend/apps/accounts/serializers.py`
- Modify: `backend/apps/accounts/views.py`
- Modify: `backend/apps/accounts/urls.py`
- Test: `backend/apps/accounts/tests/test_invite_view.py`

- [ ] **Step 1: Write the failing test**

Create `backend/apps/accounts/tests/test_invite_view.py`:

```python
import pytest
from django.contrib.auth.models import User

from apps.accounts.models import Clinician, ClinicianInvite
from conftest import ClinicianFactory
from rest_framework.test import APIClient


@pytest.mark.django_db
def test_admin_can_invite_creates_inactive_clinician_and_token(api, clinician):
    payload = {'email': 'new@example.com', 'first_name': 'New', 'last_name': 'Person', 'role': 'clinician'}
    resp = api.post('/api/auth/practice/clinicians/invite/', payload, format='json')
    assert resp.status_code == 201
    assert resp.data['token']
    user = User.objects.get(email='new@example.com')
    assert user.is_active is False
    new_clin = Clinician.objects.get(user=user)
    assert new_clin.practice_id == clinician.practice_id
    assert ClinicianInvite.objects.filter(clinician=new_clin).exists()


@pytest.mark.django_db
def test_non_admin_cannot_invite():
    tech = ClinicianFactory(role='technician')
    client = APIClient()
    client.force_authenticate(user=tech.user)
    resp = client.post('/api/auth/practice/clinicians/invite/',
                       {'email': 'x@example.com', 'first_name': 'X', 'last_name': 'Y'}, format='json')
    assert resp.status_code == 403
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `pytest apps/accounts/tests/test_invite_view.py -v`
Expected: FAIL — endpoint not implemented.

- [ ] **Step 3: Add the serializer**

Append to `backend/apps/accounts/serializers.py`:

```python
from django.contrib.auth.models import User
from django.db import transaction

from .models import Clinician, ClinicianInvite


class ClinicianInviteSerializer(serializers.Serializer):
    email = serializers.EmailField()
    first_name = serializers.CharField(max_length=100)
    last_name = serializers.CharField(max_length=100)
    role = serializers.ChoiceField(choices=Clinician.ROLE_CHOICES, default='clinician')

    def validate_email(self, value):
        if User.objects.filter(email=value).exists():
            raise serializers.ValidationError('A user with this email already exists.')
        return value

    @transaction.atomic
    def create(self, validated_data):
        practice = self.context['practice']
        invited_by = self.context['invited_by']
        base_username = validated_data['email'].split('@')[0]
        username = base_username
        i = 1
        while User.objects.filter(username=username).exists():
            username = f'{base_username}{i}'
            i += 1
        user = User.objects.create(
            username=username,
            email=validated_data['email'],
            first_name=validated_data['first_name'],
            last_name=validated_data['last_name'],
            is_active=False,
        )
        user.set_unusable_password()
        user.save()
        clinician = Clinician.objects.create(
            user=user, practice=practice, role=validated_data['role']
        )
        invite = ClinicianInvite.objects.create(
            practice=practice, email=validated_data['email'],
            role=validated_data['role'], invited_by=invited_by, clinician=clinician,
        )
        return invite
```

Note: `serializers` is already imported at the top of the file; only add the `User`, `transaction`, and model imports if not present.

- [ ] **Step 4: Add the view**

Append to `backend/apps/accounts/views.py`:

```python
from rest_framework.response import Response
from .permissions import IsPracticeAdmin
from .serializers import ClinicianInviteSerializer


class ClinicianInviteView(generics.GenericAPIView):
    """Invite a new clinician to the current practice (admin only)."""
    permission_classes = [permissions.IsAuthenticated, IsPracticeAdmin]
    serializer_class = ClinicianInviteSerializer

    def post(self, request):
        clinician = request.user.clinician
        serializer = self.get_serializer(
            data=request.data,
            context={'practice': clinician.practice, 'invited_by': clinician},
        )
        serializer.is_valid(raise_exception=True)
        invite = serializer.save()
        return Response(
            {
                'id': invite.id,
                'email': invite.email,
                'role': invite.role,
                'token': invite.token,
                'invite_url': f"/register?token={invite.token}",
            },
            status=status.HTTP_201_CREATED,
        )
```

Note: `generics`, `permissions`, `status` are already imported at the top of `views.py`.

- [ ] **Step 5: Wire the URL**

In `backend/apps/accounts/urls.py`, add to `urlpatterns` (before or after the existing `practice/clinicians/` line):

```python
    path('practice/clinicians/invite/', views.ClinicianInviteView.as_view(), name='clinician-invite'),
```

- [ ] **Step 6: Run the test to confirm it passes**

Run: `pytest apps/accounts/tests/test_invite_view.py -v`
Expected: PASS (both tests).

- [ ] **Step 7: Commit**

```bash
git add backend/apps/accounts/serializers.py backend/apps/accounts/views.py backend/apps/accounts/urls.py backend/apps/accounts/tests/test_invite_view.py
git commit -m "feat: add admin-gated clinician invite endpoint"
```

---

## Task 11: Full backend suite + schema check

- [ ] **Step 1: Run the whole suite**

Run: `pytest -v`
Expected: all tests pass.

- [ ] **Step 2: Verify the OpenAPI schema still builds (web client reads it)**

Run: `python manage.py spectacular --file /tmp/schema.yml`
Expected: writes the schema with no errors (new endpoints included).

- [ ] **Step 3: System check**

Run: `python manage.py check`
Expected: no issues.

- [ ] **Step 4: Commit any incidental fixes**

```bash
git add -A && git commit -m "test: backend additions suite green" || echo "nothing to commit"
```

---

## Self-Review Notes (for the implementer)

- **WeasyPrint native deps:** if `import weasyprint` fails on bare Windows, run Task 4+ inside the Docker image (`docker-compose run --rm <web-service> pytest ...`) or install GTK runtime. The generator catches failures and marks the report `failed`, so the suite still imports; only `test_generators.py`/`test_views.py` need the native lib.
- **DB for tests:** pytest-django builds a test database in the configured Postgres — `docker-compose up -d` must be running. Add `--reuse-db` for faster reruns.
- **Practice scoping** is enforced in every report view via `assessment__patient__practice`. The cross-practice test (Task 6) guards this.
