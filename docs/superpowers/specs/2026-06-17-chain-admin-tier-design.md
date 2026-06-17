# Chain admin tier — design

**Date:** 2026-06-17
**Status:** Approved (design); pending implementation plan

## Context

TearFlex currently has three authorization levels:

- **Superadmin** (Django `is_superuser`) — sees and manages everything; can switch
  practices via a header selector (`?practice_id=`).
- **Practice admin** (`Clinician.role == 'admin'`) — manages a single practice.
- **Clinician / technician** — work within a single practice.

Multi-practice brands (e.g. Specsavers) need an intermediate tier: a person who
manages **many practices, but only those in their own group** — not the whole
platform. Today the only way to see multiple practices is to be a superadmin,
which would expose every other customer's patient data. This adds a **chain**
grouping and a **chain admin** role scoped to it.

Patient records are involved, so the scoping rule that decides which practices a
user can see is security-critical and must be centralised and tested.

## Goals

- Introduce a **Chain** (brand/group) that practices can belong to.
- Add a **chain admin** role with full practice-admin powers across *every*
  practice in their chain, and a header practice-selector limited to that chain.
- Let superadmins create chains, assign any practice to any chain, appoint chain
  admins, and create practices.
- Let chain admins create new practices (auto-joined to their chain) and invite
  practice-level roles to any practice in their chain.

## Out of scope (parked)

- Practice admins creating their own independent practice during self-setup —
  raises separate ownership/chain questions; revisit as its own piece.
- Chain admins appointing other chain admins (only superadmins do this).
- Chain admins pulling *existing* practices into their chain (they can only add
  practices they create).

## Data model

- **`Chain`** (new, `apps.accounts`): `name`, `is_active` (default true),
  `created_at`. `__str__` → name.
- **`Practice.chain`** → `ForeignKey(Chain, null=True, blank=True, on_delete=SET_NULL, related_name='practices')`.
  Practices with `chain = NULL` behave exactly as today.
- **`Clinician.ROLE_CHOICES`** gains `('chain_admin', 'Chain Admin')`. A chain
  admin is a normal clinician based at one *home* practice; their chain is that
  practice's chain (`clinician.practice.chain`). A chain admin whose home
  practice has no chain has chain scope = just their own practice (degenerate,
  but safe).

Migration backfills nothing (all existing practices `chain = NULL`).

## Roles & permissions

| Capability | Practice admin | Chain admin | Superadmin |
|---|---|---|---|
| Data scope | own practice | all practices in their chain | all practices |
| View patients / assessments / reports | own | chain | all |
| Manage clinicians, edit practice + thresholds, report recovery | own | each practice in chain | all |
| Invite roles | admin/clinician/technician (own) | admin/clinician/technician (any chain practice) | any |
| Create practice | parked | yes → auto-joined to their chain | yes (any/no chain) |
| Appoint chain admin | no | no | yes only |
| Assign practice ↔ chain | no | only by creating new | any practice ↔ any chain |

## Scoping (security-critical)

A single helper in `apps.accounts` encodes the rule; every practice-scoped
queryset uses it instead of inline `is_superuser` checks.

```
def accessible_practice_ids(user) -> set[int] | None:
    # None == unrestricted (superuser, no filter)
    if user.is_superuser: return None
    clinician = getattr(user, 'clinician', None)
    if not clinician: return set()
    if clinician.role == 'chain_admin' and clinician.practice.chain_id:
        return set(Practice.objects.filter(chain_id=clinician.practice.chain_id)
                                   .values_list('id', flat=True))
    return {clinician.practice_id}
```

- A companion `resolve_practice_filter(user, requested_practice_id)` returns the
  practice id(s) to filter on, honouring `?practice_id=` **only if it is within**
  `accessible_practice_ids(user)` (else 403/empty) — same gate superusers use,
  now applied to chain admins too.
- Every practice-scoped view (patients, assessments, captures, reports list /
  generate / retry / delete / restore / html / download, clinicians, practice,
  invite) is refactored to call this. `user_is_report_admin` etc. add
  `chain_admin` alongside `admin`.

## Endpoints affected

- `accounts`: `PracticeView`, `PracticeListView` (returns chain practices for
  chain admins), `PracticeClinicianListView`, `ClinicianInviteView` (chain admins
  may target any chain practice; role choices stay practice-level),
  new chain CRUD + assign + appoint endpoints (superadmin), new "create practice
  in my chain" endpoint (chain admin).
- `patients`, `assessments`, `reports`: swap inline scoping for the helper.
- `IsPracticeAdmin` → treat `chain_admin` as admin (or add `IsChainOrPracticeAdmin`).

## Frontend

- `useIsAdmin` (used for Compare/Delete/recovery/clinician UI) returns true for
  `chain_admin` too.
- Header **practice selector** shows for chain admins; `usePractices` returns
  their chain's practices; `selectedPracticeId` / `?practice_id=` reused.
- **Superadmin:** Chains management (Settings) — create chains, assign practices
  to chains, appoint chain admins, create practices.
- **Chain admin:** "Create practice" (auto-joined to their chain) + the existing
  clinician-invite UI, now chain-scoped (choose practice within chain).
- `Me` payload exposes the user's chain (id/name) so the client knows scope.

## Testing

- Helper unit tests: superuser → all; chain admin → exactly their chain's
  practices; practice user → only their own; `?practice_id` outside scope → denied.
- Cross-tenant tests per resource: a chain admin **cannot** see patients/
  assessments/reports of a practice in another chain or an unrelated practice;
  **can** see those within their chain.
- Permission tests: chain admin can invite within chain, cannot appoint chain
  admins; only superadmin assigns practice↔chain.

## Suggested build phases

1. **Core model + scoping** — `Chain`, `Practice.chain`, `chain_admin` role,
   migration, the helper, and refactor every practice-scoped endpoint onto it,
   with the cross-tenant tests. (Highest risk; do first and prove isolation.)
2. **Chain-admin enablement** — permissions (`IsPracticeAdmin` etc.), header
   selector + `usePractices` + `useIsAdmin`, `Me` chain info.
3. **Superadmin chain management** — chains CRUD, assign practice↔chain, appoint
   chain admins, create practices.
4. **Chain-admin actions** — create practice in chain, chain-scoped invites.
