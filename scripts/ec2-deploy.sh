#!/usr/bin/env bash
# Publish Warin from origin/main onto this EC2 host.
# GitHub CI does not deploy. This script is the live publisher.
#
# Usage (on EC2):
#   bash /opt/warin/app/scripts/ec2-deploy.sh           # SPA only
#   bash /opt/warin/app/scripts/ec2-deploy.sh --with-api  # SPA + API/worker image rebuild + migrate
#
# Never db:seed on live.

set -euo pipefail

APP="${APP_DIR:-/opt/warin/app}"
WEB="${WEB_DIR:-/opt/warin/shared/web}"
API_BASE="${VITE_API_BASE_URL:-https://seworkspace.com/api/v1}"
WITH_API=0

for arg in "$@"; do
  case "$arg" in
    --with-api) WITH_API=1 ;;
    -h|--help)
      echo "Usage: $0 [--with-api]"
      exit 0
      ;;
    *)
      echo "Unknown argument: $arg" >&2
      exit 1
      ;;
  esac
done

if [[ ! -d "$APP/.git" ]]; then
  echo "Not a git checkout: $APP" >&2
  exit 1
fi

cd "$APP"

echo "== git fetch/pull origin main =="
git fetch origin main
git checkout main
git pull origin main
HEAD="$(git rev-parse HEAD)"
ORIGIN="$(git rev-parse origin/main)"
if [[ "$HEAD" != "$ORIGIN" ]]; then
  echo "HEAD ($HEAD) does not match origin/main ($ORIGIN)" >&2
  exit 1
fi
echo "SOURCE_OK commit=$HEAD"

wait_for_api() {
  local tries="${1:-36}"
  local i
  for i in $(seq 1 "$tries"); do
    if curl -fsS "http://127.0.0.1:8080/api/v1/health" >/dev/null 2>&1; then
      echo "API_HEALTH_OK"
      return 0
    fi
    sleep 5
  done
  echo "API did not become healthy on http://127.0.0.1:8080/api/v1/health" >&2
  docker compose ps api nginx || true
  docker compose logs api --tail 80 || true
  return 1
}

echo "== SPA vite build =="
export VITE_API_BASE_URL="$API_BASE"
export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=1536}"
npx vite build
unset NODE_OPTIONS

if [[ ! -f dist/index.html ]]; then
  echo "Vite did not produce dist/index.html — refusing to touch $WEB" >&2
  exit 1
fi
if ! grep -R -q "seworkspace.com/api/v1" dist/assets; then
  echo "SPA bundle is missing https://seworkspace.com/api/v1 — refusing to publish" >&2
  echo "Built with VITE_API_BASE_URL=$API_BASE" >&2
  exit 1
fi
if grep -R -E -q "13\.126\.64\.134|localhost:3001|YOUR_DOMAIN" dist/assets; then
  echo "SPA bundle contains a stale API host — refusing to publish" >&2
  exit 1
fi

export HEAD
export API_BASE
node -e 'const fs=require("fs"); fs.writeFileSync("dist/version.json", JSON.stringify({commit:process.env.HEAD, builtAt:new Date().toISOString(), apiBase:process.env.API_BASE})+"\n")'

echo "== publish $WEB (only after successful build) =="
mkdir -p "$WEB"
STAGE="$(mktemp -d)"
cp -a dist/. "$STAGE/"
find "$WEB" -mindepth 1 -maxdepth 1 -exec rm -rf {} +
cp -a "$STAGE"/. "$WEB/"
rm -rf "$STAGE"

test -f "$WEB/index.html"
test -f "$WEB/version.json"
echo "SPA_PUBLISH_OK"

# Vite can OOM-kill Nest on t3.small. Bring the API back, then optionally rebuild it
# after Node has released SPA-build memory.
echo "== ensure API/nginx are up =="
docker compose up -d nginx api worker
wait_for_api 24

if [[ "$WITH_API" -eq 1 ]]; then
  echo "== API/worker rebuild + migrate (no seed) =="
  docker compose up -d --build api worker
  wait_for_api 60
  docker compose exec -T api npx prisma migrate deploy --schema=/app/prisma/schema.prisma
  docker compose up -d nginx api worker
  wait_for_api 24
  echo "API_OK"
fi

echo "LIVE_COMMIT=$(git -C "$APP" rev-parse --short HEAD)"
echo "Verify: curl -sS https://seworkspace.com/version.json"
echo "Health: curl -sS http://127.0.0.1:8080/api/v1/health"
echo "Then hard-refresh https://seworkspace.com/ (Ctrl+Shift+R)"
