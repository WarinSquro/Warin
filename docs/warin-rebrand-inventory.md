# Warin rebrand inventory (OneView → Warin)

**Purpose:** Track OneView → Warin renames.  
**Laptop folder** `D:\Amit\AI\Web\OneView` — keep as-is.  
**Already Warin (UI chrome):** browser title, favicon, logos, theme `#152F39`.

---

## Done — Wave 0 (user-visible / product strings) — 2026-08-04

| Area | Change |
|------|--------|
| UI | Logout copy, WCI “Auto-pulled from Warin” |
| API | Swagger title, listen log, health `service: warin-api` |
| Mail | PIN reset + confirmation remind copy/subjects; default `noreply@warin.local` |
| Worker | Startup log |
| Seed / Prisma comment | “Seeding Warin…” |
| Upload template filename | `Warin-Employee-Upload-Template.xlsx` |
| Defaults | JWT/HMAC example secrets `warin-dev-…` in `.env.example` + Compose defaults |
| Docs | `README.md`, `AGENTS.md` product name Warin |

**Left unchanged on purpose (compatibility):**
- `localStorage` key `oneview_confirm_productivity_v1_` (changing would drop browser timer cache)
- Docker container/volume/DB name `oneview*` (needs your OK — mid EC2 deploy)
- npm scope `@oneview/*`, folders `apps/oneview-api` (breaking rename)
- Excel `docs/OneView_Table_Structure.xlsx` filename

---

## Needs your decision before doing

### A) Docker / DB rename (`oneview` → `warin`)
- Containers: `oneview-postgres` → `warin-postgres`, etc.
- DB: `POSTGRES_DB: warin`, volumes `warin_pgdata`
- Update backup/restore scripts + `.env` `DATABASE_URL`
- **Impact:** New empty volumes unless you migrate; EC2 must `git pull` after push; N5 commands change
- **Ask:** Do this **now** or **after** first successful EC2 Postgres/API?

### B) npm packages `@oneview/*` → `@warin/*` + rename `apps/oneview-api`
- **Impact:** Large breaking change (all imports, lockfile, Dockerfile `APP_NAME`)
- **Decision (2026-08-04):** **Defer** — user chose `2` (defer). Keep `@oneview/*` and `apps/oneview-*` until a dedicated sprint.

### A) Docker / DB rename — still open
- User reply was only `2` (package defer).  
- **Default until told otherwise:** keep Compose `oneview-*` / DB `oneview` through first EC2 bring-up; rename later (P1 after API healthy).

---

## Suggested remaining waves

1. **P1** — Compose/DB/scripts rename (after you approve)  
2. **P2** — Package scope rename (separate PR)  
3. **P3** — Sweep remaining docs  

---

*Last updated: 2026-08-04 — Wave 0 applied; P1/P2 awaiting decision.*
