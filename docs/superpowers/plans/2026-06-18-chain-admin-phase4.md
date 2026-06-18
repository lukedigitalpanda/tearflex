# Chain-admin Phase 4 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let chain admins create new practices in their own chain and invite practice admins (admin role only) to any practice in their chain, from the web app.

**Architecture:** Backend adds a create action to the existing practice-list endpoint (chain force-set server-side) and teaches the invite endpoint to target an in-scope practice with a chain-admin admin-only role lock. Frontend adds a CreatePracticeDialog (auto-selecting the new practice in the header) and a chain-admin variant of the invite dialog. All practice/chain scoping reuses the existing `apps.accounts.scoping` helpers.

**Tech Stack:** Django 5 + DRF, pytest (backend); Next.js 14, React Hook Form + Zod, TanStack Query, Zustand, vitest + @testing-library/react (web).

## Global Constraints

- Practice scoping is security-critical: every practice/chain decision goes through `apps.accounts.scoping` (`accessible_practice_ids`, `resolve_practice_scope`) — never inline `is_superuser`/role checks in views.
- A chain admin's chain is `clinician.practice.chain`. A chain admin whose home practice has no chain cannot create practices.
- `chain_admin` is never an invitable role for anyone (superadmin-appointed via Django admin only).
- Backend endpoints live under `/api/auth/...` (e.g. `auth/practices/`, `auth/practice/clinicians/invite/`).
- Run backend tests from the `backend/` dir; tests import factories via `from conftest import ...`.
- Run web tests/typecheck/build from the `web/` dir.

---

### Task 1: Create-practice endpoint (backend)

**Files:**
- Modify: `backend/apps/accounts/permissions.py` (add `IsChainAdminOrSuperuser`)
- Modify: `backend/apps/accounts/serializers.py` (add `PracticeCreateSerializer`)
- Modify: `backend/apps/accounts/views.py` (`PracticeListView` → `ListCreateAPIView`)
- Test: `backend/apps/accounts/tests/test_practice_create.py` (create)

**Interfaces:**
- Consumes: `accessible_practice_ids` (already imported in `views.py`), `Practice`, `Chain` models, `conftest` factories `ChainFactory`, `PracticeFactory`, `ClinicianFactory`.
- Produces: `POST /api/auth/practices/` accepting `{name, address_line_1, address_line_2, phone, email, city, postcode}`, returning `201` with `{id, name, address_line_1, address_line_2, city, postcode, phone, email}`. Chain force-set to creator's chain (chain admin) or none (superuser). Permission class `IsChainAdminOrSuperuser`.

- [ ] **Step 1: Write the failing tests**

Create `backend/apps/accounts/tests/test_practice_create.py`:

```python
import pytest
from rest_framework.test import APIClient
from django.contrib.auth.models import User

from apps.accounts.models import Practice
from conftest import ChainFactory, PracticeFactory, ClinicianFactory

URL = '/api/auth/practices/'


def _client(user):
    c = APIClient()
    c.force_authenticate(user=user)
    return c


@pytest.mark.django_db
def test_chain_admin_creates_practice_joined_to_their_chain():
    chain = ChainFactory()
    home = PracticeFactory(chain=chain)
    admin = ClinicianFactory(practice=home, role='chain_admin')
    resp = _client(admin.user).post(URL, {
        'name': 'New Branch', 'address_line_1': '2 High St',
        'city': 'Leeds', 'postcode': 'LS1 1AA',
    }, format='json')
    assert resp.status_code == 201, resp.data
    created = Practice.objects.get(id=resp.data['id'])
    assert created.chain_id == chain.id
    assert created.name == 'New Branch'


@pytest.mark.django_db
def test_chain_admin_supplied_chain_is_ignored():
    chain = ChainFactory()
    other = ChainFactory()
    home = PracticeFactory(chain=chain)
    admin = ClinicianFactory(practice=home, role='chain_admin')
    resp = _client(admin.user).post(URL, {
        'name': 'B', 'address_line_1': 'x', 'city': 'y', 'postcode': 'z',
        'chain': other.id,
    }, format='json')
    assert resp.status_code == 201
    assert Practice.objects.get(id=resp.data['id']).chain_id == chain.id


@pytest.mark.django_db
def test_chain_admin_without_chain_cannot_create():
    admin = ClinicianFactory(role='chain_admin')  # home practice has no chain
    resp = _client(admin.user).post(URL, {
        'name': 'B', 'address_line_1': 'x', 'city': 'y', 'postcode': 'z',
    }, format='json')
    assert resp.status_code == 400


@pytest.mark.django_db
def test_practice_admin_cannot_create():
    admin = ClinicianFactory(role='admin')
    resp = _client(admin.user).post(URL, {
        'name': 'B', 'address_line_1': 'x', 'city': 'y', 'postcode': 'z',
    }, format='json')
    assert resp.status_code == 403


@pytest.mark.django_db
def test_superuser_can_create_practice():
    su = User.objects.create_superuser('su', 'su@x.com', 'pw')
    resp = _client(su).post(URL, {
        'name': 'B', 'address_line_1': 'x', 'city': 'y', 'postcode': 'z',
    }, format='json')
    assert resp.status_code == 201
    assert Practice.objects.get(id=resp.data['id']).chain_id is None


@pytest.mark.django_db
def test_list_still_works_for_practice_admin():
    admin = ClinicianFactory(role='admin')
    resp = _client(admin.user).get(URL)
    assert resp.status_code == 200
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && python -m pytest apps/accounts/tests/test_practice_create.py -v`
Expected: FAIL (405 Method Not Allowed on POST / missing `IsChainAdminOrSuperuser`).

