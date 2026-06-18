# Chain-admin Phase 4 — Tiered User Management — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give each admin role the power to create practices and to manage (invite, edit, remove, move) the users below them, scoped to their tier.

**Architecture:** A single security-critical authorization module (`apps/accounts/management.py`) defines who may manage whom; every management endpoint (invite, edit/move, remove) calls it, mirroring how `scoping.py` centralises practice access. Frontend mirrors the role set client-side for UI affordances but the backend re-validates everything.

**Tech Stack:** Django 5 + DRF, pytest (backend); Next.js 14, React Hook Form + Zod, TanStack Query, Zustand, vitest + @testing-library/react (web).

## Global Constraints

- Authorization is security-critical: every management decision goes through `apps/accounts/management.py` (`manageable_roles`, `can_manage`, `is_last_active_admin`) and practice scope through `apps/accounts/scoping.py` (`accessible_practice_ids`). Never inline role/`is_superuser` checks in views or serializers.
- Tier rules (exact): superuser manages `{chain_admin, admin, clinician, technician}`; chain admin manages `{admin, clinician, technician}` within their chain; practice admin manages `{clinician, technician}` within their own practice; clinician/technician manage nothing.
- A user may never manage themselves via these endpoints (`can_manage(actor, self) == False`).
- The last active `admin` of a practice may not be removed, demoted, or moved away.
- "Remove" = deactivate (`user.is_active = False`); never hard-delete. The clinician list returns only active users.
- `chain_admin` is never an invitable/assignable role through the API (superadmin/Django only) — it falls out naturally because it is not in any non-superuser's `manageable_roles`.
- Backend endpoints live under `/api/auth/...`. Run backend tests from `backend/`; tests import factories via `from conftest import ...`. Run web tests/typecheck/build from `web/`.
- Stage only the files each task names in its commit — the working tree has unrelated in-progress changes.

---

### Task 1: Create-practice endpoint (backend) — ALREADY COMPLETE

Implemented and committed as `39aa62a` (`feat(accounts): chain admins can create practices in their chain`): `IsChainAdminOrSuperuser` permission, `PracticeCreateSerializer`, `PracticeListView` → `ListCreateAPIView` with `POST /api/auth/practices/` (chain force-set), and `backend/apps/accounts/tests/test_practice_create.py` (6 tests passing). **Do not re-implement.** Later tasks build on it.

---

### Task 2: Management authorization helpers (backend)

**Files:**
- Create: `backend/apps/accounts/management.py`
- Test: `backend/apps/accounts/tests/test_management_helpers.py`

**Interfaces:**
- Consumes: `accessible_practice_ids` from `apps.accounts.scoping`; `Clinician` model; `conftest` factories `ChainFactory`, `PracticeFactory`, `ClinicianFactory`.
- Produces: `manageable_roles(user) -> set[str]`, `can_manage(user, target_clinician) -> bool`, `is_last_active_admin(target_clinician) -> bool`.

- [ ] **Step 1: Write the failing tests**

Create `backend/apps/accounts/tests/test_management_helpers.py`:

```python
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && python -m pytest apps/accounts/tests/test_management_helpers.py -v`
Expected: FAIL (`ModuleNotFoundError: apps.accounts.management`).

- [ ] **Step 3: Implement the helpers**

Create `backend/apps/accounts/management.py`:

```python
"""Central management-authorization rules.

One place decides who may manage whom, so the tier rules that protect user
accounts are defined and tested once rather than copied into every view.
"""
from .models import Clinician
from .scoping import accessible_practice_ids


def manageable_roles(user):
    """The set of roles `user` may assign / manage. Empty for non-admins."""
    if user.is_superuser:
        return {'chain_admin', 'admin', 'clinician', 'technician'}
    clinician = getattr(user, 'clinician', None)
    if clinician is None:
        return set()
    if clinician.role == 'chain_admin':
        return {'admin', 'clinician', 'technician'}
    if clinician.role == 'admin':
        return {'clinician', 'technician'}
    return set()


def can_manage(user, target):
    """True if `user` may manage Clinician `target` (role below them, in scope,
    and not themselves)."""
    if user.is_superuser:
        return True
    actor = getattr(user, 'clinician', None)
    if actor is None or actor.pk == target.pk:
        return False
    if target.role not in manageable_roles(user):
        return False
    scope = accessible_practice_ids(user)  # None == unrestricted
    return scope is None or target.practice_id in scope


def is_last_active_admin(target):
    """True if `target` is the only remaining active practice admin of its practice."""
    if target.role != 'admin':
        return False
    return Clinician.objects.filter(
        practice_id=target.practice_id, role='admin', user__is_active=True,
    ).exclude(pk=target.pk).count() == 0
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd backend && python -m pytest apps/accounts/tests/test_management_helpers.py -v`
Expected: PASS (5 passed).

- [ ] **Step 5: Commit**

```bash
git add backend/apps/accounts/management.py backend/apps/accounts/tests/test_management_helpers.py
git commit -m "feat(accounts): management authorization helpers (tier rules)"
```

---

### Task 3: Tiered invite (backend)

**Files:**
- Modify: `backend/apps/accounts/serializers.py` (`ClinicianInviteSerializer.validate`)
- Modify: `backend/apps/accounts/views.py` (`ClinicianInviteView.post`)
- Test: `backend/apps/accounts/tests/test_invite_chain.py` (create)

