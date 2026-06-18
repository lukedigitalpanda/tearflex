# Chain admin — Phase 4 (tiered user management) — design

**Date:** 2026-06-18
**Status:** Approved (design); pending implementation plan
**Builds on:** `2026-06-17-chain-admin-tier-design.md` (Phases 1 & 2 shipped)

## Context

Phases 1 and 2 of the chain-admin tier are live: the `Chain` model, `Practice.chain`,
the `chain_admin` role, the centralised scoping helpers (`accessible_practice_ids`,
`resolve_practice_scope`, `scope_queryset`), cross-tenant tests, the header practice
selector for chain admins, and `Me` chain info. After Phase 2 a chain admin can **view and
switch between** the practices in their chain but cannot administer them.

Phase 4 makes the admin roles able to **run their part of the organisation**: create
practices and manage the people in them. Management is a strict tier — each admin role
manages everyone *below* them, within their own scope, and never sideways or above.

Only superadmins have Django admin access; the `chain_admin` role is appointed there and
is never created or changed through the app.

## Goals

1. **Create practices** — chain admins create practices in their own chain; superadmins
   anywhere. *(Backend already implemented; see Build order Task 1.)*
2. **Tiered user management** — invite, edit, remove, and move users, each action applied
   only to users *below* the actor in the actor's scope.

## The tiers

| Actor | Manages roles | Within scope |
|---|---|---|
| **Superadmin** | chain_admin, admin, clinician, technician | any practice / any chain |
| **Chain admin** | admin, clinician, technician | practices in their own chain |
| **Practice admin** | clinician, technician | their own practice |
| Clinician / technician | — (no management) | — |

"Below" and "scope" are exactly: `manageable_roles(actor)` (the role set above) **and**
`accessible_practice_ids(actor)` (the existing scoping helper). A user is manageable by an
actor only if **both** hold, and the user is not the actor themselves.

## The four actions

Applied to a target user only when the actor can manage them (per the table):

1. **Invite** — create a new user in one of the actor's manageable roles, in a practice
   within the actor's scope. (`chain_admin` is never an invitable role for anyone.)
2. **Edit** — change the target's details (`first_name`, `last_name`, `title`,
   `professional_registration`) and their **role**. A new role must itself be within the
   actor's manageable roles (you cannot promote anyone to your own tier or above).
3. **Remove** — **deactivate** the target (`user.is_active = False`); records are kept
   (clinical / UK DPA retention). Not a hard delete. Reversible by re-inviting / a
   superadmin.
4. **Move** — reassign the target to a different practice. **Chain admin:** only to another
   practice in their own chain. **Superadmin:** any practice in any chain. **Practice
   admin:** cannot move (single practice). The destination practice must be within the
   actor's scope.

### Guardrails

- **No self-management** that strips your own access: an actor cannot edit-role, remove, or
  move themselves via these endpoints (`can_manage(actor, self) == False`).
- **No orphaned practice:** the last active `admin` of a practice cannot be removed,
  demoted, or moved away — the practice must always retain at least one active practice
  admin. (Validation error if the action would leave zero.)

## Authorization helpers (security-critical)

New module `apps/accounts/management.py`, tested once, used by every management endpoint —
mirroring how `scoping.py` centralises practice access.

```python
def manageable_roles(user) -> set[str]:
    """Roles `user` may assign / manage. Empty for non-admins."""
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


def can_manage(user, target) -> bool:
    """True if `user` may manage Clinician `target`."""
    if user.is_superuser:
        return True
    actor = getattr(user, 'clinician', None)
    if actor is None or actor.pk == target.pk:
        return False
    if target.role not in manageable_roles(user):
        return False
    scope = accessible_practice_ids(user)  # None == unrestricted (superuser)
    return scope is None or target.practice_id in scope


def is_last_active_admin(target) -> bool:
    """True if `target` is the only remaining active practice admin of its practice."""
    if target.role != 'admin':
        return False
    return (
        Clinician.objects.filter(practice_id=target.practice_id, role='admin',
                                 user__is_active=True)
        .exclude(pk=target.pk).count() == 0
    )
```

- **Role change** is allowed only when the *new* role is in `manageable_roles(actor)`.
- **Move** destination must be in `accessible_practice_ids(actor)` (or unrestricted for
  superusers).