- [ ] **Step 3: Add the permission class**

Append to `backend/apps/accounts/permissions.py`:

```python
class IsChainAdminOrSuperuser(permissions.BasePermission):
    """Allow superusers and chain-admin clinicians (used to gate practice creation)."""
    message = 'Chain admin or superuser required.'

    def has_permission(self, request, view):
        if request.user and request.user.is_superuser:
            return True
        clinician = getattr(request.user, 'clinician', None)
        return bool(clinician and clinician.role == 'chain_admin')
```

- [ ] **Step 4: Add the create serializer**

In `backend/apps/accounts/serializers.py`, after `PracticeSerializer`:

```python
class PracticeCreateSerializer(serializers.ModelSerializer):
    """Write-only practice creation. `chain` is set by the view, not the client."""
    class Meta:
        model = Practice
        fields = [
            'id', 'name', 'address_line_1', 'address_line_2', 'city',
            'postcode', 'phone', 'email',
        ]
        read_only_fields = ['id']
```

- [ ] **Step 5: Extend the view to support creation**

In `backend/apps/accounts/views.py`, update imports and `PracticeListView`. Add `PracticeCreateSerializer` to the serializer import and `IsChainAdminOrSuperuser` to the permissions import, then replace the class:

```python
class PracticeListView(generics.ListCreateAPIView):
    """List the practices the user may switch between (all for superadmins, the
    chain's practices for chain admins; pagination disabled for dropdown use).
    POST creates a practice (chain admins → force-joined to their chain;
    superusers → no chain)."""
    permission_classes = [permissions.IsAuthenticated]
    pagination_class = None

    def get_serializer_class(self):
        if self.request.method == 'POST':
            return PracticeCreateSerializer
        return PracticeSerializer

    def get_permissions(self):
        if self.request.method == 'POST':
            return [permissions.IsAuthenticated(), IsChainAdminOrSuperuser()]
        return [permissions.IsAuthenticated()]

    def get_queryset(self):
        qs = Practice.objects.filter(is_active=True).order_by('name')
        scope = accessible_practice_ids(self.request.user)
        if scope is None:
            return qs
        return qs.filter(id__in=scope)

    def perform_create(self, serializer):
        user = self.request.user
        if user.is_superuser:
            serializer.save()
            return
        chain = user.clinician.practice.chain
        if chain is None:
            raise serializers.ValidationError(
                'Your practice is not part of a chain, so you cannot create practices.'
            )
        serializer.save(chain=chain)
```

Ensure `from rest_framework import serializers` (or the existing serializers import) is present in `views.py` for `serializers.ValidationError`; if not, add `from rest_framework.exceptions import ValidationError` and use `ValidationError(...)`.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd backend && python -m pytest apps/accounts/tests/test_practice_create.py -v`
Expected: PASS (6 passed).

- [ ] **Step 7: Run the full accounts suite (no regressions)**

Run: `cd backend && python -m pytest apps/accounts -q`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add backend/apps/accounts/permissions.py backend/apps/accounts/serializers.py backend/apps/accounts/views.py backend/apps/accounts/tests/test_practice_create.py
git commit -m "feat(accounts): chain admins can create practices in their chain"
```

---

### Task 2: Chain-scoped invite with admin-only role lock (backend)

**Files:**
- Modify: `backend/apps/accounts/serializers.py` (`ClinicianInviteSerializer.validate`)
- Modify: `backend/apps/accounts/views.py` (`ClinicianInviteView.post`)
- Test: `backend/apps/accounts/tests/test_invite_chain.py` (create)

**Interfaces:**
- Consumes: `resolve_practice_scope` (already imported in `views.py`), `IsPracticeAdmin`, `Practice`, `get_object_or_404`, `PermissionDenied`.
- Produces: `POST /api/auth/practice/clinicians/invite/?practice_id=<id>` — targets the requested practice only if in the inviter's scope (else 403); no param → inviter's own practice. Serializer rejects `role='chain_admin'` for everyone and restricts chain-admin inviters to `role='admin'`.

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
    assert new.practice_id == sibling.id
    assert new.role == 'admin'


