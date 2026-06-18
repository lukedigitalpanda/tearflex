#!/usr/bin/env bash
#
# Deploy TearFlex on the host VPS.
#
# Rebuilds the web/backend/worker images from the CURRENT working tree,
# (re)starts the containers, applies database migrations, and health-checks the
# web app. Run this on the server that hosts the containers whenever you want to
# ship an update — it is independent of GitHub (it deploys whatever code is on
# disk, committed or not).
#
#   ./deploy.sh
#
set -euo pipefail

cd "$(dirname "$0")"
COMPOSE="docker compose -f docker-compose.prod.yml"

echo "▶ Building images and (re)starting containers…"
$COMPOSE up -d --build

echo "▶ Applying database migrations…"
# The backend runs gunicorn directly (no migrate-on-start), so migrations must
# be applied here. Retry briefly while the backend container finishes booting.
migrated=0
for attempt in 1 2 3 4 5; do
  if $COMPOSE exec -T backend python manage.py migrate --noinput; then
    migrated=1
    break
  fi
  echo "  backend not ready yet (attempt ${attempt}/5)…"
  sleep 3
done
if [ "$migrated" -ne 1 ]; then
  echo "✖ Migrations failed. Inspect with: $COMPOSE logs backend"
  exit 1
fi

echo "▶ Health check (web)…"
web_code=000
for _ in $(seq 1 10); do
  web_code=$(curl -s -o /dev/null -w '%{http_code}' http://localhost:3005/login || echo 000)
  [ "$web_code" = "200" ] && break
  sleep 2
done
if [ "$web_code" = "200" ]; then
  echo "✔ Deploy complete — web is serving (HTTP 200)."
else
  echo "✖ Deploy finished but web returned HTTP ${web_code}. Inspect with: $COMPOSE logs web"
  exit 1
fi
