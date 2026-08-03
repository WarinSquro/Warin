# OneView

Phase-1 **Resource Management System (RMS)** — capacity planning, utilization, work confirmations, reports, weekly manager check-ins, and org setup.

This repository started as a React/Vite UI prototype and is being extended with **PostgreSQL**, **Prisma**, and **PIN-in-DB** authentication.

## Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 18, TypeScript, Vite 6, React Router 6, Tailwind CSS 4, Recharts |
| Database | **PostgreSQL** (install **locally** first; Docker later) |
| ORM | Prisma |
| Auth (target) | Email + 5-digit PIN (hashed in DB) |

## Prerequisites

- **Node.js** 20+ and npm
- **PostgreSQL 16+** installed locally (see [`docs/postgres-local-setup.md`](docs/postgres-local-setup.md))

## Quick start (Docker-first backend)

```bash
npm install
npm run packages:build
cp .env.example .env
docker compose up -d --build
npx prisma migrate deploy
npm run db:seed
npm run dev                  # UI :5173
# API via nginx :8080/api/v1  or api container :3001
```

Demo login (after seed): `admin@acme.io` / PIN **`12345`**.

See [docs/docker-deployment.md](docs/docker-deployment.md) and [docs/acceptance-checklist.md](docs/acceptance-checklist.md).

## Quick start (frontend only)

```bash
npm install
cp .env.example .env
npm run dev
```

Open [http://localhost:5173](http://localhost:5173). Auth requires the API (above).

### Demo login

| Layer | Behaviour |
|-------|-----------|
| **UI (today)** | Mock auth — any 5-digit PIN for known emails |
| **Database (seeded)** | All users have PIN **`12345`** (bcrypt hash in `employees.pin_hash`) — ready for the API |

| Email | Role |
|-------|------|
| `admin@acme.io` | Super admin — all pages |
| `ravi.sharma@acme.io` | Full planner + reports + weekly check-in |
| `arjun.mehta@acme.io` | Planner, confirmations, selected reports |
| `priya.nair@acme.io` | Confirmations, execution report, weekly check-in |
| `kiran.bose@acme.io` | Utilization, confirmations, weekly check-in |

Other emails in `data/employees.ts` / seed can sign in to the UI but may land on **Access Denied** if they have no assigned rights.

## Environment

Copy `.env.example` to `.env` and adjust if needed:

```env
VITE_API_BASE_URL=http://localhost:3001/api
DATABASE_URL="postgresql://admin:admin@localhost:5432/oneview?schema=public"
```

Dev credentials: user **`admin`**, password **`admin`**, database **`oneview`**. Do not use these in production.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Vite dev server |
| `npm run build` | Typecheck + production build |
| `npm run preview` | Preview production build |
| `npm run lint` | ESLint |
| `npm run format` | Prettier write |
| `npm run format:check` | Prettier check |
| `npm run db:migrate` | Prisma migrate (dev) |
| `npm run db:seed` | Reseed demo data |
| `npm run db:studio` | Prisma Studio |
| `npm run db:reset` | Reset DB + migrate + seed |
| `npm run db:up` / `db:down` | Docker Postgres (**later** — after local setup) |
| `npm run packages:build` | Build all `@oneview/*` workspace packages |
| `npm run test:unit` | Vitest unit smoke tests |
| `npm run test:e2e` | Playwright E2E smoke (run `npm run build` first) |

## Project layout

```
components/     Shared UI (AppShell, widgets)
context/        React contexts (auth, settings, projects)
screens/        Route-level pages
data/           Mock domain data (temporary until API)
prisma/         Schema, migrations, seed
lib/prisma.ts   Shared Prisma client (server use only)
tests/unit/     Vitest tests
tests/e2e/      Playwright smoke tests
docs/           Theme, database, architecture, API contract, prompt log
theme/          Design tokens CSS
.cursor/        Cursor skills and rules
.github/        CI workflows
AGENTS.md       Agent instructions
docker-compose.yml   Reserved for later Docker hosting
```

## Documentation

| Doc | Purpose |
|-----|---------|
| [`docs/installation-guide.md`](docs/installation-guide.md) | **Step-by-step install** — clean server → Docker Compose → migrate/seed → UI |
| [`docs/monorepo.md`](docs/monorepo.md) | npm workspaces — `@oneview/*` platform packages |
| [`docs/OneView_Table_Structure.xlsx`](docs/OneView_Table_Structure.xlsx) | **Data dictionary (Excel)** — review before Auth API |
| [`docs/postgres-local-setup.md`](docs/postgres-local-setup.md) | Optional native Postgres (host) — create DB, migrate, seed |
| [`docs/docker-deployment.md`](docs/docker-deployment.md) | Docker Compose quick start, ports, backup scripts |
| [`docs/database.md`](docs/database.md) | Schema overview and Prisma conventions |
| [`docs/architecture.md`](docs/architecture.md) | Screens ↔ permissions ↔ tables |
| [`docs/api-contract.md`](docs/api-contract.md) | Draft HTTP API contract |
| [`docs/prompt-log.md`](docs/prompt-log.md) | Every coding prompt + output with date/time |
| [`docs/theme.md`](docs/theme.md) | Design tokens |

## PostgreSQL hosting plan

1. **Now:** native local PostgreSQL (`docs/postgres-local-setup.md`).
2. **Later:** same `DATABASE_URL` via Docker (`npm run db:up`).

Next product step: Auth API (verify PIN against `pin_hash`) → wire `AuthContext` → domain APIs → replace mocks.

See `AGENTS.md` and `.cursor/skills/oneview-dev/SKILL.md`.

## Design

Brand tokens: `docs/theme.md`, `theme/tokens.css`, `index.css`, `tailwind.config.js`.

## Specs

Phase-1 FRD/UI PDFs live under [`docs/specs/`](docs/specs/README.md) (cockpit, reports, weekly check-in, access rights, `RMS-FRD-v1.pdf`). They are the product source of truth when behavior is ambiguous. Agent guide: [`docs/specs/HOW-TO-USE-FRD.md`](docs/specs/HOW-TO-USE-FRD.md). Gap checklist: [`docs/frd-gap-checklist.md`](docs/frd-gap-checklist.md).

## License

Private — internal use.
