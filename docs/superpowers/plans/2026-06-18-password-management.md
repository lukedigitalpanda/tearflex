# Password Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let logged-in users change their own password, and let admins reset the password of any user they manage via a copyable one-time link.

**Architecture:** Two thin authenticated endpoints over existing infrastructure — a change-password endpoint (verify current, set new) and an admin reset-password endpoint that mints a `PasswordResetToken` (reused from the existing forgot-password flow) gated by the Phase 4 `can_manage` helper and returns a `/reset-password?token=…` link. The frontend adds a Settings change-password card and a Reset-password action in the existing manage-clinician dialog.

**Tech Stack:** Django 5 + DRF, pytest (backend); Next.js 14, React Hook Form + Zod, TanStack Query, vitest + @testing-library/react (web).

## Global Constraints

- Permission rule: you may set a password for a target if the target is yourself (change-password endpoint) OR `can_manage(you, target)` is true (admin reset endpoint). Authorization reuses `apps/accounts/management.can_manage` — no new auth logic.
- New password minimum length is 8 (matches the existing register/reset serializers).
- Admin reset reuses the existing `PasswordResetToken` model and the existing `/reset-password?token=` page + `password-reset/confirm/` endpoint — do NOT build a new token type or consume page.
- Minting a reset link must NOT change the target's current password; it changes only when the target uses the link.
- Resetting your own password via the admin endpoint is denied (403) — self uses the change-password form (`can_manage(self) == False` already gives this).
- Authenticated frontend calls use the `api` client (`api.post('auth/...')`), NOT the Next.js `/api/auth/*` proxy routes (those serve the logged-out forgot/reset flow only).
- Backend endpoints under `/api/auth/...`. Backend tests run from `backend/`; tests import factories via `from conftest import ...`. Web tests/typecheck/build run from `web/`.
- Local Python has no Postgres — run backend pytest inside the running backend container (find name via `docker ps`, e.g. `tearflex-backend-1`): `docker cp` changed `.py` files into `/app/apps/accounts/...`, then `docker exec <container> python -m pytest <path> -v`. Create/commit the real repo files regardless.
- Stage only the files each task names — the working tree has unrelated in-progress changes.

---

### Task 1: Change-password endpoint (backend)

**Files:**
- Modify: `backend/apps/accounts/serializers.py` (add `ChangePasswordSerializer`)
- Modify: `backend/apps/accounts/views.py` (add `ChangePasswordView`)
- Modify: `backend/apps/accounts/urls.py` (route)
- Test: `backend/apps/accounts/tests/test_change_password.py` (create)

**Interfaces:**
- Produces: `POST /api/auth/password/change/` — `IsAuthenticated`, body `{current_password, new_password}`, returns `204` on success, `400` on wrong current password.

- [ ] **Step 1: Write the failing tests**

Create `backend/apps/accounts/tests/test_change_password.py`:

```python
import pytest
from rest_framework.test import APIClient

from conftest import ClinicianFactory

URL = '/api/auth/password/change/'


def _auth_client(user):
    c = APIClient()
    c.force_authenticate(user=user)
    return c


@pytest.mark.django_db
def test_change_password_with_correct_current():
    clin = ClinicianFactory(role='clinician')
    clin.user.set_password('oldpass123')
    clin.user.save()
    resp = _auth_client(clin.user).post(
        URL, {'current_password': 'oldpass123', 'new_password': 'newpass456'}, format='json')
    assert resp.status_code == 204, resp.data
    clin.user.refresh_from_db()
    assert clin.user.check_password('newpass456') is True
    assert clin.user.check_password('oldpass123') is False


@pytest.mark.django_db
def test_change_password_wrong_current_rejected():
    clin = ClinicianFactory(role='clinician')
    clin.user.set_password('oldpass123')
    clin.user.save()
    resp = _auth_client(clin.user).post(
        URL, {'current_password': 'WRONG', 'new_password': 'newpass456'}, format='json')
    assert resp.status_code == 400
    clin.user.refresh_from_db()
    assert clin.user.check_password('oldpass123') is True


@pytest.mark.django_db
def test_change_password_too_short_rejected():
    clin = ClinicianFactory(role='clinician')
    clin.user.set_password('oldpass123')
    clin.user.save()
    resp = _auth_client(clin.user).post(
        URL, {'current_password': 'oldpass123', 'new_password': 'short'}, format='json')
    assert resp.status_code == 400


@pytest.mark.django_db
def test_change_password_requires_auth():
    resp = APIClient().post(
        URL, {'current_password': 'x', 'new_password': 'newpass456'}, format='json')
    assert resp.status_code == 401
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && python -m pytest apps/accounts/tests/test_change_password.py -v` (via the container per Global Constraints)
Expected: FAIL (404 — route does not exist).

