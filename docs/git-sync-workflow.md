# Git sync workflow (local ↔ remote)

**Goal:** Keep the laptop working copy and `origin` synchronized for any change that affects the web app, source, deployment, configuration, or shared components.

**Remote:** `https://github.com/WarinSquro/Warin.git`  
**Default branch:** `main`  
**Laptop path:** `D:\Amit\AI\Web\OneView`  
**EC2 app path:** `/opt/warin/app` (pull-only after laptop push)

Related: `docs/warin-local-git-setup.md`, `docs/aws-ec2-deploy-checklist.md` (Local changes → live).

---

## Rules

1. **Before starting work** — pull latest from `origin` on the current branch.
2. **After completing and verifying** — add, commit, and push to `origin`.
3. **Merge conflicts** — resolve them before continuing coding or deploying. Do not push a broken merge.
4. **Secrets** — never commit `.env`, PEM keys, or production passwords.
5. **EC2** — after a successful push, deploy with `git pull` (+ SPA rebuild / Compose rebuild as needed). See checklist.

Agents and developers must **include the exact commands** for the current branch/repo in every task that touches the shared codebase.

---

## Before work — pull

### Laptop (PowerShell)

```powershell
cd D:\Amit\AI\Web\OneView
git checkout main
git pull origin main
```

If pull reports **merge conflicts**, resolve them, then:

```powershell
git add .
git commit -m "Resolve merge conflicts after pull."
git pull origin main
```

Only then start the feature/fix.

### EC2 (before deploy / after someone else pushed)

```bash
cd /opt/warin/app
git pull origin main
```

---

## After work — add, commit, push

### Laptop

```powershell
cd D:\Amit\AI\Web\OneView
git status
git add <paths-changed-in-this-task>
git commit -m "Short message describing why."
git push origin main
```

If push is rejected (remote ahead):

```powershell
git pull origin main
# resolve conflicts if any, commit, then:
git push origin main
```

### Then live (EC2)

GitHub CI does **not** copy files to EC2. After a green (or at least pushed) `main`:

```bash
# SPA + version stamp (always)
bash /opt/warin/app/scripts/ec2-deploy.sh
# also rebuild API/worker when Nest/Prisma changed:
# bash /opt/warin/app/scripts/ec2-deploy.sh --with-api

curl -sS https://seworkspace.com/version.json
# commit must match: git -C /opt/warin/app rev-parse HEAD
```

Do **not** `db:seed` on live. SPA API URL is `https://seworkspace.com/api/v1` (never the public IP).

---

## Conflict reminder

| Situation | Action |
|-----------|--------|
| `git pull` stops with conflicts | Fix files → `git add` → commit → continue |
| `git push` rejected | `git pull` first, resolve, then push |
| Unsure what changed | `git status` and `git diff` before committing |

Never force-push `main` unless the team explicitly agrees.
