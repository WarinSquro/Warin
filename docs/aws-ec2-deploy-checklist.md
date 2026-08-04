# Warin — AWS EC2 deployment checklist

Living tracker for hosting on **AWS EC2 + Docker**.  
Product brand: **Warin** (code/DB may still say OneView until rebrand — see `docs/warin-rebrand-inventory.md`).

**Instance (current):** `t3.small` · Ubuntu · public IP **`13.126.64.134`** (confirm after stop/start)  
**SSH:** `ssh -i "…\WARIN-QA-PAIR.pem" ubuntu@<PUBLIC_IP>`  
**Access:** `http://<PUBLIC_IP>/` until TLS; then `https://<DOMAIN>/` — see [`docs/https-letsencrypt.md`](./https-letsencrypt.md)  
**Server app path:** `/opt/warin`  
**Git remote:** `https://github.com/WarinSquro/Warin.git` (`main`)  

**Credentials / URLs inventory:** [`docs/service-urls-and-credentials.md`](./service-urls-and-credentials.md)

---

## Completed

| ID | Step | Notes |
|----|------|--------|
| C0–C1, L0–L5, N1–N6 | Access, Git, clone, Postgres, Redis | Done |
| S1 | `t3.small` + disk ~28G | Done |
| A1 | API (Dockerfile packages from build) | Done |
| A2 | Compose nginx; health OK | Done |
| A3 | Worker | Done |
| A4 | Migrate + seed | Done |
| A5–A6-IP | SPA + host Nginx :80 | Done (IP HTTP) |

---

## Pending — HTTPS (Let's Encrypt) ← **Next when you have a domain**

| ID | Step | Status |
|----|------|--------|
| **A6-TLS** | DNS A record → EC2; Certbot; HTTP→HTTPS | **Ready in repo** — `docs/https-letsencrypt.md` |
| **SG-443** | Security Group (+ UFW) **TCP 443** (keep **80** for ACME renewals) | With A6-TLS |
| **CORS-HTTPS** | `CORS_ORIGIN` / `APP_PUBLIC_URL` = `https://DOMAIN` | With A6-TLS |
| **SPA-HTTPS** | Rebuild with `VITE_API_BASE_URL=https://DOMAIN/api/v1` | With A6-TLS |

**Quick enable (EC2):**

```bash
cd /opt/warin/app && git pull origin main
export DOMAIN=warin.example.com
export EMAIL=you@example.com
bash scripts/ec2-enable-https.sh
# then update .env + rebuild SPA — full steps in docs/https-letsencrypt.md
```

> Let's Encrypt **cannot** issue a trusted cert for a bare public IP. A hostname is required.

---

## Pending — IP access notes

| ID | Step | Status |
|----|------|--------|
| A5 / A6-IP / SG-80 / CORS | HTTP via public IP | Done for QA |
| H2 | Localhost-only Docker ports | In compose |

---

## Pending — production hardening

| ID | Step | Notes |
|----|------|--------|
| **H2** | Localhost-only Docker ports + no ops stack by default | In `docker-compose.yml` |
| H1 | Strong `JWT_SECRET` / `HMAC_PEPPER` / DB password in `.env` | Not default `admin`/`admin` forever |
| H3 | Real SMTP (disable public Mailpit UI habit) | Later |
| H4 | UFW: allow 22, 80, **443** | With HTTPS |
| H5 | SG: 22 + 80 + **443**; **no** DB/Redis/8080/ops ports | Critical |
| H6 | Backups | `/opt/warin/backups` |

### Target exposure

| Port / surface | Public internet? | How to reach |
|----------------|------------------|--------------|
| **80** (host Nginx → SPA + `/api`) | Yes (or your IP only) | Browser |
| **22** SSH | Your IP only | SSH / tunnels |
| **443** | Later (TLS) | — |
| Compose **8080**, Postgres **15432**, Redis **6379**, Mailpit **8025** | **No** — `127.0.0.1` only | SSH tunnel or on-box |
| pgAdmin / Grafana / RabbitMQ / Prometheus / Loki | **No** — `profiles: [ops]` + localhost | `docker compose --profile ops up -d` + SSH tunnel |

Do **not** open SG rules for Postgres, Redis, Mailpit, Compose nginx, or ops UIs.

---

## IP access — commands (EC2)

Replace `PUBLIC_IP` with current Elastic/public IP (e.g. `13.126.64.134`).

### 1) SPA build (A5)

`npm run build` runs `tsc -b` first and can fail with hundreds of type errors (no `dist/`). For deploy use **Vite only**:

