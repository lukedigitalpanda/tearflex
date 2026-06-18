# Self-onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a new clinic self-register (single practice or chain) via a public sign-up, with email verification and an internal free/disposable-email classifier that auto-provisions professional-domain signups and routes consumer-domain ones to superadmin approval.

**Architecture:** A pending `OnboardingRegistration` row holds the signup until a single `provision_registration()` function materialises the real Chain/Practice/User/Clinician — used by both the auto path (professional email, at verify-time) and the Django-admin approval path. Classification is a self-contained module backed by a bundled domain list (no external API). The frontend adds public `/signup` and `/verify-email` pages that proxy to the backend like the existing forgot/reset pages.

**Tech Stack:** Django 5 + DRF, pytest (backend); Next.js 14, React Hook Form + Zod, vitest (web).

## Global Constraints

- Nothing real (Chain/Practice/User/Clinician) is created until `provision_registration()` runs — abandoned/abusive signups stay only as `OnboardingRegistration` rows.
- `provision_registration()` is the single shared path for both auto-provision and superadmin approval; it is `@transaction.atomic`, refuses to re-provision, and refuses if an active `User` already has that email.
- Verification issues **no JWTs** — provisioned users are sent to `/login` to sign in with the email + password they chose at sign-up.
- Email classification is **internal** (bundled `free_email_domains.txt`, loaded once into a frozenset) — no network calls. Domains NOT on the list are treated as professional (auto-approve).
- Roles: practice path → `admin`; chain path → `chain_admin` (based at the created home practice).
- Email delivery uses the existing Django email machinery; `EMAIL_BACKEND` defaults to the console backend, so verification/approval emails go to logs until SMTP/SendGrid is configured. `send_mail(..., fail_silently=True)`, `from_email=settings.DEFAULT_FROM_EMAIL`, links built from `settings.FRONTEND_URL`.
- Backend endpoints under `/api/auth/...`. Backend tests run from `backend/`; import factories via `from conftest import ...`. Local Python has no Postgres — run pytest inside the backend container (`docker ps` → e.g. `tearflex-backend-1`): `docker cp` changed files into `/app/...` then `docker exec <c> python -m pytest <path> -v`. Create/commit real repo files regardless.
- Web tests/typecheck/build run from `web/`.
- Stage only each task's named files.

---

### Task 1: Internal email classifier

**Files:**
- Create: `backend/apps/accounts/data/free_email_domains.txt`
- Create: `backend/apps/accounts/email_classification.py`
- Test: `backend/apps/accounts/tests/test_email_classification.py`

**Interfaces:**
- Produces: `is_free_or_disposable(email: str) -> bool`.

- [ ] **Step 1: Create the bundled domain list**

Create `backend/apps/accounts/data/free_email_domains.txt` (one lowercase domain per line; `#` comments allowed). Starter set of common free + disposable providers — expand later from public lists:

```
# Free consumer providers
gmail.com
googlemail.com
yahoo.com
yahoo.co.uk
ymail.com
rocketmail.com
outlook.com
hotmail.com
hotmail.co.uk
live.com
live.co.uk
msn.com
icloud.com
me.com
mac.com
aol.com
protonmail.com
proton.me
gmx.com
gmx.net
mail.com
zoho.com
yandex.com
yandex.ru
fastmail.com
tutanota.com
hey.com
hushmail.com
mail.ru
qq.com
163.com
126.com
sina.com
naver.com
daum.net
# Disposable / throwaway
mailinator.com
guerrillamail.com
10minutemail.com
tempmail.com
temp-mail.org
throwawaymail.com
getnada.com
trashmail.com
yopmail.com
sharklasers.com
guerrillamailblock.com
maildrop.cc
dispostable.com
mailnesia.com
fakeinbox.com
mintemail.com
mailcatch.com
spamgourmet.com
mohmal.com
emailondeck.com
tempinbox.com
```

- [ ] **Step 2: Write the failing tests**

Create `backend/apps/accounts/tests/test_email_classification.py`:

```python
import pytest
from apps.accounts.email_classification import is_free_or_disposable


@pytest.mark.parametrize('email', [
    'someone@gmail.com', 'a@outlook.com', 'b@yahoo.co.uk', 'c@mailinator.com',
    'd@PROTON.ME', '  e@hotmail.com  ',
])
def test_free_or_disposable_true(email):
    assert is_free_or_disposable(email) is True


@pytest.mark.parametrize('email', [
    'doctor@specsavers.com', 'admin@my-clinic.co.uk', 'x@nhs.net',
])
def test_professional_false(email):
    assert is_free_or_disposable(email) is False


@pytest.mark.parametrize('email', ['', 'not-an-email', None])
def test_malformed_is_false(email):
    assert is_free_or_disposable(email) is False
```

