# Complete Web Client Design

**Date:** 2026-06-08
**Status:** Approved for planning
**Scope:** The complete TearFlex Next.js web client — auth, patient management,
assessment/results views, PDF reports, and practice/clinician administration —
wired to the existing Django backend, plus the minimal backend additions those
features require (`reports` app, clinician-invite endpoint).

---

## 1. Goal & Scope

Build the full TearFlex web client: the practice-facing management, reporting,
and admin surface. A clinician can log in, browse and search their practice's
patients, view a patient profile with assessment history and a NIBUT trend
chart, drill into an assessment to see captures and colour-coded results,
generate and download a PDF report, create/edit patients, administer the
practice's clinicians (including invites), and edit practice-level clinical
thresholds.

This sub-project spans some backend work, because two web features depend on
backend endpoints that do not yet exist (§4a). Those additions are scoped here so
the web pages are actually functional.

### In scope
**Web client**
- Next.js 14 (App Router) + TypeScript + Tailwind + shadcn/ui project scaffold.
- Auth: login, logout, session persistence, route protection (httpOnly-cookie
  BFF — see §4).
- Patient list (searchable, paginated), patient profile, create/edit patient.
- NIBUT trend chart (Recharts) on the patient profile.
- Assessment detail: captures + full `TestResult` display (NIBUT headline plus
  fluorescein and lipid fields, each rendering gracefully when null).
- Reports: generate a PDF for an assessment, preview, and download.
- Practice settings: view/edit practice details + NIBUT thresholds.
- Clinician admin: list clinicians, invite a new clinician.
- Completion of shared types (`shared/types/user.ts`, `api.ts`,
  `shared/constants/testTypes.ts`) to match the real serializers.
- Design system (teal palette, Inter, status colours) in Tailwind + shadcn theme.

**Backend additions required by the above (§4a)**
- `reports` app: `Report` model, WeasyPrint PDF generator, `generate` + `download`
  endpoints.
- Clinician-invite endpoint under `accounts`.

### Explicitly out of scope
- **Capture / video upload flow** — this is a mobile-only product surface (camera
  + Placido attachment). It belongs to the separate **mobile** sub-project and
  cannot be a web feature.
- **Fluorescein and lipid *analysis*** — the web *display* includes these fields,
  but the backend only populates NIBUT until the separate **backend-analysis**
  sub-project lands. Web shows "—"/"Not assessed" for unpopulated fields.
- Real end-to-end data verification (deferred; see §8).

---

## 2. The Real API Contract

Confirmed by reading the backend serializers/urls (differs slightly from
CLAUDE.md). The web app targets these Django endpoints **via the BFF**:

| Purpose | Method & Path | Notes |
|---|---|---|
| Login (JWT pair) | `POST /api/auth/login/` | `{username, password}` → `{access, refresh}` |
| Refresh | `POST /api/auth/refresh/` | `{refresh}` → `{access}` |
| Current user | `GET /api/auth/me/` | `{user, clinician{...practice}}` |
| Practice detail | `GET/PATCH /api/auth/practice/` | includes `nibut_normal_threshold`, `nibut_borderline_threshold` |
| Clinicians | `GET /api/auth/practice/clinicians/` | list (read-only this sprint) |
| Patients | `GET/POST /api/patients/` | paginated, searchable |
| Patient detail | `GET/PATCH/DELETE /api/patients/{id}/` | DELETE = soft delete (`is_active`) |
| Patient trend | `GET /api/patients/{id}/trend/` | NIBUT time series for charting |
| Assessments | `GET/POST /api/assessments/` | filter by `patient`, `status`, `eye` |
| Assessment detail | `GET/PATCH /api/assessments/{id}/` | includes `captures[].result` |
| Generate report | `POST /api/reports/generate/` | **new** (§4a); `{assessment}` → `Report` |
| Download report | `GET /api/reports/{id}/download/` | **new** (§4a); streams PDF |
| List reports | `GET /api/reports/` | **new** (§4a); practice-scoped |
| Invite clinician | `POST /api/auth/practice/clinicians/invite/` | **new** (§4a) |

