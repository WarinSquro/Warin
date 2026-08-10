# Backup & Deployment Management Console

Standalone production operations tool for Warin/OneView hosts.

## Isolation (required)

| Concern | Where |
|---------|--------|
| This tool’s auth, sessions, backup history, audit, checklist | `ops-console/data/ops-store.json` |
| WARIN application database | **Never used** — no Prisma, no Postgres app tables |
| WARIN runtime | Unchanged if this console is stopped or removed |

Storage boundary string in the store: `ops-console-json-independent-of-warin-db`.

## Credentials

Initial admin is seeded on first server start (password hashed with bcrypt into `ops-store.json`).  
Credentials are **not** shown in the UI. Change via env before first boot or by replacing the hash in the store file.

Default seed (first boot only): see deployment notes from your ops owner — do not commit real passwords to docs in public channels.

## Run (dev)

```bash
cd ops-console
npm install
npm run dev
```

- UI: http://127.0.0.1:5191  
- API: http://127.0.0.1:9191 (`/api/ops/*`)

## Run on EC2 (production)

```bash
cd /opt/warin/app/ops-console
npm install
export OPS_WARIN_APP_DIR=/opt/warin/app
export OPS_BACKUP_ROOT=/opt/warin/backups
export OPS_SHARED_ENV=/opt/warin/shared/.env
export OPS_SHARED_WEB=/opt/warin/shared/web
export OPS_VITE_API_BASE_URL="http://YOUR_PUBLIC_IP/api/v1"   # or https://domain/api/v1
export OPS_BIND=127.0.0.1
export OPS_PORT=9191
npm run build
OPS_SERVE_STATIC=1 npm start
```

Proxy via host Nginx only on localhost (do not expose 9191 publicly without TLS + IP allowlist).

## Features

1. Secure login (independent of WARIN auth)  
2. Database / Application / Docker / Pre-deploy backups  
3. Docker container status  
4. Manual allowlisted commands (from real scripts/compose)  
5. Production deploy sequence with mandatory pre-backup gate  
6. Go-live checklist  
7. Backup history + retention  
8. Audit log  

Reference: `docs/production-backup-and-deployment.md` (DR / overall architecture sections intentionally not duplicated in the UI).

## Git

This console lives in the same monorepo under `ops-console/` but must remain removable without touching WARIN DB migrations.
