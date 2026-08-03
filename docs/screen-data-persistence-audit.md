# OneView — Screen data persistence audit

**Audited:** 2026-07-21 IST  
**Sources:** `routes.tsx`, `data/navConfig.ts`, `screens/`, `prisma/schema.prisma`, `apps/oneview-api/src/api/**`, `api/domain.ts`, `api/liveViews.ts`, `context/**`  
**Scope:** Documentation only — no application code changes.

### Gap legend

| Gap | Meaning |
|-----|---------|
| **OK** | User writes (or auth writes) persist to Postgres via Nest + Prisma |
| **N/A (read-only)** | Screen is reporting/computed; no own transactional table required; data comes from live APIs |
| **PARTIAL** | Tables/APIs exist but screen is incomplete, stubbed, or some fields/paths skip DB |
| **MOCK ONLY** | Still driven by `data/*` mocks / hardcoded empty UI (not wired to live domain APIs) |
| **MISSING TABLE** | User-facing persistence needed and no suitable Prisma model exists |

---

## Screen / route matrix

| Route | Screen | Read-only / computed? | User data needs persistence? | Prisma models → tables | Gap |
|-------|--------|----------------------|------------------------------|------------------------|-----|
| `/login` | Login | No | Yes (auth session) | `Employee` → `employees`; `EmployeePermission` → `employee_permissions`; `RefreshToken` → `refresh_tokens` | **OK** |
| `/forgot-pin` | ForgotPin | No | Yes (reset token) | `PinResetToken` → `pin_reset_tokens`; `Employee` | **OK** |
| `/reset-pin` | ResetPin | No | Yes (new PIN) | `PinResetToken`; `Employee.pin_hash` | **OK** |
| `/cockpit` | ExecutiveCockpit | Yes (workspace KPIs) | No writes | Reads via contexts: `Employee`, `Department`, `AppSettings`. Nest `GET /cockpit/summary` exists but **UI unused**. Snapshot from `buildLiveCockpitSnapshot` — employees/depts live; allocation/confirmation/util cards empty | **PARTIAL** |
| `/planning-conflicts` | PlanningConflicts | Yes (should be) | No (computed) | Should derive from `Allocation` (+ settings). Screen hard-codes `conflicts = []` — no API | **PARTIAL** |
| `/planner` | ResourcePlanner | Grid computed from allocations | Yes (allocations) | `Allocation` → `allocations` (+ FKs `employees`, `projects`, `project_milestones`, `activities`). Open demand from `ProjectDemandLine` | **OK** |
| `/availability` | Availability | Free capacity computed | Yes (allocate → allocation) | Same as planner (`allocations`). Rolling-off list is always empty (`buildRollingOffEmpty`) | **PARTIAL** |
| `/utilization` | Utilization | Yes | No | Computed from `allocations` + employees/settings | **N/A (read-only)** |
| `/confirmations` | WorkConfirmation | Team view computed | Yes (daily confirm) | `WorkConfirmation` → `work_confirmations`; `WorkConfirmationLine` → `work_confirmation_lines` | **OK** |
| `/reports/deployment` | ResourceDeploymentReport | Yes | No | Live `allocations` + `work_confirmations` via `api/liveViews` | **N/A (read-only)** |
| `/reports/performance` | ResourcePerformanceReport | Yes | No | Same | **N/A (read-only)** |
| `/reports/execution` | ProjectExecutionReport | Yes | No | Same + `projects` | **N/A (read-only)** |
| `/reports/daily-work` | DailyWorkReport | Yes | No (column prefs = localStorage UX only) | Same | **N/A (read-only)** |
| `/my-team/weekly-check-in` | WeeklyCheckInQueue | Yes (queue) | No (submit on workspace) | `WeeklyCheckInSubmission` → `weekly_check_in_submissions`; `Employee` | **N/A (read-only)** |
| `/my-team/weekly-check-in/:employeeId` | WeeklyCheckInWorkspace | Evidence computed from alloc/confirm | Yes (weekly submit) | `WeeklyCheckInSubmission`; config: `WeeklyCheckInSettings`, `WeeklyCheckInCompetency` | **OK** |
| `/my-team/weekly-check-in/:employeeId/history` | WeeklyCheckInHistory | Yes | No | `WeeklyCheckInSubmission` | **N/A (read-only)** |
| `/masters` | SetupMasters | No | Yes | `Department`, `SkillCategory`, `Skill`, `Activity`, `ActivityMilestone` | **OK** |
| `/masters/weekly-check-in` | WeeklyCheckInConfig | No | Yes | `WeeklyCheckInSettings` → `weekly_check_in_settings`; `WeeklyCheckInCompetency` → `weekly_check_in_competencies` | **OK** |
| `/employees` | EmployeeMaster | No | Yes | `Employee`, `EmployeeSkill` → `employee_skills` | **OK** |
| `/projects` | ProjectMaster | No | Yes | `Project`, `ProjectMilestone`, `ProjectDemandLine`, `Customer` | **OK** |
| `/settings` | Settings | No | Yes | `AppSettings` → `app_settings`; `CompanyOffDay` → `company_off_days`. **`demandPriority`** in schema/GET but not on PUT/UI. Change history → **localStorage only** (no audit model) | **PARTIAL** |
| `/access-rights` | AccessRights | No | Yes | `EmployeePermission` → `employee_permissions` | **OK** |
| `/access-denied` | AccessDenied | N/A | No | — | **N/A (read-only)** |