@pytest.mark.django_db
def test_chain_admin_cannot_invite_clinician_role():
    chain = ChainFactory()
    home = PracticeFactory(chain=chain)
    admin = ClinicianFactory(practice=home, role='chain_admin')
    resp = _client(admin.user).post(URL, _payload('a@x.com', 'clinician'), format='json')
    assert resp.status_code == 400


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
Expected: FAIL (current view ignores `practice_id` and has no role lock).

- [ ] **Step 3: Add role validation to the serializer**

In `backend/apps/accounts/serializers.py`, add a `validate` method to `ClinicianInviteSerializer` (after `validate_email`):

```python
    def validate(self, attrs):
        role = attrs.get('role', 'clinician')
        if role == 'chain_admin':
            raise serializers.ValidationError(
                {'role': 'Chain admins are appointed by a superadmin, not invited.'})
        if self.context.get('inviter_role') == 'chain_admin' and role != 'admin':
            raise serializers.ValidationError(
                {'role': 'Chain admins may only invite practice admins.'})
        return attrs
```

- [ ] **Step 4: Resolve target practice in the view**

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
            context={'practice': practice, 'invited_by': inviter, 'inviter_role': inviter.role},
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

(`resolve_practice_scope`, `PermissionDenied`, and `get_object_or_404` are already imported in `views.py` — used by `PracticeView`. Verify with `grep -n "resolve_practice_scope\|PermissionDenied\|get_object_or_404" apps/accounts/views.py`.)

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd backend && python -m pytest apps/accounts/tests/test_invite_chain.py -v`
Expected: PASS (5 passed).

- [ ] **Step 6: Run the existing invite + full accounts suite (no regressions)**

Run: `cd backend && python -m pytest apps/accounts/tests/test_invite_view.py apps/accounts -q`
Expected: PASS (existing `test_admin_can_invite...` and `test_non_admin_cannot_invite` still green).

- [ ] **Step 7: Commit**

```bash
git add backend/apps/accounts/serializers.py backend/apps/accounts/views.py backend/apps/accounts/tests/test_invite_chain.py
git commit -m "feat(accounts): chain-scoped admin-only clinician invites"
```

---

### Task 3: Create-practice dialog + invite practice_id wiring (web)

**Files:**
- Modify: `web/src/hooks/usePractice.ts` (add `useCreatePractice`; add `practice_id` to `useInviteClinician`)
- Create: `web/src/components/settings/CreatePracticeDialog.tsx`
- Modify: `web/src/app/(dashboard)/settings/page.tsx` (show the dialog to chain admins/superusers)

**Interfaces:**
- Consumes: `practiceSchema`/`PracticeInput` from `@/lib/schemas`, `canSwitchPractice` from `@/hooks/useRole`, `useSession` store (`setSelectedPracticeId`), `api`, `Practice` type.
- Produces: `useCreatePractice()` mutation (`PracticeInput → Practice`, auto-selects new practice); `useInviteClinician()` now appends `?practice_id=` when the user can switch practice; `<CreatePracticeDialog />`.

- [ ] **Step 1: Add `useCreatePractice` and practice_id to invite hook**

In `web/src/hooks/usePractice.ts`, add an import at the top alongside the existing imports:

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
```

Add a new hook below it:

```typescript
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

- [ ] **Step 2: Create the CreatePracticeDialog**

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

- [ ] **Step 3: Show the dialog in Settings for chain admins/superusers**

In `web/src/app/(dashboard)/settings/page.tsx`, add imports:

```tsx
import { useMe } from '@/hooks/useAuth'
import { canSwitchPractice } from '@/hooks/useRole'
import { CreatePracticeDialog } from '@/components/settings/CreatePracticeDialog'
```

Inside the component, after `const isAdmin = useIsAdmin()`:

```tsx
  const { data: me } = useMe()
  const canCreatePractice = canSwitchPractice(me)  // superusers + chain admins
```

Add this card immediately after the practice details `Card` (before the thresholds card):

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

- [ ] **Step 4: Typecheck and build**

Run: `cd web && npx tsc --noEmit && npm run build`
Expected: no type errors; build succeeds.

- [ ] **Step 5: Run the web test suite (no regressions)**

Run: `cd web && npm run test`
Expected: PASS (existing suite green).

- [ ] **Step 6: Commit**

```bash
git add web/src/hooks/usePractice.ts web/src/components/settings/CreatePracticeDialog.tsx "web/src/app/(dashboard)/settings/page.tsx"
git commit -m "feat(web): create-practice dialog + chain-scoped invite target"
```

---

### Task 4: Chain-admin variant of the invite dialog (web)

**Files:**
- Modify: `web/src/components/settings/InviteClinicianDialog.tsx`
- Test: `web/src/components/settings/InviteClinicianDialog.test.tsx` (create)

**Interfaces:**
- Consumes: `useSession` (`me`), `usePractice` (selected practice for the label), `useInviteClinician`.
- Produces: when the current user's role is `chain_admin`, the role select is replaced by a fixed "Practice Admin" label, the dialog shows "Inviting admin to: <selected practice name>", and submitted `role` is `'admin'`.

- [ ] **Step 1: Write the failing test**

Create `web/src/components/settings/InviteClinicianDialog.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { InviteClinicianDialog } from './InviteClinicianDialog'

