# FRD vs current app — Phase-1 gap checklist

**Created:** 2026-07-27 IST  
**Last verified:** 2026-07-27 IST (RPR-021 live Performance history shipped; Must backlog clear)  
**Basis:** PDFs in `docs/specs/` + UI/API/Prisma ([Audit pending FRD gaps](7d2067bf-446a-4580-84c4-a2f0b58ea6eb))  
**Legend:** **Match** | **Partial** | **Missing** | **Differs**

Use with [`docs/specs/HOW-TO-USE-FRD.md`](./specs/HOW-TO-USE-FRD.md). Re-score rows when aligning code to FRD.

---

## How to apply this list

1. Open the linked PDF and FR IDs.  
2. Confirm against live code/DB.  
3. Fix only user-requested gaps.  
4. Change status here when done.

---

## Verified pending gaps (2026-07-27 re-audit)

| # | Area | Status | Must/Should | Evidence / notes |
|---|------|--------|-------------|------------------|
| 1 | ECP-001–004 RBAC / refresh / drill | **Partial** | Must | Refresh + drills OK; role filter = hardcoded `COCKPIT_ROLE_PROFILES` depts, not live recursive RO hierarchy |
| 2 | ECP-017–018 Dept health | **Match** | Must | Live scores from discipline/accuracy/util (`api/departmentHealth.ts`); ranked; drill to Performance unchanged |
| 3 | RDR Must filters / columns | **Match** | skill Should | Available From = next working day after project allocation end (RDR-013/014); Reserved/Unavailable out of Must (RDR-010 no Must + no availability-block model) |
| 4 | RPR history drawer | **Match** | Must (RPR-021) | Live `buildPerformanceHistoryFromLive` (6 months); mirrors Execution history |
| 5 | PER health rules | **Match** | Must | Portfolio `projects.health` / `health_remarks` (FR-147); Execution uses portfolio health (PER-BR-006) |
| 6 | Daily Work Detail | **Partial** | Should* | No dedicated FRD; live screen OK; RMS Must lives on Work Confirmation module |
| 6b | Workday Summary | **Match** | Must | `phase1-workdaysummary-frd.pdf` — `/reports/workday-summary`; 14-day window; hierarchy scoped |
| 7 | Reports RO hierarchy | **Match** | Must | Deployment/Performance/Execution + Daily Work use `getVisibleEmployeeIds` / live employees (`utils/reportVisibility.ts`); superadmin unscoped |
| 8 | Availability rolling-off | **Match** | Must | `buildRollingOffFromLive` — allocation end dates in next 14 days; KPI + band on Availability |
| 9 | Settings leftovers | **Partial** | Should (demandPriority) | PUT skips `demandPriority`; **schedule + audit Match (FR-033 / FR-616)** |

\*Daily Work Detail is not a Phase-1 Must blocker relative to RMS-FRD inventory.

---

## A. Executive Cockpit / My Workspace (`phase1-cockpit-frd.pdf`)

| FR (examples) | Requirement (short) | Status | Notes |
|---------------|---------------------|--------|-------|
| ECP-001–004 | Access, RBAC filter, refresh, drill-down | **Partial** | Access/refresh/drills ≈ Match; hierarchy filter stubbed to executive vs Engineering+QA profiles |
| ECP-005–006 | Projects requiring attention + drill | **Match** | Live amber/red; drill `?preset=attention` |
| ECP-007–008 | Resource shortage + drill | **Match** | Unmet `demandLines` vs allocations |
| ECP-009–010 | Available resources + drill | **Match** | Free capacity next 2 weeks |
| ECP-011–012 | Planning conflicts + drill | **Match** | Live overallocation / double-booking |
| ECP-013–016 | Planning accuracy & confirmation discipline | **Match** | Live Performance/Execution builders |
| ECP-017–018 | Department health ranking + drill | **Match** | Live composite score; ranked; drill `?department=` |
| ECP-019–020 | Utilization trend + drill | **Match** | 8-week live trend |
| ECP-BR / exceptions | Pending Calculation when metrics unavailable | **Match** | |

---

## B. Reports

### Resource Deployment (`phase1-report1-frd.pdf`) → `/reports/deployment`