**Interfaces:**
- Consumes: `manageable_roles` from `apps.accounts.management`; `resolve_practice_scope`, `accessible_practice_ids` from scoping (already imported in `views.py`); `IsPracticeAdmin`, `Practice`, `get_object_or_404`, `PermissionDenied`.
- Produces: `POST /api/auth/practice/clinicians/invite/?practice_id=<id>` — target practice resolved against the inviter's scope (else 403); role validated against `manageable_roles(inviter.user)`.

- [ ] **Step 1: Write the failing tests**

Create `backend/apps/accounts/tests/test_invite_chain.py`:

```python
import pytest
from rest_framework.test import APIClient

from apps.accounts.models import Clinician
from conftest import ChainFactory, PracticeFactory, ClinicianFactory

URL = '/api/auth/practice/clinicians/invite/'


def _client(user):
    c = APIClient()
    c.force_authenticate(user=user)
    return c


def _payload(email, role):
    return {'email': email, 'first_name': 'A', 'last_name': 'B', 'role': role}


@pytest.mark.django_db
def test_chain_admin_can_invite_admin_to_sibling_practice():
    chain = ChainFactory()
    home = PracticeFactory(chain=chain)
    sibling = PracticeFactory(chain=chain)
    admin = ClinicianFactory(practice=home, role='chain_admin')
    resp = _client(admin.user).post(
        f'{URL}?practice_id={sibling.id}', _payload('a@x.com', 'admin'), format='json')
    assert resp.status_code == 201, resp.data
    new = Clinician.objects.get(user__email='a@x.com')
    assert new.practice_id == sibling.id and new.role == 'admin'


@pytest.mark.django_db
def test_chain_admin_can_invite_clinician():
    chain = ChainFactory()
    home = PracticeFactory(chain=chain)
    admin = ClinicianFactory(practice=home, role='chain_admin')
    resp = _client(admin.user).post(URL, _payload('c@x.com', 'clinician'), format='json')
    assert resp.status_code == 201


@pytest.mark.django_db
def test_chain_admin_cannot_invite_to_practice_outside_chain():
    chain = ChainFactory()
    home = PracticeFactory(chain=chain)
    outside = PracticeFactory(chain=ChainFactory())
    admin = ClinicianFactory(practice=home, role='chain_admin')
    resp = _client(admin.user).post(
        f'{URL}?practice_id={outside.id}', _payload('a@x.com', 'admin'), format='json')
    assert resp.status_code == 403


@pytest.mark.django_db
def test_practice_admin_cannot_invite_admin_role():
    admin = ClinicianFactory(role='admin')
    resp = _client(admin.user).post(URL, _payload('a@x.com', 'admin'), format='json')
    assert resp.status_code == 400


@pytest.mark.django_db
def test_practice_admin_can_invite_technician():
    admin = ClinicianFactory(role='admin')
    resp = _client(admin.user).post(URL, _payload('t@x.com', 'technician'), format='json')
    assert resp.status_code == 201


@pytest.mark.django_db
def test_nobody_can_invite_chain_admin_role():
    admin = ClinicianFactory(role='admin')
    resp = _client(admin.user).post(URL, _payload('a@x.com', 'chain_admin'), format='json')
    assert resp.status_code == 400


@pytest.mark.django_db
def test_practice_admin_cannot_target_other_practice():
    admin = ClinicianFactory(role='admin')
    other = PracticeFactory()
    resp = _client(admin.user).post(
        f'{URL}?practice_id={other.id}', _payload('a@x.com', 'clinician'), format='json')
    assert resp.status_code == 403
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && python -m pytest apps/accounts/tests/test_invite_chain.py -v`
Expected: FAIL (current view ignores `practice_id`; no role-tier validation).

- [ ] **Step 3: Add tier validation to the invite serializer**

In `backend/apps/accounts/serializers.py`, add the import near the top:

```python
from .management import manageable_roles
```

Add a `validate` method to `ClinicianInviteSerializer` (after `validate_email`):

```python
    def validate(self, attrs):
        role = attrs.get('role', 'clinician')
        if role not in manageable_roles(self.context['actor_user']):
            raise serializers.ValidationError(
                {'role': 'You do not have permission to invite this role.'})
        return attrs
```

- [ ] **Step 4: Resolve target practice and pass actor in the view**

In `backend/apps/accounts/views.py`, replace `ClinicianInviteView.post`:

```python
    def post(self, request):
        inviter = request.user.clinician
        requested = request.query_params.get('practice_id')
        if requested:
            scope = resolve_practice_scope(request.user, requested)
            if not scope:
                raise PermissionDenied()
            practice = get_object_or_404(Practice, pk=next(iter(scope)))
        else:
            practice = inviter.practice
        serializer = self.get_serializer(
            data=request.data,
            context={'practice': practice, 'invited_by': inviter, 'actor_user': request.user},
        )
        serializer.is_valid(raise_exception=True)
        invite = serializer.save()
        return Response(
            {
                'id': invite.id, 'email': invite.email, 'role': invite.role,
                'token': invite.token, 'invite_url': f"/register?token={invite.token}",
            },
            status=status.HTTP_201_CREATED,
        )
```