(Note: `nhs.net` is intentionally NOT in the list — real org domain → professional.)

- [ ] **Step 3: Run to verify it fails**

Run: `cd backend && python -m pytest apps/accounts/tests/test_email_classification.py -v`
Expected: FAIL (module missing).

- [ ] **Step 4: Implement the classifier**

Create `backend/apps/accounts/email_classification.py`:

```python
"""Internal free/disposable email classification — no external API.

A bundled list of known free-provider and disposable domains is loaded once
into a frozenset. Domains NOT on the list are treated as professional.
"""
import os

_DATA_FILE = os.path.join(os.path.dirname(__file__), 'data', 'free_email_domains.txt')


def _load_domains():
    domains = set()
    with open(_DATA_FILE, encoding='utf-8') as fh:
        for line in fh:
            domain = line.strip().lower()
            if domain and not domain.startswith('#'):
                domains.add(domain)
    return frozenset(domains)


FREE_OR_DISPOSABLE_DOMAINS = _load_domains()


def is_free_or_disposable(email):
    """True if `email`'s domain is a known free or disposable provider."""
    if not email or '@' not in email:
        return False
    domain = email.rsplit('@', 1)[1].strip().lower()
    return domain in FREE_OR_DISPOSABLE_DOMAINS
```

- [ ] **Step 5: Run to verify it passes**

Run: `cd backend && python -m pytest apps/accounts/tests/test_email_classification.py -v`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/apps/accounts/data/free_email_domains.txt backend/apps/accounts/email_classification.py backend/apps/accounts/tests/test_email_classification.py
git commit -m "feat(accounts): internal free/disposable email classifier"
```

---

### Task 2: OnboardingRegistration model

**Files:**
- Modify: `backend/apps/accounts/models.py`
- Create: `backend/apps/accounts/migrations/0006_onboardingregistration.py` (via makemigrations)
- Test: `backend/apps/accounts/tests/test_onboarding_model.py`

**Interfaces:**
- Produces: `OnboardingRegistration` model with auto-generated `email_token`, default `status='pending_verification'`.

- [ ] **Step 1: Write the failing test**

Create `backend/apps/accounts/tests/test_onboarding_model.py`:

```python
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
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && python -m pytest apps/accounts/tests/test_onboarding_model.py -v`
Expected: FAIL (model missing).

- [ ] **Step 3: Add the model**

In `backend/apps/accounts/models.py`, append (it already imports `secrets`, `settings`, `models`):

```python
class OnboardingRegistration(models.Model):
    """A pending self-onboarding signup. Nothing real (Practice/User/Clinician)
    exists until provision_registration() runs."""
    REGISTRATION_TYPES = [('practice', 'Practice'), ('chain', 'Chain')]
    STATUS_CHOICES = [
        ('pending_verification', 'Pending email verification'),
        ('awaiting_approval', 'Awaiting superadmin approval'),
        ('provisioned', 'Provisioned'),
        ('rejected', 'Rejected'),
    ]

    registration_type = models.CharField(max_length=10, choices=REGISTRATION_TYPES)

    contact_first_name = models.CharField(max_length=100)
    contact_last_name = models.CharField(max_length=100)
    contact_email = models.EmailField()
    contact_title = models.CharField(max_length=20, blank=True)
    professional_registration = models.CharField(max_length=50, blank=True)
    password = models.CharField(max_length=128)  # hashed via make_password

    practice_name = models.CharField(max_length=255)
    address_line_1 = models.CharField(max_length=255)
    address_line_2 = models.CharField(max_length=255, blank=True)
    city = models.CharField(max_length=100)
    postcode = models.CharField(max_length=10)
    phone = models.CharField(max_length=20, blank=True)
    practice_email = models.EmailField(blank=True)

    chain_name = models.CharField(max_length=255, blank=True)

    email_token = models.CharField(max_length=64, unique=True, blank=True)
    email_verified_at = models.DateTimeField(null=True, blank=True)
    status = models.CharField(max_length=24, choices=STATUS_CHOICES, default='pending_verification')

    provisioned_practice = models.ForeignKey('Practice', null=True, blank=True, on_delete=models.SET_NULL, related_name='+')
    provisioned_clinician = models.ForeignKey('Clinician', null=True, blank=True, on_delete=models.SET_NULL, related_name='+')
    decided_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='+')
    created_at = models.DateTimeField(auto_now_add=True)
    decided_at = models.DateTimeField(null=True, blank=True)

    def save(self, *args, **kwargs):
        if not self.email_token:
            self.email_token = secrets.token_urlsafe(32)
        super().save(*args, **kwargs)

    def __str__(self):
        return f'{self.contact_email} → {self.practice_name} ({self.status})'