- Remove / demote / move-away is rejected when `is_last_active_admin(target)`.

## Endpoints

Existing (kept, with broadened rules):

- `POST /api/auth/practices/` — create practice (Task 1, implemented).
- `GET /api/auth/practice/clinicians/` — list clinicians in scope. Now filters to
  **active** users (`user__is_active=True`) so removed (deactivated) users drop off the
  list; otherwise unchanged.
- `POST /api/auth/practice/clinicians/invite/?practice_id=` — invite. Now validates the
  requested role against `manageable_roles(inviter)` and the target practice against the
  inviter's scope. So: chain admin → admin/clinician/technician in any chain practice;
  practice admin → clinician/technician in own practice; `chain_admin` rejected for all.

New — `ClinicianDetailView` at `/api/auth/clinicians/<int:pk>/`:

- `GET` — retrieve a clinician the actor may view (in scope). For surfacing detail in the
  manage UI.
- `PATCH` — edit. Body may include `first_name`, `last_name`, `title`,
  `professional_registration`, `role`, `practice_id` (move). Object-gated by
  `can_manage`; `role` validated against `manageable_roles`; `practice_id` validated
  against scope; last-admin guardrail enforced for role/practice changes.
- `DELETE` — remove = deactivate the linked `User` (`is_active = False`). Object-gated by
  `can_manage`; last-admin guardrail enforced.

Permission: `IsAuthenticated` + object-level `can_manage` (for `PATCH`/`DELETE`); `GET`
limited to in-scope clinicians via `scope_queryset`.

## Frontend

- **Clinicians page (`settings/clinicians`):**
  - **Invite dialog** role dropdown is filtered to the current user's manageable roles
    (chain admin: Practice Admin / Clinician / Technician; practice admin: Clinician /
    Technician). For chain admins (and superusers) the invite targets the header-selected
    practice, shown as "Inviting to: *<practice>*".
  - **Per-row actions** (Edit, Remove) appear only on rows the current user can manage.
- **Manage dialog (Edit):** edit name/title/registration, change role (dropdown filtered
  to manageable roles), and — for chain admins/superusers — move to another in-scope
  practice (practice dropdown from `usePractices`). Save via `PATCH`.
- **Remove:** confirmation, then `DELETE`; the list refreshes (deactivated users drop out
  of the active list).
- A small role-helper on the client (`manageableRoles(me)`) mirrors the backend set so the
  UI only offers valid options; the backend remains the source of truth and re-validates.

## Testing

- **Helpers:** `manageable_roles` per actor; `can_manage` matrix (own practice vs chain vs
  cross-chain; role-below vs equal/above; self → false); `is_last_active_admin` true/false.
- **Invite (tiered):** chain admin invites admin/clinician/technician within chain (ok),
  clinician outside chain (403), `chain_admin` (400); practice admin invites
  clinician/technician (ok), admin (400), other practice (403).
- **Edit:** practice admin promotes clinician→technician (ok) but not →admin (400);
  chain admin sets a user's role to admin (ok); demoting the last admin (400); editing a
  user outside scope (403); editing self-role (403).
- **Move:** chain admin moves a user to a sibling chain practice (ok) but not to an
  outside practice (403); superuser moves across chains (ok); moving the last admin away
  (400); practice admin attempting a move (403).
- **Remove:** admin deactivates a clinician (ok, `is_active` False, record kept); removing
  the last admin (400); removing self (403); removing out-of-scope user (403).

## Build order

1. **Create-practice endpoint** — `POST /api/auth/practices/`, chain force-set, gated to
   chain admin / superuser. *(Implemented.)*
2. **Authorization helpers** — `apps/accounts/management.py` (`manageable_roles`,
   `can_manage`, `is_last_active_admin`) with unit tests.
3. **Tiered invite** — `ClinicianInviteView` / serializer use `manageable_roles` +
   scope for role and target-practice validation, with tests.
4. **Edit + move endpoint** — `ClinicianDetailView` `GET`/`PATCH` (details, role, move)
   with guardrails, with tests.
5. **Remove endpoint** — `ClinicianDetailView` `DELETE` (deactivate) with guardrails,
   with tests.
6. **Frontend invite** — filtered role dropdown + chain-scoped target practice.
7. **Frontend manage** — per-row Edit/Remove, the Edit dialog (details/role/move), and
   Remove confirmation.