```bash
cd /opt/warin/app
git pull
export VITE_API_BASE_URL="http://PUBLIC_IP/api/v1"
npx vite build
# or after pull: npm run build:web
mkdir -p /opt/warin/shared/web
rm -rf /opt/warin/shared/web/*
cp -a dist/. /opt/warin/shared/web/
ls /opt/warin/shared/web/index.html
```

Skip `packages:build` for the SPA (API image already builds packages).

### 2) API CORS + public URL + hardened ports

In `/opt/warin/shared/.env` (Compose reads env for `${CORS_ORIGIN}` etc.):

```bash
# /opt/warin/shared/.env — example
CORS_ORIGIN=http://PUBLIC_IP
APP_PUBLIC_URL=http://PUBLIC_IP
JWT_SECRET=<long-random>
HMAC_PEPPER=<long-random>
```

Ensure app symlink/env: `cd /opt/warin/app && ln -sfn /opt/warin/shared/.env .env` (if not already).

```bash
cd /opt/warin/app
git pull
# Stops publishing DB/Redis/Mailpit/8080 on 0.0.0.0; ops services stay down unless --profile ops
docker compose up -d
docker compose up -d --force-recreate api nginx
# Confirm nothing critical is on 0.0.0.0 except host ssh/nginx:
sudo ss -tlnp | grep -E ':80|:8080|:5432|:15432|:6379|:8025|:5050|:9090' || true
```

Expect Compose **8080 / 15432 / 6379 / 8025** as `127.0.0.1` only. Host **:80** is host Nginx (next step).

### 3) Host Nginx (A6-IP)

```bash
sudo apt install -y nginx
cd /opt/warin/app
sudo cp infra/nginx/host-ip.conf /etc/nginx/sites-available/warin
sudo ln -sf /etc/nginx/sites-available/warin /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl enable --now nginx
sudo systemctl reload nginx
```

If `host-ip.conf` not on server yet: `git pull` after push from laptop.

### 4) Security Group + UFW (H4/H5)

**AWS SG (inbound):**

- TCP **22** — your admin IP `/32` only  
- TCP **80** — your IP `/32` (or `0.0.0.0/0` only while testing)  
- **Remove** any rules for 5432, 15432, 6379, 8080, 8025, 5050, 3000, 9090, 15672, 3100, etc.

**UFW (on box, after host Nginx works):**

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
# sudo ufw allow 443/tcp   # when TLS exists
sudo ufw enable
sudo ufw status
```

Mailpit UI via tunnel (example):  
`ssh -i PEM -L 18025:127.0.0.1:8025 ubuntu@PUBLIC_IP` → `http://127.0.0.1:18025`

### 5) Open browser

`http://PUBLIC_IP/` → Warin login  
Seeded admin (blank seed): **`admin@acme.io`** / PIN **`12345`**

HTTP only (no TLS) until you have a domain.

---

## Local changes → live (EC2)

**Git sync first:** always pull before work and push after verified changes — see `docs/git-sync-workflow.md`.

Whenever you change code on the **laptop**, ship it like this:

### A) Laptop (Git)

```powershell
cd D:\Amit\AI\Web\OneView
git add <files>
git commit -m "Describe why"
git push origin main
```

### B) EC2 — always pull

```bash
cd /opt/warin/app && git pull
```

### C) What to rebuild (depends on what changed)

| Changed | On EC2 after `git pull` |
|---------|-------------------------|
| **SPA / React** (`screens/`, `components/`, `api/`, …) | Rebuild web + copy to host Nginx root (below) |
| **API / packages / Prisma schema** | `docker compose up -d --build api worker` (and migrate if needed) |
| **`docker-compose.yml` / nginx conf** | `docker compose up -d` and/or re-copy `host-ip.conf` + `sudo systemctl reload nginx` |
| **Seed / data only** | `npm run db:seed` (or targeted SQL) — **do not** re-seed casually on real data |

**SPA publish (most UI fixes):**

```bash
cd /opt/warin/app
export VITE_API_BASE_URL="http://PUBLIC_IP/api/v1"   # e.g. 13.126.64.134
npx vite build
rm -rf /opt/warin/shared/web/*
cp -a dist/. /opt/warin/shared/web/
# hard-refresh browser (Ctrl+Shift+R)
```

Hard-refresh the browser after SPA deploy so cached JS is not reused.

---

*Last updated: 2026-08-04 — Live SPA up; Profile rename + logout copy; document local→live.*