### Orphan screens (not routed)

| File | Read-only? | Needs persistence? | Tables | Gap |
|------|------------|--------------------|--------|-----|
| `screens/ExecutiveDashboard.tsx` | Demo | N/A unless re-wired | — (`data/executive`) | **MOCK ONLY** |
| `screens/ManagerDashboard.tsx` | Demo | N/A unless re-wired | — (`data/dashboard`, `data/utilization`) | **MOCK ONLY** |
| `screens/Placeholder.tsx` | N/A | No | — | **N/A (read-only)** |

---

## Prisma models (inventory)

| Model | Table | Used by screens / domain |
|-------|-------|--------------------------|
| `Employee` | `employees` | Auth, employees, planner, reports, WCI, access rights |
| `Department` | `departments` | Masters, employees, cockpit, WCI competencies |
| `SkillCategory` | `skill_categories` | Masters (skills) |
| `Skill` | `skills` | Masters, employees |
| `EmployeeSkill` | `employee_skills` | Employees |
| `EmployeePermission` | `employee_permissions` | Access rights, auth/me |
| `ActivityMilestone` | `activity_milestones` | Masters, projects/activities |
| `Activity` | `activities` | Masters, allocations |
| `Customer` | `customers` | Projects |
| `Project` | `projects` | Projects, planner demand, reports |
| `ProjectMilestone` | `project_milestones` | Projects, allocations |
| `ProjectDemandLine` | `project_demand_lines` | Projects, planner open demand |
| `Allocation` | `allocations` | Planner, availability, utilization, confirmations, reports, WCI evidence |
| `WorkConfirmation` | `work_confirmations` | Confirmations, reports, WCI |
| `WorkConfirmationLine` | `work_confirmation_lines` | Same |
| `AppSettings` | `app_settings` | Settings, capacity math across planning/reports |
| `CompanyOffDay` | `company_off_days` | Settings calendar |
| `PinResetToken` | `pin_reset_tokens` | Forgot/reset PIN |
| `RefreshToken` | `refresh_tokens` | Auth refresh |
| `WeeklyCheckInSettings` | `weekly_check_in_settings` | WCI config |
| `WeeklyCheckInCompetency` | `weekly_check_in_competencies` | WCI config + workspace |
| `WeeklyCheckInSubmission` | `weekly_check_in_submissions` | WCI workspace / history / queue |