```

(Confirm `import secrets` and `from django.conf import settings` are already at the top of `models.py` — they are, used by `ClinicianInvite`/`PasswordResetToken`.)

- [ ] **Step 4: Make the migration**

Run (in the backend container, then `docker cp` the generated file out — the container's app dir may be read-only, so if `makemigrations` cannot write, hand-write the migration mirroring the model and verify with `makemigrations --check`):

`docker compose -f docker-compose.prod.yml exec -T backend python manage.py makemigrations accounts`

The migration is `0006_onboardingregistration` depending on `0005_alter_clinicianinvite_role`. Verify with:
`docker compose -f docker-compose.prod.yml exec -T backend python manage.py makemigrations --check --dry-run` → "No changes detected".

- [ ] **Step 5: Run the test (applies migration in the test DB)**

Run: `cd backend && python -m pytest apps/accounts/tests/test_onboarding_model.py -v`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/apps/accounts/models.py backend/apps/accounts/migrations/0006_onboardingregistration.py backend/apps/accounts/tests/test_onboarding_model.py
git commit -m "feat(accounts): OnboardingRegistration model"
```

---

### Task 3: Sign-up submit endpoint

**Files:**
- Modify: `backend/apps/accounts/serializers.py` (add `OnboardingSubmitSerializer`)
- Modify: `backend/apps/accounts/views.py` (add `OnboardingSubmitView`)
- Modify: `backend/apps/accounts/urls.py` (route)
- Test: `backend/apps/accounts/tests/test_onboarding_submit.py`

**Interfaces:**
- Produces: `POST /api/auth/onboarding/` (`AllowAny`) — creates an `OnboardingRegistration` (`pending_verification`), sends a verification email, returns `201 {detail}`. Generic success when an active user already has the email (no leak).

- [ ] **Step 1: Write the failing tests**

Create `backend/apps/accounts/tests/test_onboarding_submit.py`:

```python
import pytest
from rest_framework.test import APIClient
from django.contrib.auth.models import User

from apps.accounts.models import OnboardingRegistration

URL = '/api/auth/onboarding/'


def _practice_payload(**over):
    data = {
        'registration_type': 'practice',
        'contact_first_name': 'Jo', 'contact_last_name': 'Bloggs',
        'contact_email': 'jo@my-clinic.co.uk', 'password': 'secret123',
        'practice_name': 'My Clinic', 'address_line_1': '1 High St',
        'city': 'Leeds', 'postcode': 'LS1 1AA',
    }
    data.update(over)
    return data


@pytest.mark.django_db
def test_submit_practice_creates_pending_registration():
    resp = APIClient().post(URL, _practice_payload(), format='json')
    assert resp.status_code == 201, resp.data
    reg = OnboardingRegistration.objects.get(contact_email='jo@my-clinic.co.uk')
    assert reg.status == 'pending_verification'
    assert reg.registration_type == 'practice'
    # password stored hashed, not plaintext
    assert reg.password != 'secret123' and reg.password
    # nothing real created yet
    assert User.objects.filter(email='jo@my-clinic.co.uk').count() == 0


@pytest.mark.django_db
def test_chain_requires_chain_name():
    resp = APIClient().post(URL, _practice_payload(registration_type='chain'), format='json')
    assert resp.status_code == 400
    resp2 = APIClient().post(
        URL, _practice_payload(registration_type='chain', chain_name='Specsavers',
                               contact_email='jo2@my-clinic.co.uk'), format='json')
    assert resp2.status_code == 201


@pytest.mark.django_db
def test_existing_active_user_email_is_generic_success_no_registration():
    User.objects.create_user('existing', email='taken@my-clinic.co.uk', password='x', is_active=True)
    resp = APIClient().post(URL, _practice_payload(contact_email='taken@my-clinic.co.uk'), format='json')
    assert resp.status_code == 201  # no leak
    assert OnboardingRegistration.objects.filter(contact_email='taken@my-clinic.co.uk').count() == 0
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && python -m pytest apps/accounts/tests/test_onboarding_submit.py -v`
Expected: FAIL (404 — route missing).

- [ ] **Step 3: Add the serializer**

In `backend/apps/accounts/serializers.py`, add (extend the existing imports with `from django.contrib.auth.hashers import make_password` and `from .models import ... OnboardingRegistration`):

