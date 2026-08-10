# Warin — Production backup, deployment & disaster recovery

Practical strategy for the **current** stack: **AWS EC2 + Docker Compose + host Nginx**, app at `/opt/warin`.

Related: [`aws-ec2-deploy-checklist.md`](./aws-ec2-deploy-checklist.md), [`docker-deployment.md`](./docker-deployment.md), [`git-sync-workflow.md`](./git-sync-workflow.md), [`https-letsencrypt.md`](./https-letsencrypt.md), scripts `scripts/backup-postgres.sh`, `scripts/restore-postgres.sh`, `scripts/ec2-backup.sh`.

**Standalone ops UI (not WARIN):** [`ops-console/README.md`](../ops-console/README.md) — Backup & Deployment Management console with its own JSON storage (never writes to the WARIN Postgres database). Dual-platform: Windows (dev) + Ubuntu EC2 (prod); EC2 installer: `ops-console/scripts/ec2-install-ops-console.sh`.

---

## 0. What we run today (inspected)

| Piece | Location / how |
|--------|----------------|
| App source (pull-only on server) | `/opt/warin/app` ← GitHub `main` |
| Secrets | `/opt/warin/shared/.env` (symlink → `app/.env`) |
| SPA static files | `/opt/warin/shared/web` (host Nginx `root`) |
| Postgres | Compose `oneview-postgres`, volume `oneview_pgdata`, host `127.0.0.1:15432` |
| Redis | Volume `oneview_redis` (cache/SSE — **not** durable business data) |
| Uploaded files | Volume `oneview_files` → API `STORAGE_ROOT=/data/files` |
| API logs | Volume `oneview_logs` |
| Public entry | Host Nginx :80/:443 → SPA + `/api` → `127.0.0.1:8080` |
| Images | **Rebuilt from Git + Dockerfile** (do not treat containers as backup) |

**Principle:** Prefer **rebuild from Git + restore DB + restore files/env** over backing up Docker images.

**Suggested targets (single EC2 QA/prod, t3.small-class):**

| Metric | Target | Meaning |
|--------|--------|---------|
| **RPO** | **24 hours** (better: **1 hour** if hourly dumps + off-box copy) | Max data loss |
| **RTO** | **2–4 hours** | Time to restore service on a new/repaired host |

Tighten later with Elastic IP, S3 replication, and a staging host.

---

## 1. Database backup

### Recommended method

Use **PostgreSQL custom-format dumps** (`pg_dump -F c`) via the existing pattern:

```bash
# On EC2 (Compose project in /opt/warin/app)
docker exec oneview-postgres pg_dump -U admin -d oneview -F c -f /backups/oneview_YYYYMMDD_HHMMSS.dump
docker cp oneview-postgres:/backups/oneview_YYYYMMDD_HHMMSS.dump /opt/warin/backups/db/
```

Or: `bash /opt/warin/app/scripts/ec2-backup.sh` (see §8).

Legacy laptop helpers: `scripts/backup-postgres.sh` / `scripts/restore-postgres.sh` (same `oneview-postgres` container).

### Full vs incremental

| Approach | Recommendation for Warin now |
|----------|-------------------------------|
| **Full dump daily** | **Required** — simple, reliable, matches current scripts |
| **Incremental / WAL archiving (PITR)** | **Optional later** — higher ops cost; enable when data criticality and team capacity grow |
| **Both** | Daily full + (later) continuous WAL to S3 for shorter RPO |

**Start with full dumps only.** Add PITR when you outgrow 24h RPO.

### Where to store

| Tier | Path / service | Purpose |
|------|----------------|---------|
| **Local (on EC2)** | `/opt/warin/backups/db/` | Fast restore same host |
| **Off-box (required)** | **S3 bucket** (or another region/account) | Survive disk/instance loss |
| **Optional** | Encrypted USB / secondary server | Extra copy for major releases |

Never keep **only** on the same EC2 volume as Postgres.