No dedicated tables for: planning conflicts, cockpit KPIs, report row caches, settings change audit, availability “rolling off” events (all should be computed or need a new audit table).

---

## Nest API vs frontend write paths

| API prefix | CRUD | Frontend `api/domain` / client | Notes |
|------------|------|--------------------------------|-------|
| `auth` | login, refresh, logout, forgot/reset PIN, me | `api/client.ts` | OK |
| `employees` | GET/POST/PUT | `fetchEmployees`, `createEmployee`, `updateEmployee` | OK |
| `masters` | customers GET/POST; departments/skills/activities GET/POST/PUT; skill-categories GET/POST; activity-milestones GET/POST | Matching create/update helpers | No PUT for customers, skill-categories, activity-milestones (create-only; UI mostly matches) |
| `projects` | GET/POST/PUT | `fetch/create/updateProject` | OK |
| `allocations` | GET/POST/PUT/DELETE | Full CRUD used by planner (+ create from availability) | OK |
| `confirmations` | GET list/me/team, POST submit, POST remind | Used by WorkConfirmation + reports | OK |
| `weekly-check-in` | config GET/PUT, queue, submissions GET/POST | Used by WCI screens | OK |
| `settings` | GET/PUT | `fetchSettings`, `putSettings` | PUT omits `demandPriority` |
| `access-rights` | GET/PUT by HRMS id | `fetchAccessRights`, `putAccessRights` | OK; legacy `data/accessRights` localStorage not the save path |
| `cockpit` | GET summary | **Not called by UI** | Underused |
| `health` | GET | Ops only | — |

`data/*.ts` remains types/labels/builders; transactional screens use API. Leftover localStorage: WCI config cache, access-rights seeds helpers, settings audit, daily-work column prefs.

---

## Contexts (shared loaders)

| Context | Source | Gap |
|---------|--------|-----|
| `AuthContext` | Auth API + `sessionStorage` tokens | OK |
| `EmployeesContext` | `GET /employees` | OK |
| `MastersContext` | `GET /masters/*` | OK |
| `ProjectsContext` | `GET /projects` | OK |
| `SettingsContext` | `GET /settings` | OK (partial fields — see Settings) |
| `CockpitRoleContext` | Client-only role mapping | N/A |

---

## Prioritized gaps only

1. **High — Planning Conflicts (`/planning-conflicts`)** — Stub empty list; should compute over-allocation / conflicts from `allocations` (+ settings). Gap: **PARTIAL**.
2. **Medium — Executive Cockpit (`/cockpit`)** — Live employees/departments only; attention, shortages, util trend, confirmation discipline still empty; `GET /cockpit/summary` unused. Gap: **PARTIAL**.
3. **Medium — Availability rolling-off** — Free-capacity + allocate persist OK; “Rolling off soon” always `[]`. Gap: **PARTIAL** (feature incomplete, not missing table).
4. **Low — Settings `demandPriority`** — Column on `app_settings`; returned on GET; not editable / not on PUT. Gap: **PARTIAL**.
5. **Low — Settings change history** — UI history via `utils/settingsAudit.ts` localStorage; no Prisma audit model. Gap: **MISSING TABLE** (if cross-device audit is required).
6. **Info — Orphan dashboards** — `ExecutiveDashboard`, `ManagerDashboard` are **MOCK ONLY** and unrouted; ignore unless product re-wires them.
7. **Info — Masters create-only endpoints** — No PUT for customers / skill-categories / activity-milestones (acceptable if UI never edits them post-create).

**Verdict:** Core transactional Phase-1 screens (auth, masters, employees, projects, planner, confirmations, weekly check-in, access rights, settings core) persist to Postgres. Reports/utilization are correctly **N/A (read-only)**. Material work remaining is computed views (conflicts, cockpit richness, availability rolling-off) plus minor settings/audit leftovers — not wholesale mock screens for main workflows.
