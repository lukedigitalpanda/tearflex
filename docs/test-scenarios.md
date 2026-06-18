# TearFlex Test Scenario Matrix

> Web-client audit performed 2026-06-11. Results in `docs/test-results-2026-06-11.md`.

## Module: Authentication (1.x)

| Ref | Scenario | Client | Pre-conditions | Test Steps | Expected Result |
|-----|----------|--------|----------------|------------|-----------------|
| 1.1 | Valid login issues tokens | All | Backend running, valid clinician account | Enter valid email or username + password, submit | JWT issued; session established; redirected to dashboard |
| 1.1 | Invalid login rejected | All | Backend running | Enter invalid credentials, submit | Error message shown; no session created |
| 1.2 | Silent token refresh | All | Logged-in session, access token near expiry | Make API call after access token expires | New access token obtained silently; request succeeds |
| 1.3 | Session expiry returns to login | All | Logged-in session, both tokens expired | Wait for both tokens to expire; attempt any action | Redirected to /login |
| 1.4 | Logout clears session | All | Logged-in session | Click Sign out | Session cleared; redirected to /login; back button cannot access protected pages |
| — | Unauthenticated redirect | Web | Not logged in | Navigate directly to /patients | Redirected to /login |
| — | HTTP-only cookie session | Web | — | Inspect cookies after login | tf_access and tf_refresh are httpOnly, sameSite=lax, secure in production |

## Module: Patient Management (2.x)

| Ref | Scenario | Client | Pre-conditions | Test Steps | Expected Result |
|-----|----------|--------|----------------|------------|-----------------|
| 2.1 | Patient list loads and orders by updated_at desc | Web, Mobile | Patients exist in DB | Navigate to /patients | List renders, most recently updated first |
| 2.2 | Real-time patient search (debounced) | Web, Mobile | Patients exist | Type in search box | Results filter; API called on debounce (not every keypress) |
| 2.3 | Patient card content | Web, Mobile | Patients exist | View patient list | Each card shows full name, DOB, severity badge |
| 2.4 | Create patient — all required fields | Web, Mobile | Logged in as clinician | Open New patient dialog; fill all fields; submit | Patient created; appears in list |
| 2.4 | Create patient — validation | Web, Mobile | — | Submit with future DOB, invalid email, invalid phone | Appropriate field errors shown; submission blocked |
| 2.5 | Patient profile view | Web, Mobile | Patient with assessments | Navigate to /patients/[id] | Shows name, DOB, NHS number, notes, trend chart, assessment history |
| 2.6 | Edit a patient | Web, Mobile | Patient exists | Click Edit patient; change name; save | Patient updated; changes reflected immediately |
| 2.7 | Practice scoping enforced | Web, Mobile | Two practices with separate patients | Log in as clinician from Practice A | Cannot see patients from Practice B |
| 2.8 | NIBUT trend chart | Web | Patient has multiple assessments | View patient profile | Recharts line chart with green/amber reference lines at practice thresholds |
| 2.9 | Assessment history list | Web | Patient has assessments | View patient profile | Rows show eye, date, status; each is a link to assessment detail |

## Module: Assessment Flow (3.x / 4.x)

| Ref | Scenario | Client | Pre-conditions | Test Steps | Expected Result |
|-----|----------|--------|----------------|------------|-----------------|
| 3.1 | Create assessment — stepper (web) | Web | Patient exists | Click New assessment; complete 5-step stepper | Assessment + captures created; redirected to results |
| 3.2 | NIBUT step mandatory | Web | In assessment stepper | Try to proceed past NIBUT step with no value | Validation error; cannot advance |
| 3.3 | Fluorescein / lipid steps optional | Web | In assessment stepper | Skip optional steps | Assessment created without those captures |

## Module: Assessment Results — Web (5.x)

| Ref | Scenario | Client | Pre-conditions | Test Steps | Expected Result |
|-----|----------|--------|----------------|------------|-----------------|
| 5.1 | Open results from history | Web | Assessment exists | Click row in assessment history | Assessment detail page loads |
| 5.2 | NIBUT display — colour coded | Web | Assessment with NIBUT result | Open assessment | Large first break-up time displayed; colour matches practice threshold band |
| 5.3 | Metrics grid | Web | Assessment with full result | Open assessment | NIBUT mean, fluorescein grade, lipid grade, tear meniscus, confidence score all shown |
| 5.4 | Tear film heatmap | Web | Assessment with heatmap | Open assessment | Heatmap image rendered; fallback shown if absent |
| 5.5 | Severity badge uses practice thresholds | Web | Practice has custom thresholds | Open assessment | Band/colour reflects custom thresholds, not defaults |
| 5.6 | Generate report from results page | Web | Assessment exists | Click PDF report | Report generated; opens in new tab |

## Module: PDF Reporting (6.x)

| Ref | Scenario | Client | Pre-conditions | Test Steps | Expected Result |
|-----|----------|--------|----------------|------------|-----------------|
| 6.6 | Web download | Web | Report in 'ready' state | Click Download | PDF downloaded via /api/download/[id] |
| 6.7 | Web report list | Web | Reports exist | Navigate to /reports | Report entries shown with patient/date/status; Download button enabled only when ready |

## Module: Practice Management (7.x)

| Ref | Scenario | Client | Pre-conditions | Test Steps | Expected Result |
|-----|----------|--------|----------------|------------|-----------------|
| 7.1 | View and edit practice details | Web | Practice admin role | Navigate to /settings | Practice name and address shown; edit form available |
| 7.2 | Configure NIBUT thresholds | Web | Practice admin role | Navigate to /settings; update thresholds | Saved; trend chart and results reflect new values immediately |
| 7.3 | Clinician list | Web | Practice admin role | Navigate to /settings/clinicians | Table shows name, role, email for each clinician |
| 7.4 | Invite a clinician | Web | Practice admin role | Click Invite clinician; fill form | Invite URL generated; can be shared; register flow creates account |
| 7.5 | Role-based access control | Web | — | Log in as non-admin clinician | Settings accessible (read), admin actions (invite/threshold edit) blocked |

## Module: API (10.x)

| Ref | Scenario | Client | Notes |
|-----|----------|--------|-------|
| 10.1 | OpenAPI docs accessible | Backend | GET /api/docs/ should return Swagger UI |
| 10.2 | All endpoints authenticated | Backend | GET /api/patients/ without token → 401 |

## Module: Clinical Thresholds (9.x)

| Ref | Scenario | Notes |
|-----|----------|-------|
| 9.1 | Per-practice threshold override | Practice-level thresholds used in trend chart + results; defaults 10s/5s when not set |
| 9.2 | NIBUT banding | ≥10s green; 5–9.9s amber; <5s red (or per-practice) |
| 9.3 | Oxford/Guillon grade labels | Fluorescein 0–5 Oxford scale labels; lipid 1–5 Guillon labels shown alongside numeric grade |
