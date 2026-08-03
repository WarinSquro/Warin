# Warin — AWS EC2 deployment checklist

Living tracker for hosting on **AWS EC2 + Docker**.  
Product brand: **Warin** (code/DB may still say OneView until rebrand — see `docs/warin-rebrand-inventory.md`).

**Instance (current):** `t3.micro` · Ubuntu · public IP was `65.0.45.168` (confirm after any stop/start)  
**SSH:** `ssh -i "…\WARIN-QA-PAIR.pem" ubuntu@<PUBLIC_IP>`  
**Key ACL (Windows):** restricted with `icacls` (required by OpenSSH)  
**Server app path:** `/opt/warin` (not `/opt/oneview`)

---

## Status legend

- **Done** — completed  
- **Pending** — required later  
- **Skipped** — deferred by choice  
- **Blocked** — waiting on another step  
- **Next** — do this soon  

---

## Completed

| ID | Step | Notes |
|----|------|--------|
| C0 | EC2 SSH access | SSH from Windows works |
| C0b | Security Group / network | Port 22 reachable |
| C0c | PEM file permissions | Windows `icacls` fixed |
| C1 | **Docker Engine + Compose** | On EC2; verified |

---

## Skipped / deferred

| ID | Step | When to do |
|----|------|------------|
| **S1** | **Upgrade `t3.micro` → `t3.small`** | **Before** full `docker compose up -d --build`. Stop → change type → Start; re-check public IP. |

---

## Pending — laptop Git first (BEFORE EC2 clone)

> Project folder is **not** a git repo yet. Complete this on Windows, then EC2 **N3**.

Full guide: **`docs/warin-local-git-setup.md`**

| ID | Step | Status |
|----|------|--------|
| **L0** | Install Git for Windows (`git --version`) | **← Next (laptop)** |
| **L1** | Create empty GitHub/GitLab repo **Warin** | Pending |
| **L2** | `git init` in `D:\Amit\AI\Web\OneView` | Pending |
| **L3** | First commit | Pending |
| **L4** | `git remote add origin` + `git push` | Pending |
| **L5** | Save clone URL for EC2 | Pending |

**N3 (clone on EC2) is blocked until L4 succeeds.**

---

## Pending — server prep (EC2, after L4)

| ID | Step | Commands / notes |
|----|------|------------------|
| N1 | Install `git` on EC2 | `sudo apt install -y git` |
| N2 | Create `/opt/warin/{app,backups,shared}` | `chown ubuntu:ubuntu` |
| N3 | Clone repo into `/opt/warin/app` | Needs L4 URL — **blocked until L4** |
| N4 | `.env` from `.env.example` | `/opt/warin/shared/.env` + symlink; `chmod 600` |
| N5 | Start **Postgres only** | `docker compose up -d postgres` |
| N6 | Start **Redis only** | `docker compose up -d redis` |

---

## Pending — after S1 upgrade (recommended)

| ID | Step | Notes |
|----|------|--------|
| A1 | Build/start **API** | `docker compose up -d --build api` |
| A2 | Compose **nginx** | `curl http://127.0.0.1:8080/api/v1/health` |
| A3 | Start **worker** | After API healthy |
| A4 | Prisma migrate + seed | `migrate deploy` + `db:seed` |
| A5 | Frontend build | `VITE_API_BASE_URL=…` → copy `dist/` |
| A6 | Host Nginx + TLS | Certbot; proxy `/api` → `:8080` |

---

## Pending — production hardening

| ID | Step |
|----|------|
| H1 | Strong secrets (`JWT_SECRET`, `HMAC_PEPPER`, DB password) |
| H2 | Do not publish Postgres/Redis/Grafana/Mailpit publicly |
| H3 | Real SMTP via `.env` (not Mailpit) |
| H4 | UFW: 22 / 80 / 443 |
| H5 | SG: SSH = My IP; 80/443 public |
| H6 | Backup cron + restore drill |
| H7 | Optional: SMTP on Settings UI (future) |

---

## Suggested order (current)

1. **L0 → L4** — Git on laptop + push **Warin** remote ← **you are here**  
2. **N1 → N2** — git + `/opt/warin` on EC2  
3. **N3 → N4** — clone + `.env`  
4. **N5 → N6** — Postgres + Redis only  
5. **S1** — upgrade to `t3.small`  
6. **A1 → A6** — API, nginx, migrate, SPA, TLS  
7. **H1 → H6** — harden  

---

## Related docs

- `docs/warin-local-git-setup.md` — detailed laptop Git steps  
- `docs/warin-rebrand-inventory.md` — OneView → Warin rename waves  
- `docs/docker-deployment.md` — local Compose  

*Last updated: 2026-08-03 — local Git inserted before EC2 clone; paths use `/opt/warin`.*
