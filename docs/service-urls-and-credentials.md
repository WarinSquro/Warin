# Warin / OneView — Service URLs & Credentials

Living inventory of infrastructure and app services.  
**Dev defaults below are for local/QA only — never use them in real production.**

| Item | Location |
|------|----------|
| Compose stack | `docker-compose.yml` |
| Env template | `.env.example` |
| Live secrets (EC2) | `/opt/warin/shared/.env` (symlink → `/opt/warin/app/.env`) |
| Live SPA files (EC2) | `/opt/warin/shared/web` (host Nginx `root`) |
| Host Nginx (IP/HTTP) | `infra/nginx/host-ip.conf` → `/etc/nginx/sites-available/warin` |
| Compose Nginx (API) | `infra/nginx/default.conf` |
| Deploy checklist | `docs/aws-ec2-deploy-checklist.md` |
| Git sync | `docs/git-sync-workflow.md` |

**Current QA public IP (confirm in AWS if instance restarted):** `http://13.126.64.134/`

**SSH (laptop → EC2):**

```powershell
ssh -i "D:\Amit\AI\Web\OneView Docs Backups\AWS\WARIN-QA-PAIR.pem" ubuntu@13.126.64.134
```

(PEM stays on the laptop only — never commit it.)

---

## How to open URLs (read this first)

| Who / where | Use these URLs |
|-------------|----------------|
| **Browser on your Windows laptop (QA)** | **Only** `http://13.126.64.134/` (and paths under it, e.g. `/settings`, `/api/v1/health`) |
| **`http://127.0.0.1:…` in this doc** | Means **on the EC2 box** (`curl` over SSH) **or** after an **SSH tunnel** — **not** “open in Chrome on Windows” |
| Laptop without Docker stack running | `http://127.0.0.1:8080` / `:8025` / `:5173` → **`ERR_CONNECTION_REFUSED`** (nothing listening on the PC) |

**SSH tunnel example (Mailpit UI from laptop):**

```powershell
ssh -i "D:\Amit\AI\Web\OneView Docs Backups\AWS\WARIN-QA-PAIR.pem" -L 18025:127.0.0.1:8025 ubuntu@13.126.64.134
# then browser: http://127.0.0.1:18025
```

---

## Security notes

1. Compose publishes infrastructure ports on **`127.0.0.1` only** (not the public internet).
2. Ops tools (pgAdmin, Grafana, Prometheus, RabbitMQ, Loki) use Compose profile **`ops`** — not started by default:  
   `docker compose --profile ops up -d`
3. Reach localhost-only services on EC2 via **SSH tunnel** (see above).
4. Passwords marked **(compose default)** must be rotated for any shared/production environment and stored in `.env` / secrets manager — **do not commit real secrets**.
5. AWS SG: public **TCP 80** (+ **22** for your IP). Do **not** open 15432 / 6379 / 8080 / 8025 / ops ports.

---

## SPA publish & restore (EC2)

Host Nginx serves static files from **`/opt/warin/shared/web`**.  
`git pull` alone does **not** update the live UI — you must rebuild and copy (or upload a laptop build).

### Preferred on small instances (`t3.small`) — build on laptop, upload

EC2 `npx vite build` often gets **OOM-killed**. Do **not** delete `shared/web` until a successful build exists.

**Laptop:**

```powershell
cd D:\Amit\AI\Web\OneView
git pull origin main
$env:VITE_API_BASE_URL="http://13.126.64.134/api/v1"
Remove-Item -Recurse -Force dist -ErrorAction SilentlyContinue
npx vite build
# Confirm SMTP UI is in the bundle:
Select-String -Path dist\assets\*.js -Pattern "SMTP Settings" -SimpleMatch | Select-Object -First 1
tar -czf warin-web.tgz -C dist .
scp -i "D:\Amit\AI\Web\OneView Docs Backups\AWS\WARIN-QA-PAIR.pem" warin-web.tgz ubuntu@13.126.64.134:/tmp/warin-web.tgz
```

**EC2:**

