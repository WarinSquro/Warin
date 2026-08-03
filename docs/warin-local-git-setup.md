# Warin — local Git setup (laptop first)

**Why:** The EC2 step `git clone … /opt/warin/app` needs a **remote repository URL**.  
The project folder `D:\Amit\AI\Web\OneView` is **not** a git repo yet (`No .git`).  
Do this on your **Windows laptop**, then continue EC2 clone.

Related: `docs/aws-ec2-deploy-checklist.md`

---

## Status

| ID | Step | Status |
|----|------|--------|
| **L0** | Install Git for Windows (if missing) | **← start here** |
| **L1** | Create empty remote repo (GitHub/GitLab) named **Warin** (or `warin-rms`) | Pending |
| **L2** | `git init` in project folder + `.gitignore` check | Pending |
| **L3** | First commit | Pending |
| **L4** | Add remote `origin` + `git push` | Pending |
| **L5** | Note clone URL for EC2 | Pending → then EC2 **N3** |

**Blocked until L4:** EC2 `git clone` (checklist **N3**).

---

## L0 — Install Git on Windows

1. Check in **PowerShell**:
   ```powershell
   git --version
   ```
2. If not found: install [Git for Windows](https://git-scm.com/download/win) → default options OK.  
3. Optional identity (once):
   ```powershell
   git config --global user.name "Your Name"
   git config --global user.email "you@example.com"
   ```

---

## L1 — Create remote repo (Warin)

### GitHub (typical)

1. Open https://github.com/new  
2. Repository name: **`Warin`** (or `warin-app`)  
3. Private (recommended for now)  
4. **Do not** add README / .gitignore / license if you’ll push an existing folder  
5. Create repository  
6. Copy the URL, e.g.:
   - HTTPS: `https://github.com/YOUR_ORG/Warin.git`  
   - SSH: `git@github.com:YOUR_ORG/Warin.git`

You’ll need a **Personal Access Token** (HTTPS) or **SSH key** for private repos.

---

## L2 — Init Git in the project folder

In **PowerShell**:

```powershell
cd "D:\Amit\AI\Web\OneView"

git init
git status
```

Confirm `.gitignore` exists and ignores `.env`, `node_modules`, `dist`, etc. (do **not** commit secrets).

If you want the default branch named `main`:

```powershell
git branch -M main
```

---

## L3 — First commit

```powershell
cd "D:\Amit\AI\Web\OneView"
git add .
git status
git commit -m "Initial commit — Warin (OneView RMS) codebase"
```

If `git commit` fails on identity, set `user.name` / `user.email` (see L0).

---

## L4 — Link remote and push

Replace with **your** URL:

```powershell
cd "D:\Amit\AI\Web\OneView"
git remote add origin https://github.com/YOUR_ORG/Warin.git
git remote -v
git push -u origin main
```

HTTPS will prompt for username + **PAT** (not account password).

---

## L5 — Clone URL for EC2

Save one of these for the server:

```text
https://github.com/YOUR_ORG/Warin.git
# or
git@github.com:YOUR_ORG/Warin.git
```

On EC2 (after N1–N2):

```bash
cd /opt/warin
git clone https://github.com/YOUR_ORG/Warin.git app
```

For a **private** repo on EC2: use a deploy key or PAT (don’t put the PAT in docs/chat long-term).

---

## Folder name vs product name

| Place | Name |
|-------|------|
| Laptop path (today) | `D:\Amit\AI\Web\OneView` — OK to keep for now |
| GitHub repo | Prefer **`Warin`** |
| EC2 path | `/opt/warin/app` |
| Code packages | Still `@oneview/*` until rebrand wave — see `docs/warin-rebrand-inventory.md` |

Renaming the Windows folder is optional and can wait.

---

## After L4 is done

1. Mark L0–L4 **Done** in this file (or tell the agent to update).  
2. Resume EC2 checklist: **N1** git on server → **N2** `/opt/warin` → **N3** clone → **N4** `.env`.

---

*Last updated: 2026-08-03*
