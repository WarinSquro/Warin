#!/usr/bin/env bash
# Backup OneView PostgreSQL (Docker volume / running container)
set -euo pipefail
STAMP=$(date +%Y%m%d_%H%M%S)
OUT_DIR=${1:-./backups}
mkdir -p "$OUT_DIR"
FILE="$OUT_DIR/oneview_$STAMP.dump"
docker exec oneview-postgres pg_dump -U admin -d oneview -F c -f /backups/oneview_$STAMP.dump
docker cp oneview-postgres:/backups/oneview_$STAMP.dump "$FILE"
echo "Wrote $FILE"
