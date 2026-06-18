# Self-onboarding (practice / chain self-registration) — design

**Date:** 2026-06-18
**Status:** Approved (design); pending implementation plan
**Builds on:** chain-admin tier + tiered user management (`accessible_practice_ids`,
`manageable_roles`, `Chain`/`Practice`/`Clinician`) and the existing
`PasswordResetToken` email machinery.

## Context

Account creation today is **invite-only**: an admin invites a person, who activates a
pre-made inactive account via `/register?token=`. The very first superadmin is made with
`createsuperuser`, and the first practice + its admin are set up in Django admin. There is
no way for a brand-new clinic to onboard itself — every new practice needs a superadmin.

This adds **public self-onboarding** so a new practice (or a multi-practice group) can sign
up and provision itself, with **minimal superadmin involvement** — superadmins only get
involved for the riskier consumer-email signups.

## Goals

- A public **Sign up** flow that branches into **single practice** or **multi-practice
  group (chain)**.
  - *Practice:* creates a standalone practice; the registrant becomes its **practice admin**.
  - *Chain:* creates a chain + the registrant's **first/home practice**; the registrant
    becomes a **chain admin** (a chain admin must be based at a home practice).
- **Email verification** before anything is provisioned.
- After verification, branch on the email domain:
  - **Professional domain** → **auto-provision**, account goes live immediately.
  - **Free / disposable domain** → **pending**, held for **superadmin approval** (in
    Django admin).
- A **self-contained, internal** email classifier — no external API.

## Out of scope (parked)

- Billing / payment / subscription.
- Staff invites during onboarding (the existing tiered invite flow handles staff once the
  practice exists).
- An in-app superadmin approval UI (Django admin is used for now).
- Actual email delivery — depends on SendGrid (not yet wired). Verification and
  approval-notification emails go to the server log until then; the flow is otherwise
  complete.

## Email classification (internal, no external dependency)

New module `apps/accounts/email_classification.py`:

```python
def is_free_or_disposable(email: str) -> bool:
    """True if the email's domain is a known free provider or disposable domain."""
```

- Backed by a **bundled data file** `apps/accounts/data/free_email_domains.txt` (one domain
  per line, lowercased), compiled from the public open-source free-provider and
  disposable-email-domain lists (thousands of entries). Loaded once into a module-level
  `frozenset` at import.
- The domain is the part after `@`, lowercased and stripped.
- **No network calls at runtime.** Refreshed by replacing the data file (a maintenance
  task), not a runtime dependency.
- Unknown domains are treated as **professional** (auto-approve) — the file lists the bad
  set; anything not on it is assumed to be a real organisation domain.

## Data model

New `OnboardingRegistration` (`apps.accounts`). Nothing real (Practice/User/Clinician) is
created until provisioning, so abandoned/abusive signups stay contained here and are easy
to purge.

```python
class OnboardingRegistration(models.Model):
    registration_type = CharField(choices=[('practice','Practice'), ('chain','Chain')])

    # Contact / first admin
    contact_first_name = CharField()
    contact_last_name = CharField()
    contact_email = EmailField()
    contact_title = CharField(blank=True)
    professional_registration = CharField(blank=True)  # GOC/GMC number, optional
    password = CharField()  # hashed via make_password; set on the User at provision time

    # Practice (the home practice for the chain path)
    practice_name = CharField()
    address_line_1 = CharField()
    address_line_2 = CharField(blank=True)
    city = CharField()
    postcode = CharField()
    phone = CharField(blank=True)
    practice_email = EmailField(blank=True)

    # Chain path only
    chain_name = CharField(blank=True)

    # Verification + lifecycle
    email_token = CharField(unique=True)         # emailed verification token
    email_verified_at = DateTimeField(null=True, blank=True)
    status = CharField(choices=[
        ('pending_verification', ...),  # created, email not yet verified
        ('awaiting_approval', ...),     # verified but free/disposable email → needs superadmin
        ('provisioned', ...),           # account created
        ('rejected', ...),              # superadmin rejected
    ], default='pending_verification')

    # Audit
    provisioned_practice = FK(Practice, null=True, blank=True, on_delete=SET_NULL)
    provisioned_clinician = FK(Clinician, null=True, blank=True, on_delete=SET_NULL)
    decided_by = FK(User, null=True, blank=True, on_delete=SET_NULL)  # approving superadmin
    created_at = DateTimeField(auto_now_add=True)
    decided_at = DateTimeField(null=True, blank=True)
```

The `email_token` is generated like the existing invite/reset tokens (`secrets.token_urlsafe`).

## Provisioning (shared by both paths)

A single function `provision_registration(registration, decided_by=None)` in
`apps/accounts/onboarding.py`, wrapped in `transaction.atomic`, so the auto path and the
superadmin-approval path can never diverge:

1. If `registration_type == 'chain'`: create `Chain(name=chain_name)`.
2. Create `Practice` from the practice fields (`chain=` the new chain for the chain path,
   else `None`).
3. Create `User` (active): username derived from the email local-part with the existing
   dedupe loop, `email`, names, and `password` set directly from the stored hash.
4. Create `Clinician(user, practice, role='chain_admin' if chain else 'admin', title,
   professional_registration)`.
5. Mark `status='provisioned'`, link `provisioned_practice`/`provisioned_clinician`, set
   `decided_by`/`decided_at`.
6. Return the `Clinician`.

Idempotency / guards: refuse to provision a registration that is already `provisioned`;
refuse if an **active** `User` with that email already exists.

## Endpoints

- `POST /api/auth/onboarding/` (`AllowAny`) — submit a registration. Body: `registration_type`,
  contact fields, `password`, practice fields, and `chain_name` (chain path). Validates,
  creates the `OnboardingRegistration` (`pending_verification`), sends the verification
  email. Returns `201` with a generic "check your email" message (does not reveal whether
  the email already exists).
- `POST /api/auth/onboarding/verify/` (`AllowAny`) — body: `token`. Marks
  `email_verified_at`, then decides:
  - **professional domain** → `provision_registration(...)`, return **JWT access/refresh**
    so the client logs the new admin straight in.
  - **free/disposable domain** → set `status='awaiting_approval'`, return a body indicating
    "under review" (no tokens).
  - Already-verified / invalid / provisioned tokens → appropriate 400.

Existing invite-based `/register` and the password flows are unchanged.

## Superadmin approval (Django admin)

- Register `OnboardingRegistration` in Django admin with `status` in `list_display` and
  `list_filter`, read-mostly fields.
- Admin actions on selected `awaiting_approval` rows:
  - **Approve** → `provision_registration(reg, decided_by=request.user)` + send the
    "approved, you can log in" email.
  - **Reject** → `status='rejected'`, `decided_at`, optional notification.

## Frontend

- **`/signup`** (public; linked as "Sign up" / "Create an account" from `/login`):
  - **Step 1:** choose **Single practice** or **Multi-practice group (chain)**.
  - **Step 2:** form — practice fields + contact (name, email, password, optional title /
    registration); the chain path additionally asks for the **group/chain name**. Zod
    schemas in `lib/schemas.ts`. Submit → `POST auth/onboarding/` → "Check your email to
    verify your account."
- **`/verify-email?token=`** (public): on load, `POST auth/onboarding/verify/`:
  - auto-provisioned → store the returned tokens and **redirect to the dashboard**.
  - awaiting approval → show "Your application is under review — we'll email you when it's
    approved."
  - invalid/expired → error with a link back to `/signup`.
- These reuse the existing public-route fetch pattern (Next.js `/api/auth/*` proxy routes,
  like login/forgot-password), since the user is unauthenticated.

## Abuse / safety

- Nothing real is created pre-provision → spam contained in `OnboardingRegistration`.
- Email verification is required before any provisioning.
- Free/disposable domains gated behind a human (superadmin).
- Basic rate-limiting on `POST /api/auth/onboarding/` (DRF throttle) to blunt automated
  signup floods.
- Duplicate handling: an active `User` already on that email → generic success but no new
  registration acted on (don't reveal existence); a prior un-provisioned registration for
  the email may be replaced.

## Testing

- **Classifier:** `gmail.com`, `outlook.com`, a known disposable domain → `True`; a custom
  org domain → `False`; case/whitespace handling.
- **Submit (practice):** creates a `pending_verification` registration; **no** Practice/User
  yet; verification email attempted.
- **Verify (professional email):** provisions → Practice + active User + Clinician(`admin`);
  JWT returned; logging in works.
- **Verify (free email):** → `awaiting_approval`; **no** Practice/User created.
- **Approve (free one) in admin:** provisions.
- **Reject:** no provisioning; status `rejected`.
- **Chain path:** provisions a Chain + Practice + Clinician(`chain_admin`); the new chain
  admin's scope is that single practice (their chain).
- **Duplicate active email:** refused.
- **Re-verify / already-provisioned token:** 400, no double provisioning.

## Build order

1. **Email classifier** — module + bundled `free_email_domains.txt` + unit tests.
2. **`OnboardingRegistration` model** + migration.
3. **Submit endpoint** — serializer (per-path validation), create registration, send
   verification email, with tests.
4. **Verify endpoint + `provision_registration`** — auto-provision vs awaiting-approval,
   JWT on auto, with tests (the security-critical core).
5. **Django admin approval** — approve/reject actions + notification email.
6. **Frontend** — `/signup` (branch + forms), `/verify-email`, login "Sign up" link, zod
   schemas.