- [ ] **Step 3: Add the serializer**

In `backend/apps/accounts/serializers.py`, add after `PasswordResetConfirmSerializer`:

```python
class ChangePasswordSerializer(serializers.Serializer):
    """Authenticated self-service password change. Requires the current password."""
    current_password = serializers.CharField(write_only=True)
    new_password = serializers.CharField(write_only=True, min_length=8)

    def validate_current_password(self, value):
        user = self.context['request'].user
        if not user.check_password(value):
            raise serializers.ValidationError('Current password is incorrect.')
        return value

    def save(self):
        user = self.context['request'].user
        user.set_password(self.validated_data['new_password'])
        user.save()
        return user
```

- [ ] **Step 4: Add the view**

In `backend/apps/accounts/views.py`, add (near the password-reset views):

```python
class ChangePasswordView(generics.GenericAPIView):
    """Authenticated user changes their own password."""
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = ChangePasswordSerializer

    def post(self, request):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(status=status.HTTP_204_NO_CONTENT)
```

(`get_serializer` injects `{'request': request}` into the serializer context by default via DRF's `GenericAPIView.get_serializer_context`, so the serializer's `self.context['request']` resolves. Confirm `ChangePasswordSerializer` is importable in `views.py` — if serializers are imported individually rather than by module, add it to that import list.)

- [ ] **Step 5: Route it**

In `backend/apps/accounts/urls.py`, add to `urlpatterns` (after the `password-reset/confirm/` path):

```python
    path('password/change/', views.ChangePasswordView.as_view(), name='password-change'),
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd backend && python -m pytest apps/accounts/tests/test_change_password.py -v`
Expected: PASS (4 passed). If `test_change_password_requires_auth` returns 403 instead of 401 in this project's auth config, that is an acceptable equivalent — but with JWT auth it should be 401; investigate only if it differs.

- [ ] **Step 7: Commit**

```bash
git add backend/apps/accounts/serializers.py backend/apps/accounts/views.py backend/apps/accounts/urls.py backend/apps/accounts/tests/test_change_password.py
git commit -m "feat(accounts): self-service change password endpoint"
```

---

### Task 2: Admin reset-password endpoint (backend)

**Files:**
- Modify: `backend/apps/accounts/views.py` (add `ClinicianResetPasswordView`)
- Modify: `backend/apps/accounts/urls.py` (route)
- Test: `backend/apps/accounts/tests/test_clinician_reset_password.py` (create)

**Interfaces:**
- Consumes: `can_manage` from `apps.accounts.management` (already imported in `views.py`); `PasswordResetToken` from `apps.accounts.models`.
- Produces: `POST /api/auth/clinicians/<int:pk>/reset-password/` — `IsAuthenticated`, gated by `can_manage`; returns `201` `{token, reset_url}`.

- [ ] **Step 1: Write the failing tests**

Create `backend/apps/accounts/tests/test_clinician_reset_password.py`:

```python
import pytest
from rest_framework.test import APIClient

from apps.accounts.models import PasswordResetToken
from conftest import ChainFactory, PracticeFactory, ClinicianFactory


def _client(user):
    c = APIClient()
    c.force_authenticate(user=user)
    return c


def _url(pk):
    return f'/api/auth/clinicians/{pk}/reset-password/'


@pytest.mark.django_db
def test_chain_admin_resets_clinician_in_chain():
    chain = ChainFactory()
    home = PracticeFactory(chain=chain)
    sibling = PracticeFactory(chain=chain)
    ca = ClinicianFactory(practice=home, role='chain_admin')
    clin = ClinicianFactory(practice=sibling, role='clinician')
    resp = _client(ca.user).post(_url(clin.id), {}, format='json')
    assert resp.status_code == 201, resp.data
    assert resp.data['reset_url'] == f"/reset-password?token={resp.data['token']}"
    token = PasswordResetToken.objects.get(token=resp.data['token'])
    assert token.user_id == clin.user_id and token.is_valid()


@pytest.mark.django_db
def test_practice_admin_resets_own_clinician():
    practice = PracticeFactory()
    admin = ClinicianFactory(practice=practice, role='admin')
    clin = ClinicianFactory(practice=practice, role='clinician')
    resp = _client(admin.user).post(_url(clin.id), {}, format='json')
    assert resp.status_code == 201


@pytest.mark.django_db
def test_practice_admin_cannot_reset_peer_admin():
    practice = PracticeFactory()
    admin = ClinicianFactory(practice=practice, role='admin')
    peer = ClinicianFactory(practice=practice, role='admin')
    resp = _client(admin.user).post(_url(peer.id), {}, format='json')
    assert resp.status_code == 403


@pytest.mark.django_db
def test_cannot_reset_out_of_scope_user():
    admin = ClinicianFactory(role='admin')
    other = ClinicianFactory(role='clinician')
    resp = _client(admin.user).post(_url(other.id), {}, format='json')
    assert resp.status_code == 403


@pytest.mark.django_db
def test_cannot_reset_self_via_admin_endpoint():
    admin = ClinicianFactory(role='admin')
    resp = _client(admin.user).post(_url(admin.id), {}, format='json')
    assert resp.status_code == 403


@pytest.mark.django_db
def test_minting_link_does_not_change_current_password():
    practice = PracticeFactory()
    admin = ClinicianFactory(practice=practice, role='admin')
    clin = ClinicianFactory(practice=practice, role='clinician')
    clin.user.set_password('original123')
    clin.user.save()
    _client(admin.user).post(_url(clin.id), {}, format='json')
    clin.user.refresh_from_db()
    assert clin.user.check_password('original123') is True
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && python -m pytest apps/accounts/tests/test_clinician_reset_password.py -v`
Expected: FAIL (404 — route does not exist).

- [ ] **Step 3: Add the view**

In `backend/apps/accounts/views.py`, ensure `PasswordResetToken` is imported from `.models` (add it to the existing models import line if absent), then add:

```python
class ClinicianResetPasswordView(generics.GenericAPIView):
    """Admin mints a one-time password-reset link for a user they manage."""
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        target = get_object_or_404(Clinician.objects.select_related('user'), pk=pk)
        if not can_manage(request.user, target):
            raise PermissionDenied()
        PasswordResetToken.objects.filter(user=target.user, used_at__isnull=True).delete()
        token = PasswordResetToken.objects.create(user=target.user)
        return Response(
            {'token': token.token, 'reset_url': f"/reset-password?token={token.token}"},
            status=status.HTTP_201_CREATED,
        )
```

(`can_manage`, `get_object_or_404`, `PermissionDenied`, `Clinician`, `status`, `permissions` are already imported in `views.py` from earlier work — verify and only add `PasswordResetToken`.)

- [ ] **Step 4: Route it**

In `backend/apps/accounts/urls.py`, add (after the `clinicians/<int:pk>/` detail path):

