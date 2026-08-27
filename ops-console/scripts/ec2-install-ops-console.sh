#!/usr/bin/env bash
# Install / refresh Backup & Deployment Management (ops-console) on Ubuntu EC2.
# Safe to re-run. Does not touch WARIN Postgres schema.
set -euo pipefail

APP_DIR="${OPS_WARIN_APP_DIR:-/opt/warin/app}"
OPS_DIR="${APP_DIR}/ops-console"
DATA_DIR="${OPS_DATA_DIR:-/opt/warin/ops-console-data}"
BACKUP_ROOT="${OPS_BACKUP_ROOT:-/opt/warin/backups}"
SHARED_ENV="${OPS_SHARED_ENV:-/opt/warin/shared/.env}"
SHARED_WEB="${OPS_SHARED_WEB:-/opt/warin/shared/web}"
SERVICE_USER="${OPS_SERVICE_USER:-ubuntu}"
VITE_API="${OPS_VITE_API_BASE_URL:-}"

if [[ "$(uname -s)" != "Linux" ]]; then
  echo "This installer targets Ubuntu/Linux EC2. On Windows use: cd ops-console && npm run dev" >&2
  exit 1
fi

if [[ ! -d "$OPS_DIR" ]]; then
  echo "ERROR: $OPS_DIR not found. Clone/pull Warin to $APP_DIR first." >&2
  exit 1
fi

echo "==> Creating directories"
sudo mkdir -p "$DATA_DIR" "$BACKUP_ROOT"/{db,files,meta,app,docker} "$SHARED_WEB"
sudo chown -R "${SERVICE_USER}:${SERVICE_USER}" "$DATA_DIR" "$BACKUP_ROOT" || true
chmod 700 "$DATA_DIR" || true

echo "==> Dependencies (node/npm/docker expected already for Warin)"
command -v node >/dev/null
command -v npm >/dev/null
command -v docker >/dev/null
command -v git >/dev/null
command -v curl >/dev/null
command -v tar >/dev/null
command -v bash >/dev/null

cd "$OPS_DIR"
echo "==> npm install + build"
npm install
npm run build

ENV_FILE="/opt/warin/shared/ops-console.env"
if [[ ! -f "$ENV_FILE" ]]; then
  echo "==> Writing $ENV_FILE"
  umask 077
  cat > "$ENV_FILE" <<EOF
OPS_LAYOUT=ec2
OPS_BIND=127.0.0.1
OPS_PORT=9191
OPS_SERVE_STATIC=1
OPS_WARIN_APP_DIR=${APP_DIR}
OPS_BACKUP_ROOT=${BACKUP_ROOT}
OPS_SHARED_ENV=${SHARED_ENV}
OPS_SHARED_WEB=${SHARED_WEB}
OPS_DATA_DIR=${DATA_DIR}
OPS_ENVIRONMENT_LABEL=PRODUCTION
OPS_SESSION_SECRET=$(openssl rand -hex 24)
OPS_VITE_API_BASE_URL=${VITE_API:-http://127.0.0.1/api/v1}
# OPS_ADMIN_PASSWORD=91203
EOF
  chown "${SERVICE_USER}:${SERVICE_USER}" "$ENV_FILE"
  chmod 600 "$ENV_FILE"
else
  echo "==> Keeping existing $ENV_FILE"
fi

UNIT_SRC="${OPS_DIR}/deploy/ops-console.service"
UNIT_DST="/etc/systemd/system/ops-console.service"
if [[ -f "$UNIT_SRC" ]]; then
  echo "==> Installing systemd unit"
  sudo cp "$UNIT_SRC" "$UNIT_DST"
  sudo systemctl daemon-reload
  sudo systemctl enable ops-console
  sudo systemctl restart ops-console
  sleep 2
  sudo systemctl --no-pager --full status ops-console || true
  curl -sf "http://127.0.0.1:9191/api/ops/health" && echo && echo "==> Health OK"
else
  echo "WARN: missing $UNIT_SRC — start manually:"
  echo "  set -a; source $ENV_FILE; set +a; cd $OPS_DIR && npm run start:prod"
fi

echo "==> Done. Bind is 127.0.0.1:9191 — proxy via host Nginx; do not open 9191 publicly."
