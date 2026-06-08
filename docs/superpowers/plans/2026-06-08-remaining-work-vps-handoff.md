# TearFlex — Remaining Work & VPS Handoff Plan

**Date:** 2026-06-08
**Repo:** https://github.com/lukedigitalpanda/tearflex.git (branch `master`)
**Audience:** picking this up on a VPS that has Docker + Python + Node available.

---

## 0. Where things stand

| Component | State |
|---|---|
| **Web client** (`web/`) | ✅ Built & merged to `master`. Full Next.js 14 app: httpOnly-cookie BFF auth, patients, assessments/results, reports UI, settings, clinician admin. 17 tests + lint + build green. |
| **Backend core** (`backend/`) | ✅ Pre-existing scaffold: `accounts`, `patients`, `assessments` apps (models, serializers, views, JWT auth) all functional. |
| **Backend additions** | 📝 **Planned, not built.** `reports` app (PDF) + clinician-invite endpoint + JWT blacklist fix. Couldn't run here (no Docker/Python). Plan: `docs/superpowers/plans/2026-06-08-backend-additions.md`. |
| **Backend analysis** (NIBUT pipeline) | ⛔ Not started. Needs its own spec → plan. |
| **Mobile app** (`mobile/`) | ⛔ Placeholder only. Needs its own spec → plan. |
| **Production deployment** | ⛔ Not started. `docker-compose.yml` runs Postgres + Redis only; no Dockerfile for Django/web yet. |

**Architecture reminder:** the browser never calls Django directly. It calls the Next.js BFF (`web/src/app/api/*`), which talks to Django server-side using a server-only `API_URL`. Therefore **browser↔Django CORS is not used** in this design — only the Next.js server needs network access to Django.

---

## Phase A — Bring the existing stack up on the VPS and verify end-to-end

Goal: log into the web app against the real backend. This proves the whole slice works before adding anything.

### A1. Clone and start infrastructure
```bash
git clone https://github.com/lukedigitalpanda/tearflex.git
cd tearflex/backend
cp .env.example .env          # edit SECRET_KEY at minimum
docker compose up -d          # Postgres 16 + Redis 7
```

### A2. Backend (Django) via virtualenv
```bash
cd tearflex/backend
python3.12 -m venv venv && source venv/bin/activate
pip install -r requirements/dev.txt
python manage.py migrate
python manage.py createsuperuser   # creates a Django User
python manage.py runserver 0.0.0.0:8000
```
API docs available at `http://<vps>:8000/api/docs/`.

### A3. Seed a Practice + Clinician (required to log in)
The web app's `me` endpoint needs the logged-in `User` to have a linked `Clinician`. There is **no self-registration endpoint** yet (invite-based onboarding arrives in Phase B). So, via Django admin (`/admin/`, log in as the superuser):
1. Create a **Practice** (name, address, postcode…).
2. Create a **Clinician** linking your superuser `User` to that Practice, role = `admin`.

(Or script it via `manage.py shell` — see Phase B for an invite flow that automates new clinicians.)

### A4. Web client
```bash
cd tearflex/web
npm install
cp .env.example .env.local     # set API_URL to where Django runs, e.g. http://localhost:8000/api
npm run build && npm start      # or `npm run dev` for development
```
Open `http://<vps>:3000/login`, sign in with the superuser credentials, and confirm: dashboard loads, patient list/profile, create a patient, open an assessment.

