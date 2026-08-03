# OneView — FRD test matrix (Phase-1 Must)

**Created:** 2026-07-27 IST  
**Basis:** `docs/frd-gap-checklist.md` Match rows + recent Must closes  
**How to use:** Run **Auto** where noted; otherwise **Manual** with stack up (`docker compose` + UI on `:5173` or nginx `:8080`). Login: `admin@acme.io` / PIN `12345`.

| Priority | ID | Area | Given / When / Then | Type | Auto |
|----------|----|------|---------------------|------|------|
| P0 | AUTH-01 | Login | Given seeded admin; When login with email+PIN; Then JWT session and redirect to cockpit | E2E | `tests/e2e/login.spec.ts` |
| P0 | NAV-01 | RBAC keys | Given permission keys; When resolve routes; Then nav maps match `navConfig` | Unit | `tests/unit/navConfig.test.ts` |
| P0 | RDR-01 | Available From | Given allocation ending Fri; When compute Available From with Mon–Fri calendar; Then next Mon (or skip company off days) | Unit | `tests/unit/liveViews.rdrAvailableFrom.test.ts` |
| P0 | RDR-02 | Available From UI | Given live allocations; When open `/reports/deployment`; Then Available From shows date or `Now`, not literal `Allocated` | Manual / E2E | `tests/e2e/reports-smoke.spec.ts` (smoke) |
| P0 | RPR-01 | 6-mo history | Given employee with allocations across months; When `buildPerformanceHistoryFromLive`; Then 6 month labels with utilization ≥ 0 | Unit | `tests/unit/liveViews.performanceHistory.test.ts` |
| P0 | RPR-02 | History drawer | Given Performance report; When open employee drawer + select metric; Then 6-month trend section renders | Manual / E2E | reports smoke |
| P0 | PER-01 | Project health | Given project; When set health amber/red + remarks and save; Then persists and Execution shows portfolio health | Manual | Projects → Edit → Save |
| P0 | SET-01 | Immediate save | Given System Parameters dirty; When Save & apply; Then GET settings reflects change + audit row | Manual / API | Settings |
| P0 | SET-02 | Schedule | Given future effective date; When Schedule change; Then active settings unchanged, pending banner, audit `Scheduled:` | Manual / API | Settings |
| P0 | SET-03 | Audit durable | Given prior saves; When reload Settings; Then Change history from API (not only localStorage) | Manual | Settings |
| P0 | AVL-01 | Rolling-off | Given allocation ending within 14 days; When Availability; Then person appears in rolling-off | Manual | Availability |
| P0 | RO-01 | Report scope | Given non-superadmin RO; When open Deployment/Performance; Then only visible subtree employees | Manual | Report visibility |
| P0 | WCI-01 | Submit | Given manager queue; When submit check-in; Then queue completed + history shows row | Manual | Weekly Check-In |
| P0 | REM-01 | Remind | Given pending confirmation; When Remind; Then Mailpit receives mail (or honest error) | Manual | Confirmations + `:8025` |
| P1 | ECP-01 | Cockpit cards | Given live data; When My Workspace; Then attention / shortage / available / conflicts cards populate | Manual | Cockpit |
| P1 | ECP-02 | Dept health | Given confirmations; When dept health card; Then ranked scores and drill to Performance | Manual | Cockpit |
| P1 | EXE-01 | Execution drawer | Given project with resources; When open drawer; Then roster + 6-month trend live | Manual | Execution report |
| P1 | ACC-01 | Acceptance | Walk `docs/acceptance-checklist.md` end-to-end | Manual | Ops |

### Out of Must (document only — do not fail release)

| ID | Note |
|----|------|
| RDR-Rsvd | Reserved/Unavailable statuses — no FR Must priority + no availability-block model |
| SET-DP | `demandPriority` PUT/UI — Should |
| ECP-RBAC | Cockpit role filter still profile stub vs full recursive RO — Partial |

### Commands

```bash
# Unit
npm run test:unit

# E2E (build/preview by default; or point at running Vite)
# Full login + reports need API: docker compose up -d  (and migrate/seed if needed)
npm run test:e2e

# Against existing UI (e.g. Vite :5173) with API via nginx :8080
# set PLAYWRIGHT_BASE_URL=http://127.0.0.1:5173
#
# Note: default Playwright webServer is vite preview (:4173). API CORS must allow that origin
# (docker-compose CORS_ORIGIN includes :4173). Authenticated e2e skips if login/API unavailable.
```

### Pass criteria (this pass)

- [ ] `npm run test:unit` green  
- [ ] `npm run test:e2e` green (login smoke; report smokes skip gracefully if API down)  
- [ ] Manual P0 rows for Settings schedule, RDR Available From, Performance drawer, Project health verified once on live data  

### Related

- Gap checklist: `docs/frd-gap-checklist.md`  
- Acceptance: `docs/acceptance-checklist.md`  
- Specs: `docs/specs/`