### Retention

| Class | Keep |
|-------|------|
| Hourly (optional) | Last **24 hours** |
| Daily | Last **14 days** |
| Weekly (Sunday) | Last **8 weeks** |
| Pre-deploy / pre-migrate tagged | Last **10** tagged dumps |
| Monthly (1st of month) | Last **12 months** (compliance-dependent) |

### Frequency

| Cadence | When |
|---------|------|
| **Daily full** | e.g. **02:00 IST** (low traffic) via cron |
| **Hourly** (optional) | Business hours only, if RPO &lt; 24h needed |
| **Before every production deploy / migrate** | Mandatory tagged dump |

### Verify restorable (do this monthly)

1. Copy a dump to a **non-prod** Postgres (local Docker or spare volume).
2. `pg_restore` into an empty DB (or `createdb warin_restore_test`).
3. Point a throwaway API at it **or** run:  
   `SELECT COUNT(*) FROM employees WHERE is_deleted = false;`  
   `SELECT COUNT(*) FROM allocations WHERE is_deleted = false;`
4. Confirm counts ≈ production snapshot time.
5. Drop the test DB.

Document date of last successful restore test in this file or an ops channel.

---

## 2. Docker and application backup

### Back up (business-critical)

| Item | How | Notes |
|------|-----|--------|
| **Postgres** | `pg_dump` → `/opt/warin/backups/db` + S3 | Primary |
| **Uploaded files** | Tar `oneview_files` volume or `/data/files` from API | KPI snaps, attachments |
| **Secrets / config** | Copy `/opt/warin/shared/.env` to encrypted S3 (restricted IAM) | Never commit to Git |
| **Host Nginx conf** | `/etc/nginx/sites-available/warin` (+ TLS certs under `/etc/letsencrypt` if HTTPS) | Or rebuild from repo `infra/nginx/*` |
| **SPA publish tree** (optional) | Snapshot `/opt/warin/shared/web` | Prefer rebuild with correct `VITE_API_BASE_URL` |
| **Git revision** | Record `git rev-parse HEAD` in backup manifest | For exact rebuild |

### Do **not** treat as durable backups

| Item | Why |
|------|-----|
| Docker **images/containers** | Rebuild: `docker compose up -d --build` from Git |
| **Redis** volume | Ephemeral cache / pub-sub; cold start OK |
| Mailpit / Grafana / Prometheus / Loki / RabbitMQ (ops profile) | Non-essential for core RMS; recreate empty |
| `node_modules` / build caches | Reinstall/rebuild |

### Restore complete app after server failure (summary)

1. New EC2 (or repaired) + Docker + Nginx + clone `/opt/warin/app`.
2. Restore `/opt/warin/shared/.env` (secrets).
3. `docker compose up -d` (or `--build`).
4. Restore Postgres dump → `pg_restore`.
5. Restore `oneview_files` (uploads).
6. Rebuild SPA with live `VITE_API_BASE_URL` → `/opt/warin/shared/web`.
7. Install host Nginx from `infra/nginx/host-ip.conf` or HTTPS docs.
8. Health checks (§5).

Full steps: §7.

---

## 3. Production deployment process

### Environments (practical)

| Env | Role | Warin today |
|-----|------|-------------|
| **Dev** | Laptop + local Compose | Already |
| **Staging** | Optional 2nd EC2 or branch deploy | **Recommended before prod** when users depend on the system |
| **Production** | Current EC2 `/opt/warin` | Live QA → harden to prod |

Until staging exists: treat `main` carefully; deploy in a maintenance window; always pre-backup.

### Standard deploy flow (laptop → EC2)

```text
Laptop: pull → change → verify locally → commit → push origin main
EC2:    pre-deploy backup → git pull → migrate (if any) → rebuild API (if needed)
        → rebuild SPA with real VITE_API_BASE_URL → copy to shared/web
        → smoke test → monitor
```

