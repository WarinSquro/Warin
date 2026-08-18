# Warin — Live deployment

**Audience:** anyone shipping a change to production EC2.  
**Live URL:** https://seworkspace.com/  
**Git:** `https://github.com/WarinSquro/Warin.git` · branch `main`  
**Publisher on the server:** `scripts/ec2-deploy.sh`

Related: [`git-sync-workflow.md`](./git-sync-workflow.md) (laptop ↔ GitHub), [`aws-ec2-deploy-checklist.md`](./aws-ec2-deploy-checklist.md) (instance setup), [`production-backup-and-deployment.md`](./production-backup-and-deployment.md) (backup / DR), [`service-urls-and-credentials.md`](./service-urls-and-credentials.md).

---

## The rule

**One complete commit → one push → wait for CI → one deploy script → verify the same SHA is live.**

Do not paste `git pull`, `npx vite build`, `rm`, `cp`, `docker compose`, and `curl` as a stack. Do not push a subset of files “just so Vite compiles.” Do not treat a GitHub CI email as proof that EC2 updated.

---

## Why pull/push felt unreliable (root cause)

Git **did** synchronize on the first successful `pull` / `push`. Fast-forward and `main -> main` are success. Live still looked old because **Git is not the running app**.

Live Warin is three artifacts:

| Artifact | Location | Updated by |
|----------|----------|------------|
| Source | `/opt/warin/app` | `git pull` (inside the deploy script) |
| UI | `/opt/warin/shared/web` (host Nginx) | Vite build **then copy** |
| API | Docker image `oneview-api` | `docker compose up --build` **then reload Compose Nginx** |

`git pull` alone never updates the UI or the API image.

What went wrong in practice (August 2026):

1. **Incomplete commits.** Helpers were imported on `main` but the new files stayed uncommitted on the laptop (`workingCalendar.ts`, `apiFetchBlob`, planner `roundHoursToTenth`). EC2 can only receive `origin/main`.
2. **CI does not deploy.** `.github/workflows/ci.yml` is lint / unit / `tsc` / Vite / API build only. It never copies to `/opt/warin/shared/web` or rebuilds Docker on EC2.
3. **`npx vite build` does not typecheck.** It can print `✓ built` while a missing import ships; the browser then whitescreens (e.g. `/planner`).
4. **Stale Compose Nginx.** After the API container is recreated, `oneview-nginx` can keep the old `api` IP → **API 502** on login even though Nest is healthy. Reload/restart Nginx after API rebuild.
5. **Stacked commands.** `curl` during `docker compose restart nginx` → `Connection reset`. `/version.json` returning HTML is host Nginx `try_files` falling back to `index.html` when that file is missing.

---

## Standard process

### 1) Laptop — complete commit, then push

```powershell
cd D:\Amit\AI\Web\OneView
git checkout main
git pull origin main
git status
```

Every file that change **needs** (including new utils imported by already-committed code) must be in the same commit.

```powershell
git add <those files>
git commit -m "Short why."
git push origin main
git log -1 --format="%H %s"
```

`main -> main` is a successful push. If the push is rejected: `git pull origin main`, resolve conflicts, push again. Never force-push `main`.

Never commit `.env`, PEM keys, or `warin-web.tgz` as a substitute for a server rebuild.

### 2) GitHub CI — quality gate only

Wait until **CI / Lint · Packages · Unit · Build** is green for that commit:

https://github.com/WarinSquro/Warin/actions

CI does **not** publish to EC2. Do not deploy a red `main` unless you are recovering a known-good SHA.

### 3) EC2 — one command

SSH as usual, then **only**:

```bash
cd /opt/warin/app
bash scripts/ec2-deploy.sh
```

Use API rebuild when Nest, Prisma, `apps/Dockerfile`, or Compose API config changed:

```bash
bash scripts/ec2-deploy.sh --with-api
```

The script:

- fetches/pulls `origin/main` and refuses to continue if `HEAD` ≠ `origin/main`
- builds the SPA with `VITE_API_BASE_URL=https://seworkspace.com/api/v1` (never the public IP)
- refuses to wipe `shared/web` unless `dist/index.html` exists and the bundle contains the HTTPS API URL
- writes `/opt/warin/shared/web/version.json` with the git SHA
- brings API/Nginx up, reloads Compose Nginx, waits for `/api/v1/health`
- with `--with-api`: rebuilds `api`/`worker`, migrates (`--schema=/app/prisma/schema.prisma`), reloads Nginx again

**Never** `npm run db:seed` on live. **Never** edit application code on EC2.

If `scripts/ec2-deploy.sh` is missing, pull once then run the script (chicken-and-egg only for the first time the file exists on `main`):

```bash
cd /opt/warin/app && git pull origin main && bash scripts/ec2-deploy.sh
```

### 4) Verify the same commit is running

```bash
git -C /opt/warin/app rev-parse HEAD
curl -sS https://seworkspace.com/version.json
curl -sS http://127.0.0.1:8080/api/v1/health
```

Pass only if:

- both SHAs match `origin/main` for the commit you pushed
- `version.json` is JSON (`commit`, `builtAt`, `apiBase`) — **not** an HTML document
- health is JSON with `"status":"ok"` and `"database":"up"` — **not** `<h1>502 Bad Gateway</h1>`

Then hard-refresh the browser: **https://seworkspace.com/** (Ctrl+Shift+R). Spot-check the screens you changed.

---

## Which flag to use

| What you changed | EC2 command |
|------------------|-------------|
| Screens, `components/`, `api/*.ts` (browser), CSS | `bash scripts/ec2-deploy.sh` |
| `apps/oneview-api`, `apps/oneview-worker`, Prisma, Docker API image | `bash scripts/ec2-deploy.sh --with-api` |
| Both in one commit | `--with-api` once |

---

## Do not do this

- Push only the file Vite named in an error while leaving new modules uncommitted.
- `git pull` on EC2 and expect the UI to change with no Vite publish.
- Build with `http://13.126.64.134/api/v1` (mixed content on HTTPS → “Failed to fetch”).
- Clear `/opt/warin/shared/web` before `dist/index.html` exists.
- `curl` health in the same second as `docker compose restart nginx`.
- Run a 1.5GB Vite build and an API image rebuild as two overlapping manual jobs on `t3.small` (OOM-kills Nest → 502). The script orders SPA first, then API.

---

## If something still looks old

| Symptom | Meaning | Action |
|---------|---------|--------|
| EC2 `git rev-parse HEAD` ≠ laptop `git log -1` | Push did not land, or EC2 did not pull | Push from laptop; run the deploy script (do not pull-only) |
| Git SHA on EC2 is new, UI is old | SPA not published | Run `ec2-deploy.sh`; confirm `version.json` |
| `version.json` is the login HTML | File missing; Nginx SPA fallback | Deploy script did not finish publish |
| Login **API 502**, Docker `api` healthy | Compose Nginx stale upstream | `docker compose restart nginx`, wait 3s, curl `:8080/api/v1/health` |
| White screen after Vite `✓ built` | Runtime JS error (often missing import) | Browser DevTools console; fix and **commit the import + module together** |
| `git pull` conflict on EC2 | Someone edited files on the server | Do not develop on EC2; stash/reset only with care, then deploy script |

---

## Later (optional): push → CI → EC2 with no SSH

Fully automatic publish needs a GitHub Action **after** the quality job, plus an SSH deploy key in GitHub Secrets, that runs `scripts/ec2-deploy.sh` on the instance. Until that exists, this document is the production path: **CI gates, the script publishes, SHA check proves it.**