| Area | Status | Notes |
|------|--------|-------|
| Access, live allocation data, period | **Match** | `buildDeploymentRowsFromEmployees` |
| Must filters (dept, project, RO, employee, status) | **Partial** | Available/Allocated filter live; Reserved/Unavailable out of Must (no FR priority Must, no availability blocks) |
| Columns / Available From | **Match** | Next working date after latest allocation end for that project; "Now" when already free; calendar from AppSettings |
| Skill filter | **Match** | Present (FRD Should) |
| Export | **Match** | Excel/PDF |
| Hierarchy visibility | **Match** | Recursive RO via `scopeEmployeesForViewer` |

### Resource Performance (`phase1-report2-frd.pdf`) → `/reports/performance`

| Area | Status | Notes |
|------|--------|-------|
| Live metrics, period, vs prior | **Match** | |
| History drawer / trends (RPR-021) | **Match** | Live monthly metrics from allocations/confirmations |
| Hierarchy visibility | **Match** | Recursive RO via `scopeEmployeesForViewer` |

### Project Execution (`phase1-report3-frd.pdf`) → `/reports/execution`

| Area | Status | Notes |
|------|--------|-------|
| Project list + KPIs | **Match** | |
| Contributing resources + 6-month trend | **Match** | Live drawer |
| Health rules (PER-BR-006) | **Match** | Uses `project.health` from portfolio; Project Master edits health + remarks |
| Hierarchy visibility | **Match** | Scoped allocations/confirmations + visible project filter |

### Daily Work Detail

| Area | Status | Notes |
|------|--------|-------|
| Product report vs RMS Must | **Partial** / **Should** | Live screen; hierarchy uses live employees + `getVisibleEmployeeIds` |

---

## C. Weekly Check-In (`phase1-weeklyci-frd.pdf`)

| Area | Status | Notes |
|------|--------|-------|
| Config, ranking, queue, submit, history | **Match** | Unchanged this audit |

---

## D. Access Rights (`phase1-rights-ui.pdf`)

| Requirement | Status | Notes |
|-------------|--------|-------|
| SETUP; Super Admin; page-level only; counts on load | **Match** | |
| Data visibility from hierarchy (not on this page) | **Match** | Banner/helper + reports apply recursive RO scope (superadmin sees all) |

---

## E. Core RMS (`RMS-FRD-v1.pdf`) — high-level

| Module | Status | Notes |
|--------|--------|-------|
| Org / Skills / Activities / Employees / Projects | **Match** | |
| Planner / Utilization / Confirmations / Remind / Auth | **Match** | RO immediate-reports scope on Planning screens + allocate/remind API |
| Availability rolling-off | **Match** | Live end dates within 2 weeks (`buildRollingOffFromLive`) |
| Settings schedule + durable audit | **Match** | Bands/calendar + DB audit + scheduled apply (FR-033); demandPriority Should |
| Planning Conflicts | **Match** | Scoped to immediate reports for non–super-admin |

---

## Prioritized Must-only next implement

_None — Phase-1 Must FRD gaps from this checklist are complete._  
Next: Walk Manual P0 in `docs/frd-test-matrix.md` + `docs/acceptance-checklist.md`. Should items remain (e.g. Settings `demandPriority`, cockpit RO filter stub).

~~Done: FRD test matrix + unit/e2e smoke expansion.~~  
~~Done: Live 6-month Performance history (RPR-021).~~  
~~Done: RDR Available From (RDR-013/014).~~  
~~Done: Effective-dated / scheduled Settings apply (FR-033).~~  
~~Done: Durable Settings config audit (FR-616).~~  
~~Done: Recursive RO visibility on reports.~~  
~~Done: ECP-017–018 live department health.~~  
~~Done: Availability rolling-off (FR-291 / FR-560).~~  
~~Done: Portfolio project health (FR-147) + Execution uses it (PER-BR-006).~~
~~Done: Planning screens RO immediate-resources scope.~~

---

## Related

- Specs index: `docs/specs/README.md`  
- Persistence audit: `docs/screen-data-persistence-audit.md`  
- Acceptance: `docs/acceptance-checklist.md`  
- **Test matrix:** `docs/frd-test-matrix.md`  