**Never** bake `YOUR_DOMAIN` or `localhost` into the SPA build for live.

### Schema / migrations

1. Pre-deploy **tagged DB backup**.
2. `git pull`.
3. Rebuild API if Prisma client / API code changed:  
   `docker compose up -d --build api worker`
4. Apply migrations (**always** with schema path):

```bash
cd /opt/warin/app
docker compose exec api npx prisma migrate deploy --schema=/app/prisma/schema.prisma
docker compose restart api worker
```

5. **Do not** run `npm run db:seed` on production/live data.
6. Smoke-test login + one write path (e.g. open planner).

### Minimize downtime / data loss

| Practice | Detail |
|----------|--------|
| Pre-backup | Always before migrate/API rebuild |
| Order | Backup → pull → migrate → API → SPA (SPA can be near-zero downtime) |
| SPA cutover | Build to `dist/`, then atomic `cp -a` into `shared/web` |
| API | Short blip during container recreate; healthcheck before announcing done |
| Avoid | Editing live DB by hand; force-push; deleting `shared/web` before successful `vite build` |

### Checks before deploy

- [ ] Changes pushed to `origin/main`
- [ ] Pre-deploy backup completed + path recorded
- [ ] Know whether migrate / API rebuild / SPA-only
- [ ] Correct `VITE_API_BASE_URL` for this host (IP or HTTPS domain)
- [ ] CORS / `APP_PUBLIC_URL` in `/opt/warin/shared/.env` match the URL users open

### Checks after deploy

- [ ] `curl -sS http://127.0.0.1:8080/api/v1/health` → `database":"up"`
- [ ] Public `/` loads; login works
- [ ] SPA bundle has **no** `YOUR_DOMAIN` / `localhost:3001` (`grep -R` in `shared/web` or DevTools Network → `/api/v1/...`)
- [ ] One master read + one transaction write (allocation or confirmation)
- [ ] `git -C /opt/warin/app rev-parse --short HEAD` matches intended commit

---

## 4. Backup before deployment

### Automatic DB backup before every production deploy?

**Yes.** Treat as mandatory for:

- Any Prisma migration  
- API/worker image rebuild  
- Major SPA releases  
- `.env` / Nginx / TLS changes  

Use a **tagged** name:

```text
/opt/warin/backups/db/predeploy_YYYYMMDD_HHMMSS_<gitsha>.dump
```

### Other checkpoints

| Checkpoint | When |
|------------|------|
| Files volume tar | If release touches uploads/storage |
| Copy of `.env` | Before rotating secrets |
| Note of `HEAD` SHA | Every deploy |
| SPA `dist` tarball (optional) | Before wiping `shared/web` |

### Rollback if deploy fails

| Failure | Rollback |
|---------|----------|
| **SPA bad** | Rebuild previous commit’s SPA **or** restore last `shared/web` tarball; fix `VITE_API_BASE_URL` |
| **API bad (no migrate)** | `git checkout <previous-sha>` → `docker compose up -d --build api worker` |
| **Migrate failed / data broken** | Stop API writes → `pg_restore` from **predeploy** dump → redeploy previous Git SHA |
| **Partial migrate** | Do **not** invent reverse SQL under pressure; restore dump + old code |

**Rule:** Prefer **restore backup + redeploy last known good Git SHA** over hand-editing production schema.

---

## 5. Disaster recovery

### Step-by-step (EC2 / Docker / DB lost)