vi.mock('@/hooks/usePractice', () => ({
  useInviteClinician: () => ({ mutate: vi.fn(), isPending: false, isError: false }),
  usePractice: () => ({ data: { id: 7, name: 'Specsavers — Oxford St' } }),
}))

const mockState = {
  me: { user: { is_superuser: false }, clinician: { role: 'chain_admin' } },
}
vi.mock('@/store/session', () => ({
  useSession: (sel: (s: typeof mockState) => unknown) => sel(mockState),
}))

describe('InviteClinicianDialog (chain admin)', () => {
  it('locks role to Practice Admin and names the selected practice', () => {
    render(<InviteClinicianDialog />)
    // Trigger button opens an always-mounted Radix dialog in jsdom via portal;
    // assert the chain-admin-only copy is present in the rendered tree.
    expect(screen.getByText(/Inviting admin to/i)).toBeInTheDocument()
    expect(screen.getByText(/Specsavers — Oxford St/)).toBeInTheDocument()
    // The role <select> must NOT be rendered for chain admins.
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
  })
})
```

Note: the dialog's form is inside `DialogContent`. To make the form assertable without a click, this task also renders the chain-admin notice/role region unconditionally inside `DialogContent` (the content is portalled but mounted). If `DialogContent` is not mounted until open in this UI lib, change the test to open it first:

```tsx
import userEvent from '@testing-library/user-event'
// inside the test, before assertions:
await userEvent.click(screen.getByRole('button', { name: /invite clinician/i }))
```

Use whichever form matches the existing dialog behaviour (check `LoginPage`/other dialog tests for the project's convention); keep the three assertions identical.

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd web && npm run test -- InviteClinicianDialog`
Expected: FAIL (no "Inviting admin to" text; role combobox present).

- [ ] **Step 3: Implement the chain-admin variant**

In `web/src/components/settings/InviteClinicianDialog.tsx`, add imports:

```tsx
import { useSession } from '@/store/session'
import { usePractice } from '@/hooks/usePractice'
```

Inside the component, after `const invite = useInviteClinician()`:

```tsx
  const me = useSession((s) => s.me)
  const isChainAdmin = me?.clinician?.role === 'chain_admin'
  const { data: selectedPractice } = usePractice()
```

Change the form's `defaultValues` so chain admins default to `admin`:

```tsx
  const { register, handleSubmit, reset, watch } = useForm<InviteInput>({
    resolver: zodResolver(inviteSchema),
    defaultValues: { role: isChainAdmin ? 'admin' : 'clinician' },
  })
```

Replace the role `<div>` block (the `<Label htmlFor="irole">` … `</select></div>`) with:

```tsx
            {isChainAdmin ? (
              <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
                <p className="font-medium">Role: Practice Admin</p>
                <p className="text-muted-foreground">
                  Inviting admin to: {selectedPractice?.name ?? '…'}
                </p>
              </div>
            ) : (
              <div>
                <Label htmlFor="irole">Role</Label>
                <select id="irole" {...register('role')} className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm text-foreground">
                  <option value="clinician">Clinician</option>
                  <option value="technician">Technician</option>
                  <option value="admin">Practice Admin</option>
                </select>
              </div>
            )}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd web && npm run test -- InviteClinicianDialog`
Expected: PASS.

- [ ] **Step 5: Typecheck, build, and full web suite**

Run: `cd web && npx tsc --noEmit && npm run build && npm run test`
Expected: no type errors; build succeeds; all tests pass.

- [ ] **Step 6: Commit**

```bash
git add web/src/components/settings/InviteClinicianDialog.tsx web/src/components/settings/InviteClinicianDialog.test.tsx
git commit -m "feat(web): chain-admin invite dialog locks role to practice admin"
```

---

## Final verification

- [ ] Backend full suite: `cd backend && python -m pytest -q` → PASS.
- [ ] Web: `cd web && npx tsc --noEmit && npm run test && npm run build` → all green.
- [ ] Manual smoke (optional): as a chain admin, Settings → Create practice → new practice auto-selected in header → Invite clinician shows "Practice Admin" + the new practice name → invite succeeds and creates an inactive admin in that practice.
