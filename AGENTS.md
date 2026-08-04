# AGENTS.md — Warin

Instructions for AI agents working in this repository.

## What this is

**Warin** is a Phase-1 Resource Management System (RMS) UI prototype being turned into a working application.  
(Legacy identifiers `oneview` / `@oneview/*` remain in Docker/npm until rebrand wave P1/P2 — see `docs/warin-rebrand-inventory.md`.)

## Locked technical choices

| Concern | Choice |
|---------|--------|
| Frontend | React 18 + TypeScript + Vite + Tailwind 4 + React Router + Recharts |
| Database | **PostgreSQL** |
| ORM | **Prisma** |
| Auth (product) | Evolving: PIN-in-DB seed + platform `@oneview/auth` (Keycloak) packages |
| Hosting (now) | **Docker Compose** — user `admin`, password `admin`, DB `oneview` (legacy id; product name Warin) |
| Hosting (host Prisma) | Published as `127.0.0.1:15432` (avoids local Windows Postgres on 5432/5433) |
| Monorepo | **npm workspaces** — `packages/*` platform libs, `apps/*` Nest APIs |

```
DATABASE_URL="postgresql://admin:admin@127.0.0.1:15432/oneview?schema=public"
```

Setup guide: `docs/postgres-local-setup.md`. Monorepo: `docs/monorepo.md`.  
**Service URLs & credentials:** `docs/service-urls-and-credentials.md`.

## How to work

1. Read `.cursor/skills/oneview-dev/SKILL.md` for product/stack rules; use `reference.md` for routes and permissions.
2. Follow `.cursor/rules/` (`oneview-ui`, `oneview-api`, `oneview-postgres`, `typescript-react`, `oneview-prompt-log`, `oneview-change-standards`, `oneview-git-sync`).
3. **Change standards (required for fixes/features):** `docs/change-implementation-standards.md` — investigate root cause, smallest change, verify no regressions, report cause/files/tests/result.
3b. **Git sync (required):** Keep laptop and `origin` synchronized. Before work: pull. After verified changes: add / commit / push. Include those commands in every codebase task. See `docs/git-sync-workflow.md`. Resolve merge conflicts before continuing.
4. Theme: `docs/theme.md` + `theme/tokens.css` / `index.css`. Do not redesign brand colors.
5. Preserve `AppShell`, `routes.tsx`, and permission keys in `data/navConfig.ts`.
6. Treat `data/*.ts` as temporary mocks until API + Prisma replace them screen-by-screen.
7. Prefer minimal diffs; do not mass-refactor folder structure (`src/`) unless asked.
8. Never commit production secrets. Local `admin`/`admin` is for development only.
9. **Prompt log (required):** After every coding prompt, append prompt + output + date/time to `docs/prompt-log.md` (newest first). See that file’s template.
10. Platform packages: `@oneview/security`, `@oneview/redis`, `@oneview/storage`, `@oneview/mail`, `@oneview/auth` — build with `npm run packages:build`.
11. **Table structure workbook (required):** When creating, altering, or removing a PostgreSQL/Prisma table (or significant columns/enums), update `docs/OneView_Table_Structure.xlsx` in the **same change**. Keep sheets consistent: `00_Index`, `01_Table_Fields`, `02_Enums` (and auth notes if relevant). Match live DB / Prisma schema; exclude `_prisma_migrations` from the app table index.
12. **Foreign keys use primary keys (required):** When a row references another table, store that table’s **primary key** (`BIGINT` `id`) as the foreign key. Do **not** use business codes, names, or other text values as the persisted reference (e.g. use `department_id` → `departments.id`, not `department_code`; use `customer_id` → `customers.id`, not customer name). Business keys (`code`, `hrms_id`, `project_code`) remain unique for UX/API lookup, but relations in the database must be PK FKs.
13. **Delete requires confirmation (required):** Across the app, any delete action (soft-delete or hard-delete) that a user triggers must show an explicit confirmation step before the delete runs. Never remove records on a single click without confirm.

## Priority path to production

Phase plan (ONE PROMPT adapted): Foundation → Database → Auth/JWT → Domain APIs → Integration → Production readiness.

Local/Docker: `docker compose up -d --build` → `npx prisma migrate deploy` → `npm run db:seed` → `npm run api:dev` / `npm run dev`.

See `docs/docker-deployment.md`, `docs/acceptance-checklist.md`, `docs/monorepo.md`.

## Specs (FRD / UI)

Phase-1 FRD/UI PDFs live under **`docs/specs/`** — product source of truth when behavior is ambiguous.

| Doc | Purpose |
|-----|---------|
| [`docs/specs/README.md`](docs/specs/README.md) | Inventory of PDFs ↔ screens |
| [`docs/specs/HOW-TO-USE-FRD.md`](docs/specs/HOW-TO-USE-FRD.md) | How agents apply FRD to built code |
| [`docs/frd-gap-checklist.md`](docs/frd-gap-checklist.md) | Living Match / Partial / Missing vs current app |

**Precedence when ambiguous:** user prompt → FRD/UI PDF for that module → this file + skills/rules → existing code.

Do not load FRD into the database at runtime; use it for design-time gap analysis and targeted fixes.