Key serializer field shapes (used to define TS types):
- **Patient list:** `id, first_name, last_name, full_name, date_of_birth, latest_severity, updated_at`
- **Patient detail:** adds `sex, email, phone, nhs_number, notes, is_active, created_at`
- **Assessment list:** `id, patient, patient_name, eye, status, assessed_at, capture_count`
- **Assessment detail:** adds `clinician_name, notes, updated_at, captures[]`
- **TestCapture:** `id, test_type, video_file, thumbnail, duration_seconds, resolution_*, fps, device_model, status, captured_at, result`
- **TestResult:** `nibut_first_breakup_seconds, nibut_mean_breakup_seconds, nibut_heatmap, fluorescein_grade, fluorescein_breakup_seconds, lipid_grade, lipid_thickness_nm, tear_meniscus_height_mm, dry_eye_severity, confidence_score, analysis_version, processing_time_seconds, analysed_at`
- **Me:** `{ user{id,username,email,first_name,last_name}, clinician{id,title,professional_registration,role,practice{...}} }`

`latest_severity` and `dry_eye_severity` are one of `normal|mild|moderate|severe`
(or null), driving status colours.

---

## 3. Architecture Overview

```
Browser (client components, TanStack Query)
   │  same-origin fetch, httpOnly cookies sent automatically
   ▼
Next.js BFF  (route handlers under web/src/app/api/*)
   │  reads access token from httpOnly cookie, attaches Bearer header,
   │  refreshes on 401, re-issues cookie
   ▼
Django REST API (unchanged)
```

The browser never holds a token in JavaScript. The Next.js server is the only
party that reads the cookie and talks to Django.

---

## 4. Auth Design (httpOnly cookies via BFF)

### Cookies
- `tf_access` — httpOnly, secure (in prod), `SameSite=Lax`, short-lived.
- `tf_refresh` — httpOnly, secure, `SameSite=Lax`, longer-lived, path scoped to
  the refresh route handler.

### Route handlers (the BFF)
- `POST /api/auth/login` — body `{username, password}`; calls Django
  `/api/auth/login/`; on success sets `tf_access` + `tf_refresh` cookies; returns
  `{ ok: true }` (no tokens in the body).
- `POST /api/auth/logout` — clears both cookies.
- `GET /api/auth/me` — proxies Django `/api/auth/me/` with the access token.
- A **catch-all proxy** `/<...path>` (e.g. `web/src/app/api/proxy/[...path]/route.ts`)
  forwards `patients/`, `assessments/`, `auth/practice/` GET/POST/PATCH/DELETE to
  Django with the Bearer header, returning the JSON verbatim.

### Refresh logic (server-side)
A shared `serverFetch(path, init)` helper used by every route handler:
1. Attach `Authorization: Bearer <tf_access>`.
2. If Django returns 401, POST `tf_refresh` to Django `/api/auth/refresh/`.
3. On refresh success: set a new `tf_access` cookie, retry the original request once.
4. On refresh failure: clear cookies, return 401 (client redirects to `/login`).

### Route protection
- A `middleware.ts` matcher on `(dashboard)` routes checks for the presence of
  `tf_refresh`; if absent, redirect to `/login`. (Presence check only — validity
  is enforced by the API layer, which redirects on a hard 401.)
- The dashboard layout calls `me` on mount; a 401 clears client state and routes
  to login.

### Client session state (Zustand)
Holds only **non-sensitive** session context derived from `me`
(`user`, `clinician`, `practice`) plus an `isAuthenticated` flag. No tokens.

---

## 4a. Backend Additions (required by reports & clinician admin)

These are built as part of this sub-project because the web pages depend on them.
Both follow the existing app's practice-scoping conventions.

### `reports` app (currently stubbed)
- **`Report` model:** `assessment (FK)`, `pdf_file (FileField)`, `generated_by
  (FK Clinician, null)`, `created_at`, `status (pending|ready|failed)`.
- **`generators.py`:** `generate_assessment_report(assessment) -> Report` —
  renders an HTML template (practice header, patient demographics, per-capture
  results with severity colours, NIBUT trend) to PDF via **WeasyPrint**, saves to
  storage. Synchronous for MVP (reports are small); structured so it can move to a
  Celery task later.
