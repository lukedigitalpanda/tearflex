# TearFlex VPS Deployment Design

**Date:** 2026-06-08
**Domain:** tearflex.mydryeapp.co.uk
**Server IP:** 76.13.254.227

---

## Overview

Deploy the existing TearFlex stack (Next.js 14 web client + Django 5 backend) onto the production VPS as a self-contained Docker Compose project, then execute the backend-additions plan (Phase B) to complete the web client's feature set.

The VPS already runs multiple apps sharing a single nginx container (`msp-service-desk-nginx-1`). TearFlex follows the same pattern: its own compose project, a new nginx vhost file, SSL via the shared certbot container.

---

## Architecture

```
Browser
  └─▶ nginx (msp-service-desk-nginx-1, shared, ports 80/443)
        └─▶ 127.0.0.1:3005  ──▶ [tearflex-web]     Next.js 14 standalone
                                        │
                               compose network (tearflex)
                                        │
                              [tearflex-backend]    Django 5 / gunicorn :8000
                              [tearflex-worker]     Celery worker (same image)
                              [tearflex-db]         Postgres 16-alpine
                              [tearflex-redis]      Redis 7-alpine
```

**Key constraints:**
- Django is never exposed to nginx or the browser. Only the Next.js BFF calls it, server-side, via the internal compose network (`http://backend:8000/api`).
- Postgres and Redis bind no host ports — internal only.
- Next.js binds `127.0.0.1:3005` on the host — nginx proxies to it.
- Django does not need to be in `ALLOWED_HOSTS` for tearflex.mydryeapp.co.uk — only `localhost` and `tearflex.mydryeapp.co.uk` are needed (health checks + future direct access).

**Port allocation** (all existing server ports up to 8004/3004 are taken):
- Next.js host port: `3005`
- Django is internal only (no host binding needed; backend additions plan may add `127.0.0.1:8005` for admin access if required)

---

## Files to Create / Modify

| File | Action | Purpose |
|---|---|---|
| `backend/Dockerfile` | Create | Python 3.12-slim + WeasyPrint native libs + ffmpeg |
| `web/Dockerfile` | Create | Node 20-alpine, Next.js standalone build |
| `docker-compose.prod.yml` | Create | All 5 services, production config |
| `backend/tearflex/settings/prod.py` | Create | DEBUG=False, secure cookies, WhiteNoise statics |
| `backend/requirements/base.txt` | Modify | Add `whitenoise>=6,<7` |
| `web/next.config.mjs` | Modify | Add `output: 'standalone'` |
| `backend/.env.prod` | Create (not committed) | Secrets, DB creds, ALLOWED_HOSTS, AWS placeholders |
| `web/.env.prod` | Create (not committed) | `API_URL=http://backend:8000/api` |
| `/opt/msp-service-desk/deploy/nginx/conf.d/tearflex.conf` | Create | HTTP→HTTPS redirect + proxy to port 3005 |

---

## Dockerfile: Backend

```dockerfile
FROM python:3.12-slim

# WeasyPrint native deps + ffmpeg (for Phase C NIBUT analysis)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpango-1.0-0 libpangocairo-1.0-0 libgdk-pixbuf2.0-0 \
    libffi-dev libcairo2 libpq-dev \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements/base.txt requirements/base.txt
RUN pip install --no-cache-dir -r requirements/base.txt

COPY . .

RUN python manage.py collectstatic --noinput

EXPOSE 8000
CMD ["gunicorn", "tearflex.wsgi:application", "--bind", "0.0.0.0:8000", "--workers", "3", "--timeout", "120"]
```

The `worker` service uses the same image with command override:
`celery -A tearflex worker -l info --concurrency 2`

---

## Dockerfile: Web

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
EXPOSE 3000
CMD ["node", "server.js"]
```

Requires `output: 'standalone'` in `next.config.mjs` (add if not present).

---

## docker-compose.prod.yml

```yaml
services:
  db:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_DB: tearflex
      POSTGRES_USER: ${DB_USER}
      POSTGRES_PASSWORD: ${DB_PASSWORD}
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

