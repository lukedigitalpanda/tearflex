# TearFlex VPS Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deploy TearFlex (Django backend + Next.js web client) to the production VPS at tearflex.mydryeapp.co.uk as a Docker Compose stack, then verify end-to-end login and patient flow (Phase A).

**Architecture:** 5-container Compose project (db, redis, backend, worker, web). Only the Next.js container (`web`) binds a host port (`127.0.0.1:3005`); everything else is internal to the compose network. The shared nginx container (`msp-service-desk-nginx-1`) proxies `tearflex.mydryeapp.co.uk` → port 3005. SSL via the shared certbot container. Phase B (backend additions — JWT blacklist, reports PDF, clinician invite) has its own existing plan; this plan ends after Phase A verification and hands off to it.

**Tech Stack:** Docker Compose, Python 3.12 / Django 5 / gunicorn, Node 20 / Next.js 14 standalone, Postgres 16, Redis 7, WhiteNoise, Certbot (Let's Encrypt).

---

## File Map

| File | Action |
|---|---|
| `backend/requirements/base.txt` | Modify — add `whitenoise` |
| `web/next.config.mjs` | Modify — add `output: 'standalone'` |
| `backend/tearflex/settings/prod.py` | Create — production Django settings |
| `backend/Dockerfile` | Create — Django/gunicorn image |
| `web/Dockerfile` | Create — Next.js standalone image |
| `docker-compose.prod.yml` | Create — all 5 services |
| `backend/.env.prod` | Create (gitignored) — secrets + DB creds |
| `web/.env.prod` | Create (gitignored) — API_URL |
| `.gitignore` | Modify — add `*.env.prod` |
| `/opt/msp-service-desk/deploy/nginx/conf.d/tearflex.conf` | Create — vhost config |

---

## Task 1: Prep repo — whitenoise, next standalone, gitignore

**Files:**
- Modify: `backend/requirements/base.txt`
- Modify: `web/next.config.mjs`
- Modify: `.gitignore`

- [ ] **Step 1: Add whitenoise to backend requirements**

Append to `backend/requirements/base.txt`:

```
whitenoise>=6,<7
```

Full file after edit:
```
Django>=5.1,<5.2
djangorestframework>=3.15,<4
djangorestframework-simplejwt>=5.3,<6
django-cors-headers>=4.3,<5
django-filter>=24.1,<25
drf-spectacular>=0.27,<1
psycopg2-binary>=2.9,<3
celery>=5.4,<6
redis>=5.0,<6
Pillow>=10.4,<11
gunicorn>=22,<23
whitenoise>=6,<7
```

- [ ] **Step 2: Enable Next.js standalone output**

Replace the contents of `web/next.config.mjs` with:

```js
/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
};

export default nextConfig;
```

- [ ] **Step 3: Gitignore env.prod files**

Append to `.gitignore`:

```
# Production env files (contain secrets)
*.env.prod
```

- [ ] **Step 4: Commit**

```bash
git add backend/requirements/base.txt web/next.config.mjs .gitignore
git commit -m "chore: prep for production containerisation"
```

---

## Task 2: Production Django settings

**Files:**
- Create: `backend/tearflex/settings/prod.py`

- [ ] **Step 1: Create prod.py**

Create `backend/tearflex/settings/prod.py`:

```python
import os
from .base import *

DEBUG = False
ALLOWED_HOSTS = os.environ.get(
    'ALLOWED_HOSTS', 'tearflex.mydryeapp.co.uk,localhost'
).split(',')

# Trust X-Forwarded-Proto from nginx
SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
SECURE_BROWSER_XSS_FILTER = True

# WhiteNoise for static files
MIDDLEWARE.insert(1, 'whitenoise.middleware.WhiteNoiseMiddleware')
STATICFILES_STORAGE = 'whitenoise.storage.CompressedManifestStaticFilesStorage'

# Media storage — local by default; switch to S3 by setting env vars
DEFAULT_FILE_STORAGE = os.environ.get(
    'DEFAULT_FILE_STORAGE',
    'django.core.files.storage.FileSystemStorage',
)
MEDIA_ROOT = os.environ.get('MEDIA_ROOT', '/app/media')

# S3 (leave blank for local; fill in to switch)
AWS_STORAGE_BUCKET_NAME = os.environ.get('AWS_STORAGE_BUCKET_NAME', '')
AWS_S3_REGION_NAME = os.environ.get('AWS_S3_REGION_NAME', '')
AWS_ACCESS_KEY_ID = os.environ.get('AWS_ACCESS_KEY_ID', '')
AWS_SECRET_ACCESS_KEY = os.environ.get('AWS_SECRET_ACCESS_KEY', '')
AWS_S3_ENDPOINT_URL = os.environ.get('AWS_S3_ENDPOINT_URL', '')
```

- [ ] **Step 2: Commit**

```bash
git add backend/tearflex/settings/prod.py
git commit -m "feat: add production Django settings"
```

---

## Task 3: Backend Dockerfile

**Files:**
- Create: `backend/Dockerfile`

- [ ] **Step 1: Create the Dockerfile**

Create `backend/Dockerfile`:

```dockerfile
FROM python:3.12-slim

# WeasyPrint native deps (for PDF reports) + ffmpeg (for Phase C NIBUT pipeline)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libgdk-pixbuf2.0-0 \
    libffi-dev \
    libcairo2 \
    libpq-dev \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements/base.txt requirements/base.txt
RUN pip install --no-cache-dir -r requirements/base.txt

COPY . .

# Collect static files at build time (no DB needed; dummy SECRET_KEY sufficient)
RUN SECRET_KEY=build-placeholder \
    DJANGO_SETTINGS_MODULE=tearflex.settings.base \
    python manage.py collectstatic --noinput

EXPOSE 8000
CMD ["gunicorn", "tearflex.wsgi:application", \
     "--bind", "0.0.0.0:8000", \
     "--workers", "3", \
     "--timeout", "120"]
```

- [ ] **Step 2: Verify the image builds**

Run from `backend/`:
```bash
docker build -t tearflex-backend-test .
```
Expected: image builds successfully, `Successfully tagged tearflex-backend-test:latest`.

- [ ] **Step 3: Clean up test image**

```bash
docker rmi tearflex-backend-test
```

- [ ] **Step 4: Commit**

```bash
git add backend/Dockerfile
git commit -m "feat: add backend Dockerfile"
```

---

## Task 4: Web Dockerfile

**Files:**
- Create: `web/Dockerfile`

- [ ] **Step 1: Create the Dockerfile**

Create `web/Dockerfile`:

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
# Ensure public dir exists (Next.js standalone requires it even if empty)
RUN mkdir -p public
# API_URL is server-only (not NEXT_PUBLIC_*) so it doesn't need to be set at build time
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
# standalone output includes only what's needed — no node_modules copy required
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
EXPOSE 3000
CMD ["node", "server.js"]
```

- [ ] **Step 2: Verify the image builds**

Run from `web/`:
```bash
docker build -t tearflex-web-test .
```
Expected: multi-stage build completes, final image is ~200–300MB (not 1GB+).

- [ ] **Step 3: Clean up test image**

```bash
docker rmi tearflex-web-test
```

- [ ] **Step 4: Commit**

```bash
git add web/Dockerfile
git commit -m "feat: add web Dockerfile"
```

---

## Task 5: Production Docker Compose

**Files:**
- Create: `docker-compose.prod.yml` (repo root)

- [ ] **Step 1: Create docker-compose.prod.yml**

Create `/opt/tearflex/docker-compose.prod.yml`:

```yaml
services:
  db:
    image: postgres:16-alpine
    restart: unless-stopped
    env_file: ./backend/.env.prod
    volumes:
      - pgdata:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    restart: unless-stopped

  backend:
    build:
      context: ./backend
    restart: unless-stopped
    env_file: ./backend/.env.prod
    environment:
      DJANGO_SETTINGS_MODULE: tearflex.settings.prod
    volumes:
      - media:/app/media
    depends_on:
      - db
      - redis

  worker:
    build:
      context: ./backend
    restart: unless-stopped
    command: celery -A tearflex worker -l info --concurrency 2
    env_file: ./backend/.env.prod
    environment:
      DJANGO_SETTINGS_MODULE: tearflex.settings.prod
    volumes:
      - media:/app/media
    depends_on:
      - db
      - redis

  web:
    build:
      context: ./web
    restart: unless-stopped
    env_file: ./web/.env.prod
    ports:
      - "127.0.0.1:3005:3000"
    depends_on:
      - backend

volumes:
  pgdata:
  media:
```

Note: the `db` service uses `env_file: ./backend/.env.prod`. Postgres reads `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD` from it and ignores the rest.

- [ ] **Step 2: Commit**

```bash
git add docker-compose.prod.yml
git commit -m "feat: add production Docker Compose"
```

---

## Task 6: Env files (secrets — not committed)

**Files:**
- Create: `backend/.env.prod`
- Create: `web/.env.prod`

- [ ] **Step 1: Generate secrets**

Run to generate a SECRET_KEY and strong DB password:
```bash
python3 -c "import secrets; print('SECRET_KEY=' + secrets.token_urlsafe(50))"
python3 -c "import secrets; print('DB_PASSWORD=' + secrets.token_urlsafe(32))"
```
Copy both values — you'll need them in the next step.

- [ ] **Step 2: Create backend/.env.prod**

Create `backend/.env.prod` with the generated values filled in:

```
# Django
SECRET_KEY=<generated above>
DEBUG=False
ALLOWED_HOSTS=tearflex.mydryeapp.co.uk,localhost
DB_NAME=tearflex
DB_USER=tearflex
DB_PASSWORD=<generated above>
DB_HOST=db
DB_PORT=5432
REDIS_URL=redis://redis:6379/0
CORS_ALLOWED_ORIGINS=https://tearflex.mydryeapp.co.uk
MEDIA_ROOT=/app/media

# S3 (leave blank to use local filesystem)
DEFAULT_FILE_STORAGE=django.core.files.storage.FileSystemStorage
AWS_STORAGE_BUCKET_NAME=
AWS_S3_REGION_NAME=
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_S3_ENDPOINT_URL=

# Postgres container (must match DB_* above)
POSTGRES_DB=tearflex
POSTGRES_USER=tearflex
POSTGRES_PASSWORD=<same DB_PASSWORD as above>
```

- [ ] **Step 3: Create web/.env.prod**

Create `web/.env.prod`:

```
API_URL=http://backend:8000/api
```

- [ ] **Step 4: Verify files are gitignored**

```bash
git status
```
Expected: neither `backend/.env.prod` nor `web/.env.prod` appears in the output (they are ignored).

---

## Task 7: Build and start the stack

All commands run from `/opt/tearflex/`.

- [ ] **Step 1: Build and start all containers**

```bash
docker compose -f docker-compose.prod.yml up -d --build
```
Expected: builds both images (~3–5 minutes first time), starts 5 containers. May show some warnings about build context size — these are OK.

- [ ] **Step 2: Check all containers are running**

```bash
docker compose -f docker-compose.prod.yml ps
```
Expected: all 5 services show `running` or `Up`. If any are `Exited`, check logs:
```bash
docker compose -f docker-compose.prod.yml logs <service-name>
```

- [ ] **Step 3: Run database migrations**

```bash
docker compose -f docker-compose.prod.yml exec backend python manage.py migrate
```
Expected: applies all migrations including `accounts`, `patients`, `assessments`, `analysis`. Ends with "Applying ... OK".

- [ ] **Step 4: Verify Django system check**

```bash
docker compose -f docker-compose.prod.yml exec backend python manage.py check
```
Expected: "System check identified no issues (0 silenced)."

- [ ] **Step 5: Create Django superuser**

```bash
docker compose -f docker-compose.prod.yml exec -it backend python manage.py createsuperuser
```
Enter a username, email, and password when prompted. This creates the `User` record — you still need to link it to a Practice+Clinician (next step).

- [ ] **Step 6: Create Practice and Clinician via Django shell**

The web app's `/api/auth/me/` endpoint requires the logged-in User to have a linked Clinician. Run:

```bash
docker compose -f docker-compose.prod.yml exec backend python manage.py shell
```

Then inside the shell:
```python
from django.contrib.auth.models import User
from apps.accounts.models import Practice, Clinician

u = User.objects.get(username='<your superuser username>')
p = Practice.objects.create(
    name='TearFlex Demo Practice',
    address_line_1='1 Test Street',
    city='London',
    postcode='EC1A 1BB',
)
Clinician.objects.create(user=u, practice=p, role='admin')
print('Done — Clinician linked to Practice.')
exit()
```

---

## Task 8: Nginx HTTP config

**File:** `/opt/msp-service-desk/deploy/nginx/conf.d/tearflex.conf`

- [ ] **Step 1: Create HTTP-only nginx config**

Create `/opt/msp-service-desk/deploy/nginx/conf.d/tearflex.conf`:

```nginx
server {
    listen 80;
    server_name tearflex.mydryeapp.co.uk;

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        proxy_pass http://127.0.0.1:3005;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        client_max_body_size 250M;
    }
}
```

- [ ] **Step 2: Test nginx config**

```bash
docker exec msp-service-desk-nginx-1 nginx -t
```
Expected: `syntax is ok` / `test is successful`.

- [ ] **Step 3: Reload nginx**

```bash
docker exec msp-service-desk-nginx-1 nginx -s reload
```

- [ ] **Step 4: Verify HTTP routing**

```bash
curl -I http://tearflex.mydryeapp.co.uk
```
Expected: `HTTP/1.1 200 OK` or a redirect from Next.js. If you get a connection refused or 502, check that the web container is healthy:
```bash
docker compose -f docker-compose.prod.yml logs web
```

**Prerequisite:** The DNS A record `tearflex.mydryeapp.co.uk → 76.13.254.227` must be configured before this step. If it isn't yet, set it now and wait for propagation (typically 5–30 minutes).

Verify DNS is live:
```bash
dig +short tearflex.mydryeapp.co.uk
```
Expected: `76.13.254.227`

---

## Task 9: SSL certificate and HTTPS

- [ ] **Step 1: Issue the certificate**

```bash
docker exec msp-service-desk-certbot-1 certbot certonly \
  --webroot \
  --webroot-path=/var/www/certbot \
  --email admin@digital-panda.co.uk \
  --agree-tos \
  --no-eff-email \
  -d tearflex.mydryeapp.co.uk