```python
class OnboardingSubmitSerializer(serializers.Serializer):
    registration_type = serializers.ChoiceField(choices=['practice', 'chain'])
    contact_first_name = serializers.CharField(max_length=100)
    contact_last_name = serializers.CharField(max_length=100)
    contact_email = serializers.EmailField()
    contact_title = serializers.CharField(max_length=20, required=False, allow_blank=True)
    professional_registration = serializers.CharField(max_length=50, required=False, allow_blank=True)
    password = serializers.CharField(min_length=8, write_only=True)
    practice_name = serializers.CharField(max_length=255)
    address_line_1 = serializers.CharField(max_length=255)
    address_line_2 = serializers.CharField(max_length=255, required=False, allow_blank=True)
    city = serializers.CharField(max_length=100)
    postcode = serializers.CharField(max_length=10)
    phone = serializers.CharField(max_length=20, required=False, allow_blank=True)
    practice_email = serializers.EmailField(required=False, allow_blank=True)
    chain_name = serializers.CharField(max_length=255, required=False, allow_blank=True)

    def validate(self, attrs):
        if attrs['registration_type'] == 'chain' and not attrs.get('chain_name'):
            raise serializers.ValidationError({'chain_name': 'Required when registering a group / chain.'})
        return attrs

    def create(self, validated_data):
        validated_data['password'] = make_password(validated_data['password'])
        return OnboardingRegistration.objects.create(**validated_data)
```

- [ ] **Step 4: Add the view**