```bash
ls -la /tmp/warin-web.tgz
mkdir -p /opt/warin/shared/web
rm -rf /opt/warin/shared/web/*
tar -xzf /tmp/warin-web.tgz -C /opt/warin/shared/web
test -f /opt/warin/shared/web/index.html && echo INDEX_OK
grep -R -l "SMTP Settings" /opt/warin/shared/web/assets && echo LIVE_BUNDLE_OK || echo LIVE_BUNDLE_MISSING
curl -sS -o /dev/null -w "%{http_code}\n" http://127.0.0.1/
```

Then hard-refresh the browser: `http://13.126.64.134/` → **Ctrl+Shift+R**.

### On-box build (only with enough RAM / swap)

```bash
# Optional 2G swap if builds get "Killed"
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile

cd /opt/warin/app && git pull origin main
export VITE_API_BASE_URL="http://13.126.64.134/api/v1"
export NODE_OPTIONS="--max-old-space-size=1536"
npx vite build   # wait for "✓ built" — if you see "Killed", abort and use laptop upload
# Only after success:
rm -rf /opt/warin/shared/web/* && cp -a dist/. /opt/warin/shared/web/
```

### Incident note (2026-08-04)

`shared/web` was wiped with `rm -rf` **before** a successful Vite build; the build was OOM-killed → empty site / missing SMTP UI. Restored by laptop `warin-web.tgz` + `scp` + extract. **Never clear `shared/web` until `dist/index.html` exists.**

---

## Core application

| Service | Purpose | Local URL | Production / QA URL | Default port(s) | Username | Password / secret | Env var(s) | Config location |
|---------|---------|-----------|---------------------|-----------------|----------|-------------------|------------|-----------------|
| **Warin Web (SPA)** | React UI | Dev: `http://localhost:5173` · Preview: `http://localhost:4173` · Via Compose nginx: `http://127.0.0.1:8080/` (on-box) | **Browser:** `http://13.126.64.134/` | 5173 (Vite) · **80** (host Nginx) · 4173 (preview) | App login: `admin@acme.io` | PIN **`12345`** (seeded; hashed in DB) | `VITE_API_BASE_URL`, `APP_PUBLIC_URL`, `CORS_ORIGIN` | Source: repo · Live files: `/opt/warin/shared/web` |
| **Backend API** (`oneview-api`) | NestJS REST API | On-box: `http://127.0.0.1:8080/api/v1/health` | **Browser:** `http://13.126.64.134/api/v1/…` | **3001** inside container (not published to host) | — (JWT after login) | `JWT_SECRET`, `HMAC_PEPPER` | `API_PORT`, `DATABASE_URL`, `REDIS_URL`, `JWT_*`, `HMAC_PEPPER`, `CORS_ORIGIN`, `MAIL_*`, `APP_PUBLIC_URL`, `SMTP_ENCRYPTION_KEY` | `docker-compose.yml` → `api` · `apps/oneview-api` · `.env` |
| **API Swagger** | OpenAPI UI | On-box: `http://127.0.0.1:8080/api/docs` | `http://13.126.64.134/api/docs` | via 8080/80 | — | — | — | `apps/oneview-api/src/main.ts` (`api/docs`) |
| **Worker** (`oneview-worker`) | Background jobs (mail queue stub, etc.) | No public URL | No public URL | — | — | Uses DB/Redis env | `DATABASE_URL`, `REDIS_URL`, `MAIL_DRY_RUN` | `docker-compose.yml` → `worker` · `apps/oneview-worker` |

### App login (seeded)

| Field | Blank seed value | Where stored |
|-------|------------------|--------------|
| Email | `admin@acme.io` | Postgres `employees.email` |
| PIN | `12345` | Postgres `employees.pin_hash` (Argon2) — never plaintext |
| Seed scripts | — | `prisma/seed.ts`, `prisma/seed-demo.ts` |

---

## Data & cache