### A5. Definition of done for Phase A
- Login works end-to-end (cookies set by the BFF; `me` returns your clinician/practice).
- Patient CRUD + search works against real data.
- Assessment detail renders (results will be empty until captures exist — expected).
- Reports/clinician-invite buttons return errors/empty (those endpoints don't exist yet — Phase B).

---

## Phase B — Execute the backend-additions plan

Now that Docker + Python are available, run the **already-written** plan that the web UI depends on.

**Plan file:** `docs/superpowers/plans/2026-06-08-backend-additions.md` (11 tasks, TDD).

It delivers:
1. **pytest + factory-boy** test harness.
2. **JWT blacklist fix** — installs `rest_framework_simplejwt.token_blacklist` (refresh rotation is on and currently errors without it). *Do this early; it affects login refresh.*
3. **`reports` app** — `Report` model, WeasyPrint HTML→PDF generator, `generate`/`download`/list endpoints, admin. Adds `weasyprint` (needs native libs: `apt-get install libpango-1.0-0 libpangocairo-1.0-0 libgdk-pixbuf2.0-0` on Debian/Ubuntu).
4. **Clinician invite** — `ClinicianInvite` model + admin-gated `POST /api/auth/practice/clinicians/invite/`.

**How to execute:** either follow the plan task-by-task, or run it with the subagent-driven workflow. Verify with `pytest` (needs `docker compose up -d` for the test Postgres) and `python manage.py spectacular --file schema.yml`.

**After Phase B:** the web app's **Reports** page (generate + download PDF) and **Settings → Clinicians → Invite** flow light up end-to-end. Re-test those in the browser.

---

## Phase C — Backend analysis sub-project (NIBUT pipeline) — needs spec + plan

Not yet specced. Scope (from `CLAUDE.md` §Analysis Pipeline):
- `apps/analysis/nibut.py` — deterministic CV pipeline: frame extraction (FFmpeg/`ffmpeg` system dep), Placido ring detection (OpenCV Hough), per-frame distortion metric, first/mean break-up timing, heatmap generation.
- `apps/analysis/utils.py`, plus `fluorescein.py` / `lipid.py` later.
- Wire the Celery task in `apps/assessments/tasks.py` (`process_capture`) to call the pipeline and populate `TestResult`; the upload→analyse→poll flow already exists.
- Dependencies: `opencv-python`, `numpy`, `scikit-image`, `Pillow`, system `ffmpeg`.

**Verification is the hard part** — needs real 4K/60fps Placido capture video. Plan should include a small set of reference clips + expected break-up ranges as fixtures.

**Next step:** run the brainstorming → writing-plans flow for this sub-project (or ask Claude Code to). It's independent of the web client (API contract for `TestResult` is already fixed and the web already renders all the fields).

---

## Phase D — Mobile app sub-project — needs spec + plan

Not yet specced. Scope (from `CLAUDE.md` §Mobile + Capture Screen):
- Expo SDK 52 app: auth (expo-secure-store), patient list, and the **capture flow** (the key screen) — camera viewfinder, Placido alignment overlay, capture state machine, then processing/results screens.
- Reuses the `shared/` types and the same API contract; auth differs (mobile holds tokens in secure storage and calls Django directly, since there's no BFF on device — or proxies through a mobile-friendly endpoint).
- **Verification needs a physical device + the Placido attachment** — not doable in CI.

**Next step:** its own brainstorming → spec → plan cycle. Lowest priority for a server-side VPS pickup; do it when hardware is available.

---

## Phase E — Production hardening & deployment (VPS)

Currently dev-only. Before real patient data:

1. **Containerise the apps.**
   - Add `backend/Dockerfile` (Python 3.12, gunicorn, `weasyprint` native libs, `ffmpeg`).
   - Add a Celery worker service (same image, `celery -A tearflex worker`).
   - Add `web/Dockerfile` (Next.js standalone build).
   - Extend `docker-compose.yml` (or a `docker-compose.prod.yml`) to run db, redis, web (Django), worker, and the Next.js app together.
2. **Reverse proxy + HTTPS** — Caddy or nginx in front; terminate TLS (Let's Encrypt). Route `/` → Next.js, keep Django internal (Next BFF reaches it over the compose network, e.g. `API_URL=http://backend:8000/api`).
3. **Settings/secrets** — create `backend/tearflex/settings/prod.py` (referenced in `CLAUDE.md` but absent): `DEBUG=False`, real `SECRET_KEY`, `ALLOWED_HOSTS`, secure cookie/SSL settings. Put secrets in env, never in git.
4. **Media/object storage** — wire S3 or MinIO for `MEDIA` (video captures are 50–150 MB; `CLAUDE.md` notes chunked/direct upload). `django-storages` + the `AWS_*` env vars from `CLAUDE.md`.
5. **Web cookies in prod** — the BFF already sets `secure` cookies when `NODE_ENV=production`; ensure the app runs behind HTTPS so they're sent.
6. **Compliance (SaMD / GDPR / UK DPA), per `CLAUDE.md` §Important Notes** — encryption at rest for patient records + video, data export/deletion endpoints (subject access requests), retention policy, audit logging, and IEC 62304 documentation (SBOM, versioning). Treat these as their own work items.
7. **CI** — run `web`: `npm test && npm run lint && npm run build`; `backend`: `pytest` against a Postgres service. (No CI exists yet.)

---

## Recommended order on the VPS

1. **Phase A** (bring-up + verify) — fastest path to a working demo.
2. **Phase B** (backend additions) — completes the web app's feature set end-to-end.
3. **Phase E** items 1–3 (containerise + HTTPS + prod settings) — if you want it reachable/secure for others.
4. **Phase C** (NIBUT analysis) — the core clinical value; do when you can supply reference video.
5. **Phase D** (mobile) — when hardware is available.

Each of Phases C, D (and the larger Phase E work) should get its own brainstorm → spec → plan before coding, the same way the web client was built. The two existing plans (`web-client`, `backend-additions`) are the template.

---

## Quick reference — env wiring

| Where | Var | Value (dev) | Notes |
|---|---|---|---|
| `backend/.env` | `SECRET_KEY` | (random) | change for prod |
| | `DEBUG` | `True` | `False` in prod |
| | `ALLOWED_HOSTS` | `localhost,127.0.0.1,<vps-host>` | add your domain |
| | `DB_*` / `REDIS_URL` | match `docker-compose.yml` | |
| `web/.env.local` | `API_URL` | `http://localhost:8000/api` | **server-only**; where the BFF reaches Django. In compose, `http://backend:8000/api`. Never `NEXT_PUBLIC_*`. |

CORS between browser and Django is **not** needed (BFF is server-to-server). `CORS_ALLOWED_ORIGINS` in the backend env is only relevant if something calls Django directly from a browser (e.g. a future mobile web build).