In `backend/apps/accounts/views.py`, add (`User`, `send_mail`, `django_settings` may need importing — `User` from `django.contrib.auth.models`, `send_mail` from `django.core.mail`, settings as `from django.conf import settings as django_settings`; check the top of the file and add only what's missing):

```python
class OnboardingSubmitView(generics.GenericAPIView):
    """Public self-onboarding sign-up. Creates a pending registration and emails
    a verification link."""
    permission_classes = [permissions.AllowAny]
    serializer_class = OnboardingSubmitSerializer

    def post(self, request):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = serializer.validated_data['contact_email']
        # Don't reveal whether an account already exists — generic success, no-op.
        if not User.objects.filter(email__iexact=email, is_active=True).exists():
            reg = serializer.save()
            verify_url = f"{django_settings.FRONTEND_URL}/verify-email?token={reg.email_token}"
            send_mail(
                subject='Verify your TearFlex account',
                message=(
                    f"Welcome to TearFlex.\n\n"
                    f"Confirm your email to continue setting up {reg.practice_name}:\n\n"
                    f"{verify_url}\n\n"
                    f"If you didn't request this, you can ignore this email."
                ),
                from_email=django_settings.DEFAULT_FROM_EMAIL,
                recipient_list=[email],
                fail_silently=True,
            )
        return Response(
            {'detail': 'Check your email to verify your account.'},
            status=status.HTTP_201_CREATED,
        )
```

- [ ] **Step 5: Route it**

In `backend/apps/accounts/urls.py`, add (after `register/`):

```python
    path('onboarding/', views.OnboardingSubmitView.as_view(), name='onboarding-submit'),
```

- [ ] **Step 6: Run the tests**

Run: `cd backend && python -m pytest apps/accounts/tests/test_onboarding_submit.py -v`
Expected: PASS (3 passed).

- [ ] **Step 7: Commit**

```bash
git add backend/apps/accounts/serializers.py backend/apps/accounts/views.py backend/apps/accounts/urls.py backend/apps/accounts/tests/test_onboarding_submit.py
git commit -m "feat(accounts): self-onboarding sign-up endpoint"
```

---

### Task 4: Verify endpoint + provisioning (security-critical core)

**Files:**
- Create: `backend/apps/accounts/onboarding.py` (`provision_registration`)
- Modify: `backend/apps/accounts/views.py` (add `OnboardingVerifyView`)
- Modify: `backend/apps/accounts/urls.py` (route)
- Test: `backend/apps/accounts/tests/test_onboarding_verify.py`

**Interfaces:**
- Consumes: `is_free_or_disposable` (Task 1); `OnboardingRegistration` (Task 2); `Chain`/`Practice`/`Clinician`.
- Produces: `provision_registration(registration, decided_by=None) -> Clinician`; `OnboardingError`; `POST /api/auth/onboarding/verify/` (`AllowAny`) returning `{status: 'provisioned' | 'awaiting_approval'}`.

- [ ] **Step 1: Write the failing tests**

Create `backend/apps/accounts/tests/test_onboarding_verify.py`:

```python
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
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && python -m pytest apps/accounts/tests/test_onboarding_verify.py -v`
Expected: FAIL (404 / missing `onboarding` module).

- [ ] **Step 3: Implement provisioning**

Create `backend/apps/accounts/onboarding.py`:

```python
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
    if User.objects.filter(email__iexact=registration.contact_email, is_active=True).exists():
        raise OnboardingError('An active account already exists for this email.')

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
```

- [ ] **Step 4: Add the verify view**

In `backend/apps/accounts/views.py`, add (import `OnboardingRegistration`, `is_free_or_disposable` from `.email_classification`, `provision_registration` from `.onboarding`, `timezone` from `django.utils`, `ValidationError` is already imported):

```python
class OnboardingVerifyView(generics.GenericAPIView):
    """Verify an onboarding email; auto-provision professional domains, route
    free/disposable domains to superadmin approval. Issues no JWTs."""
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        token = request.data.get('token', '')
        try:
            reg = OnboardingRegistration.objects.get(email_token=token)
        except OnboardingRegistration.DoesNotExist:
            raise ValidationError('Invalid or expired verification link.')
        if reg.status == 'provisioned':
            raise ValidationError('This account has already been set up. Please sign in.')
        if reg.status == 'rejected':
            raise ValidationError('This application was not approved.')

        if reg.email_verified_at is None:
            reg.email_verified_at = timezone.now()
            reg.save(update_fields=['email_verified_at'])

        if reg.status == 'awaiting_approval' or is_free_or_disposable(reg.contact_email):
            if reg.status != 'awaiting_approval':
                reg.status = 'awaiting_approval'
                reg.save(update_fields=['status'])
            return Response({'status': 'awaiting_approval'})

        provision_registration(reg)
        return Response({'status': 'provisioned'})
```

- [ ] **Step 5: Route it**

In `backend/apps/accounts/urls.py`, add (after `onboarding/`):

```python
    path('onboarding/verify/', views.OnboardingVerifyView.as_view(), name='onboarding-verify'),
```

- [ ] **Step 6: Run the tests + full accounts suite**

Run: `cd backend && python -m pytest apps/accounts/tests/test_onboarding_verify.py -v && python -m pytest apps/accounts -q`
Expected: new 5 passed; full accounts suite passes.

- [ ] **Step 7: Commit**

```bash
git add backend/apps/accounts/onboarding.py backend/apps/accounts/views.py backend/apps/accounts/urls.py backend/apps/accounts/tests/test_onboarding_verify.py
git commit -m "feat(accounts): onboarding verify + provisioning"
```

---

### Task 5: Superadmin approval (Django admin)

**Files:**
- Modify: `backend/apps/accounts/admin.py`
- Test: `backend/apps/accounts/tests/test_onboarding_admin.py`

**Interfaces:**
- Consumes: `provision_registration`, `OnboardingError` (Task 4).
- Produces: `OnboardingRegistrationAdmin` with `approve` / `reject` actions.

- [ ] **Step 1: Write the failing test**

Create `backend/apps/accounts/tests/test_onboarding_admin.py`:

```python
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
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && python -m pytest apps/accounts/tests/test_onboarding_admin.py -v`
Expected: FAIL (no `OnboardingRegistrationAdmin`).

- [ ] **Step 3: Implement the admin**

In `backend/apps/accounts/admin.py`, add the imports and the admin (it currently imports `Chain, Practice, Clinician` — extend it):

```python
from django.contrib import admin, messages
from django.core.mail import send_mail
from django.conf import settings
from django.utils import timezone
from .models import Chain, Practice, Clinician, OnboardingRegistration
from .onboarding import provision_registration, OnboardingError


@admin.register(OnboardingRegistration)
class OnboardingRegistrationAdmin(admin.ModelAdmin):
    list_display = ['contact_email', 'registration_type', 'practice_name', 'chain_name', 'status', 'created_at']
    list_filter = ['status', 'registration_type']
    search_fields = ['contact_email', 'practice_name', 'chain_name']
    actions = ['approve', 'reject']

    @admin.action(description='Approve selected (provision the account)')
    def approve(self, request, queryset):
        done = 0
        for reg in queryset.filter(status='awaiting_approval'):
            try:
                provision_registration(reg, decided_by=request.user)
            except OnboardingError as exc:
                self.message_user(request, f'{reg.contact_email}: {exc}', level=messages.ERROR)
                continue
            send_mail(
                subject='Your TearFlex account is ready',
                message=(
                    f"Your TearFlex application has been approved.\n\n"
                    f"Sign in here: {settings.FRONTEND_URL}/login"
                ),
                from_email=settings.DEFAULT_FROM_EMAIL,
                recipient_list=[reg.contact_email],
                fail_silently=True,
            )
            done += 1
        self.message_user(request, f'Provisioned {done} account(s).')

    @admin.action(description='Reject selected')
    def reject(self, request, queryset):
        updated = queryset.filter(status='awaiting_approval').update(
            status='rejected', decided_at=timezone.now(), decided_by=request.user)
        self.message_user(request, f'Rejected {updated} registration(s).')
```

(Keep the existing `ChainAdmin`/`PracticeAdmin`/`ClinicianAdmin` registrations as-is.)

- [ ] **Step 4: Run the tests**

Run: `cd backend && python -m pytest apps/accounts/tests/test_onboarding_admin.py -v`
Expected: PASS (2 passed).

- [ ] **Step 5: Commit**

```bash
git add backend/apps/accounts/admin.py backend/apps/accounts/tests/test_onboarding_admin.py
git commit -m "feat(accounts): superadmin approve/reject for onboarding"
```

---

### Task 6: Frontend — sign-up + verify pages

**Files:**
- Modify: `web/src/lib/schemas.ts` (add onboarding schemas)
- Create: `web/src/app/api/auth/onboarding/route.ts`
- Create: `web/src/app/api/auth/onboarding/verify/route.ts`
- Create: `web/src/app/(auth)/signup/page.tsx`
- Create: `web/src/app/(auth)/verify-email/page.tsx`
- Modify: `web/src/app/(auth)/login/page.tsx` (add "Sign up" link)
- Test: `web/src/lib/schemas.test.ts` (extend)

**Interfaces:**
- Consumes: the live `POST /api/auth/onboarding/` and `/verify/` endpoints (proxied).
- Produces: public `/signup` and `/verify-email` pages.

- [ ] **Step 1: Add onboarding schemas + failing test**

In `web/src/lib/schemas.ts`, add:

```typescript
// registration_type is a UI choice (component state), added to the payload at
// submit — not a form field. chain_name is validated in the component + backend.
export const onboardingSchema = z.object({
  chain_name: z.string().optional(),
  practice_name: z.string().min(1, 'Required'),
  address_line_1: z.string().min(1, 'Required'),
  address_line_2: z.string().optional(),
  city: z.string().min(1, 'Required'),
  postcode: z.string().min(1, 'Required'),
  phone: z.string().optional(),
  practice_email: z.string().email().optional().or(z.literal('')),
  contact_first_name: z.string().min(1, 'Required'),
  contact_last_name: z.string().min(1, 'Required'),
  contact_email: z.string().email('Enter a valid email'),
  contact_title: z.string().optional(),
  professional_registration: z.string().optional(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
})
export type OnboardingInput = z.infer<typeof onboardingSchema>
```

In `web/src/lib/schemas.test.ts`, add:

```typescript
import { onboardingSchema } from './schemas'

describe('onboardingSchema', () => {
  const base = {
    practice_name: 'C', address_line_1: '1 St', city: 'Leeds', postcode: 'LS1 1AA',
    contact_first_name: 'Jo', contact_last_name: 'B', contact_email: 'jo@x.com',
    password: 'secret123',
  }
  it('accepts valid details', () => {
    expect(onboardingSchema.safeParse(base).success).toBe(true)
  })
  it('rejects a short password', () => {
    expect(onboardingSchema.safeParse({ ...base, password: 'x' }).success).toBe(false)
  })
  it('rejects a missing practice name', () => {
    expect(onboardingSchema.safeParse({ ...base, practice_name: '' }).success).toBe(false)
  })
})
```

Run: `cd web && npm run test -- schemas` → FAIL, then PASS after the schema is added.

- [ ] **Step 2: Add the proxy routes**

Create `web/src/app/api/auth/onboarding/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { API_BASE } from '@/lib/server/cookies'

export async function POST(req: NextRequest) {
  const body = await req.json()
  const res = await fetch(`${API_BASE}/auth/onboarding/`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  return NextResponse.json(data, { status: res.status })
}
```

Create `web/src/app/api/auth/onboarding/verify/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { API_BASE } from '@/lib/server/cookies'

export async function POST(req: NextRequest) {
  const body = await req.json()
  const res = await fetch(`${API_BASE}/auth/onboarding/verify/`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  return NextResponse.json(data, { status: res.status })
}
```

- [ ] **Step 3: Build the sign-up page**

Create `web/src/app/(auth)/signup/page.tsx`:

```tsx
'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { onboardingSchema, type OnboardingInput } from '@/lib/schemas'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card } from '@/components/ui/card'

export default function SignupPage() {
  const [type, setType] = useState<'practice' | 'chain' | null>(null)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const { register, handleSubmit, formState: { errors } } = useForm<OnboardingInput>({
    resolver: zodResolver(onboardingSchema),
  })

  const onSubmit = async (data: OnboardingInput) => {
    if (type === 'chain' && !data.chain_name) { setError('Group / chain name is required.'); return }
    setSubmitting(true); setError('')
    const res = await fetch('/api/auth/onboarding', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...data, registration_type: type }),
    })
    setSubmitting(false)
    if (res.ok) setDone(true)
    else setError('Something went wrong. Please check your details and try again.')
  }

  if (done) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Card className="w-full max-w-md p-8 text-center">
          <h1 className="mb-2 text-2xl font-bold text-teal-600">Check your email</h1>
          <p className="text-sm text-muted-foreground">
            We've sent a verification link to confirm your account. Click it to finish setting up.
          </p>
        </Card>
      </div>
    )
  }

  if (!type) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Card className="w-full max-w-md p-8 space-y-4">
          <h1 className="text-2xl font-bold text-teal-600">Create your TearFlex account</h1>
          <p className="text-sm text-muted-foreground">What are you registering?</p>
          <button onClick={() => setType('practice')} className="w-full rounded-md border border-border p-4 text-left hover:border-teal-400">
            <span className="font-semibold">A single practice</span>
            <p className="text-xs text-muted-foreground">One clinic. You'll be its practice admin.</p>
          </button>
          <button onClick={() => setType('chain')} className="w-full rounded-md border border-border p-4 text-left hover:border-teal-400">
            <span className="font-semibold">A multi-practice group (chain)</span>
            <p className="text-xs text-muted-foreground">A brand with several practices. You'll be its chain admin.</p>
          </button>
          <p className="text-center text-sm text-muted-foreground">
            Already have an account? <Link href="/login" className="text-teal-600 hover:underline">Sign in</Link>
          </p>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background py-10">
      <Card className="w-full max-w-md p-8">
        <button onClick={() => setType(null)} className="mb-2 text-xs text-muted-foreground hover:underline">← back</button>
        <h1 className="mb-4 text-2xl font-bold text-teal-600">
          {type === 'chain' ? 'Register your group' : 'Register your practice'}
        </h1>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
          {type === 'chain' && (
            <div>
              <Label htmlFor="chain">Group / chain name</Label>
              <Input id="chain" {...register('chain_name')} />
              {errors.chain_name && <p className="mt-1 text-xs text-status-severe">{errors.chain_name.message}</p>}
            </div>
          )}
          <div>
            <Label htmlFor="pname">{type === 'chain' ? 'First practice name' : 'Practice name'}</Label>
            <Input id="pname" {...register('practice_name')} />
            {errors.practice_name && <p className="mt-1 text-xs text-status-severe">{errors.practice_name.message}</p>}
          </div>
          <div><Label htmlFor="a1">Address line 1</Label><Input id="a1" {...register('address_line_1')} />
            {errors.address_line_1 && <p className="mt-1 text-xs text-status-severe">{errors.address_line_1.message}</p>}</div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label htmlFor="city">City</Label><Input id="city" {...register('city')} />
              {errors.city && <p className="mt-1 text-xs text-status-severe">{errors.city.message}</p>}</div>
            <div><Label htmlFor="pc">Postcode</Label><Input id="pc" {...register('postcode')} />
              {errors.postcode && <p className="mt-1 text-xs text-status-severe">{errors.postcode.message}</p>}</div>
          </div>
          <hr className="border-border" />
          <div className="grid grid-cols-2 gap-3">
            <div><Label htmlFor="fn">Your first name</Label><Input id="fn" {...register('contact_first_name')} />
              {errors.contact_first_name && <p className="mt-1 text-xs text-status-severe">{errors.contact_first_name.message}</p>}</div>
            <div><Label htmlFor="ln">Your last name</Label><Input id="ln" {...register('contact_last_name')} />
              {errors.contact_last_name && <p className="mt-1 text-xs text-status-severe">{errors.contact_last_name.message}</p>}</div>
          </div>
          <div><Label htmlFor="email">Your work email</Label><Input id="email" type="email" {...register('contact_email')} />
            {errors.contact_email && <p className="mt-1 text-xs text-status-severe">{errors.contact_email.message}</p>}</div>
          <div><Label htmlFor="pw">Password</Label><Input id="pw" type="password" {...register('password')} />
            {errors.password && <p className="mt-1 text-xs text-status-severe">{errors.password.message}</p>}</div>
          {error && <p className="text-sm text-status-severe">{error}</p>}
          <Button type="submit" className="w-full bg-teal-600 hover:bg-teal-700" disabled={submitting}>
            {submitting ? 'Submitting…' : 'Create account'}
          </Button>
        </form>
      </Card>
    </div>
  )
}
```

- [ ] **Step 4: Build the verify-email page**

Create `web/src/app/(auth)/verify-email/page.tsx`:

```tsx
'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Card } from '@/components/ui/card'

type State = 'verifying' | 'provisioned' | 'awaiting' | 'error'

export default function VerifyEmailPage() {
  const router = useRouter()
  const [state, setState] = useState<State>('verifying')

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get('token') ?? ''
    if (!token) { setState('error'); return }
    fetch('/api/auth/onboarding/verify', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token }),
    }).then(async (res) => {
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setState('error'); return }
      if (data.status === 'provisioned') {
        setState('provisioned')
        setTimeout(() => router.push('/login?onboarded=1'), 2500)
      } else {
        setState('awaiting')
      }
    }).catch(() => setState('error'))
  }, [router])

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <Card className="w-full max-w-md p-8 text-center">
        {state === 'verifying' && <p className="text-sm text-muted-foreground">Verifying your email…</p>}
        {state === 'provisioned' && (
          <>
            <h1 className="mb-2 text-2xl font-bold text-teal-600">Your account is ready</h1>
            <p className="text-sm text-muted-foreground">Redirecting you to sign in…</p>
            <Link href="/login" className="mt-3 inline-block text-sm text-teal-600 hover:underline">Go to sign in</Link>
          </>
        )}
        {state === 'awaiting' && (
          <>
            <h1 className="mb-2 text-2xl font-bold text-teal-600">Under review</h1>
            <p className="text-sm text-muted-foreground">
              Thanks — your application is being reviewed. We'll email you when your account is approved.
            </p>
          </>
        )}
        {state === 'error' && (
          <>
            <p className="mb-3 text-sm text-muted-foreground">This verification link is invalid or has expired.</p>
            <Link href="/signup" className="text-sm text-teal-600 hover:underline">Start again</Link>
          </>
        )}
      </Card>
    </div>
  )
}
```

- [ ] **Step 5: Add a "Sign up" link to the login page**

In `web/src/app/(auth)/login/page.tsx`, add a link near the existing "Forgot password" link (match the surrounding markup):

```tsx
<p className="text-center text-sm text-muted-foreground">
  New practice? <Link href="/signup" className="text-teal-600 hover:underline">Create an account</Link>
</p>
```

(Ensure `import Link from 'next/link'` is present — add it if not.)

- [ ] **Step 6: Typecheck, build, full web suite**

Run: `cd web && npx tsc --noEmit && npm run build && npm run test`
Expected: no new type errors; build succeeds; schema tests pass. (The pre-existing `login` test is fixed already; suite should be fully green.)

- [ ] **Step 7: Commit**

```bash
git add web/src/lib/schemas.ts web/src/lib/schemas.test.ts "web/src/app/api/auth/onboarding/route.ts" "web/src/app/api/auth/onboarding/verify/route.ts" "web/src/app/(auth)/signup/page.tsx" "web/src/app/(auth)/verify-email/page.tsx" "web/src/app/(auth)/login/page.tsx"
git commit -m "feat(web): self-onboarding sign-up and verify pages"
```

---

## Deferred (from the spec)

- **Rate-limiting the `/onboarding/` endpoint** is intentionally NOT implemented at the
  application layer here — a DRF `ScopedRateThrottle` shares a cache key across the test
  suite (testserver IP), making the suite flaky. It belongs at the reverse-proxy (nginx)
  layer as an ops concern. The other abuse controls from the spec (nothing-real-pre-provision,
  email verification, free/disposable gating, no-leak duplicate handling) are all implemented.

## Final verification

- [ ] Backend: `cd backend && python -m pytest -q` (container) → PASS, migration state clean (`makemigrations --check`).
- [ ] Web: `cd web && npx tsc --noEmit && npm run test && npm run build` → green.
- [ ] Manual smoke (after deploy; email goes to logs until SendGrid): `/signup` → choose practice → submit → read the verify link from the backend logs → open it → with a professional email it provisions and lands on `/login`; sign in works. With a gmail address it shows "under review", and Django admin → approve provisions it. Chain path creates a chain + chain_admin.