(`resolve_practice_scope`, `PermissionDenied`, `get_object_or_404` are already imported in `views.py` — verify with `grep -n "resolve_practice_scope\|PermissionDenied\|get_object_or_404" apps/accounts/views.py`.)

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd backend && python -m pytest apps/accounts/tests/test_invite_chain.py apps/accounts/tests/test_invite_view.py -v`
Expected: PASS (new 7 + existing 2; existing `test_admin_can_invite...` uses role `clinician`, still valid for a practice admin).

- [ ] **Step 6: Commit**

```bash
git add backend/apps/accounts/serializers.py backend/apps/accounts/views.py backend/apps/accounts/tests/test_invite_chain.py
git commit -m "feat(accounts): tier-scoped clinician invites"
```

---

### Task 4: Edit + move endpoint (backend)

**Files:**
- Modify: `backend/apps/accounts/serializers.py` (add `ClinicianManageSerializer`)
- Modify: `backend/apps/accounts/views.py` (add `ClinicianDetailView`)
- Modify: `backend/apps/accounts/urls.py` (route + active-only list filter)
- Test: `backend/apps/accounts/tests/test_clinician_manage.py` (create)

**Interfaces:**
- Consumes: `manageable_roles`, `can_manage`, `is_last_active_admin` from management; `accessible_practice_ids` from scoping; `ClinicianSerializer`, `Clinician`, `Practice`.
- Produces: `GET`/`PATCH /api/auth/clinicians/<int:pk>/`. PATCH body keys (all optional): `first_name`, `last_name`, `title`, `professional_registration`, `role`, `practice_id`. Returns the updated clinician via `ClinicianSerializer`.

- [ ] **Step 1: Write the failing tests**

Create `backend/apps/accounts/tests/test_clinician_manage.py`:

```python
import pytest
from rest_framework.test import APIClient

from conftest import ChainFactory, PracticeFactory, ClinicianFactory


def _client(user):
    c = APIClient()
    c.force_authenticate(user=user)
    return c


def _url(pk):
    return f'/api/auth/clinicians/{pk}/'


@pytest.mark.django_db
def test_practice_admin_edits_details_and_promotes_within_range():
    practice = PracticeFactory()
    admin = ClinicianFactory(practice=practice, role='admin')
    clin = ClinicianFactory(practice=practice, role='clinician')
    resp = _client(admin.user).patch(_url(clin.id), {
        'first_name': 'Renamed', 'role': 'technician', 'title': 'Dr',
    }, format='json')
    assert resp.status_code == 200, resp.data
    clin.refresh_from_db()
    clin.user.refresh_from_db()
    assert clin.user.first_name == 'Renamed' and clin.role == 'technician' and clin.title == 'Dr'


@pytest.mark.django_db
def test_practice_admin_cannot_promote_to_admin():
    practice = PracticeFactory()
    admin = ClinicianFactory(practice=practice, role='admin')
    clin = ClinicianFactory(practice=practice, role='clinician')
    resp = _client(admin.user).patch(_url(clin.id), {'role': 'admin'}, format='json')
    assert resp.status_code == 400


@pytest.mark.django_db
def test_cannot_edit_user_out_of_scope():
    admin = ClinicianFactory(role='admin')
    other = ClinicianFactory(role='clinician')  # different practice
    resp = _client(admin.user).patch(_url(other.id), {'title': 'X'}, format='json')
    assert resp.status_code == 403


@pytest.mark.django_db
def test_cannot_edit_self():
    admin = ClinicianFactory(role='admin')
    resp = _client(admin.user).patch(_url(admin.id), {'title': 'X'}, format='json')
    assert resp.status_code == 403


@pytest.mark.django_db
def test_demoting_last_admin_blocked():
    practice = PracticeFactory()
    a1 = ClinicianFactory(practice=practice, role='admin')
    chain_admin = ClinicianFactory(
        practice=PracticeFactory(chain=ChainFactory()), role='chain_admin')
    # put the lone admin's practice into the chain admin's chain so it's manageable
    a1.practice.chain = chain_admin.practice.chain
    a1.practice.save()
    resp = _client(chain_admin.user).patch(_url(a1.id), {'role': 'clinician'}, format='json')
    assert resp.status_code == 400


@pytest.mark.django_db
def test_chain_admin_moves_user_within_chain():
    chain = ChainFactory()
    home = PracticeFactory(chain=chain)
    sibling = PracticeFactory(chain=chain)
    ca = ClinicianFactory(practice=home, role='chain_admin')
    clin = ClinicianFactory(practice=home, role='clinician')
    resp = _client(ca.user).patch(_url(clin.id), {'practice_id': sibling.id}, format='json')
    assert resp.status_code == 200, resp.data
    clin.refresh_from_db()
    assert clin.practice_id == sibling.id


