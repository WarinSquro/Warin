#!/usr/bin/env bash
# Restore OneView PostgreSQL from a custom-format dump
set -euo pipefail
FILE=${1:?Usage: restore-postgres.sh path/to/dump}
docker cp "$FILE" oneview-postgres:/backups/restore.dump
docker exec oneview-postgres pg_restore -U admin -d oneview -c /backups/restore.dump
echo "Restore complete"
