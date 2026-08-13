# OneView database

PostgreSQL + Prisma. **Docker-first** for production-like local (`docker compose up -d`).

**Schema doc:** Any table create/alter/remove (or significant columns/enums) must update `docs/OneView_Table_Structure.xlsx` in the same change (`00_Index`, `01_Table_Fields`, `02_Enums`; exclude `_prisma_migrations`).

## Connection

```
DATABASE_URL="postgresql://admin:admin@127.0.0.1:15432/oneview?schema=public"
```

(Host port **15432** maps to container 5432 when using Docker Compose.)

## Standards (production)

| Rule | Implementation |
|------|----------------|
| Primary key | `BIGINT GENERATED ALWAYS AS IDENTITY` (`id BigInt @id @default(autoincrement())`) |
| Business keys | Unique strings (`hrms_id`, `project_code`, `code`) — not PKs |
| Foreign keys | Always the referenced table’s **primary key** (`*_id` → `id`). Do **not** store codes/names as relational links |
| Soft delete | `is_deleted`, `deleted_at`, `is_active` |
| Audit | `created_at`, `modified_at`, `created_by`, `modified_by`, `version` |
| Masters | Disable, never hard-delete |

**Intentionally not PK FKs (yet):** `project_demand_lines.skills` remains a `TEXT[]` of skill *names* for demand UI labels (multi-value; junction-table follow-up). `work_confirmation_lines.activity` / `project_label` / `milestone_label` are historical snapshots at confirmation time, not live master references. Business keys (`code`, `hrms_id`, `project_code`) stay unique for lookup/display.

## Core tables

`employees`, `departments`, `skills`, `employee_skills`, `employee_permissions`, `activity_milestones`, `activities`, `projects`, `project_milestones`, `project_demand_lines`, `allocations`, `work_confirmations`, `work_confirmation_lines`, `app_settings`, `company_off_days`, `pin_reset_tokens`, `refresh_tokens` (incl. single-session metadata / `session_id`), `employees.active_session_id`, `weekly_check_in_settings`, `weekly_check_in_competencies`, `weekly_check_in_submissions`

Weekly check-in tables back Module 14 (`my_team.weekly_check_in` / `masters.weekly_check_in`): `weekly_check_in_settings` holds the singleton ranking-levels + action-types JSON, `weekly_check_in_competencies` holds per-department technical/behavioural competency masters (`department_id` → `departments.id`), and `weekly_check_in_submissions` stores one RO-submitted review per employee per ISO week (`week_start`), including the frozen evidence snapshot, ratings, status/confidence, remarks, and action-item tracking.

Projects reference customers via `customer_id` → `customers.id` (not customer name text).

## Commands

```bash
npx prisma migrate deploy
npm run db:seed          # Blank: required masters + 1 admin (PIN 12345)
npm run db:seed:demo     # Full demo employees/projects
npm run db:reset:blank   # Wipe DB, migrate, blank seed
npm run db:studio
```

Blank seed includes departments, skills, activities, app settings, and **one** login user (`admin@acme.io`). No demo projects or extra employees.

See [postgres-local-setup.md](postgres-local-setup.md) and [docker-deployment.md](docker-deployment.md).
