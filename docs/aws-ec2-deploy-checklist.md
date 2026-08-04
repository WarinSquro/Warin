# Warin — AWS EC2 deployment checklist

Living tracker for hosting on **AWS EC2 + Docker**.  
Product brand: **Warin** (code/DB may still say OneView until rebrand — see `docs/warin-rebrand-inventory.md`).

**Instance (current):** `t3.small` · Ubuntu · public IP **`13.126.64.134`** (confirm after stop/start)  
**SSH:** `ssh -i "…\WARIN-QA-PAIR.pem" ubuntu@<PUBLIC_IP>`  
**Access (no domain yet):** `http://<PUBLIC_IP>/` after A5+A6-IP  
**Server app path:** `/opt/warin`  
**Git remote:** `https://github.com/WarinSquro/Warin.git` (`main`)  

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

---

## Pending — IP access (no domain) ← **Next**

| ID | Step | Status |
|----|------|--------|
| **A5** | Build SPA with `VITE_API_BASE_URL=http://PUBLIC_IP/api/v1` | **← Next** |
| **A6-IP** | Host Nginx on port 80 (SPA + `/api` proxy) — `infra/nginx/host-ip.conf` | Pending |
| **SG-80** | Security Group inbound **TCP 80** from your IP or `0.0.0.0/0` | Pending |
| **CORS** | API `CORS_ORIGIN` includes `http://PUBLIC_IP` | Pending |
| A6-TLS | Domain + Certbot HTTPS | Deferred (no domain) |

---

## Pending — production hardening

| ID | Step |
|----|------|
| H1 | Strong secrets |
| H2 | Don’t publish DB/Redis/Mailpit publicly |
| H3 | Real SMTP |
| H4–H5 | UFW + SG tighten |
| H6 | Backups |

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

### 2) API CORS + public URL

Edit Compose API env (or recreate with overrides). Minimal approach — set in `docker-compose.yml` under `api.environment` then recreate:

```text
CORS_ORIGIN: http://PUBLIC_IP
APP_PUBLIC_URL: http://PUBLIC_IP
```

```bash
cd /opt/warin/app
docker compose up -d --force-recreate api
```

Also update `/opt/warin/shared/.env` the same for host tooling.

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

### 4) Security Group

Inbound: **HTTP TCP 80** ← your IP or `0.0.0.0/0` (temporary).

### 5) Open browser

`http://PUBLIC_IP/` → Warin login  
Seeded admin (blank seed): **`admin@acme.io`** / PIN **`12345`**

HTTP only (no TLS) until you have a domain.

---

*Last updated: 2026-08-04 — A3/A4 done; next IP-based SPA + host Nginx.*