- **Endpoints:** `POST /api/reports/generate/` (body `{assessment}`, practice-scoped,
  returns the `Report`), `GET /api/reports/{id}/download/` (streams the PDF with
  `Content-Disposition`), `GET /api/reports/` (list, practice-scoped).
- **Serializer + URLs + admin** wired; `weasyprint` added to `requirements/base.txt`.

### Clinician invite (`accounts`)
- **Endpoint:** `POST /api/auth/practice/clinicians/invite/` — body `{email,
  first_name, last_name, role}`. Creates an inactive `User` + `Clinician` in the
  caller's practice and issues a single-use invite token (stored on a small
  `ClinicianInvite` model). For MVP the response returns the invite link/token
  (email delivery is a later concern); admin-role permission required.
- This keeps registration **invite-based** per CLAUDE.md without building the full
  email pipeline now.

---

## 5. Data Layer

- `lib/api.ts` — thin same-origin client wrapper over the BFF (`/api/proxy/...`).
  Typed methods (`get`, `post`, `patch`, `del`) returning parsed JSON or throwing
  a typed `ApiError { status, detail }`. Credentials always included so cookies flow.
- `hooks/useAuth.ts` — `useMe()` query, `useLogin()`/`useLogout()` mutations.
- `hooks/usePatients.ts` — `usePatients(search, page)`, `usePatient(id)`,
  `useCreatePatient()`, `useUpdatePatient()`, `usePatientTrend(id)`.
- `hooks/useAssessments.ts` — `useAssessments(filters)`, `useAssessment(id)`.
- `hooks/usePractice.ts` — `usePractice()`, `useUpdatePractice()`,
  `useClinicians()`, `useInviteClinician()`.
- `hooks/useReports.ts` — `useReports()`, `useGenerateReport()`, plus a download
  helper that hits the BFF download proxy.
- TanStack Query for caching/invalidation; React Hook Form + Zod for the
  login, new-patient, and settings forms (schemas in `lib/schemas.ts`).

---

## 6. Routes & Pages

```
src/app/
  (auth)/
    login/page.tsx              # login form → POST /api/auth/login → /dashboard
  (dashboard)/
    layout.tsx                  # Sidebar + Header shell; loads `me`; guards session
    page.tsx                    # Dashboard: counts, recent assessments, quick actions
    patients/
      page.tsx                  # Searchable, paginated patient list + "New patient"
      [id]/
        page.tsx                # Profile: demographics, TrendChart, assessment history
        assessments/
          [assessmentId]/page.tsx  # Assessment detail: captures + results + "Generate report"
    reports/
      page.tsx                  # Reports list: generated PDFs, download
    settings/
      page.tsx                  # Practice details + editable NIBUT thresholds
      clinicians/page.tsx       # Clinician admin: list + invite (admin role only)
  api/
    auth/{login,logout,me}/route.ts
    proxy/[...path]/route.ts    # generic authenticated proxy to Django
    download/[id]/route.ts      # streams report PDF from Django through the cookie auth
  layout.tsx, globals.css
```

---

## 7. Components & Design System

### Components (mirroring CLAUDE.md structure)
- `components/layout/`: `Sidebar`, `Header`.
- `components/patients/`: `PatientList`, `PatientCard`, `PatientProfile`, `TrendChart`.
- `components/assessments/`: `ResultsDisplay` (NIBUT + fluorescein + lipid),
  `TearFilmHeatmap`.
- `components/reports/`: `ReportPreview`, `GenerateReportButton`.
- `components/settings/`: `ClinicianTable`, `InviteClinicianDialog`,
  `ThresholdForm`.
- `components/common/`: `StatusBadge` (severity → colour), `EmptyState`,
  `LoadingState`.
- `components/ui/`: shadcn primitives (button, card, dialog, input, table, badge,
  form, select, skeleton).