1. **Declare incident** — stop accepting “fixes” on a half-dead host if disk is corrupt.
2. **Provision** Ubuntu EC2 (size ≥ prior), Security Group: **22** (your IP), **80**, **443** (if TLS). Prefer **Elastic IP**.
3. Install Docker, Compose plugin, Nginx, Git.
4. `mkdir -p /opt/warin/{app,shared,backups}` and clone repo → `/opt/warin/app`.
5. Restore **`/opt/warin/shared/.env`** from off-box backup; `ln -sfn /opt/warin/shared/.env /opt/warin/app/.env`.
6. `cd /opt/warin/app && docker compose up -d --build` (wait for Postgres healthy).
7. Restore latest good **DB dump** (`pg_restore` into empty `oneview` DB — see `scripts/restore-postgres.sh` / §8).
8. Restore **`oneview_files`** uploads into the files volume.
9. Rebuild SPA:  
   `export VITE_API_BASE_URL=http://<PUBLIC_IP>/api/v1` (or `https://DOMAIN/api/v1`)  
   `npx vite build && rm -rf /opt/warin/shared/web/* && cp -a dist/. /opt/warin/shared/web/`
10. Install host Nginx (`infra/nginx/host-ip.conf` or HTTPS flow).
11. Verify health + login + sample data counts.
12. Re-point DNS / Elastic IP; notify users.
13. Schedule a **post-mortem** and a restore drill calendar entry.

### RPO / RTO (recommended now)

- **RPO:** 24h with daily off-box dumps; aim **≤ 1h** once hourly dumps + S3 sync are automated.  
- **RTO:** 2–4h for full rebuild on new EC2 (with docs + backups ready).

### How often to test DR

| Test | Cadence |
|------|---------|
| Restore dump to scratch DB | **Monthly** |
| Full “new host” drill (or game day) | **Every 6 months** (or after major infra change) |
| Pre-deploy backup restore spot-check | After first production cutover |

---

## 6. Overall recommended architecture (Warin-specific)

```text
                    ┌─────────────────────────────┐
   Users ──HTTP(S)──► Host Nginx (:80/:443)         │
                    │  / → /opt/warin/shared/web   │
                    │  /api → 127.0.0.1:8080       │
                    └─────────────┬───────────────┘
                                  │
                    ┌─────────────▼───────────────┐
                    │ Docker Compose (localhost)   │
                    │  nginx → api + worker         │
                    │  postgres (pgdata)           │
                    │  redis (ephemeral)           │
                    │  files volume (uploads)      │
                    └─────────────┬───────────────┘
                                  │
              cron: ec2-backup.sh │
                                  ▼
                    /opt/warin/backups/{db,files,meta}
                                  │
                                  ▼ aws s3 sync (recommended)
                               s3://warin-backups-...
```

**Keep it simple:** Git is the app backup; dumps + files + `.env` are the data backup; S3 is off-box; rebuild beats image snapshots.

**Cost-effective next steps (priority order):**

1. Daily `ec2-backup.sh` + cron + S3 sync (H6).  
2. Pre-deploy hook/script that always dumps first.  
3. Elastic IP + HTTPS domain.  
4. Staging EC2 when change risk grows.  
5. PITR / Multi-AZ only when business requires tighter RPO/HA.

---

## 7. Runbooks (copy/paste)

### A. Backup schedule (recommended)

| When | Job |
|------|-----|
| Daily 02:00 IST | Full DB dump + files tar + manifest → local + S3 |
| Hourly 09–19 IST (optional) | DB dump only → local (retain 24h) + S3 |
| Each production deploy | Tagged `predeploy_*.dump` (+ files if storage changes) |
| Weekly Sunday | Promote/keep weekly copy (retention above) |
| Monthly | Restore-test one dump |

### B. What / where / retention

| Asset | Local path | Off-box | Retention |
|-------|------------|---------|-----------|
| DB dumps | `/opt/warin/backups/db/` | S3 `…/db/` | See §1 |
| Files | `/opt/warin/backups/files/` | S3 `…/files/` | Same as daily |
| `.env` encrypted copy | `/opt/warin/backups/meta/` (mode 600) | S3 IAM-locked | 90 days + current |
| Manifest (SHA, dates) | `/opt/warin/backups/meta/MANIFEST.txt` | S3 | With dump |
| Nginx/TLS | Optional tar under `meta/` | S3 | 90 days |