@pytest.mark.django_db
def test_chain_admin_cannot_move_user_outside_chain():
    chain = ChainFactory()
    home = PracticeFactory(chain=chain)
    outside = PracticeFactory(chain=ChainFactory())
    ca = ClinicianFactory(practice=home, role='chain_admin')
    clin = ClinicianFactory(practice=home, role='clinician')
    resp = _client(ca.user).patch(_url(clin.id), {'practice_id': outside.id}, format='json')
    assert resp.status_code == 400
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && python -m pytest apps/accounts/tests/test_clinician_manage.py -v`
Expected: FAIL (404/no route — `ClinicianDetailView` does not exist).

- [ ] **Step 3: Add the manage serializer**

In `backend/apps/accounts/serializers.py`, add the import near the top:

```python
from .management import manageable_roles, can_manage, is_last_active_admin
from .scoping import accessible_practice_ids
```

(If `manageable_roles` was already imported in Task 3, extend that import line rather than duplicating.)

Add after `ClinicianInviteSerializer`:

```python
class ClinicianManageSerializer(serializers.Serializer):
    """Edit a clinician's details, role, and/or practice (move). Caller provides
    `actor_user` and `target` (the Clinician) in context."""
    first_name = serializers.CharField(max_length=150, required=False)
    last_name = serializers.CharField(max_length=150, required=False)
    title = serializers.CharField(max_length=20, required=False, allow_blank=True)
    professional_registration = serializers.CharField(max_length=50, required=False, allow_blank=True)
    role = serializers.ChoiceField(choices=Clinician.ROLE_CHOICES, required=False)
    practice_id = serializers.IntegerField(required=False)

    def validate_role(self, value):
        if value not in manageable_roles(self.context['actor_user']):
            raise serializers.ValidationError('You cannot assign this role.')
        return value

    def validate_practice_id(self, value):
        scope = accessible_practice_ids(self.context['actor_user'])
        if scope is not None and value not in scope:
            raise serializers.ValidationError('That practice is outside your scope.')
        return value

    def validate(self, attrs):
        target = self.context['target']
        new_role = attrs.get('role', target.role)
        new_practice = attrs.get('practice_id', target.practice_id)
        leaving_admin = target.role == 'admin' and (
            new_role != 'admin' or new_practice != target.practice_id)
        if leaving_admin and is_last_active_admin(target):
            raise serializers.ValidationError(
                'This is the last admin of the practice; assign another admin first.')
        return attrs

    def save(self):
        target = self.context['target']
        data = self.validated_data
        user = target.user
        if 'first_name' in data:
            user.first_name = data['first_name']
        if 'last_name' in data:
            user.last_name = data['last_name']
        user.save()
        for field in ('title', 'professional_registration', 'role'):
            if field in data:
                setattr(target, field, data[field])
        if 'practice_id' in data:
            target.practice_id = data['practice_id']
        target.save()
        return target
