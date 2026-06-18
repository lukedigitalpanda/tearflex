# Manual test checklist — 2026-06-18 updates

Covers everything shipped this session: tiered user management, password
management, the permission/UI polish, the data-integrity change, and deploy.
Backend logic is already covered by automated tests; this list focuses on
**confirming the behaviour in the actual UI** and the cross-role rules.

## Test accounts you'll want

To exercise the tiers fully, have one of each (or promote/appoint via Django
admin as superadmin):

- **Superadmin** (Django `is_superuser`)
- **Chain admin** — a clinician with role `chain_admin` whose home practice is in
  a **chain that has at least 2 practices**
- **Practice admin** (role `admin`)
- **Clinician** and **Technician** (in a practice you can manage)

---

## 1. Create practice

- [ ] **Chain admin:** Settings → "Create practice" → fill form → succeeds, and the
      new practice is **auto-selected** in the header practice selector.
- [ ] New practice belongs to the chain admin's **chain** (visible in their selector).
- [ ] **Practice admin / clinician / technician:** the "Practices / Create practice"
      card is **not shown**.
- [ ] **Superadmin:** can create a practice.

## 2. Invite (tiered roles)

- [ ] **Practice admin:** Clinicians → Invite → role dropdown shows **Clinician,
      Technician only** (no "Practice Admin"). Invite produces a copyable link.
- [ ] **Chain admin:** pick a practice in the header → Clinicians → Invite → shows
      **"Inviting to: <selected practice>"** and the role dropdown includes
      **Practice Admin, Clinician, Technician**. Invite to a chain practice works.
- [ ] **Clinician / technician:** the **Invite button is hidden**.
- [ ] (Backend guard) A chain admin cannot invite into a practice outside their chain.

## 3. Edit & move (manage clinician)

- [ ] **Per-row Edit** appears only on rows you can manage (not on your **own** row,
      not on a **peer admin's** row for a practice admin).
- [ ] **Practice admin:** edit a clinician → change role **Clinician ↔ Technician**
      saves; "Practice Admin" is **not** an option.
- [ ] **Chain admin:** edit a user in the chain → can set **Practice Admin / Clinician
      / Technician**; can **move** them to a **sibling practice** in the chain.
- [ ] **Chain admin:** the move dropdown lists **only their chain's practices** (cannot
      move someone outside the chain).
- [ ] **Last-admin guard:** try to demote/move/remove the **only practice admin** of a
      practice → **blocked** with an error.

## 4. Remove (deactivate)

- [ ] Admin removes a clinician (Edit → Remove → confirm) → they **disappear from the
      clinician list**.
- [ ] The removed user **cannot log in** (account deactivated; record retained).
- [ ] Cannot remove the **last admin** of a practice (blocked).
- [ ] Cannot remove **yourself**.

## 5. Scope / isolation

- [ ] **Chain admin** sees and can switch only between **their chain's** practices.
- [ ] **Practice admin** sees only **their own practice's** clinicians and patients.
- [ ] Switching practice in the header re-scopes patients/assessments/reports.

## 6. Self-service change password (all roles)

- [ ] Settings → **Password → Change password** card is visible to **every** logged-in
      user (including clinician/technician).
- [ ] Wrong **current** password → error, password unchanged.
- [ ] Correct current + new (≥8 chars) + matching confirm → success.
- [ ] Log out, log back in with the **new** password → works.

## 7. Admin-initiated password reset (link)

- [ ] **Admin:** Clinicians → Edit a managed user → **Reset password** → a **copyable
      reset link** appears.
- [ ] Open that link (e.g. in a private window) → set a new password via the reset page
      → that user can **log in with the new password**.
- [ ] Minting the link does **not** change the user's current password until the link is
      actually used.
- [ ] You can only reset users you can **manage** (no Reset option for peers / out-of-scope).

## 8. Permission / UI polish

- [ ] **Thresholds:** admins can edit and **Save thresholds**; non-admins see the form
      **read-only** with "Only practice admins can edit thresholds."
- [ ] **Session expiry:** when the access token is invalid/expired, the app **redirects
      to /login** (test by clearing the token / letting it expire).
- [ ] **Patient search:** typing in the search box is **debounced** (no flicker / no
      request per keystroke).
- [ ] **Results display:** fluorescein and lipid grades show a **label**, e.g.
      "3 — Moderate", "2 — Closed meshwork" (not just a number).
- [ ] **Fluorescein step:** the Oxford 0–5 grade options render as a **vertical list**.

## 9. Data integrity — NHS number now required

- [ ] Create a patient **without** an NHS number → confirm the expected behaviour.
      ⚠️ The backend model now **requires** `nhs_number`; verify the new-patient form
      either enforces it client-side or surfaces the server error cleanly (if it just
      errors out unhelpfully, that's a small frontend follow-up).

## 10. Deploy

- [ ] `./deploy.sh` on the VPS rebuilds, applies migrations, and reports
      "✔ Deploy complete — web is serving (HTTP 200)." (Already exercised this session.)