```python
    path('clinicians/<int:pk>/reset-password/', views.ClinicianResetPasswordView.as_view(), name='clinician-reset-password'),
```

- [ ] **Step 5: Run the tests + full accounts suite**

Run: `cd backend && python -m pytest apps/accounts/tests/test_clinician_reset_password.py -v && python -m pytest apps/accounts -q`
Expected: new 6 passed; full accounts suite passes (no regressions).

- [ ] **Step 6: Commit**

```bash
git add backend/apps/accounts/views.py backend/apps/accounts/urls.py backend/apps/accounts/tests/test_clinician_reset_password.py
git commit -m "feat(accounts): admin-initiated password reset link (can_manage-gated)"
```

---

### Task 3: Frontend — self-service change password

**Files:**
- Modify: `web/src/lib/schemas.ts` (add `changePasswordSchema`)
- Modify: `web/src/hooks/useAuth.ts` (add `useChangePassword`)
- Create: `web/src/components/settings/ChangePasswordDialog.tsx`
- Modify: `web/src/app/(dashboard)/settings/page.tsx` (add the card)
- Test: `web/src/lib/schemas.test.ts` (create — schema unit test)

**Interfaces:**
- Consumes: `api` (already imported in `useAuth.ts`); shadcn `Dialog`/`Input`/`Label`/`Button`/`Card`.
- Produces: `changePasswordSchema`/`ChangePasswordInput`; `useChangePassword()`; `<ChangePasswordDialog />`.

- [ ] **Step 1: Write the failing schema test**

Create `web/src/lib/schemas.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'
import { changePasswordSchema } from './schemas'

describe('changePasswordSchema', () => {
  it('accepts a valid change', () => {
    const r = changePasswordSchema.safeParse({
      current_password: 'old', new_password: 'newpass456', confirm_password: 'newpass456' })
    expect(r.success).toBe(true)
  })
  it('rejects a too-short new password', () => {
    const r = changePasswordSchema.safeParse({
      current_password: 'old', new_password: 'short', confirm_password: 'short' })
    expect(r.success).toBe(false)
  })
  it('rejects mismatched confirmation', () => {
    const r = changePasswordSchema.safeParse({
      current_password: 'old', new_password: 'newpass456', confirm_password: 'different' })
    expect(r.success).toBe(false)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd web && npm run test -- schemas`
Expected: FAIL (`changePasswordSchema` is not exported).

- [ ] **Step 3: Add the schema**

In `web/src/lib/schemas.ts`, add after `resetPasswordSchema`/its type:

```typescript
export const changePasswordSchema = z.object({
  current_password: z.string().min(1, 'Required'),
  new_password: z.string().min(8, 'Password must be at least 8 characters'),
  confirm_password: z.string(),
}).refine((v) => v.new_password === v.confirm_password, {
  message: 'Passwords do not match',
  path: ['confirm_password'],
})
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd web && npm run test -- schemas`
Expected: PASS.

- [ ] **Step 5: Add the hook**

In `web/src/hooks/useAuth.ts`, add (the `api` import already exists at the top):

```typescript
export function useChangePassword() {
  return useMutation({
    mutationFn: (data: { current_password: string; new_password: string }) =>
      api.post('auth/password/change/', data),
  })
}
```

- [ ] **Step 6: Create the dialog**

Create `web/src/components/settings/ChangePasswordDialog.tsx`:

```tsx
'use client'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { changePasswordSchema, type ChangePasswordInput } from '@/lib/schemas'
import { useChangePassword } from '@/hooks/useAuth'

export function ChangePasswordDialog() {
  const [open, setOpen] = useState(false)
  const [done, setDone] = useState(false)
  const change = useChangePassword()
  const { register, handleSubmit, reset, formState: { errors } } = useForm<ChangePasswordInput>({
    resolver: zodResolver(changePasswordSchema),
  })

  const onSubmit = (data: ChangePasswordInput) =>
    change.mutate(
      { current_password: data.current_password, new_password: data.new_password },
      { onSuccess: () => { setDone(true); reset() } },
    )

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setDone(false); change.reset() } }}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">Change password</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Change your password</DialogTitle></DialogHeader>
        {done ? (
          <p className="text-sm text-muted-foreground">Your password has been changed.</p>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
            <div>
              <Label htmlFor="cpw-current">Current password</Label>
              <Input id="cpw-current" type="password" {...register('current_password')} />
              {errors.current_password && <p className="mt-1 text-xs text-status-severe">{errors.current_password.message}</p>}
            </div>
            <div>
              <Label htmlFor="cpw-new">New password</Label>
              <Input id="cpw-new" type="password" {...register('new_password')} />
              {errors.new_password && <p className="mt-1 text-xs text-status-severe">{errors.new_password.message}</p>}
            </div>
            <div>
              <Label htmlFor="cpw-confirm">Confirm new password</Label>
              <Input id="cpw-confirm" type="password" {...register('confirm_password')} />
              {errors.confirm_password && <p className="mt-1 text-xs text-status-severe">{errors.confirm_password.message}</p>}
            </div>
            {change.isError && <p className="text-xs text-status-severe">Current password is incorrect.</p>}
            <Button type="submit" className="w-full bg-teal-600 hover:bg-teal-700" disabled={change.isPending}>
              {change.isPending ? 'Saving…' : 'Change password'}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 7: Add the card to Settings (visible to all users)**

In `web/src/app/(dashboard)/settings/page.tsx`, add the import:

```tsx
import { ChangePasswordDialog } from '@/components/settings/ChangePasswordDialog'
```

Add this card immediately after the "Clinical thresholds" `Card` (it is NOT gated by `isAdmin` — every user sees it):

```tsx
      <Card className="flex items-center justify-between p-5">
        <div>
          <span className="font-semibold">Password</span>
          <p className="text-xs text-muted-foreground">Change the password for your account.</p>
        </div>
        <ChangePasswordDialog />
      </Card>
```

- [ ] **Step 8: Typecheck, build, full web suite**

Run: `cd web && npx tsc --noEmit && npm run build && npm run test`
Expected: no NEW type errors (a pre-existing `libphonenumber-js` issue and a broken `login/page.test.tsx` are known and unrelated — ignore them); build succeeds; the new schema test passes.

- [ ] **Step 9: Commit**

```bash
git add web/src/lib/schemas.ts web/src/lib/schemas.test.ts web/src/hooks/useAuth.ts web/src/components/settings/ChangePasswordDialog.tsx "web/src/app/(dashboard)/settings/page.tsx"
git commit -m "feat(web): self-service change-password in settings"
```

---

### Task 4: Frontend — admin reset-password in the manage dialog

**Files:**
- Modify: `web/src/hooks/usePractice.ts` (add `useResetClinicianPassword`)
- Modify: `web/src/components/settings/ManageClinicianDialog.tsx` (Reset-password action)
- Modify: `web/src/components/settings/ManageClinicianDialog.test.tsx` (extend mock + assertion)

**Interfaces:**
- Consumes: `api` (already imported in `usePractice.ts`).
- Produces: `useResetClinicianPassword(id)` → mutation returning `{token, reset_url}`; a "Reset password" button in `ManageClinicianDialog` that reveals the returned link in a copyable field.

- [ ] **Step 1: Add the hook**

In `web/src/hooks/usePractice.ts`, add:

```typescript
export function useResetClinicianPassword(id: number) {
  return useMutation({
    mutationFn: () =>
      api.post<{ token: string; reset_url: string }>(`auth/clinicians/${id}/reset-password/`, {}),
  })
}
```

- [ ] **Step 2: Extend the failing test**

In `web/src/components/settings/ManageClinicianDialog.test.tsx`, update the `usePractice` mock to include the new hook (whose `mutate` immediately invokes `onSuccess` with a link), and add an assertion. Replace the `vi.mock('@/hooks/usePractice', ...)` block with:

```tsx
vi.mock('@/hooks/usePractice', () => ({
  useUpdateClinician: () => ({ mutate: vi.fn(), isPending: false }),
  useRemoveClinician: () => ({ mutate: vi.fn(), isPending: false }),
  usePractices: () => ({ data: [{ id: 1, name: 'Home' }, { id: 2, name: 'Sibling' }] }),
  useResetClinicianPassword: () => ({
    mutate: (_: unknown, opts: { onSuccess: (d: { reset_url: string }) => void }) =>
      opts.onSuccess({ reset_url: '/reset-password?token=abc123' }),
    isPending: false,
  }),
}))
```

Add this test after the existing one:

```tsx
  it('reveals a copyable reset link after clicking Reset password', async () => {
    render(<ManageClinicianDialog clinician={clinician} />)
    await userEvent.click(screen.getByRole('button', { name: /edit/i }))
    await userEvent.click(screen.getByRole('button', { name: /reset password/i }))
    expect(screen.getByDisplayValue('/reset-password?token=abc123')).toBeInTheDocument()
  })