```

- [ ] **Step 4: Add the detail view**

In `backend/apps/accounts/views.py`, add the import for the helpers and serializer (extend existing import lines):

```python
from .management import can_manage, is_last_active_admin
from .serializers import ClinicianManageSerializer  # if serializers are imported individually; otherwise it is covered by the module import
```

Add the view (near `ClinicianInviteView`):

```python
class ClinicianDetailView(generics.GenericAPIView):
    """Retrieve / edit / remove a single clinician, gated by management tier."""
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = ClinicianManageSerializer

    def _get_target(self, pk):
        return get_object_or_404(
            Clinician.objects.select_related('user', 'practice'), pk=pk)

    def get(self, request, pk):
        target = self._get_target(pk)
        scope = accessible_practice_ids(request.user)
        if scope is not None and target.practice_id not in scope:
            raise PermissionDenied()
        return Response(ClinicianSerializer(target).data)

    def patch(self, request, pk):
        target = self._get_target(pk)
        if not can_manage(request.user, target):
            raise PermissionDenied()
        serializer = self.get_serializer(
            data=request.data,
            context={'actor_user': request.user, 'target': target},
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(ClinicianSerializer(target).data)
```

- [ ] **Step 5: Route it and filter the list to active users**

In `backend/apps/accounts/urls.py`, add inside `urlpatterns` (after the invite path):

```python
    path('clinicians/<int:pk>/', views.ClinicianDetailView.as_view(), name='clinician-detail'),
```

In `backend/apps/accounts/views.py`, in `PracticeClinicianListView.get_queryset`, change the base queryset to active users only:

```python
        base = Clinician.objects.select_related('user', 'practice').filter(
            user__is_superuser=False, user__is_active=True)
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd backend && python -m pytest apps/accounts/tests/test_clinician_manage.py -v`
Expected: PASS (7 passed).

- [ ] **Step 7: Commit**

```bash
git add backend/apps/accounts/serializers.py backend/apps/accounts/views.py backend/apps/accounts/urls.py backend/apps/accounts/tests/test_clinician_manage.py
git commit -m "feat(accounts): edit and move clinicians within tier"
```

---

### Task 5: Remove (deactivate) endpoint (backend)

**Files:**
- Modify: `backend/apps/accounts/views.py` (`ClinicianDetailView.delete`)
- Test: `backend/apps/accounts/tests/test_clinician_remove.py` (create)

**Interfaces:**
- Consumes: `can_manage`, `is_last_active_admin`, `Clinician`.
- Produces: `DELETE /api/auth/clinicians/<int:pk>/` → `204`, sets `target.user.is_active = False`.

- [ ] **Step 1: Write the failing tests**

Create `backend/apps/accounts/tests/test_clinician_remove.py`:

```python
import pytest
from rest_framework.test import APIClient

from conftest import PracticeFactory, ClinicianFactory


def _client(user):
    c = APIClient()
    c.force_authenticate(user=user)
    return c


def _url(pk):
    return f'/api/auth/clinicians/{pk}/'


@pytest.mark.django_db
def test_admin_deactivates_clinician_keeps_record():
    practice = PracticeFactory()
    admin = ClinicianFactory(practice=practice, role='admin')
    clin = ClinicianFactory(practice=practice, role='clinician')
    resp = _client(admin.user).delete(_url(clin.id))
    assert resp.status_code == 204
    clin.user.refresh_from_db()
    assert clin.user.is_active is False
    clin.refresh_from_db()  # record still exists
    assert clin.pk is not None


@pytest.mark.django_db
def test_cannot_remove_last_admin():
    practice = PracticeFactory()
    admin = ClinicianFactory(practice=practice, role='admin')
    second = ClinicianFactory(practice=practice, role='admin')
    # admin removing the only OTHER admin is fine; removing the last one is blocked.
    resp_ok = _client(admin.user).delete(_url(second.id))
    assert resp_ok.status_code == 403  # admins are equal tier — cannot manage each other


@pytest.mark.django_db
def test_chain_admin_cannot_remove_last_admin_of_a_practice():
    from conftest import ChainFactory
    chain = ChainFactory()
    practice = PracticeFactory(chain=chain)
    home = PracticeFactory(chain=chain)
    ca = ClinicianFactory(practice=home, role='chain_admin')
    lone_admin = ClinicianFactory(practice=practice, role='admin')
    resp = _client(ca.user).delete(_url(lone_admin.id))
    assert resp.status_code == 400


@pytest.mark.django_db
def test_cannot_remove_out_of_scope_user():
    admin = ClinicianFactory(role='admin')
    other = ClinicianFactory(role='clinician')
    resp = _client(admin.user).delete(_url(other.id))
    assert resp.status_code == 403


@pytest.mark.django_db
def test_removed_user_drops_off_clinician_list():
    practice = PracticeFactory()
    admin = ClinicianFactory(practice=practice, role='admin')
    clin = ClinicianFactory(practice=practice, role='clinician')
    _client(admin.user).delete(_url(clin.id))
    resp = _client(admin.user).get('/api/auth/practice/clinicians/')
    ids = [c['id'] for c in resp.data['results']]
    assert clin.id not in ids
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && python -m pytest apps/accounts/tests/test_clinician_remove.py -v`
Expected: FAIL (405 Method Not Allowed — no `delete`).

- [ ] **Step 3: Implement delete (deactivate)**

In `backend/apps/accounts/views.py`, add to `ClinicianDetailView`:

```python
    def delete(self, request, pk):
        target = self._get_target(pk)
        if not can_manage(request.user, target):
            raise PermissionDenied()
        if is_last_active_admin(target):
            raise ValidationError(
                'This is the last admin of the practice; assign another admin first.')
        target.user.is_active = False
        target.user.save(update_fields=['is_active'])
        return Response(status=status.HTTP_204_NO_CONTENT)
```

Ensure `ValidationError` is available (Task 1 added `from rest_framework.exceptions import ValidationError`; confirm it is imported, else add it).

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd backend && python -m pytest apps/accounts/tests/test_clinician_remove.py -v`
Expected: PASS (5 passed).

- [ ] **Step 5: Run the full accounts suite (no regressions)**

Run: `cd backend && python -m pytest apps/accounts -q`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/apps/accounts/views.py backend/apps/accounts/tests/test_clinician_remove.py
git commit -m "feat(accounts): remove (deactivate) clinicians within tier"
```

---

### Task 6: Frontend — create-practice dialog + tiered invite

**Files:**
- Modify: `web/src/hooks/useRole.ts` (add `manageableRoles`)
- Modify: `web/src/hooks/usePractice.ts` (add `useCreatePractice`; `practice_id` on `useInviteClinician`)
- Create: `web/src/components/settings/CreatePracticeDialog.tsx`
- Modify: `web/src/app/(dashboard)/settings/page.tsx` (show CreatePracticeDialog)
- Modify: `web/src/components/settings/InviteClinicianDialog.tsx` (filtered roles + target label)
- Test: `web/src/hooks/useRole.test.ts` (create)

**Interfaces:**
- Consumes: `Me` type, `useSession`, `canSwitchPractice`, `api`, `practiceSchema`/`PracticeInput`, `Practice`.
- Produces: `manageableRoles(me) -> ClinicianRole[]`; `useCreatePractice()`; `useInviteClinician()` sends `?practice_id=` when the user can switch practice; `<CreatePracticeDialog />`.

- [ ] **Step 1: Write the failing test for `manageableRoles`**

Create `web/src/hooks/useRole.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'
import { manageableRoles } from './useRole'

const me = (role: string | null, superuser = false) => ({
  user: { is_superuser: superuser },
  clinician: role ? { role } : null,
}) as never

describe('manageableRoles', () => {
  it('superuser manages all roles', () => {
    expect(manageableRoles(me(null, true)).sort()).toEqual(
      ['admin', 'chain_admin', 'clinician', 'technician'])
  })
  it('chain admin manages admin/clinician/technician', () => {
    expect(manageableRoles(me('chain_admin')).sort()).toEqual(
      ['admin', 'clinician', 'technician'])
  })
  it('practice admin manages clinician/technician', () => {
    expect(manageableRoles(me('admin')).sort()).toEqual(['clinician', 'technician'])
  })
  it('technician manages nothing', () => {
    expect(manageableRoles(me('technician'))).toEqual([])
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd web && npm run test -- useRole`
Expected: FAIL (`manageableRoles` is not exported).

- [ ] **Step 3: Add `manageableRoles`**

In `web/src/hooks/useRole.ts`, add (it is a pure function — also export for component use):

```typescript
import type { ClinicianRole, Me } from '@shared/types/user'

// Roles the current user may assign/manage, mirroring the backend tier rules.
export function manageableRoles(me?: Me | null): ClinicianRole[] {
  if (me?.user.is_superuser) return ['chain_admin', 'admin', 'clinician', 'technician']
  const role = me?.clinician?.role
  if (role === 'chain_admin') return ['admin', 'clinician', 'technician']
  if (role === 'admin') return ['clinician', 'technician']
  return []
}
```

(Adjust the existing `import type { Me }` line to also import `ClinicianRole` if not already.)

- [ ] **Step 4: Run to verify it passes**

Run: `cd web && npm run test -- useRole`
Expected: PASS.

- [ ] **Step 5: Add `useCreatePractice` and `practice_id` to the invite hook**

In `web/src/hooks/usePractice.ts`, add at the top with the other imports:

```typescript
import type { PracticeInput } from '@/lib/schemas'
```

Replace `useInviteClinician` with:

```typescript
export function useInviteClinician() {
  const qc = useQueryClient()
  const me = useSession((s) => s.me)
  const selectedPracticeId = useSession((s) => s.selectedPracticeId)
  const suffix = canSwitchPractice(me) && selectedPracticeId ? `?practice_id=${selectedPracticeId}` : ''
  return useMutation({
    mutationFn: (data: { email: string; first_name: string; last_name: string; role: string }) =>
      api.post<ClinicianInviteResult>(`auth/practice/clinicians/invite/${suffix}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['clinicians'] }),
  })
}

export function useCreatePractice() {
  const qc = useQueryClient()
  const setSelectedPracticeId = useSession((s) => s.setSelectedPracticeId)
  return useMutation({
    mutationFn: (data: PracticeInput) => api.post<Practice>('auth/practices/', data),
    onSuccess: (created) => {
      qc.invalidateQueries({ queryKey: ['practices'] })
      setSelectedPracticeId(created.id)
      qc.invalidateQueries({ queryKey: ['practice'] })
    },
  })
}
```

- [ ] **Step 6: Create the CreatePracticeDialog**

Create `web/src/components/settings/CreatePracticeDialog.tsx`:

```tsx
'use client'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { practiceSchema, type PracticeInput } from '@/lib/schemas'
import { useCreatePractice } from '@/hooks/usePractice'

const EMPTY: PracticeInput = {
  name: '', address_line_1: '', address_line_2: '', city: '', postcode: '', phone: '', email: '',
}

export function CreatePracticeDialog() {
  const [open, setOpen] = useState(false)
  const create = useCreatePractice()
  const { register, handleSubmit, reset, watch, formState: { errors } } = useForm<PracticeInput>({
    resolver: zodResolver(practiceSchema), defaultValues: EMPTY,
  })
  const values = watch()
  const onSubmit = (data: PracticeInput) =>
    create.mutate(data, { onSuccess: () => { reset(EMPTY); setOpen(false) } })

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="bg-teal-600 hover:bg-teal-700">Create practice</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Create a practice in your chain</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
          <div>
            <Label htmlFor="cp-name">Practice name {!values.name && <span className="text-xs text-red-500">* required</span>}</Label>
            <Input id="cp-name" {...register('name')} />
            {errors.name && <p className="mt-1 text-xs text-status-severe">{errors.name.message}</p>}
          </div>
          <div>
            <Label htmlFor="cp-addr1">Address line 1 {!values.address_line_1 && <span className="text-xs text-red-500">* required</span>}</Label>
            <Input id="cp-addr1" {...register('address_line_1')} />
            {errors.address_line_1 && <p className="mt-1 text-xs text-status-severe">{errors.address_line_1.message}</p>}
          </div>
          <div>
            <Label htmlFor="cp-addr2">Address line 2</Label>
            <Input id="cp-addr2" {...register('address_line_2')} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="cp-city">City {!values.city && <span className="text-xs text-red-500">* required</span>}</Label>
              <Input id="cp-city" {...register('city')} />
              {errors.city && <p className="mt-1 text-xs text-status-severe">{errors.city.message}</p>}
            </div>
            <div>
              <Label htmlFor="cp-postcode">Postcode {!values.postcode && <span className="text-xs text-red-500">* required</span>}</Label>
              <Input id="cp-postcode" {...register('postcode')} />
              {errors.postcode && <p className="mt-1 text-xs text-status-severe">{errors.postcode.message}</p>}
            </div>
          </div>
          <div>
            <Label htmlFor="cp-phone">Phone</Label>
            <Input id="cp-phone" type="tel" {...register('phone')} />
          </div>
          <div>
            <Label htmlFor="cp-email">Email</Label>
            <Input id="cp-email" type="email" {...register('email')} />
            {errors.email && <p className="mt-1 text-xs text-status-severe">{errors.email.message}</p>}
          </div>
          {create.isError && <p className="text-xs text-status-severe">Could not create practice. Please try again.</p>}
          <Button type="submit" className="w-full bg-teal-600 hover:bg-teal-700" disabled={create.isPending}>
            {create.isPending ? 'Creating…' : 'Create practice'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 7: Show the dialog in Settings**

In `web/src/app/(dashboard)/settings/page.tsx`, add imports:

```tsx
import { useMe } from '@/hooks/useAuth'
import { canSwitchPractice } from '@/hooks/useRole'
import { CreatePracticeDialog } from '@/components/settings/CreatePracticeDialog'
```

After `const isAdmin = useIsAdmin()`:

```tsx
  const { data: me } = useMe()
  const canCreatePractice = canSwitchPractice(me)  // superusers + chain admins
```

Add after the practice-details `Card`:

```tsx
      {canCreatePractice && (
        <Card className="flex items-center justify-between p-5">
          <div>
            <span className="font-semibold">Practices</span>
            <p className="text-xs text-muted-foreground">Create a new practice in your chain.</p>
          </div>
          <CreatePracticeDialog />
        </Card>
      )}
```

- [ ] **Step 8: Filter invite roles and show the target practice**

In `web/src/components/settings/InviteClinicianDialog.tsx`, add imports:

```tsx
import { useMe } from '@/hooks/useAuth'
import { usePractice } from '@/hooks/usePractice'
import { manageableRoles, canSwitchPractice } from '@/hooks/useRole'

const ROLE_LABELS: Record<string, string> = {
  admin: 'Practice Admin', clinician: 'Clinician', technician: 'Technician',
}
```

Inside the component, after `const invite = useInviteClinician()`:

```tsx
  const { data: me } = useMe()
  const roles = manageableRoles(me).filter((r) => r !== 'chain_admin')
  const { data: selectedPractice } = usePractice()
  const showTarget = canSwitchPractice(me)
```

Set the form default role to the first allowed role:

```tsx
  const { register, handleSubmit, reset, watch } = useForm<InviteInput>({
    resolver: zodResolver(inviteSchema), defaultValues: { role: roles[0] ?? 'clinician' },
  })
```

Replace the role `<div>` block (`<Label htmlFor="irole">` … `</select></div>`) with:

```tsx
            {showTarget && (
              <p className="text-xs text-muted-foreground">
                Inviting to: <span className="font-medium">{selectedPractice?.name ?? '…'}</span>
              </p>
            )}
            <div>
              <Label htmlFor="irole">Role</Label>
              <select id="irole" {...register('role')} className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm text-foreground">
                {roles.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
              </select>
            </div>
```

- [ ] **Step 9: Typecheck, build, and run the web suite**

Run: `cd web && npx tsc --noEmit && npm run build && npm run test`
Expected: no type errors; build succeeds; all tests pass (including the new `useRole` test).

- [ ] **Step 10: Commit**

```bash
git add web/src/hooks/useRole.ts web/src/hooks/useRole.test.ts web/src/hooks/usePractice.ts web/src/components/settings/CreatePracticeDialog.tsx "web/src/app/(dashboard)/settings/page.tsx" web/src/components/settings/InviteClinicianDialog.tsx
git commit -m "feat(web): create-practice dialog + tier-filtered invites"
```

---

### Task 7: Frontend — manage clinicians (edit / move / remove)

**Files:**
- Modify: `web/src/hooks/usePractice.ts` (add `useUpdateClinician`, `useRemoveClinician`)
- Create: `web/src/components/settings/ManageClinicianDialog.tsx`
- Modify: `web/src/components/settings/ClinicianTable.tsx` (per-row Edit/Remove action)
- Test: `web/src/components/settings/ManageClinicianDialog.test.tsx` (create)

**Interfaces:**
- Consumes: `useUpdateClinician(id)`, `useRemoveClinician(id)`, `manageableRoles`, `usePractices`, `useMe`, `Clinician` type, `canSwitchPractice`.
- Produces: a per-row Edit dialog (details + role + move) and Remove action on the clinicians page.

- [ ] **Step 1: Add the mutation hooks**

In `web/src/hooks/usePractice.ts`, add:

```typescript
export function useUpdateClinician(id: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      api.patch<Clinician>(`auth/clinicians/${id}/`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['clinicians'] }),
  })
}

export function useRemoveClinician(id: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => api.delete(`auth/clinicians/${id}/`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['clinicians'] }),
  })
}
```

(If `api.delete` does not exist, check `web/src/lib/api.ts` for the delete helper name and use it; add a `delete` method there following the existing `post`/`patch` pattern if missing — this is the only acceptable extension outside the listed files, and include it in the commit.)

- [ ] **Step 2: Write the failing test for ManageClinicianDialog**

Create `web/src/components/settings/ManageClinicianDialog.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ManageClinicianDialog } from './ManageClinicianDialog'

vi.mock('@/hooks/usePractice', () => ({
  useUpdateClinician: () => ({ mutate: vi.fn(), isPending: false }),
  useRemoveClinician: () => ({ mutate: vi.fn(), isPending: false }),
  usePractices: () => ({ data: [{ id: 1, name: 'Home' }, { id: 2, name: 'Sibling' }] }),
}))
vi.mock('@/hooks/useAuth', () => ({
  useMe: () => ({ data: { user: { is_superuser: false }, clinician: { role: 'chain_admin' } } }),
}))

const clinician = {
  id: 9, role: 'clinician', title: '', professional_registration: '',
  user: { first_name: 'Jo', last_name: 'Bloggs', email: 'jo@x.com' },
  practice: { id: 1, name: 'Home' },
} as never

describe('ManageClinicianDialog (chain admin)', () => {
  it('offers manageable roles and the move dropdown', async () => {
    render(<ManageClinicianDialog clinician={clinician} />)
    await userEvent.click(screen.getByRole('button', { name: /edit/i }))
    // role options limited to admin/clinician/technician (no chain_admin)
    expect(screen.getByRole('option', { name: 'Practice Admin' })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'Chain Admin' })).not.toBeInTheDocument()
    // move dropdown lists the chain's practices
    expect(screen.getByRole('option', { name: 'Sibling' })).toBeInTheDocument()
  })
})
```

- [ ] **Step 3: Run to verify it fails**

Run: `cd web && npm run test -- ManageClinicianDialog`
Expected: FAIL (component does not exist).

- [ ] **Step 4: Create ManageClinicianDialog**

Create `web/src/components/settings/ManageClinicianDialog.tsx`:

```tsx
'use client'
import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useUpdateClinician, useRemoveClinician, usePractices } from '@/hooks/usePractice'
import { useMe } from '@/hooks/useAuth'
import { manageableRoles, canSwitchPractice } from '@/hooks/useRole'
import type { Clinician } from '@shared/types/user'

