# Password management — design

**Date:** 2026-06-18
**Status:** Approved (design); pending implementation plan
**Builds on:** `2026-06-18-chain-admin-phase4-design.md` (tiered user management — `can_manage`)

## Context

TearFlex already has a logged-out **"forgot password"** flow (committed): the
`forgot-password` / `reset-password` pages, the `PasswordResetToken` model, and the
`password-reset/` (request) + `password-reset/confirm/` endpoints. Email delivery of the
reset link is not yet wired up (messages go to the server log until SendGrid is added) —
that is deferred and out of scope here.

Two capabilities are missing and are added by this feature, both following the management
tier built in Phase 4:

1. A logged-in user has **no way to change their own password**.
2. An admin has **no way to reset the password** of a user they manage.

## Goal

Let users manage passwords under the same tier as user management, plus self-service:

> You may reset/set a password for a target if the target **is yourself**, or if
> **`can_manage(you, target)`** is true.

"Yourself" is served by a dedicated change-password form; the admin endpoint therefore
only needs the `can_manage` half. Each piece stays single-purpose.

## Out of scope (parked)

- Email delivery of reset links (needs SendGrid; the link is copyable in the meantime).
- Changing the existing logged-out forgot-password flow (left exactly as-is).
- Forcing logout / session invalidation when a reset link is minted (a minted link does
  not change the current password until used — see below).
- Password complexity policy beyond the existing minimum length (`min_length=8`, as the
  current reset/register serializers already enforce).

## Piece 1 — Self-service change password (logged in)

- **Endpoint:** `POST /api/auth/password/change/` — `IsAuthenticated`. Body
  `{current_password, new_password}`.
- **Serializer:** new `ChangePasswordSerializer`.
  - `current_password` validated with `user.check_password(...)`; wrong → 400 with a
    field error (`{'current_password': 'Current password is incorrect.'}`).
  - `new_password` `min_length=8` (matches existing serializers), `write_only`.
  - `save()` calls `user.set_password(new_password)` then `user.save()`. The user stays
    authenticated (existing access token remains valid; this is a deliberate non-goal to
    force re-login).
- **Frontend:** a "Change password" card in **Settings** (`settings/page.tsx`), visible to
  every logged-in user. Fields: current password, new password (with the existing
  show/hide toggle pattern). New `ChangePasswordDialog` (or inline card) + a
  `useChangePassword` hook posting to `auth/password/change/`. New
  `changePasswordSchema` in `lib/schemas.ts`.

## Piece 2 — Admin-initiated reset (for a managed user)

- **Endpoint:** `POST /api/auth/clinicians/<int:pk>/reset-password/` —
  `IsAuthenticated`; object-gated by `can_manage(request.user, target)` → 403 otherwise.
  Reuses the existing `PasswordResetToken` model.
  - Mints a fresh token for `target.user` (deleting any prior unused token for that user,
    matching the existing request flow's behaviour), with the same expiry the existing
    flow uses.
  - Returns `{reset_url: "/reset-password?token=<token>"}` (and the raw `token`), mirroring
    how `ClinicianInviteView` returns `invite_url`.
  - Minting a link does **not** change the target's current password; it only becomes a new
    password when the target opens the link and submits the existing
    `password-reset/confirm/` flow. A misfire cannot lock anyone out.
- **Frontend:** a **"Reset password"** button inside the existing `ManageClinicianDialog`
  (which already renders only on rows the current user can manage). On click → calls the
  endpoint and shows the returned `reset_url` in a read-only, copyable field — the same
  pattern `InviteClinicianDialog` uses for its invite link. New `useResetClinicianPassword`
  hook.

## Reuse / structure

- Token + the `/reset-password` page + `password-reset/confirm/` endpoint already exist
  and are unchanged. Piece 2 only adds a new "mint a token for someone I manage" endpoint;
  the consume side is shared.
- Authorization reuses `apps/accounts/management.can_manage` — no new auth logic.
- `ChangePasswordSerializer` and the reset-mint view live in the existing
  `apps/accounts/serializers.py` / `views.py`, routed in `apps/accounts/urls.py`.

## Testing

**Change password (Piece 1):**
- Wrong current password → 400, password unchanged.
- Correct current password → 200, `user.check_password(new)` true, old password no longer
  valid.
- Unauthenticated request → 401.

**Admin reset (Piece 2):**
- `can_manage` matrix: chain admin resets a clinician/admin in their chain → 200 with a
  token; practice admin resets a clinician in their practice → 200; practice admin resets a
  **peer admin** → 403; resetting an **out-of-scope** user → 403; resetting **self** via
  this endpoint → 403 (self uses the change-password form).
- The minted token is valid and drives the existing `password-reset/confirm/` flow to set
  a new password.
- Minting a token does not alter the target's current password until the link is used.

## Build order

1. **Change-password endpoint** (`ChangePasswordSerializer` + view + route) with tests.
2. **Admin reset endpoint** (mint token, `can_manage`-gated) with tests.
3. **Frontend change-password** (Settings card + hook + schema).
4. **Frontend admin reset** (button in `ManageClinicianDialog` + hook + copyable link).