```

- [ ] **Step 3: Run to verify it fails**

Run: `cd web && npm run test -- ManageClinicianDialog`
Expected: FAIL (no "Reset password" button yet).

- [ ] **Step 4: Add the Reset-password action to the dialog**

In `web/src/components/settings/ManageClinicianDialog.tsx`:

Add to the imports the new hook (extend the existing `@/hooks/usePractice` import line):

```tsx
import { useUpdateClinician, useRemoveClinician, usePractices, useResetClinicianPassword } from '@/hooks/usePractice'
```

Inside the component, after `const remove = useRemoveClinician(clinician.id)`:

```tsx
  const resetPw = useResetClinicianPassword(clinician.id)
  const [resetUrl, setResetUrl] = useState<string | null>(null)
  const onResetPassword = () =>
    resetPw.mutate(undefined, { onSuccess: (d) => setResetUrl(d.reset_url) })
```

Then, immediately above the existing action row (`<div className="flex items-center justify-between pt-1">`), add the reset block:

```tsx
          <div className="rounded-md border border-border p-3">
            {resetUrl ? (
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Share this one-time reset link:</p>
                <Input readOnly value={resetUrl} onFocus={(e) => e.currentTarget.select()} />
              </div>
            ) : (
              <Button type="button" variant="outline" size="sm" onClick={onResetPassword} disabled={resetPw.isPending}>
                {resetPw.isPending ? 'Generating…' : 'Reset password'}
              </Button>
            )}
          </div>
```

- [ ] **Step 5: Run to verify it passes**

Run: `cd web && npm run test -- ManageClinicianDialog`
Expected: PASS (both tests).

- [ ] **Step 6: Typecheck, build, full web suite**

Run: `cd web && npx tsc --noEmit && npm run build && npm run test`
Expected: no NEW type errors (ignore the known pre-existing `libphonenumber-js` / `login` failures); build succeeds; ManageClinicianDialog tests pass.

- [ ] **Step 7: Commit**

```bash
git add web/src/hooks/usePractice.ts web/src/components/settings/ManageClinicianDialog.tsx web/src/components/settings/ManageClinicianDialog.test.tsx
git commit -m "feat(web): admin password-reset link in manage dialog"
```

---

## Final verification

- [ ] Backend full suite: `cd backend && python -m pytest -q` (in container) → PASS.
- [ ] Web: `cd web && npx tsc --noEmit && npm run test && npm run build` → new tests green; only the known pre-existing `login`/`libphonenumber-js` issues outstanding.
- [ ] Manual smoke (optional): in Settings, change your own password (wrong current rejected, correct works, re-login with new password); as an admin, open a managed clinician → Reset password → copy the link → open it in a private window → set a new password via the existing reset page → that clinician logs in with it.
