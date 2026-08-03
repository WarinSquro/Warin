# OneView reference

Companion to `SKILL.md`. Route, permission, and module map for agents.

## Public routes

| Path | Screen |
|------|--------|
| `/login` | Login (email + 5-digit PIN UI) |
| `/forgot-pin` | Forgot PIN |
| `/reset-pin` | ResetPin |

## Authenticated (no nav permission key)

| Path | Screen |
|------|--------|
| `/account` | AccountSettings (profile, change PIN, access summary, log out) |
| `/access-denied` | AccessDenied |

## App-shell routes (permission-guarded)

| Path | Screen | Permission key |
|------|--------|----------------|
| `/cockpit` | ExecutiveCockpit | `my_workspace` |
| `/planner` | ResourcePlanner | `planner` |
| `/availability` | Availability | `availability` |
| `/utilization` | Utilization | `utilization` |
| `/confirmations` | WorkConfirmation | `confirmations` |
| `/planning-conflicts` | PlanningConflicts | `planning_conflicts` (menu hidden) |
| `/reports/deployment` | ResourceDeploymentReport | `reports.deployment` |
| `/reports/performance` | ResourcePerformanceReport | `reports.performance` |
| `/reports/execution` | ProjectExecutionReport | `reports.execution` |
| `/reports/daily-work` | DailyWorkReport | `reports.daily_work` |
| `/my-team/weekly-check-in` | WeeklyCheckInQueue | `my_team.weekly_check_in` |
| `/my-team/weekly-check-in/:employeeId` | WeeklyCheckInWorkspace | same |
| `/my-team/weekly-check-in/:employeeId/history` | WeeklyCheckInHistory | same |
| `/masters` | SetupMasters | `masters` + children |
| `/masters/weekly-check-in` | WeeklyCheckInConfig | super-admin only |
| `/employees` | EmployeeMaster | `employees` |
| `/projects` | ProjectMaster | `projects` |
| `/settings` | Settings | `settings` (menu hidden) |
| `/access-rights` | AccessRights | `access_rights` (super-admin) |

Redirects: `/dashboard`, `/exec-dashboard` → `/cockpit`.

## Masters child keys

| Key | Segment |
|-----|---------|
| `masters.departments` | Organization |
| `masters.skills` | Skills |
| `masters.activities` | Activities |

## Contexts

| File | Role today |
|------|------------|
| `context/AuthContext.tsx` | Session email in `sessionStorage` (`oneview_session_email`); allowed keys from accessRights |
| `context/SettingsContext.tsx` | In-memory settings from `data/settings` |
| `context/ProjectsContext.tsx` | In-memory projects from `data/projects` |
| `context/CockpitRoleContext.tsx` | Demo role switcher for cockpit |

## Mock data modules (`data/`)

| File | Domain |
|------|--------|
| `accessRights.ts` | Per-employee page keys; localStorage overrides |
| `availability.ts` | Availability grid |
| `cockpit.ts` | Cockpit metrics |
| `confirmation.ts` | Work confirmations |
| `dailyWorkReport.ts` | Daily work report |
| `dashboard.ts` | Legacy dashboard mock |
| `deploymentReport.ts` | Deployment report |
| `employees.ts` | Employee master |
| `executionReport.ts` | Project execution |
| `executive.ts` | Executive metrics |
| `navConfig.ts` | Menu + permission registry |
| `performanceReport.ts` | Performance report |
| `planner.ts` | Resource planner |
| `projects.ts` | Projects |
| `settings.ts` | App settings |
| `setup.ts` | Org / skills / activities |
| `utilization.ts` | Utilization |
| `weeklyCheckIn.ts` | Weekly check-in |

## Components worth preserving

- `AppShell`, `AuthLayout`, `ProtectedRoute`, `ProductLogo`
- Report helpers: `ReportColumnPicker`, `ReportPagination`, `SortColHeader`, `FilterMultiSelect`
- Cockpit widgets under `components/Cockpit*`
- Weekly check-in widgets under `components/WeeklyCheckIn*`

## Orphan screens (not routed)

- `screens/ExecutiveDashboard.tsx`
- `screens/ManagerDashboard.tsx`
- `screens/Placeholder.tsx`

## Auth target model

1. User submits email + 5-digit PIN.
2. API looks up user by email; verifies PIN against **hashed** value in PostgreSQL (Prisma).
3. On success, issue session (cookie or token — prefer httpOnly cookie when backend exists).
4. Client replaces demo `signIn(email)` with API result and loads permission keys from DB.
5. Forgot PIN: request flow that resets/hashed PIN server-side (no email send required in local Docker unless configured).

## Spec PDFs (`docs/specs/`)

Phase-1 FRD/UI PDFs live under **`docs/specs/`** (not the repo root):

- `RMS-FRD-v1.pdf` — full RMS FRD  
- `phase1-cockpit-frd.pdf` / `phase1-cockpit-ui.pdf`  
- `phase1-report1-*.pdf` — Resource Deployment  
- `phase1-report2-*.pdf` — Resource Performance  
- `phase1-report3-*.pdf` — Project Execution  
- `phase1-weeklyci-*.pdf` — Weekly Check-In  
- `phase1-rights-ui.pdf` — Access Rights  

Product source of truth when UI and data conflict. See `docs/specs/HOW-TO-USE-FRD.md` and `docs/frd-gap-checklist.md`.