const ROLE_LABELS: Record<string, string> = {
  admin: 'Practice Admin', clinician: 'Clinician', technician: 'Technician',
}

export function ManageClinicianDialog({ clinician }: { clinician: Clinician }) {
  const [open, setOpen] = useState(false)
  const { data: me } = useMe()
  const update = useUpdateClinician(clinician.id)
  const remove = useRemoveClinician(clinician.id)
  const { data: practices } = usePractices()
  const roles = manageableRoles(me).filter((r) => r !== 'chain_admin')
  const canMove = canSwitchPractice(me)

  const [firstName, setFirstName] = useState(clinician.user.first_name)
  const [lastName, setLastName] = useState(clinician.user.last_name)
  const [role, setRole] = useState(clinician.role)
  const [practiceId, setPracticeId] = useState(clinician.practice.id)

  const onSave = () => {
    const data: Record<string, unknown> = {
      first_name: firstName, last_name: lastName, role,
    }
    if (canMove && practiceId !== clinician.practice.id) data.practice_id = practiceId
    update.mutate(data, { onSuccess: () => setOpen(false) })
  }

  const onRemove = () => {
    if (confirm(`Remove ${clinician.user.first_name} ${clinician.user.last_name}?`)) {
      remove.mutate(undefined, { onSuccess: () => setOpen(false) })
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">Edit</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Manage {clinician.user.first_name} {clinician.user.last_name}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="mc-fn">First name</Label>
              <Input id="mc-fn" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="mc-ln">Last name</Label>
              <Input id="mc-ln" value={lastName} onChange={(e) => setLastName(e.target.value)} />
            </div>
          </div>
          <div>
            <Label htmlFor="mc-role">Role</Label>
            <select id="mc-role" value={role} onChange={(e) => setRole(e.target.value as Clinician['role'])}
                    className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm text-foreground">
              {roles.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
            </select>
          </div>
          {canMove && (
            <div>
              <Label htmlFor="mc-practice">Practice</Label>
              <select id="mc-practice" value={practiceId} onChange={(e) => setPracticeId(Number(e.target.value))}
                      className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm text-foreground">
                {practices?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          )}
          {(update.isError || remove.isError) && <p className="text-xs text-status-severe">Action failed. Please try again.</p>}
          <div className="flex items-center justify-between pt-1">
            <Button variant="outline" size="sm" className="text-status-severe" onClick={onRemove} disabled={remove.isPending}>Remove</Button>
            <Button className="bg-teal-600 hover:bg-teal-700" onClick={onSave} disabled={update.isPending}>
              {update.isPending ? 'Saving…' : 'Save changes'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `cd web && npm run test -- ManageClinicianDialog`
Expected: PASS.

- [ ] **Step 6: Wire a per-row action into ClinicianTable**

Replace `web/src/components/settings/ClinicianTable.tsx` with (adds an actions column that renders the dialog only on manageable rows):

```tsx
'use client'
import { useClinicians } from '@/hooks/usePractice'
import { useMe } from '@/hooks/useAuth'
import { manageableRoles } from '@/hooks/useRole'
import { ManageClinicianDialog } from '@/components/settings/ManageClinicianDialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { LoadingState } from '@/components/common/LoadingState'

export function ClinicianTable() {
  const { data, isLoading } = useClinicians()
  const { data: me } = useMe()
  const roles = manageableRoles(me)
  if (isLoading) return <LoadingState rows={3} />
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead><TableHead>Role</TableHead><TableHead>Email</TableHead><TableHead className="w-16" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {(data?.results ?? []).map((c) => {
          const canManage = roles.includes(c.role) && c.user.email !== me?.user.email
          return (
            <TableRow key={c.id}>
              <TableCell>{c.title} {c.user.first_name} {c.user.last_name}</TableCell>
              <TableCell className="capitalize">{c.role}</TableCell>
              <TableCell>{c.user.email}</TableCell>
              <TableCell className="text-right">
                {canManage && <ManageClinicianDialog clinician={c} />}
              </TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}
```

- [ ] **Step 7: Typecheck, build, and full web suite**

Run: `cd web && npx tsc --noEmit && npm run build && npm run test`
Expected: no type errors; build succeeds; all tests pass.

- [ ] **Step 8: Commit**

```bash
git add web/src/hooks/usePractice.ts web/src/components/settings/ManageClinicianDialog.tsx web/src/components/settings/ManageClinicianDialog.test.tsx web/src/components/settings/ClinicianTable.tsx web/src/lib/api.ts
git commit -m "feat(web): manage clinicians — edit, move, remove"
```

---

## Final verification

- [ ] Backend full suite: `cd backend && python -m pytest -q` → PASS.
- [ ] Web: `cd web && npx tsc --noEmit && npm run test && npm run build` → all green.
- [ ] Manual smoke (optional): as a chain admin — create a practice (auto-selected in header); invite a practice admin / clinician / technician to it; edit a clinician and move them to a sibling practice; remove a clinician and confirm they drop off the list; confirm you cannot remove the last admin of a practice.