| Service | Purpose | Local URL | Production / QA URL | Default port(s) | Username | Password / secret | Env var(s) | Config location |
|---------|---------|-----------|---------------------|-----------------|----------|-------------------|------------|-----------------|
| **PostgreSQL 16** | Primary database | Host: `127.0.0.1:15432` · In Compose network: `postgres:5432` | Same on EC2 (**localhost bind**); not public | Host **15432** → container **5432** | `admin` | `admin` **(compose default)** | `DATABASE_URL`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` | `docker-compose.yml` → `postgres` · Prisma `prisma/schema.prisma` |
| **Redis 7** | Cache / queues | `redis://127.0.0.1:6379` · In Compose: `redis:6379` | Localhost on EC2; not public | **6379** | — (no auth in compose default) | — (add password for prod) | `REDIS_URL` | `docker-compose.yml` → `redis` |
| **Filesystem storage** | Uploaded files | Path `./data/files` (host) · `/data/files` (API container) | Volume `oneview_files` | — | OS user | — | `STORAGE_PROVIDER`, `STORAGE_ROOT` | `docker-compose.yml` volumes · `.env.example` |

### Example `DATABASE_URL`

```text
# From host (Prisma CLI on laptop/EC2)
postgresql://admin:admin@127.0.0.1:15432/oneview?schema=public

# From API container
postgresql://admin:admin@postgres:5432/oneview?schema=public
```

---

## HTTP reverse proxies

| Service | Purpose | Local URL | Production / QA URL | Default port(s) | Username | Password / secret | Env var(s) | Config location |
|---------|---------|-----------|---------------------|-----------------|----------|-------------------|------------|-----------------|
| **Compose Nginx** (`oneview-nginx`) | Proxies `/api` → API container | On-box: `http://127.0.0.1:8080/` | Bound to **127.0.0.1:8080** on EC2; fronted by host Nginx | Host **8080** → container **80** | — | — | — | `infra/nginx/default.conf` · `docker-compose.yml` → `nginx` |
| **Host Nginx** (Ubuntu) | Serves SPA + proxies `/api` to Compose nginx | N/A from laptop without tunnel | **Browser:** `http://13.126.64.134/` (port **80**); TLS deferred | **80** (443 later) | — | — | — | `infra/nginx/host-ip.conf` → `/etc/nginx/sites-available/warin` · root `/opt/warin/shared/web` |

---

## Mail

| Service | Purpose | Local URL | Production / QA URL | Default port(s) | Username | Password / secret | Env var(s) | Config location |
|---------|---------|-----------|---------------------|-----------------|----------|-------------------|------------|-----------------|
| **Mailpit** | Dev/QA SMTP catcher + inbox UI | SMTP `127.0.0.1:1025` · UI `http://127.0.0.1:8025` (on-box) | Tunnel from laptop (see above) | **1025** (SMTP), **8025** (UI) | — | — | `MAIL_SMTP_HOST=mailpit` (Compose API), `MAIL_SMTP_PORT`, `MAIL_FROM`, `MAIL_DRY_RUN`, `MAIL_PROVIDER` | `docker-compose.yml` → `mailpit` |
| **Product SMTP (Settings)** | Real outbound mail (Forgot PIN, etc.) | UI: Settings → **SMTP Settings** | Same on QA (`/settings`) | Per provider | Username in Settings | Password **AES-GCM** in DB (`smtp_settings`); never returned by API | `SMTP_ENCRYPTION_KEY` (or `HMAC_PEPPER`) | Settings UI · `smtp_settings` · `smtp-settings.service.ts` |

---

## Ops profile (optional dashboards)

Start: `docker compose --profile ops up -d`  
All bound to **127.0.0.1** — use SSH tunnels for remote access.

