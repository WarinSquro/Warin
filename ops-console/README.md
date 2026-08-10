# Backup & Deployment Management Console

Standalone production operations tool for Warin/OneView hosts.

**Platforms:** Windows (local development) and **Ubuntu Linux on AWS EC2** (production).  
The same codebase uses platform-aware binary resolution (`/bin/bash`, `/usr/bin/docker`, … on Linux; Git Bash / Docker Desktop paths on Windows).

## Isolation (required)

| Concern | Where |
|---------|--------|
| This tool’s auth, sessions, backup history, audit, checklist | `OPS_DATA_DIR` JSON (`ops-store.json`) — **EC2 default** `/opt/warin/ops-console-data` |
| WARIN application database | **Never used** — no Prisma, no Postgres app tables |
| WARIN runtime | Unchanged if this console is stopped or removed |

Storage boundary: `ops-console-json-independent-of-warin-db`.

## Credentials

Initial admin is seeded on first server start (password hashed with bcrypt).  
Credentials are **not** shown in the UI. Set `OPS_ADMIN_PASSWORD` only before first boot if changing the seed.

## Run (Windows / local dev)

```bash
cd ops-console
npm install
npm run dev
```

- UI: http://127.0.0.1:5191 (Vite)  
- API: http://127.0.0.1:9191  

Requires Docker Desktop for backup/container actions. Git Bash is recommended so POSIX deploy snippets match EC2.

## Install on Ubuntu EC2

Prerequisites (same host as Warin): Node.js 20+, npm, Docker CE + Compose plugin, git, curl, tar, bash. App at `/opt/warin/app`.

```bash
cd /opt/warin/app
git pull origin main
# Optional: set public API URL for SPA builds during deploy
export OPS_VITE_API_BASE_URL="http://YOUR_PUBLIC_IP/api/v1"   # or https://domain/api/v1
sudo bash ops-console/scripts/ec2-install-ops-console.sh
```

The installer:

1. Creates `/opt/warin/ops-console-data` and `/opt/warin/backups/{db,files,meta,…}`  
2. Builds the UI (`npm run build`)  
3. Writes `/opt/warin/shared/ops-console.env` (if missing)  
4. Installs systemd unit `ops-console` → **127.0.0.1:9191**

```bash
sudo systemctl status ops-console
curl -sf http://127.0.0.1:9191/api/ops/health
```

**Do not** expose port 9191 on the security group. Proxy via host Nginx (localhost only), preferably IP allowlist or VPN.

### Manual start (without systemd)

```bash
set -a
source /opt/warin/shared/ops-console.env
set +a
cd /opt/warin/app/ops-console
npm run start:prod
```

## Platform notes

| Concern | Ubuntu EC2 | Windows dev |
|---------|------------|-------------|
| Shell for scripts | `/bin/bash` | Git Bash when present |
| Docker | `/usr/bin/docker` + `docker compose` | Docker Desktop `docker.exe` |
| Paths | `/opt/warin/...` auto-detected | Monorepo root + `./backups` |
| Ops data | `/opt/warin/ops-console-data` | `ops-console/data/` |
| Disk status | `df -h` | PowerShell `Get-PSDrive` |
| Pre-deploy | `scripts/ec2-backup.sh` | Same via Git Bash, or sequential fallback |

Manual Commands in the UI show **EC2/POSIX** commands (production runbook). Runnable safe commands use the host’s shell/tooling.

## Features

1. Secure login (independent of WARIN auth)  
2. Database / Application / Docker / Pre-deploy backups  
3. Docker container status  
4. Allowlisted manual commands  
5. Production deploy sequence with mandatory pre-backup gate  
6. Go-live checklist, history, retention, audit  

Reference: `docs/production-backup-and-deployment.md`.

## Git

Lives under `ops-console/` in the monorepo; removable without touching WARIN DB migrations.