---

## settings/prod.py

```python
from .base import *

DEBUG = False
ALLOWED_HOSTS = os.environ.get('ALLOWED_HOSTS', 'tearflex.mydryeapp.co.uk,localhost').split(',')

SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
SECURE_BROWSER_XSS_FILTER = True

MIDDLEWARE.insert(1, 'whitenoise.middleware.WhiteNoiseMiddleware')
STATICFILES_STORAGE = 'whitenoise.storage.CompressedManifestStaticFilesStorage'

# Media: local by default, switch to S3 by setting these env vars
DEFAULT_FILE_STORAGE = os.environ.get(
    'DEFAULT_FILE_STORAGE',
    'django.core.files.storage.FileSystemStorage'
)
MEDIA_ROOT = os.environ.get('MEDIA_ROOT', '/app/media')

# S3 (leave blank for local; fill in to switch storage backend)
AWS_STORAGE_BUCKET_NAME = os.environ.get('AWS_STORAGE_BUCKET_NAME', '')
AWS_S3_REGION_NAME = os.environ.get('AWS_S3_REGION_NAME', '')
AWS_ACCESS_KEY_ID = os.environ.get('AWS_ACCESS_KEY_ID', '')
AWS_SECRET_ACCESS_KEY = os.environ.get('AWS_SECRET_ACCESS_KEY', '')
AWS_S3_ENDPOINT_URL = os.environ.get('AWS_S3_ENDPOINT_URL', '')
```

---

## Nginx Config

File: `/opt/msp-service-desk/deploy/nginx/conf.d/tearflex.conf`

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

Initial deploy uses HTTP-only (no SSL block) until cert is issued.

---

## Execution Order

### Step 1 — DNS prerequisite
Confirm `tearflex.mydryeapp.co.uk` A record → `76.13.254.227` before issuing SSL cert.

### Step 2 — Containerise & start
```bash
cd /opt/tearflex
docker compose -f docker-compose.prod.yml up -d --build
```

### Step 3 — Initialise database
```bash
docker compose -f docker-compose.prod.yml exec backend python manage.py migrate
docker compose -f docker-compose.prod.yml exec backend python manage.py createsuperuser
```

### Step 4 — Nginx (HTTP first)
Add `tearflex.conf` (HTTP-only version), reload nginx:
```bash
docker exec msp-service-desk-nginx-1 nginx -s reload
```
Verify `http://tearflex.mydryeapp.co.uk` proxies to Next.js.

### Step 5 — SSL
```bash
docker exec msp-service-desk-certbot-1 certbot certonly --webroot \
  --webroot-path=/var/www/certbot \
  --email admin@digital-panda.co.uk --agree-tos --no-eff-email \
  -d tearflex.mydryeapp.co.uk
```
Update `tearflex.conf` to full HTTPS config, reload nginx.

### Step 6 — Phase A verification
- Login works end-to-end
- Patient CRUD + search works
- Assessment detail renders (empty results expected)
- Reports/invite buttons return errors (Phase B not built yet — expected)

### Step 7 — Phase B (backend additions)
Execute the existing plan at `docs/superpowers/plans/2026-06-08-backend-additions.md` using the subagent-driven-development workflow. Delivers:
1. pytest + factory-boy test harness
2. JWT blacklist fix
3. `reports` app (PDF via WeasyPrint)
4. Clinician invite endpoint

After Phase B: reports page and clinician invite flow are live end-to-end.

---

## What This Does NOT Cover

- **Phase C** (NIBUT analysis pipeline) — needs its own spec+plan when reference video is available
- **Phase D** (mobile app) — needs its own spec+plan when hardware is available
- **S3 storage** — env vars are wired; fill them in when ready, no code changes needed
- **CI** — no pipeline exists yet; add after Phase B is stable
- **GDPR / SaMD compliance** — separate work items per `CLAUDE.md` §Important Notes
