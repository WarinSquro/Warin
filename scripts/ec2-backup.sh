#!/usr/bin/env bash
# Warin EC2 backup helper — DB dump + files volume + manifest (+ optional .env copy).
# Usage (on EC2):
#   bash /opt/warin/app/scripts/ec2-backup.sh [daily|hourly|predeploy]
# Requires: docker, running oneview-postgres. Optional: oneview-api for files.
set -euo pipefail

MODE="${1:-daily}"
STAMP="$(date +%Y%m%d_%H%M%S)"
ROOT="${WARIN_BACKUP_ROOT:-/opt/warin/backups}"
APP_DIR="${WARIN_APP_DIR:-/opt/warin/app}"
SHARED_ENV="${WARIN_SHARED_ENV:-/opt/warin/shared/.env}"
DB_DIR="$ROOT/db"
FILES_DIR="$ROOT/files"
META_DIR="$ROOT/meta"

mkdir -p "$DB_DIR" "$FILES_DIR" "$META_DIR"

GIT_SHA="unknown"
if [[ -d "$APP_DIR/.git" ]]; then
  GIT_SHA="$(git -C "$APP_DIR" rev-parse --short HEAD 2>/dev/null || echo unknown)"
fi

TAG="${MODE}_${STAMP}_${GIT_SHA}"
DUMP_NAME="oneview_${TAG}.dump"
DUMP_HOST="$DB_DIR/$DUMP_NAME"

echo "==> Warin backup mode=$MODE stamp=$STAMP sha=$GIT_SHA"

# --- PostgreSQL custom-format dump ---
if ! docker ps --format '{{.Names}}' | grep -qx 'oneview-postgres'; then
  echo "ERROR: container oneview-postgres is not running" >&2
  exit 1
fi

docker exec oneview-postgres pg_dump -U admin -d oneview -F c -f "/backups/$DUMP_NAME"
docker cp "oneview-postgres:/backups/$DUMP_NAME" "$DUMP_HOST"
# Keep container backup dir from growing forever
docker exec oneview-postgres rm -f "/backups/$DUMP_NAME"
echo "Wrote $DUMP_HOST"

# --- Uploaded files (best-effort from API container) ---
FILES_TAR="$FILES_DIR/files_${TAG}.tar.gz"
if docker ps --format '{{.Names}}' | grep -qx 'oneview-api'; then
  docker exec oneview-api sh -c 'cd /data/files && tar -czf - .' > "$FILES_TAR" || {
    echo "WARN: files tar failed (empty volume?)" >&2
    rm -f "$FILES_TAR"
  }
  [[ -f "$FILES_TAR" ]] && echo "Wrote $FILES_TAR"
else
  echo "WARN: oneview-api not running — skipped files volume"
fi

# --- Secrets copy (local only; sync to S3 with IAM restrictions) ---
if [[ -f "$SHARED_ENV" ]]; then
  ENV_COPY="$META_DIR/env_${TAG}.env"
  cp -a "$SHARED_ENV" "$ENV_COPY"
  chmod 600 "$ENV_COPY"
  echo "Wrote $ENV_COPY (mode 600)"
fi

# --- Manifest ---
MANIFEST="$META_DIR/MANIFEST_${TAG}.txt"
{
  echo "mode=$MODE"
  echo "stamp=$STAMP"
  echo "git_sha=$GIT_SHA"
  echo "dump=$DUMP_HOST"
  echo "files=${FILES_TAR:-none}"
  echo "host=$(hostname -f 2>/dev/null || hostname)"
  echo "utc=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
} > "$MANIFEST"
echo "Wrote $MANIFEST"

# --- Simple retention (local) ---
# hourly: keep 24h of hourly_* ; daily: keep 14 days ; predeploy: keep 10
if [[ "$MODE" == "hourly" ]]; then
  find "$DB_DIR" -name 'oneview_hourly_*.dump' -mtime +1 -delete 2>/dev/null || true
elif [[ "$MODE" == "daily" ]]; then
  find "$DB_DIR" -name 'oneview_daily_*.dump' -mtime +14 -delete 2>/dev/null || true
elif [[ "$MODE" == "predeploy" ]]; then
  ls -1t "$DB_DIR"/oneview_predeploy_*.dump 2>/dev/null | tail -n +11 | xargs -r rm -f
fi

echo "==> Backup complete ($MODE)"