### Severity → colour mapping (single source of truth)
A `lib/severity.ts` maps `normal|mild|moderate|severe` to the
`DRY_EYE_SEVERITY_COLOURS` tokens and human labels, consumed by `StatusBadge`,
the trend chart, and the results headline. NIBUT seconds are colour-banded using
the practice thresholds from `me`/`practice` (default 10 / 5), **not** hardcoded.

### Theme
Tailwind config + shadcn CSS variables set primary = teal `#0E7C7B`, neutrals =
slate, status = green/amber/orange/red. Inter loaded via `next/font`. Result
numbers use tabular figures.

---

## 8. Verification Approach

Per decision: build to the documented contract; verify the app **compiles,
type-checks, lints, and renders via the Next.js dev server**. Live data
integration is deferred to a session where the Django backend is running
(Docker + Postgres + Redis).

Concretely, "done" for this sprint means:
- `npm run build` and `tsc --noEmit` pass with no errors.
- `npm run lint` passes.
- `npm run dev` boots; `/login` renders; with the session-guard satisfied,
  dashboard routes render their loading/empty states without runtime errors.
- The BFF route handlers are unit-shaped so they degrade gracefully (a failed
  Django call surfaces a typed error and the UI shows an error state, not a crash).

A lightweight automated check: a Vitest + Testing Library smoke test per page
component rendering against mocked hooks, plus a unit test of the `severity.ts`
banding logic against the threshold table.

The **backend additions** (§4a) are verified independently with Django tests
(`manage.py test apps.reports apps.accounts`): report generation produces a
`Report` with a non-empty PDF, the download endpoint streams it, and the invite
endpoint creates a scoped, inactive clinician and rejects non-admin callers.
These don't depend on the web client and can run before it exists.

---

## 9. Risks & Notes
- **Backend not running during build** → mitigated by contract-first build and
  component-level mocked tests; full integration flagged as a follow-up.
- **Pagination shape** — DRF default paginated response (`{count, next,
  previous, results}`) assumed; the proxy passes it through and `usePatients`
  reads `results`. Confirm page size matches backend `PAGE_SIZE`.
- **Practice-scoping** is enforced server-side by Django; the web app does not
  re-implement it, but must never expose a cross-practice id selector.
- **`video_file`/`nibut_heatmap`/`thumbnail`** are media URLs served by Django in
  dev; `TearFilmHeatmap` renders the `nibut_heatmap` URL with a graceful fallback
  when absent (MVP backend may not yet produce one).
- **WeasyPrint has native system dependencies** (Pango/Cairo/GDK-PixBuf) that are
  awkward to install on Windows. Mitigations: (a) the generator is isolated behind
  `generators.py` so the import is lazy and a missing native lib fails only the
  report path, not the whole app; (b) backend verification of report generation
  runs in the Docker/Linux image rather than bare Windows; (c) the PDF template is
  plain HTML/CSS so an alternate engine (e.g. `reportlab`) could be swapped without
  touching the endpoint contract if Windows-local generation is later needed.
- **Backend tests** run against a test database via `manage.py test` (SQLite or
  the Dockerised Postgres); they do not require the full dev stack to be up.

---

## 10. Deliverables Checklist

**Backend additions**
- [ ] `reports` app: `Report` model, WeasyPrint generator, serializer, endpoints, admin.
- [ ] `weasyprint` added to requirements; migration created.
- [ ] Clinician invite: `ClinicianInvite` model + invite endpoint (admin-gated).
- [ ] Backend tests for report generation and invite.

**Web client**
- [ ] Next.js project scaffolded in `web/` (App Router, TS, Tailwind, shadcn).
- [ ] Theme + fonts + design tokens wired.
- [ ] Shared types completed and imported.
- [ ] BFF route handlers (`login`, `logout`, `me`, proxy, download) + `serverFetch` refresh.
- [ ] `middleware.ts` session guard.
- [ ] Data hooks (auth, patients, assessments, practice, reports).
- [ ] Pages: login, dashboard, patient list, patient profile, assessment detail,
      reports, settings, clinician admin.
- [ ] Components + new-patient dialog + trend chart + results display + report
      preview + invite dialog.
- [ ] Smoke tests + severity unit test; build/lint/type-check green.
