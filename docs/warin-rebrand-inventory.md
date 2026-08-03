# Warin rebrand inventory (OneView → Warin)

**Purpose:** Understand every place the product/code still says **OneView** / `oneview`, and what should become **Warin** / `warin`.  
**Status:** Inventory only — **not applied** as a bulk rename yet.  
**Already Warin (UI chrome):** browser title, favicon, login logo (`Warin-logo.png`), sidebar contrast logo, theme `#152F39`.

---

## How to read this list

| Priority | Meaning |
|----------|---------|
| **P0 — User-visible** | Users see “Warin” in UI, emails, exports, tab title |
| **P1 — Ops / deploy** | Docker names, DB name, env samples, server paths |
| **P2 — Code identity** | npm package names, Nest app folder names, `@oneview/*` scopes |
| **P3 — Docs / agents** | README, AGENTS.md, FRD docs, skills/rules filenames |

**Risk note:** Renaming **P2** (packages `@oneview/*`, folders `apps/oneview-api`) is a large breaking change (imports, lockfile, Docker build args). Prefer **P0 + P1** first for “product is Warin”; keep internal package scope as `@oneview` until a dedicated rename sprint, **or** plan a coordinated rename.

---

## A. Already done (Warin branding)

| Area | Current |
|------|---------|
| `index.html` `<title>` | `Warin` |
| Favicon | `/favicon-96x96.png` (Warin mark) |
| Login / ProductLogo default | `/Warin-logo.png`, alt `Warin` |
| Sidebar logo | `/f-logo-1.png` (contrast) |
| Login wallpaper | `/wallpaper-new.png` |
| Theme tokens | `#152F39` family (`index.css`, `theme/tokens.css`) |

---

## B. P0 — User-visible string / copy changes

Search/replace display strings (keep URLs/API paths unless product decides otherwise).

| Location / pattern | Example today | Target |
|--------------------|---------------|--------|
| Any UI text “OneView” | Account settings, exports, mail templates | `Warin` |
| `packages/mail` from/default subjects | `noreply@oneview.local`, copy mentioning OneView | `warin` domain / Warin copy |
| `utils/reportExport.ts` | Filename/title prefixes | `Warin-…` |
| `screens/AccountSettings.tsx` | Product name if present | Warin |
| E2E tests `tests/e2e/login.spec.ts` | Assertions on title/brand | Warin |
| Swagger / OpenAPI title in Nest `main.ts` | OneView API | Warin API |
| Health / app name strings | if returned to clients | Warin |

---

## C. P1 — Docker, DB, env, infra (ops-facing)

| Item | Today | Suggested Warin |
|------|-------|-----------------|
| Compose comment | OneView production Docker stack | Warin … |
| Container names | `oneview-postgres`, `oneview-api`, … | `warin-postgres`, `warin-api`, … |
| DB name | `POSTGRES_DB: oneview` | `warin` (requires new volume / migrate) |
| Volumes | `oneview_pgdata`, `oneview_files`, … | `warin_pgdata`, … |
| `DATABASE_URL` | `…/oneview?schema=public` | `…/warin?schema=public` |
| JWT/HMAC defaults | `oneview-dev-jwt-secret-…` | `warin-dev-…` (prod: random secrets) |
| `MAIL_FROM` default | `noreply@oneview.local` | `noreply@warin.…` |
| Log path | `/var/log/oneview` | `/var/log/warin` |
| Nginx upstream | `oneview_api` | `warin_api` |
| Backup scripts | `oneview_$STAMP.dump` | `warin_$STAMP.dump` |
| `.env.example` | oneview URLs/names | warin |
| Host path (EC2 guide) | `/opt/oneview` | `/opt/warin` |

**Caution:** Renaming DB/volumes on an existing server needs backup → new volume → restore or recreate + migrate/seed.

---

## D. P2 — Monorepo / package identity (high effort)

| Item | Today | Target if full rename |
|------|-------|------------------------|
| Root `package.json` `name` | `oneview` | `warin` |
| Workspaces | `@oneview/security`, `redis`, `storage`, `mail`, `auth` | `@warin/…` |
| Apps | `apps/oneview-api`, `apps/oneview-worker` | `apps/warin-api`, `apps/warin-worker` |
| Dockerfile `APP_NAME` | `oneview-api` / `oneview-worker` | matching folder names |
| Nest package names | `@oneview/api`, `@oneview/worker` | `@warin/api`, … |
| All `import … from '@oneview/…'` | throughout apps | `@warin/…` |
| Cursor skills/rules | `oneview-dev`, `oneview-ui`, … | `warin-dev`, … (optional) |
| Excel workbook | `docs/OneView_Table_Structure.xlsx` | `Warin_Table_Structure.xlsx` |

---

## E. P3 — Documentation & agent instructions

| File / area | Change |
|-------------|--------|
| `AGENTS.md`, `README.md` | Product name OneView → Warin |
| `docs/*.md` (architecture, docker, install, database, …) | Branding + paths/DB name |
| `docs/specs/*` | May still say OneView in FRD context — clarify “product brand Warin / legacy doc OneView” |
| `.cursor/skills/oneview-dev` | Rename or dual-name in description |
| Prompt log / change standards headers | Optional |

---

## F. Suggested rename waves (safe order)

1. **Wave 1 — Brand only (low risk)**  
   User-visible strings, mail copy, export titles, Swagger title, docs product name.  
   Keep `@oneview/*` and Docker/DB names.

2. **Wave 2 — Deploy identity**  
   Compose container/volume names, `/opt/warin`, env samples, backup script names.  
   New environments only (or planned migration).

3. **Wave 3 — Package rename**  
   `@oneview` → `@warin`, rename `apps/oneview-*`, full lockfile + CI update.

---

## G. Out of scope / keep as-is unless decided

| Item | Reason |
|------|--------|
| GitHub repo folder `OneView` on disk | Rename is optional; clone URL can stay |
| Historical `docs/prompt-log.md` entries | Don’t rewrite history; new entries say Warin |
| FRD PDFs under `docs/specs/` | External specs; note “legacy OneView naming” |
| Database **table** names (`employees`, …) | Not branded; no rename needed |

---

## H. Quick grep (for implementers)

From repo root (exclude `node_modules`):

```bash
rg -i "oneview" --glob "!node_modules/**" --glob "!**/dist/**" --glob "!package-lock.json"
```

~80+ tracked files currently mention OneView/oneview (code, docs, compose, packages).

---

*Last updated: 2026-08-03 — inventory for Warin product branding decision.*
