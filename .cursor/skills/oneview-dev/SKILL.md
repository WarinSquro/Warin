---
name: oneview-dev
description: >-
  Builds and evolves OneView (resource management Phase-1 app) from the React/Vite
  prototype toward a working stack with PostgreSQL, Prisma, PIN-in-DB auth, and
  local Docker. Use when implementing OneView features, wiring mock data to APIs,
  editing screens/components/contexts, Prisma schema, auth, or Docker Postgres.
---

# OneView Development

## Product

**OneView** is a Phase-1 Resource Management System (RMS): capacity planning, utilization, work confirmations, reports, weekly manager check-ins, and setup (org/skills/employees/projects/access rights).

npm package name is **oneview**; product UI brand is **OneView**.

## Stack (locked)

| Layer | Choice |
|-------|--------|
| Frontend | React 18, TypeScript, Vite 6, React Router 6, Tailwind 4, Recharts, Lucide |
| ORM | **Prisma** |
| Database | **PostgreSQL** (local install first; Docker later) |
| Auth | **Email + 5-digit PIN stored in DB** (hash PINs; never store plaintext) |
| Hosting (dev) | **Local PostgreSQL install first**; Docker later (`admin` / `admin`) |

Local Postgres connection:

```
DATABASE_URL="postgresql://admin:admin@localhost:5432/oneview?schema=public"
```

Setup: `docs/postgres-local-setup.md`. Docker Compose is reserved for a later move.

## Current state

- Mature **frontend prototype**: screens, components, contexts, design tokens, permissioned nav.
- Domain data mostly in `data/*.ts` (mocks) + some `localStorage`.
- Auth today is demo-only (`AuthContext` + `sessionStorage`); replace with API + PIN verification.
- **PostgreSQL + Prisma** scaffolded: `docker-compose.yml`, `prisma/schema.prisma`, init migration, seed (PIN `12345`). Next: Auth API.

## Folder map

```
App.tsx, main.tsx, routes.tsx, index.css, index.html
components/     # AppShell, AuthLayout, feature widgets
context/        # Auth, Settings, Projects, CockpitRole
screens/        # Route-level pages
data/           # Mock modules (temporary until API)
utils/
public/         # Logos
docs/           # Theme + architecture docs + monorepo.md
theme/          # Extracted tokens CSS
packages/       # npm workspaces — @oneview/security|redis|storage|mail|auth
apps/           # Future Nest APIs (see apps/README.md)
.cursor/        # This skill + rules
```
## Agent rules of engagement

1. **Preserve the UI shell** — `AppShell`, brand navy tokens, permission keys in `data/navConfig.ts`. Do not invent a new visual language.
2. **Permission keys are the contract** — nav, guards, and Access Rights UI share keys like `planner`, `reports.deployment`, `masters.skills`. Do not rename without updating all three.
3. **Mock → API** — introduce `api/` (or `server/` + client) and swap `data/*` imports screen-by-screen; keep screens usable with mocks until the endpoint exists.
4. **Auth** — login validates email + PIN against PostgreSQL via Prisma; session after success. Super-admin behavior exists today for `admin@acme.io`; keep compatible unless asked to change.
5. **Prisma + Postgres** — schema/migrations with Prisma; **local install first** (`docs/postgres-local-setup.md`); Docker later. Credentials `admin`/`admin` for local only. When creating/altering/removing tables (or significant columns/enums), update `docs/OneView_Table_Structure.xlsx` in the same change (`00_Index`, `01_Table_Fields`, `02_Enums`; auth notes if relevant; exclude `_prisma_migrations`). **Foreign keys must reference primary keys** (`BIGINT` `id`) — never store another table’s `code`/name/text as the FK (use `department_id`, `customer_id`, etc.).
6. **Do not** commit real production secrets. `.env` stays local; `.env.example` uses placeholders.
7. **Orphan screens** — `ExecutiveDashboard`, `ManagerDashboard`, `Placeholder` are unused; do not wire them unless requested.
8. Read `docs/theme.md` and `.cursor/rules/*` before large UI or DB changes. For route/permission detail, see [reference.md](reference.md).
8b. **FRD / UI specs** — Phase-1 PDFs in `docs/specs/`; how to apply: `docs/specs/HOW-TO-USE-FRD.md`; living gaps: `docs/frd-gap-checklist.md`. When behavior is ambiguous, FRD wins over mocks unless the user overrides.
8c. **Toasts** — `useToast()` only; 5s default; hover pauses; remaining time on mouse leave. See `docs/ui-toast.md`.
9. **Prompt log** — after every coding prompt, append prompt + output + date/time to `docs/prompt-log.md` (newest first).
10. **Delete requires confirmation** — any user-triggered delete (soft or hard) must confirm with the user before executing.

## Implementation order (prefer)

1. ~~Local Postgres + Prisma schema/migrate/seed~~ (migrate/seed after user installs PG — see `docs/postgres-local-setup.md`)  
2. Auth API (PIN hash verify) + wire `AuthContext`  
3. Masters / employees / projects APIs  
4. Planner, availability, utilization, confirmations  
5. Reports + weekly check-in  
6. Access rights persistence  
7. Move Postgres hosting to Docker (optional)  

## Don'ts

- No purple redesigns, card spam, or dark-mode theme unless asked.
- No dropping `PERMISSION_PAGES` in favor of free-form menus.
- No plaintext PIN columns.
- No force-rewriting flat folder layout into `src/` unless the user asks.