### C. Production deployment checklist

**Laptop**

1. `git pull` · implement · test  
2. `git push origin main`  

**EC2**

1. `bash /opt/warin/app/scripts/ec2-backup.sh predeploy`  
2. `cd /opt/warin/app && git pull origin main`  
3. If API/Prisma: `docker compose up -d --build api worker`  
4. If migrations:  
   `docker compose exec api npx prisma migrate deploy --schema=/app/prisma/schema.prisma`  
   `docker compose restart api worker`  
5. SPA:  
   `export VITE_API_BASE_URL="http://13.126.64.134/api/v1"`  
   *(or `https://YOUR_REAL_DOMAIN/api/v1` — never a placeholder)*  
   `npx vite build && test -f dist/index.html`  
   `rm -rf /opt/warin/shared/web/* && cp -a dist/. /opt/warin/shared/web/`  
6. Post-checks (§3)  
7. Record deploy SHA + backup filename in chat/ops log  

### D. Rollback procedure

1. Announce rollback.  
2. Identify last good **Git SHA** + **predeploy dump**.  
3. SPA-only: rebuild that SHA’s SPA or restore `shared/web` tarball.  
4. API-only: checkout SHA → rebuild `api worker`.  
5. Data/migrate: restore dump (app stopped or read-only) → checkout SHA → rebuild → migrate only if that SHA’s migrations match restored DB.  
6. Smoke test; communicate all-clear.

### E. Disaster recovery procedure

Follow §5 steps 1–13. Keep this doc + S3 access + SSH key available **outside** the failed server.

### F. Automation strategy

| Automation | Tool |
|------------|------|
| Daily/hourly backups | `cron` + `scripts/ec2-backup.sh` |
| Off-box copy | `aws s3 sync /opt/warin/backups s3://…` (IAM role on EC2) |
| Pre-deploy | Same script with `predeploy` arg in deploy checklist |
| Deploy | Manual checklist first; later CI (GitHub Actions) → SSH deploy job |
| Alerts (later) | Fail cron → email/Slack if dump missing or `health` down |

**Example cron (EC2 `ubuntu`):**

```cron
# IST ≈ UTC+5:30 → 02:00 IST = 20:30 UTC previous day
30 20 * * * /opt/warin/app/scripts/ec2-backup.sh daily >> /opt/warin/backups/cron.log 2>&1
0 * * * * /opt/warin/app/scripts/ec2-backup.sh hourly >> /opt/warin/backups/cron.log 2>&1
15 21 * * * aws s3 sync /opt/warin/backups s3://YOUR_BUCKET/warin/ --delete >> /opt/warin/backups/s3-sync.log 2>&1
```

---

## 8. Helper script

Use [`scripts/ec2-backup.sh`](../scripts/ec2-backup.sh) on the server:

```bash
sudo mkdir -p /opt/warin/backups/{db,files,meta}
sudo chown -R ubuntu:ubuntu /opt/warin/backups
cd /opt/warin/app
bash scripts/ec2-backup.sh daily      # or: hourly | predeploy
```

Restores remain: `scripts/restore-postgres.sh` (adjust paths) or manual `pg_restore` into `oneview-postgres`.

---

## 9. Security notes

- Restrict S3 bucket (no public ACL); encrypt at rest; versioning on.  
- `.env` backups: filesystem mode `600`; limited IAM read.  
- Rotate `JWT_SECRET` / DB password as part of hardening (checklist **H1**).  
- SG: never expose `15432` / Redis / `8080` publicly.

---

## 10. Checklist status vs this doc

| Checklist ID | This document |
|--------------|---------------|
| **H6 Backups** | §§1–2, 7–8 |
| Deploy | §§3–4, 7C–D |
| HTTPS / CORS | Still [`https-letsencrypt.md`](./https-letsencrypt.md) |

Update **RPO/RTO** and retention here when moving from QA IP to full production.
