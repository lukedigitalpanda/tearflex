# Chain admin — Phase 4 (chain-admin actions) — design

**Date:** 2026-06-18
**Status:** Approved (design); pending implementation plan
**Builds on:** `2026-06-17-chain-admin-tier-design.md` (Phases 1 & 2 shipped)

## Context

Phases 1 and 2 of the chain-admin tier are live: the `Chain` model, `Practice.chain`,
the `chain_admin` role, the centralised scoping helpers, cross-tenant tests, the header
practice selector for chain admins, and `Me` chain info. After Phase 2 a chain admin can
**view and switch between** the practices in their chain, but cannot yet *do* anything
that creates or seeds a practice.

Only superadmins have Django admin access. Superadmin-only tasks (creating chains,
appointing chain admins, assigning existing practices to chains) are therefore already
covered via Django admin and are **not** part of this phase (that is the parked Phase 3,
a convenience UI). The real gap is the chain admin, who has no Django fallback: today they
cannot stand up a new branch or seed it with an admin without escalating to a superadmin.

## Goals

- Let a chain admin **create a new practice** in their own chain, from the web app.
- Let a chain admin **invite a practice admin** (the `admin` role *only*) to any practice
  in their chain. The seeded practice admin then handles inviting clinicians/technicians
  within that practice.

## Out of scope (parked)

- Chain admins inviting clinicians or technicians (delegated to each practice's own admin).
- Chain admins inviting or appointing other chain admins (superadmin-only, unchanged).
- Chain admins creating practices outside their chain, or moving existing practices into
  their chain.
- In-app superadmin chain management (the parked Phase 3).

## Roles & permissions (delta from Phase 1 spec)

| Capability | Practice admin | Chain admin | Superadmin |
|---|---|---|---|
| Create practice | no | yes → force-joined to their chain | yes (any/no chain) |
| Invite practice **admin** | own practice | any practice in chain | any |
| Invite clinician / technician | own practice | **no** | any |
| Invite chain admin | no | no | no (Django admin only) |

## Backend

### 1. Create practice

- Endpoint: `POST /api/practices/` — extend the existing `PracticeListView` to
  `ListCreateAPIView` (the `GET` list behaviour is unchanged).
- Permission: authenticated **and** (chain admin or superadmin). Practice admins and
  below get 403 on `POST`; the `GET` list is unchanged for everyone.
- On create, the new practice's `chain` is **force-set** server-side:
  - chain admin → `request.user.clinician.practice.chain` (ignore any client-supplied
    chain). A chain admin whose home practice has no chain cannot create (403 / validation
    error) — there is no chain to attach to.
  - superadmin → may pass an explicit `chain` or none.
- Writable fields mirror `EditPracticeDialog`: `name`, `address_line_1`, `address_line_2`,
  `city`, `postcode`, `phone`, `email`. `is_active` defaults true.
- Response: the created `Practice` (serialised as elsewhere) so the client can select it.

### 2. Invite a practice admin

`ClinicianInviteView` currently hardcodes the inviter's own `clinician.practice` as the
target. Two changes:

- **Target practice:** honour `?practice_id=` **only if** it is within
  `accessible_practice_ids(user)` (the same gate `PracticeView` uses); otherwise 403. No
  param → the inviter's own practice (regular practice admins unchanged).
- **Role rules (server-enforced in the serializer):**
  - chain admin → may invite `role='admin'` **only**; any other role → validation error.
  - practice admin → may invite `admin` / `clinician` / `technician` for their own
    practice (unchanged).
  - `chain_admin` is never an acceptable invite role here, for anyone.

The serializer takes the resolved target practice and the inviter's role via context and
validates accordingly; it does not trust client-supplied practice or unchecked roles.

## Frontend

- **Create practice (Settings):** a new `CreatePracticeDialog` (mirrors the existing
  `EditPracticeDialog` fields and styling), shown to chain admins and superadmins. On
  success it **auto-selects the new practice in the header selector**, so the natural next
  step — inviting that practice's admin — lands on the right practice without a manual
  switch.
- **Invite dialog (`InviteClinicianDialog`):** when the current user is a chain admin:
  - the role field is **fixed to "Practice Admin"** and rendered as a static label, not a
    dropdown;
  - the dialog shows "Inviting admin to: *<header-selected practice>*" as a read-only
    label, and the invite request passes the selected `practice_id`.
  - Regular practice admins see the existing role dropdown and own-practice behaviour,
    unchanged.

## Testing

- **Create practice:** chain admin creates a practice → it auto-joins their chain;
  client-supplied `chain` is ignored. Chain admin with no chain cannot create. Practice
  admin / clinician / technician → 403 on `POST`. Superadmin can create with or without a
  chain.
- **Invite role lock:** chain admin invite forced to `admin`; attempting `clinician`,
  `technician`, or `chain_admin` → rejected. Practice admin invite flow unchanged.
- **Invite scope:** chain admin inviting to a practice **outside** their chain (crafted
  `?practice_id=`) → denied; inviting within the chain → allowed. Practice admin cannot
  target another practice via `?practice_id=`.
- **Cross-tenant:** a chain admin in chain A cannot create into or invite into chain B or
  an unrelated practice.

## Build order

1. Backend: `POST /api/practices/` with force-set chain + permission gate, and tests.
2. Backend: `ClinicianInviteView`/serializer target-practice + admin-only role lock, and
   tests.
3. Frontend: `CreatePracticeDialog` in Settings + auto-select on success.
4. Frontend: `InviteClinicianDialog` chain-admin variant (admin-only, selected-practice
   label).