| Service | Purpose | Local URL | Production / QA URL | Default port(s) | Username | Password / secret | Env var(s) | Config location |
|---------|---------|-----------|---------------------|-----------------|----------|-------------------|------------|-----------------|
| **pgAdmin 4** | Postgres admin UI | `http://127.0.0.1:5050` | Tunnel to EC2 `:5050` | **5050** → 80 | `admin@acme.io` | `admin` **(compose default)** | `PGADMIN_DEFAULT_EMAIL`, `PGADMIN_DEFAULT_PASSWORD` | `docker-compose.yml` → `pgadmin` |
| **Grafana** | Metrics dashboards | `http://127.0.0.1:3000` | Tunnel to `:3000` | **3000** | `admin` | `admin` **(compose default)** | `GF_SECURITY_ADMIN_USER`, `GF_SECURITY_ADMIN_PASSWORD` | `docker-compose.yml` → `grafana` |
| **Prometheus** | Metrics scrape/store | `http://127.0.0.1:9090` | Tunnel to `:9090` | **9090** | — | — | — | `infra/prometheus/prometheus.yml` · Compose `prometheus` |
| **Loki** | Log aggregation | `http://127.0.0.1:3100` | Tunnel to `:3100` | **3100** | — | — | — | Compose `loki` |
| **RabbitMQ** | Message broker (+ management UI) | AMQP `127.0.0.1:5672` · UI `http://127.0.0.1:15672` · stream `5552` | Tunnel as needed | **5672**, **15672**, **5552** | `admin` | `admin` **(compose default)** | `RABBITMQ_DEFAULT_USER`, `RABBITMQ_DEFAULT_PASS`, `RABBITMQ_DEFAULT_VHOST` | `infra/rabbitmq/*` · Compose `rabbitmq` |

---

## Platform / hosting & source control

| Service | Purpose | Local URL | Production / QA URL | Default port(s) | Username | Password / secret | Env var(s) | Config location |
|---------|---------|-----------|---------------------|-----------------|----------|-------------------|------------|-----------------|
| **Docker / Compose** | Run the stack | CLI on laptop or EC2 | EC2: `/opt/warin/app` | Daemon socket | OS/`ubuntu` + docker group | SSH key for EC2 | — | `docker-compose.yml`, `apps/Dockerfile` |
| **AWS EC2** | QA host | — | SSH `ubuntu@13.126.64.134` · HTTP `http://13.126.64.134/` | **22**, **80** | `ubuntu` | `WARIN-QA-PAIR.pem` (laptop path above) | — | AWS Console SG |
| **GitHub** | Source remote | — | `https://github.com/WarinSquro/Warin.git` | 443 | GitHub user/org | PAT / SSH key (not in repo) | — | `git remote -v` |
| **Vite / npm** | Frontend tooling | `npm run dev` → `:5173` | Build on laptop preferred for QA publish | 5173 / 4173 | — | — | `VITE_API_BASE_URL` | `package.json` |

---

## Auth & crypto secrets (not services, but required)

| Name | Purpose | Default / example (dev) | Where set | Notes |
|------|---------|-------------------------|-----------|--------|
| `JWT_SECRET` | Sign access tokens | `warin-dev-jwt-secret-change-me` / compose fallback | `.env`, Compose `api` | Change for any shared env |
| `HMAC_PEPPER` | Security module pepper; SMTP encrypt fallback | `warin-dev-pepper-change-me` | `.env` | |
| `SMTP_ENCRYPTION_KEY` | Encrypt SMTP passwords in DB | Optional; falls back to `HMAC_PEPPER` | `.env` | Settings → SMTP |
| `JWT_EXPIRES_SECONDS` | Access token TTL | `28800` (8h) | `.env` | |
| `JWT_REFRESH_DAYS` | Refresh token lifetime | `7` | `.env` | |

---

## Quick local start

```bash
# App stack (no ops UIs)
docker compose up -d

# Ops dashboards
docker compose --profile ops up -d

# UI (host Vite) — optional while API runs in Docker
npm run dev
# → http://localhost:5173  (set VITE_API_BASE_URL to http://127.0.0.1:8080/api/v1)
```

## Quick EC2 access map

| What | How |
|------|-----|
| Web UI (laptop browser) | `http://13.126.64.134/` — **not** `127.0.0.1` |
| Settings / SMTP | `http://13.126.64.134/settings` (scroll to SMTP Settings) |
| API health | `http://13.126.64.134/api/v1/health` or on-box `curl http://127.0.0.1:8080/api/v1/health` |
| SPA files | `/opt/warin/shared/web` |
| Postgres | On-box `127.0.0.1:15432` or SSH tunnel |
| Mailpit UI | SSH tunnel → local `18025` → EC2 `8025` |
| Secrets | `/opt/warin/shared/.env` |

---

*Last updated: 2026-08-04 — SPA publish/restore, laptop vs 127.0.0.1 browser rules, QA IP + PEM path.*