```
Expected: "Successfully received certificate." Certificate stored at `/etc/letsencrypt/live/tearflex.mydryeapp.co.uk/`.

If it fails with a DNS or connection error, confirm DNS propagation first (Step 0 of Task 8).

- [ ] **Step 2: Update nginx config to full HTTPS**

Replace the contents of `/opt/msp-service-desk/deploy/nginx/conf.d/tearflex.conf` with:

```nginx
server {
    listen 80;
    server_name tearflex.mydryeapp.co.uk;

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        return 301 https://$host$request_uri;
    }
}

server {
    listen 443 ssl;
    server_name tearflex.mydryeapp.co.uk;

    ssl_certificate /etc/letsencrypt/live/tearflex.mydryeapp.co.uk/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/tearflex.mydryeapp.co.uk/privkey.pem;

    client_max_body_size 250M;

    location / {
        proxy_pass http://127.0.0.1:3005;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

- [ ] **Step 3: Test and reload nginx**

```bash
docker exec msp-service-desk-nginx-1 nginx -t && docker exec msp-service-desk-nginx-1 nginx -s reload
```
Expected: `syntax is ok`, then reload succeeds.

- [ ] **Step 4: Verify HTTPS**

```bash
curl -I https://tearflex.mydryeapp.co.uk
```
Expected: `HTTP/2 200` (or `HTTP/1.1 200 OK`). If you get a certificate error, check the cert path matches `/etc/letsencrypt/live/tearflex.mydryeapp.co.uk/`.

Also verify HTTP redirects to HTTPS:
```bash
curl -I http://tearflex.mydryeapp.co.uk
```
Expected: `HTTP/1.1 301 Moved Permanently` with `Location: https://tearflex.mydryeapp.co.uk/`.

---

## Task 10: Phase A — End-to-end verification

Open `https://tearflex.mydryeapp.co.uk` in a browser and confirm:

- [ ] **Step 1: Login works**

Navigate to `/login`. Sign in with the superuser credentials created in Task 7, Step 5.

Expected: redirected to dashboard (`/`). No error, no redirect loop. The browser's DevTools → Application → Cookies should show an httpOnly `session` cookie set by the Next.js BFF.

- [ ] **Step 2: Dashboard loads**

Expected: dashboard page renders (patient count, empty states). No console errors.

- [ ] **Step 3: Create a patient**

Navigate to `/patients` → click "New Patient" → fill in a name, DOB, and click Save.

Expected: patient appears in the patient list. No 500 errors.

- [ ] **Step 4: Patient profile loads**

Click into the patient you just created.

Expected: patient profile renders with empty assessment list. No 500 errors.

- [ ] **Step 5: Reports and Invite buttons return expected errors**

Navigate to `/reports` and `/settings/clinicians`. Try the Generate Report and Invite Clinician buttons.

Expected: errors (404 or similar) — these endpoints don't exist yet. This is correct; Phase B builds them.

- [ ] **Step 6: Confirm all other apps still work**

Spot-check at least two other apps on the server to confirm the shared nginx wasn't disrupted:
```bash
curl -I https://desk.digital-panda.co.uk
curl -I https://repairs.digital-panda.co.uk
```
Expected: both return 200 or their normal response.

---

## Task 11: Hand off to Phase B

Phase A is complete. The stack is live and the core patient/assessment flow works.

- [ ] **Step 1: Execute the backend-additions plan**

The plan is at `docs/superpowers/plans/2026-06-08-backend-additions.md`. It has 11 tasks covering:
1. pytest + factory-boy test harness
2. JWT blacklist fix (affects login refresh — do this first)
3. `reports` app — Report model, WeasyPrint PDF generator, generate/download/list endpoints
4. Clinician invite endpoint (admin-gated)

**How to run it:** use the `superpowers:subagent-driven-development` skill, pointing it at that plan file. Alternatively, follow it task-by-task in this session.

**Environment for Phase B:** all commands in that plan run inside the container:
```bash
# Instead of: pytest ...
docker compose -f docker-compose.prod.yml exec backend pytest ...

# Instead of: python manage.py ...
docker compose -f docker-compose.prod.yml exec backend python manage.py ...
```

Or open a shell:
```bash
docker compose -f docker-compose.prod.yml exec backend bash
```

**WeasyPrint native deps** are already installed in the Docker image (Task 3 of this plan) — no `apt-get` needed inside the container for Phase B Task 4.

- [ ] **Step 2: After Phase B — retest Reports and Invite**

Once Phase B is complete, return to `https://tearflex.mydryeapp.co.uk` and verify:
- `/reports` → Generate Report creates a PDF and the Download button works
- `/settings/clinicians` → Invite Clinician creates an inactive user and returns a token
