# Warin comprehensive test cases and execution report

**Execution date:** 2026-09-15 IST  
**Scope:** Main React application, Nest API, PostgreSQL/Prisma persistence, worker scheduling, and standalone Backup & Deployment console.  
**Status meanings:** **Pass** = assertion actually executed and passed; **Fail** = executed and failed; **Blocked** = execution prerequisite unavailable; **Not Executed** = manual or environment-dependent test not run in this pass.

## Test-data policy

- Public UI tests below use no application records.
- Unit tests use explicit controlled fixtures local to each test and do not claim to validate live records.
- Authenticated browser/API tests create dedicated `e2e-admin@warin.test` and `e2e-restricted@warin.test` accounts, then remove their refresh tokens and employee rows in global teardown.
- Fixture cleanup was verified after execution: zero E2E employee rows remained.
- No production/live data was changed. Mail delivery, deployment, backup, restore, and destructive cases remain manual or blocked unless an isolated disposable environment is available.
- For database integration execution, use a dedicated test database and wrap each case in a rollback transaction (or reset/seed it before every case).

## Application inventory

- **Identity and session:** login, session-conflict continuation, refresh/logout, forgot/reset PIN, forced first-login PIN change, current-PIN verification, allowed-IP restriction, idle timeout.
- **Workspace:** Executive Cockpit, Performance Card, Cost Analyzer, Planning Conflicts.
- **Planning:** Resource Planner, resource leave, employee-project eligibility mapping, Availability, Utilization, Work Confirmation, focus/productivity timeline.
- **Reports:** Resource Deployment, Resource Performance, Project Execution, Daily Work Detail, Workday Summary; filtering, pagination, column preferences, drill-downs, Excel/PDF export.
- **My Team:** Weekly Check-In queue/workspace/history, KPI Results, Decision Points, Team Projects.
- **Setup:** organization/departments, skill categories/skills, activities/milestones, decision-point types, employees, employee costs, projects/customers/milestones/demand, KPI Framework, Weekly Check-In configuration, Settings/SMTP, Access Rights.
- **Platform/API:** health and clock, JWT/RBAC guards, validation/exception envelope, realtime events, hard delete, settings scheduler/worker.
- **Operations console:** isolated authentication, status, backups/download/restore, Docker status/restart, allowlisted commands, pre-deploy/deploy, checklist, history, retention, audit.

## Automated execution evidence

- Docker Compose: API, PostgreSQL, Redis, RabbitMQ, Mailpit and supporting services running; API and database healthy.
- `npx prisma migrate status`: **27 migrations found; database schema up to date**.
- `npm run test:unit`: **57 files passed; 280 tests passed; 1 external-workbook test skipped**.
- `npm run test:e2e`: **12 passed; 1 failed; 0 skipped**. Failure is the confirmed missing rate limiting.
- `npm run test:e2e -- --grep-invert "forgot-PIN endpoint"`: **12 passed**.
- Authenticated smoke covered UI login, Deployment, Performance, Settings, 30 protected read endpoints, 401, 403 and DTO validation.
- `npm run build`, `npm run api:build`, `npm run worker:build`, `npm run ops:build`: **passed**; main build retained a non-failing large-chunk warning.
- `npm run lint`: **passed with 0 errors and 37 existing warnings**; focused E2E lint passed cleanly.
- `npm run test -w @oneview/api`: **failed at startup** because `apps/oneview-api/vitest.config.ts` is missing.

## Test cases

| Test Case ID | Module / Feature | Execution | Preconditions | Test Steps | Test Data | Expected Result | Actual Result | Status | Remarks |
|---|---|---|---|---|---|---|---|---|---|
| AUTH-001 | Login page rendering | Automated | Built SPA | Open `/login`; inspect email, five-digit PIN and submit controls | None | All controls render and are usable | Playwright assertion passed | Pass | `tests/e2e/login.spec.ts` |
| AUTH-002 | Incomplete login validation | Automated | SPA running | Enter malformed email and one PIN digit; submit; monitor requests | `invalid-email`, `1` | Validation message appears; no login API request | Playwright assertion passed; zero login calls | Pass | No application data used |
| AUTH-003 | PIN numeric restriction | Automated | Login open | Enter a letter then a digit in PIN | `x`, `7` | Letter rejected; digit accepted | Playwright assertion passed | Pass | `login.spec.ts` |
| AUTH-004 | PIN visibility | Automated | Login open | Enter digit; toggle Show/Hide PIN | `7` | All PIN inputs switch password/text safely | Playwright assertion passed | Pass | `login.spec.ts` |
| AUTH-005 | Forgot-PIN navigation | Automated | Login open | Select Forgot PIN; verify URL; return to sign-in | None | Correct routes load | Playwright assertion passed | Pass | `login.spec.ts` |
| AUTH-006 | Forgot-PIN email gate | Automated | Forgot-PIN open | Observe button empty; enter syntactically valid email | Controlled address | Disabled until email is syntactically valid | Playwright assertion passed | Pass | Does not send request |
| AUTH-007 | Reset link missing token | Automated | SPA running | Open `/reset-pin` without query token | None | Actionable error; save disabled | Playwright assertion passed | Pass | `login.spec.ts` |
| AUTH-008 | PIN hashing | Automated | Unit runner | Hash and verify a controlled five-digit PIN | Controlled PIN | Argon2 hash verifies; plaintext is not persisted | Vitest passed | Pass | `tests/unit/pinHash.test.ts` |
| AUTH-009 | Allowed-IP parsing/matching | Automated | Unit runner | Exercise IPv4/IPv6/proxy normalization and mismatch cases | Controlled IP fixtures | Only normalized configured IP is accepted | 9 Vitest assertions passed | Pass | `tests/unit/allowedIp.test.ts` |
| AUTH-010 | Idle expiry boundary | Automated | Unit runner | Test just before, at, and after idle limit | Controlled timestamps | Session expires at configured boundary | Vitest passed | Pass | `sessionIdle.test.ts`, `idleSessionTimeout.test.ts` |
| AUTH-011 | Valid login and landing | Automated / API | Healthy Docker API + controlled E2E account | Enter controlled account credentials; submit | Temporary E2E administrator | JWT session created and cockpit opens | Controlled login reached `/cockpit` | Pass | Fixture removed by global teardown |
| AUTH-012 | Invalid credentials | Manual / API | API + test account | POST login with wrong PIN, malformed email, nonnumeric/4/6-digit PIN | Controlled invalid inputs | 401 for wrong credentials; 400 for invalid DTO; no session created | Not run | Not Executed | Verify rate-limit headers/logs |
| AUTH-013 | Session conflict | Manual | Same test account active on two browsers | Login browser A; login browser B; cancel then continue replacement | Controlled test account | Conflict details shown; cancel preserves A; continue revokes A | Not run | Not Executed | Confirm old refresh token fails |
| AUTH-014 | Forgot/reset PIN privacy | Manual | Mail test provider + disposable account | Request known and unknown email; use token once; retry and expire token | Controlled account | Responses do not enumerate users; token one-use and 30-minute expiry | Not run | Not Executed | Check mail without exposing PIN/token in logs |
| AUTH-015 | Forced PIN change | Manual | Account with `must_change_pin=true` | Login; attempt app routes; try same/mismatched/non-5-digit PIN; save valid new PIN | Controlled temporary PIN | App routes blocked until distinct valid PIN saved | Not run | Not Executed | Verify DB hash and flag atomically |
| NAV-001 | Permission registry uniqueness | Automated | Unit runner | Enumerate page keys | Registry | Parent keys are unique and registry nonempty | Vitest passed | Pass | `navConfig.test.ts` |
| NAV-002 | Route-to-permission mapping | Automated | Unit runner | Resolve workspace, report, planning and nested paths | Controlled paths | Correct permission key returned | Vitest passed | Pass | `navConfig.test.ts` |
| NAV-003 | Allowed/denied route logic | Automated | Unit runner | Check route with matching and unrelated keys | Controlled key sets | Matching route allowed; unrelated route denied | Vitest passed | Pass | `navConfig.test.ts` |
| NAV-004 | Default landing route | Automated | Unit runner | Resolve super-admin and restricted-user landing | Controlled key sets | Admin→cockpit; user→first allowed menu page | Vitest passed | Pass | `navConfig.test.ts` |
| NAV-005 | Account access tree | Automated | Unit runner | Build tree with/without Settings permission | Controlled keys | Profile always present; Settings appears only when granted | Vitest passed | Pass | `navConfig.test.ts` |
| NAV-006 | Unauthenticated route protection | Manual | Signed out | Open each protected deep link and unknown route | Route list in `routes.tsx` | Redirect to login; intended origin retained where supported | Not run | Not Executed | Include browser refresh |
| NAV-007 | Permission revocation | Manual | Restricted account logged in | Remove current page permission from admin session; refocus/await sync | Controlled role | Menu/page revoked; user redirected or signed out when no access | Not run | Not Executed | Verify SSE and 30-second fallback |
| NAV-008 | Super-admin-only routes | Manual | Normal user and super-admin | Open Access Rights and WCI Config directly | Two controlled roles | Normal user redirected; super-admin admitted | Not run | Not Executed | Also verify hidden menu links |
| MST-001 | Master code/name uniqueness | Manual / DB | Disposable DB | Create duplicate department, skill/category, customer and DP type | Controlled duplicate values | Conflict returned; no duplicate row | Not run | Not Executed | Check unique constraints |
| MST-002 | Department create/update | Manual | Masters permission | Create valid department; edit name/status; refresh | Controlled unique department | Changes persist and audit/version fields update | Not run | Not Executed | Validate required code/name |
| MST-003 | Skill category and skill | Manual | Skills permission; category exists | Create category and skill; attempt invalid/missing category | Controlled unique values | Valid rows persist with PK FK; invalid FK rejected | Not run | Not Executed | No business code as FK |
| MST-004 | Activity parsing | Automated | Unit runner | Parse milestone kind, project type, billable values and unknown type | Controlled strings | Canonical values map; unknown type reports error | Vitest passed | Pass | `activityBulkUpload.test.ts` |
| MST-005 | Activity upload workbook | Automated / fixture | Expected local workbook exists | Parse workbook headers and every row | User-selected workbook | Shape and all values valid | Fixture absent; conditional test skipped | Blocked | Remove machine-specific path in future |
| MST-006 | Activity CRUD validation | Manual | Activities permission and milestone exists | Create/edit activity; test duplicate name in milestone and invalid billable/type | Controlled values | Valid persists; duplicates/invalids rejected clearly | Not run | Not Executed | Refresh and filter inactive |
| MST-007 | Decision-point type rules | Manual | DP Types permission | Create optional/required type; deactivate; attempt duplicate | Controlled type | Requirement/status persist; duplicate blocked | Not run | Not Executed | Existing points remain readable |
| MST-008 | Delete confirmation | Manual | Deletable master row | Trigger delete/disable/hard-delete actions; cancel then confirm | Disposable row | No deletion on first click/cancel; confirmed path only mutates | Not run | Not Executed | Required application-wide |
| EMP-001 | Employee create | Manual | Employee permission; valid department/RO | Enter all required fields and save | Controlled unique employee | Employee and skills persist; welcome flow recorded | Not run | Not Executed | Never inspect plaintext temporary PIN |
| EMP-002 | Employee validation | Manual / API | Employee permission | Submit invalid email, duplicate HRMS/email, self/cyclic RO, invalid dates/IP | Controlled invalid values | Clear 4xx; no partial employee/skill rows | Not run | Not Executed | Verify payload whitelist |
| EMP-003 | Employee update/version | Manual | Existing disposable employee | Edit profile, status, department, skills, dates; refresh | Controlled employee | All changes persist and version increments | Not run | Not Executed | Check stale-write behavior |
| EMP-004 | Employee hierarchy traversal | Automated | Unit runner | Build nested RO tree and resolve descendants/subordinates | Controlled hierarchy | Recursive descendants correct; siblings excluded | Vitest passed | Pass | `resourceOwnerTree.test.ts` |
| EMP-005 | Employee-project map scope | Automated | Unit runner | Evaluate super-admin, RO and contributor visibility | Controlled roster | Admin all active excluding system admin; RO descendants; IC none | Vitest passed | Pass | `employeeProjectMapScope.test.ts` |
| EMP-006 | Map employees to projects | Manual / DB | Disposable employees/project | Add mappings; duplicate mapping; remove mapping; refresh | Controlled PKs | Composite uniqueness holds; removal does not corrupt allocations | Not run | Not Executed | Verify authorization scope |
| EMP-007 | Employee cost effective dates | Manual / DB | Employee-cost permission | Add multiple effective rates; query periods before/on/after dates | Controlled rates/dates | Correct historical rate selected; decimals preserved | Not run | Not Executed | Check inactive/deleted rates |
| EMP-008 | Hard-delete employee cascade | Automated + Manual | Unit runner; disposable DB for integration | Validate dependency plan; then hard-delete with confirm credentials | Controlled dependency graph | Defined children cascade; unrelated rows remain | Unit cascade assertions passed; DB path not run | Pass | Integration portion remains manual |
| PRJ-001 | Project create | Manual | Projects permission; customer exists | Create each project type with valid date order/milestones/demand | Controlled project | PK-FK relations and arrays persist | Not run | Not Executed | Check paid/POC/product/support |
| PRJ-002 | Project validation | Manual / API | Projects permission | Missing customer; duplicate code; start/end inversion; invalid health; oversized snap | Controlled invalid payloads | 4xx with no partial children | Not run | Not Executed | Body limit is 5 MB |
| PRJ-003 | Project update | Manual | Existing disposable project | Edit health/remarks/dates/milestones/demand; refresh | Controlled project | Updated values appear in Project and reports | Not run | Not Executed | Verify removed children semantics |
| PRJ-004 | Project visible search | Automated | Unit runner | Search visible and hidden columns | Controlled rows/columns | Only visible searchable fields match; action/ID excluded | Vitest passed | Pass | `projectVisibleSearch.test.ts` |
| PRJ-005 | Project type badge | Automated | Unit runner | Resolve all project type labels/tones | Controlled enum values | Consistent type presentation | Vitest passed | Pass | `projectTypeBadge.test.ts` |
| PRJ-006 | Open-demand staffing | Automated | Unit runner | Vary skill match, headcount, health and working Saturdays | Controlled projects/allocations | Unmet count and priority computed correctly | 8 Vitest assertions passed | Pass | `openDemandStaffing.test.ts` |
| PRJ-007 | Project execution health propagation | Manual | Project with report visibility | Change health/remarks; open execution report | Controlled project | Report uses portfolio health and current remarks | Not run | Not Executed | Regression FR-147/PER-BR-006 |
| PRJ-008 | Hard-delete project cascade | Automated + Manual | Unit runner; disposable DB for integration | Validate plan; confirm hard-delete; inspect dependencies | Controlled graph | Milestones/demand/maps/allocations follow defined cascade | Unit assertions passed; DB path not run | Pass | Never run against production |
| PLN-001 | Planner day/week display | Automated | Unit runner | Generate day strip across dates/calendar | Controlled dates | Correct labels, dates and working-day treatment | Vitest passed | Pass | `plannerDayStrip.test.ts` |
| PLN-002 | Allocation permission | Automated | Unit runner | Evaluate direct RO, indirect RO, self and super-admin | Controlled hierarchy | Direct RO/admin allowed; self/indirect blocked | Vitest passed | Pass | `allocationPermission.test.ts` |
| PLN-003 | Self-allocation guard | Automated | Unit runner | Compare actor and target IDs | Controlled IDs | Matching IDs flagged as self-allocation | Vitest passed | Pass | `selfAllocation.test.ts` |
| PLN-004 | Allocation create | Manual / API | Eligible mapped employee/project | Create allocation with milestone/activity/date/hours/tasks | Controlled allocation | Row persists and appears after refresh/realtime event | Not run | Not Executed | Validate PK relationships |
| PLN-005 | Allocation validation boundaries | Manual / API | Planner permission | Test 0, negative, fractional and over-limit hours; inverted/outside-project dates | Controlled boundaries | Invalid values rejected; valid boundary accepted | Not run | Not Executed | Check overlap policy |
| PLN-006 | Allocation edit/delete confirmation | Manual | Disposable allocation | Edit and refresh; initiate delete, cancel, then confirm | Controlled allocation | Edit persists; cancel preserves; confirm removes/soft-deletes once | Not run | Not Executed | Verify confirmations retain safe references |
| PLN-007 | Employee-project eligibility | Manual | Mapped and unmapped employees | Open project options/create API for each | Controlled mappings | Only eligible project selectable; API rejects bypass | Not run | Not Executed | Admin/RO scopes differ |
| PLN-008 | Leave markers/capacity | Automated | Unit runner | Apply partial/full working-week leave | Controlled leave dates | Marker and capacity reduction follow working calendar | 4 Vitest assertions passed | Pass | `plannerLeaveMarkers.test.ts` |
| PLN-009 | Leave mutation scope/date | Automated | Unit runner | Evaluate admin/RO/IC and past/today/future dates | Controlled hierarchy/dates | Only permitted reportees and nonpast dates allowed | 7 Vitest assertions passed | Pass | `resourceLeaveScope.test.ts` |
| PLN-010 | Leave create/edit/cancel | Manual / API | Disposable employee | Create planned/unplanned leave; edit reason; cancel; refresh | Controlled leave | State and timestamps persist; allocation check reflects active only | Not run | Not Executed | Reason max 30 chars |
| CNF-001 | Confirmation submission | Manual / API | Allocation on selected work date | Start day; enter actuals/reasons/tasks; submit; refresh | Controlled workday | One confirmation/day persists with correct line kinds/totals | Not run | Not Executed | Check unique employee/date |
| CNF-002 | Duplicate confirmation | Manual / DB | Confirmation already exists | Submit same employee/date twice rapidly | Controlled duplicate request | One row only; duplicate safely rejected/idempotent | Not run | Not Executed | Double-submit prevention |
| CNF-003 | Day-start submission gate | Automated | Unit runner | Attempt submission with absent/blank day start | Controlled productivity state | Submission blocked with product message | Vitest passed | Pass | `confirmationProductivity.test.ts` |
| CNF-004 | Productive-window gate | Automated | Unit runner | Compare productive window below/equal/above planned | Controlled durations | Below blocked; equal/above allowed | Vitest passed | Pass | `confirmationProductivity.test.ts` |
| CNF-005 | Focus threshold/rounding | Automated | Unit runner | Exercise nearest 0.5h and 80% boundary | Controlled milliseconds/hours | Rounding and threshold are exact | Vitest passed | Pass | `confirmationProductivity.test.ts` |
| CNF-006 | Focus lifecycle gates | Automated | Unit runner | Start before day, during lunch, after end; pause/stop/logout | Controlled timestamps | Invalid starts blocked; timers finalized without inflation | Vitest passed | Pass | 25-test productivity suite |
| CNF-007 | Abandoned focus timer | Automated | Unit runner | Leave timer open past work date/day end | Controlled dates | Elapsed capped to work date/day end | Vitest passed | Pass | Prevents live `Date.now` growth |
| CNF-008 | Focus check-in timeout | Automated | Unit runner | Compute interval/deadline and timeout action | Controlled minute settings | Disabled at 0; valid interval prompts; timeout stops | 4 Vitest assertions passed | Pass | `focusCheckIn.test.ts` |
| CNF-009 | Planned/deviation/unplanned rules | Automated | Unit runner | Normalize unplanned reasons and compute confirmation codes | Controlled lines/reasons | Canonical reason required; same/late-day codes correct | Vitest passed | Pass | `unplannedWorkReason`, `dailyWorkAllocatedOn` |
| CNF-010 | Reminder workflow | Manual | Pending reportee + SMTP test provider | Send reminder once/repeatedly; inspect UI and mail provider | Controlled pending confirmation | Honest success/error; no unauthorized recipient or duplicate storm | Not run | Not Executed | Requires mail environment |
| AVL-001 | Leave-adjusted availability | Automated | Unit runner | Calculate partial and full-week leave capacity | Controlled employees/allocations/leaves | Free hours/capacity reduced correctly; zero-hour row retained | Vitest passed | Pass | `availLeaveCapacity.test.ts` |
| AVL-002 | Rolling-off calculation | Automated | Unit runner | Merge two weeks and classify ending allocations | Controlled dates/hours | Only qualifying resources counted; no duplicates | Vitest passed | Pass | `availRollingOffSoon`, `liveViews.rollingOff` |
| AVL-003 | Availability KPI boundaries | Automated | Unit runner | Calculate averages/deltas/zero capacity/critical percent | Controlled rows | Correct signs, nulls, percentages and top-three | Vitest passed | Pass | `availRollingOffSoon.test.ts` |
| AVL-004 | Allocate from Availability | Manual | Eligible resource visible | Open allocate action; save valid record; refresh Planner/Availability | Controlled allocation | One persisted allocation reflected on both screens | Not run | Not Executed | Prevent duplicate submit |
| AVL-005 | Utilization KPIs/bands | Automated | Unit runner | Compute booked/capacity percentages and thresholds | Controlled hours/settings | Values and band classifications follow settings | Vitest passed | Pass | `utilKpis.test.ts`, `settingsImpact.test.ts` |
| AVL-006 | Working calendar edge cases | Automated | Unit runner | Exercise weekends, configured workdays and off-days | Controlled calendar | Capacity/date traversal skips nonworking dates | Vitest passed | Pass | `workingCalendar.test.ts` |
| ECP-001 | Attention projects | Automated | Unit runner | Filter/rank project health and drill preset inputs | Controlled projects | Amber/red attention set correct | Vitest passed | Pass | `cockpitAttention.test.ts` |
| ECP-002 | Team-load calculation | Automated | Unit runner | Convert current/prior booked hours to percentages | Controlled performance rows | Percent, trend and tone correct; no-hours is 0 | Vitest passed | Pass | `cockpitTeamLoad.test.ts` |
| ECP-003 | Cockpit live cards/drills | Manual | Authenticated account with current data | Refresh cockpit; open each card/drill | Existing nonfabricated environment data | Counts agree with source screens; filters preserved | Not run | Not Executed | Do not validate against demo constants |
| ECP-004 | Department health ranking | Manual | Current confirmations/allocations | Compare ranking inputs and drill to Performance | Existing environment data | Sorted composite scores; target filter opens | Not run | Not Executed | Pending-calculation handled |
| ECP-005 | Planning conflicts | Manual | Controlled overlapping allocations in test DB | Create over-capacity/double booking; open conflicts; resolve one | Controlled records | Conflict appears once and disappears after correction | Not run | Not Executed | Validate RO scope |
| ECP-006 | Cockpit role scope | Manual | Super-admin and nested RO | Compare cards and role selector | Controlled hierarchy | Admin global; RO only permitted hierarchy | Not run | Not Executed | Known profile-stub risk documented |
| RPT-001 | Report hierarchy visibility | Automated | Unit runner | Scope employees/projects for admin and nested RO | Controlled hierarchy | Only permitted subtree visible | Vitest passed | Pass | `reportVisibility.test.ts` |
| RPT-002 | Deployment allocation hours | Automated | Unit runner | Calculate today/week/month overlap and filters | Controlled allocations | Working-day hour rollups correct | 5 Vitest assertions passed | Pass | `deploymentReport.allocationHours.test.ts` |
| RPT-003 | Available From | Automated | Unit runner | End Friday/off-day/already-free scenarios | Controlled dates/calendar | Next working date or `Now` | 4 Vitest assertions passed | Pass | `liveViews.rdrAvailableFrom.test.ts` |
| RPT-004 | Performance history | Automated | Unit runner | Build six-month history from live-shaped fixtures | Controlled period records | Six ordered labels and nonnegative metrics | Vitest passed | Pass | `liveViews.performanceHistory.test.ts` |
| RPT-005 | Performance leave capacity | Automated | Unit runner | Apply leave to denominator | Controlled leave/allocation | Utilization denominator reflects leave | Vitest passed | Pass | `performanceLeaveCapacity.test.ts` |
| RPT-006 | Daily Work columns/search | Automated | Unit runner | Toggle columns; search visible fields; filter project/day | Controlled rows/preferences | Hidden fields excluded; filters/search stable | Vitest passed | Pass | Multiple Daily Work unit files |
| RPT-007 | Report periods/pagination | Automated | Unit runner | Resolve date periods and page boundaries | Controlled dates/counts | Inclusive periods and page bounds correct | Vitest passed | Pass | `reportPeriods`, `reportPage` |
| RPT-008 | Filter persistence | Automated | Unit runner | Load all/subset/changed option lists; clear legacy keys | Controlled lists/storage | Explicit subset retained; all expands correctly | Vitest passed | Pass | `reportFilterPersistence.test.ts` |
| RPT-009 | Workday Summary calculations | Automated | Unit runner | Build 14-day window; compute codes/focus/unplanned/hours | Controlled records | Correct HH:mm, status codes, capping and filtering | 12 Vitest assertions passed | Pass | `workdaySummary.test.ts` |
| RPT-010 | Authenticated report smoke | Automated / API | Healthy Docker API + controlled E2E account | Login; open Deployment and Performance | Temporary E2E administrator | Headings and Available From render | Both authenticated report screens passed | Pass | `reports-smoke.spec.ts` |
| RPT-011 | Report exports | Manual | Report has existing environment rows | Apply filters/columns; export Excel and PDF; inspect content | Existing environment data | Export matches visible scope/filters and opens correctly | Not run | Not Executed | Check empty-result export |
| RPT-012 | Empty/error/loading states | Manual | API response can be safely controlled | Test zero rows, delayed response, 401, 403 and 500 | Controlled test environment | Accurate state; retry/sign-in behavior; no stale rows | Not run | Not Executed | No console errors |
| WCI-001 | Queue scope/day | Automated | Unit runner | Resolve compliance day and RO team scope | Controlled dates/hierarchy | Correct due/completed queue membership | Vitest passed | Pass | `teamComplianceDay.test.ts` |
| WCI-002 | RO remarks | Automated | Unit runner | Validate required/optional remarks by outcome | Controlled inputs | Rule enforced consistently | Vitest passed | Pass | `weeklyCheckInRoRemarks.test.ts` |
| WCI-003 | Submit weekly check-in | Manual / DB | Immediate report; active config | Enter every rating/status/action/remark; submit | Controlled submission | Immutable weekly record persists and queue completes | Not run | Not Executed | Unique employee/week enforced |
| WCI-004 | Duplicate/unauthorized submission | Manual / API | Existing submission; unrelated employee | Resubmit same week and submit outside RO scope | Controlled IDs | Duplicate and unauthorized requests rejected | Not run | Not Executed | No overwrite without explicit policy |
| WCI-005 | History | Manual | Employee has controlled submissions | Open history; navigate weeks; refresh | Controlled submissions | Ordered records match stored payload/evidence | Not run | Not Executed | Empty history state |
| WCI-006 | Config validation | Manual | Super-admin | Edit ranks/actions/competencies; test duplicate/empty/invalid order | Controlled config | Valid config persists; invalid config rejected atomically | Not run | Not Executed | Nonadmin denied |
| WCI-007 | Evidence accuracy | Manual | Controlled allocations/confirmations | Open workspace and compare evidence to source rows | Controlled week | Evidence totals and labels match sources | Not run | Not Executed | Deleted rows excluded |
| WCI-008 | Refresh/navigation safety | Manual | Draft entered | Refresh, back, employee switch, direct history URL | Controlled draft | No silent unintended submission; prompts/state per design | Not run | Not Executed | Regression workflow |
| KPI-001 | KPI master limits | Automated | Unit runner | Test category/method/unit/name and weight limits | Controlled boundary strings/numbers | Limits exactly enforced | Vitest passed | Pass | `kpiMasterLimits.test.ts` |
| KPI-002 | KPI year/cycle filters | Automated | Unit runner | Resolve allowed years/current quarter/All option | Controlled dates | Only configured years/cycles returned | Vitest passed | Pass | `kpiFilters.test.ts` |
| KPI-003 | KPI hierarchy/editability | Automated | Unit runner | Scope self/direct/indirect/admin | Controlled hierarchy | Visibility recursive; editing immediate reports only | Vitest passed | Pass | `kpiFilters.test.ts` |
| KPI-004 | KPI period expiry | Automated | Unit runner | Test before/on/after period end | Controlled dates/cycles | Edit/expiry state changes on correct boundary | Vitest passed | Pass | `kpiPeriodExpiry.test.ts` |
| KPI-005 | Framework CRUD and total weight | Manual / API | KPI Framework permission | Create/update/delete rows; test totals below/equal/above 100 | Controlled KPIs | Valid rows persist; invalid totals/fields rejected | Not run | Not Executed | Delete confirmation required |
| KPI-006 | Copy framework | Manual / API | Source/target employee-cycle | Copy once then repeat and test conflicts | Controlled cycles | Intended rows copied once with correct FKs | Not run | Not Executed | No partial duplicate copy |
| KPI-007 | Results/scoring | Manual | Editable reportee KPI | Enter results for both target directions and boundaries | Controlled targets/results | Score/status/remarks correct; unauthorized edit denied | Not run | Not Executed | Decimal precision checked |
| KPI-008 | Attachment lifecycle | Manual | Result row; storage configured | Upload allowed/oversized/unsupported; download; delete with confirmation | Controlled files | Metadata/storage consistent; failures leave no orphan | Not run | Not Executed | Verify auth and content type |
| DPT-001 | Decision-point create | Manual / API | Active type; raiser has immediate RO | Raise optional and required-allocation types | Controlled point | Unique code, owner and initial action created atomically | Not run | Not Executed | Required allocation enforced |
| DPT-002 | Decision-point lists/scope | Manual | Points across owners/statuses | Open Mine, Team, Requiring Action and badge summary | Controlled points | Counts/lists agree and unauthorized points hidden | Not run | Not Executed | Empty states included |
| DPT-003 | Decision-point detail trail | Manual | Existing point | Open detail and compare chronological actions | Controlled point/actions | Immutable complete trail and owner transitions | Not run | Not Executed | Direct URL authorization |
| DPT-004 | Acknowledge/approve/reject | Manual | Current owner | Execute each closing action on separate points | Controlled points | Correct final status/actor/time; no later actions | Not run | Not Executed | Remarks validation |
| DPT-005 | Escalation | Manual | Owner has next RO | Recommend escalation repeatedly to top | Controlled hierarchy | Owner/status/level transition correctly; top handled | Not run | Not Executed | Previous owner retained |
| DPT-006 | Self-resolve | Manual | Open point raised by actor | Self-resolve own point; attempt another user's point | Controlled points | Own closes; unauthorized request rejected | Not run | Not Executed | Audit action appended |
| DPT-007 | Concurrent action | Manual / DB | Same point open in two clients | Submit conflicting actions simultaneously | Controlled point | One valid transition; loser gets conflict; no split state | Not run | Not Executed | Transaction integrity |
| PCD-001 | Performance Card periods | Automated | Unit runner | Week/month/quarter/custom and discontinuous ranges | Controlled dates | Valid periods normalized; discontinuity rejected | Vitest passed | Pass | `performanceCard.test.ts` |
| PCD-002 | Performance metrics | Automated | Unit runner | Compute competency, discipline, focus, unplanned, billable and trends | Controlled evidence | Metrics and previous-period comparisons correct | 14 Vitest assertions passed | Pass | `performanceCard.test.ts` |
| PCD-003 | Missing/count-only metrics | Automated | Unit runner | Omit ratings; include leave/appreciation counts | Controlled sparse data | Missing displays as unavailable; count-only excluded from ranking | Vitest passed | Pass | Performance suite |
| PCD-004 | Resource scope | Manual / API | Admin, RO and contributor | Query resources/card for self, report and unrelated ID | Controlled hierarchy | Self/report permitted; unrelated denied | Not run | Not Executed | Debug endpoints admin-only |
| PCD-005 | Metric drill/export | Manual | Card has controlled 12-week evidence | Open metric modal; prev/next; export | Controlled card | Details/trend basis correct; export matches modal | Not run | Not Executed | No-data behavior |
| PCD-006 | Focus debug privacy | Manual / API | Admin and nonadmin | Call focus-laps/metric-debug for permitted/unpermitted IDs | Controlled IDs | Admin-only debug; no cross-user leakage | Not run | Not Executed | Validate query dates |
| CST-001 | Cost analyzer period/resource scope | Manual / API | Costs and work records in disposable DB | Query periods as admin/RO/IC | Controlled costs/work | Only visible employed resources included | Not run | Not Executed | Joining/exit inclusive |
| CST-002 | Effective cost selection | Manual / DB | Multiple employee rates | Calculate across effective-date boundary | Controlled rates/dates | Each work minute uses rate active that date | Not run | Not Executed | Decimal precision |
| CST-003 | Lost/overcaptured cost | Manual | Planned/actual/focus differences exist | Compare summary and drilldown totals | Controlled records | Drill rows sum exactly to cards | Not run | Not Executed | Zero/negative handling |
| CST-004 | Project cost drilldown | Manual | Multiple projects/activities | Open project then detail/back | Controlled records | Captured totals and navigation context preserved | Not run | Not Executed | Existing environment values not fabricated |
| CST-005 | Department drilldown | Manual | Multi-department hierarchy | Open department drill and filter | Controlled records | Scoped totals equal summary | Not run | Not Executed | Empty department |
| CST-006 | Missing rate/error state | Manual | Employee without effective rate | Query a period containing work | Controlled missing-rate row | Explicit unavailable/warning behavior; no invented zero cost | Not run | Not Executed | Critical financial integrity |
| SET-001 | Band-impact calculation | Automated | Unit runner | Change thresholds around employee percentages | Controlled settings/utilization | Reclassification impact correct | Vitest passed | Pass | `settingsImpact.test.ts` |
| SET-002 | Review draft restore | Automated | Unit runner | Cancel one section and leave review screen | Controlled drafts | Only cancelled/all unsaved fields restore as designed | Vitest passed | Pass | `settingsReviewDraft.test.ts` |
| SET-003 | Immediate settings save | Manual / DB | Settings permission | Change one section; review/save; refresh and query audit | Controlled settings | Active singleton updates and immutable audit row added | Not run | Not Executed | Validate version/change summary |
| SET-004 | Settings validation boundaries | Manual / API | Settings permission | Test unordered/negative/excess bands, hours, empty workdays and focus 0/1/240/241 | Controlled boundaries | Valid bounds accepted; invalid rejected atomically | Not run | Not Executed | Includes focus check-in |
| SET-005 | Future schedule | Manual / DB | Future date | Schedule settings; refresh before date | Controlled payload/date | Active unchanged; one pending schedule and audit visible | Not run | Not Executed | Timezone boundary |
| SET-006 | Apply due schedule | Manual / worker | Disposable DB; worker running | Advance/use due date; invoke worker/apply-due once and concurrently | Controlled schedule | Applied exactly once; status/time/audit consistent | Not run | Not Executed | Transaction/concurrency |
| SET-007 | Cancel/supersede schedule | Manual | Pending schedule | Cancel with confirmation; create competing schedule | Controlled schedules | Cancelled never applies; supersede policy consistent | Not run | Not Executed | Delete endpoint requires UI confirm |
| SET-008 | Settings authenticated smoke | Automated / API | Healthy Docker API + controlled E2E account | Login; open Settings | Temporary E2E administrator | Parameters and Change History render | Authenticated Settings smoke passed | Pass | `reports-smoke.spec.ts` |
| SET-009 | SMTP security | Manual | Test SMTP server | Save each security mode; test connection/email; change config | Controlled SMTP account | Password encrypted/masked; verified flag resets on change | Not run | Not Executed | Never log secret |
| SET-010 | Date/calendar propagation | Manual | Settings permission | Change date format/workdays/off-day; inspect planning/reports | Controlled settings | Display and capacity recalculate app-wide after refresh/event | Not run | Not Executed | Existing stored dates unchanged |
| SET-011 | Scheduled-settings worker parity | Static configuration audit | API and worker schedule apply implementations available | Compare fields written by API apply and worker apply | Current source | Both paths apply every scheduled settings field consistently | Worker omits `demandPriority` while API writes it | Fail | Root cause: `apps/oneview-worker/src/settings-schedule-apply.service.ts` update payload lacks `demandPriority` |
| API-001 | Global DTO whitelist | Automated / API | Docker API running | Submit malformed login with unknown property | Controlled invalid payload | 400 `VALIDATION_ERROR`; no write | Returned 400 with safe validation envelope | Pass | `api-smoke.spec.ts` |
| API-002 | Authentication guard | Automated / API | Docker API running | Call protected Employees route without JWT | No token | 401 `UNAUTHORIZED`; no data leakage | Returned expected safe 401 envelope | Pass | Expired/malformed-token matrix remains future coverage |
| API-003 | Permission guard denial | Automated / API | Controlled user with no permissions | Login restricted user; call Employees endpoint | Temporary restricted user | Unassigned module returns 403 | Returned expected `FORBIDDEN` envelope | Pass | Fixture removed by global teardown |
| API-004 | Exception envelope | Manual / API | API running | Trigger validation, auth, forbidden, not found, conflict and server errors | Controlled requests | Stable safe status/body; no stack/secret leakage | Not run | Not Executed | `AllExceptionsFilter` |
| API-005 | Throttling enforcement | Automated / API | Docker API running | Send six forgot-PIN requests inside one minute | Controlled nonexistent email | First five accepted; sixth returns 429 | All six returned 201; sixth did not throttle | Fail | Root cause: no registered `ThrottlerGuard` despite module/decorator configuration |
| API-006 | Realtime events | Manual | Two authenticated browsers | Mutate each emitted resource; observe second client | Controlled changes | Authorized client receives one event and refreshes | Not run | Not Executed | Reconnect/fallback behavior |
| API-007 | Health/clock | Automated / API | Docker API and DB available | GET health and clock | None | 200, database up, valid Asia/Kolkata clock | Both endpoints returned expected 200 responses | Pass | DB-down branch not executed |
| API-008 | Invalid identifiers | Manual / API | API running | Use nonnumeric, zero, negative, missing and nonexistent IDs | Controlled IDs | 400/404 consistently; no 500 | Not run | Not Executed | All `:id` routes |
| API-009 | Pagination/filter boundaries | Manual / API | Sufficient test records | Empty, max, oversized, negative page/limit and invalid dates | Controlled query params | Bounded deterministic results or clear 400 | Not run | Not Executed | Stable ordering |
| API-010 | API build | Automated | Dependencies installed | Run Nest compilation as part of root TypeScript build | Source tree | No TypeScript/build error | Root production build passed | Pass | No API runtime assertions |
| API-011 | API package test command | Automated | Dependencies installed | Run `npm run test -w @oneview/api` | Current workspace | API test runner starts and executes its suite | Startup failed: configured `vitest.config.ts` cannot be resolved | Fail | Root cause: script references missing `apps/oneview-api/vitest.config.ts`; no API tests exist |
| API-012 | Core protected read endpoints | Automated / API | Docker stack + controlled super-admin | Login then GET 30 auth/settings/master/planning/report/team endpoints | Temporary E2E administrator | Every endpoint returns 200 without unsafe mutation | All 30 endpoints returned 200 | Pass | `api-smoke.spec.ts`; includes SMTP, Cost Analyzer and Performance resources |
| API-013 | OpenAPI documentation | Automated smoke | Docker nginx running | GET `/api/docs` through nginx | None | Swagger UI responds successfully | HTTP 200 | Pass | Non-mutating |
| DB-001 | Prisma schema validity/build | Automated | Dependencies installed | Compile app and generated Prisma consumers | Current schema | Type-safe build succeeds | Production build passed | Pass | Does not replace migration test |
| DB-002 | PK foreign-key integrity | Manual / DB | Disposable DB | Insert valid and invalid department/customer/employee/project/allocation references | Controlled PKs | Valid PK FKs accepted; orphan/business-code references rejected | Not run | Not Executed | Required project standard |
| DB-003 | Unique constraints | Manual / DB | Disposable DB | Duplicate every business key/composite key | Controlled duplicates | Duplicate rejected and transaction remains usable | Not run | Not Executed | Employees, permissions, maps, confirmations, etc. |
| DB-004 | Cascade/set-null/restrict | Manual / DB | Disposable dependency graph | Delete parents under each relation policy | Controlled graph | Cascade/set-null/restrict exactly matches schema | Not run | Not Executed | Roll back after case |
| DB-005 | Soft-delete visibility | Manual / API | Disposable active/deleted rows | Soft-delete then list/get/report/query relationships | Controlled rows | Deleted rows excluded without corrupting historical references | Not run | Not Executed | Include inactive separately |
| DB-006 | Audit/version timestamps | Manual / DB | Disposable mutable rows | Create/update and inspect created/modified/by/version | Controlled actor | Audit fields correct and monotonic | Not run | Not Executed | Immutable audits never update |
| DB-007 | Migration from clean and current | Manual / DB | Empty DB and copy of current test DB | Run `prisma migrate deploy` twice on each | Disposable databases | First applies cleanly; second idempotent; no data loss | Not run | Not Executed | Never use production DB |
| DB-008 | Seed repeatability/security | Manual / DB | Empty disposable DB | Run required seed; rerun as documented; inspect sensitive columns | Development seed | Expected controlled records; PINs hashed; no plaintext secret | Not run | Not Executed | Demo seed only when explicitly chosen |
| DB-009 | Refresh-token employee FK | Static + live DB audit | Prisma schema and Docker DB available | Inspect schema/constraints and count orphan refresh tokens | Current local DB | FK to `employees.id`; zero orphan tokens | No FK exists and one orphan refresh token was found | Fail | Root cause: missing relation/FK in `prisma/schema.prisma` and migrations |
| OPS-001 | Ops console build | Automated | Ops dependencies installed | Build SPA and type-check server | Current source | Build succeeds | Build passed | Pass | `npm run ops:build` |
| OPS-002 | Ops authentication/session | Manual | Isolated ops-console data dir | Login invalid/valid; refresh; logout; replay cookie | Controlled ops credentials | Invalid denied; secure session works; revoked session rejected | Not run | Not Executed | Independent of WARIN DB |
| OPS-003 | Backup creation/download | Manual | Disposable local stack/files | Confirm then create DB/app/docker backup; download each | Disposable environment | Valid nonempty artifacts/metadata; cancel makes none | Not run | Not Executed | Never include secrets |
| OPS-004 | Restore safeguards | Manual | Disposable local Docker only | Upload wrong extension/oversize; wrong creds; cancel; restore valid dump | Controlled files/credentials | Invalid blocked/cleaned; valid restore only after two gates | Not run | Not Executed | Upload restore blocked on EC2 |
| OPS-005 | Docker restart safeguard | Manual | Disposable containers | Select restart; cancel then confirm; use invalid name | Disposable container | Cancel no-op; allowlisted valid restart only; audit written | Not run | Not Executed | Do not run on production for test |
| OPS-006 | Command allowlist | Manual | Ops authenticated | Run read-only command; submit unknown/destructive ID | Controlled IDs | Read-only runs; unknown/destructive denied; output/audit safe | Not run | Not Executed | No arbitrary shell |
| OPS-007 | Predeploy/deployment | Manual | Staging EC2 clone | Cancel; run with combinations; force backup/build/health failure | Staging ref | Backup gate enforced; failure stops; steps and SHAs audited | Not run | Not Executed | Production execution excluded |
| OPS-008 | Checklist persistence | Manual | Ops authenticated | Toggle valid key; refresh; submit invalid key | Controlled key | Valid persists/audits; invalid 400 | Not run | Not Executed | JSON store isolated |
| OPS-009 | Retention cleanup | Manual | Disposable expired/in-retention artifacts | Preview; cancel; confirm cleanup | Controlled backup dates | Only expired eligible files removed; records/audit consistent | Not run | Not Executed | Never delete single click |
| OPS-010 | Ops loading/error/responsive UI | Manual | Ops API success/delay/error | Visit all ten tabs at desktop/mobile; trigger errors | Controlled ops environment | Clear loading/error/success; no overlap; keyboard usable | Not run | Not Executed | Includes truncation titles |
| INF-001 | Local platform service health | Automated smoke | Docker Compose running | Verify Postgres, Redis, RabbitMQ, Prometheus, Grafana, Loki and Mailpit readiness | Local containers | Every dependency reports healthy/ready | All checks passed; Loki returned ready after startup warm-up | Pass | Worker logs contained no recent error |
| UX-001 | Main responsive layout | Manual | Authenticated test account | Exercise all routed screens at 320, 768, 1440 widths | Existing environment data | No overlap/clipping; tables scroll; drawers usable | Not run | Not Executed | Visual/manual |
| UX-002 | Keyboard/focus/accessibility | Manual | All forms/dialogs | Tab/Shift+Tab/Enter/Escape; inspect labels/focus traps | None | Logical order, visible focus, first field focus, dialog containment | Not run | Not Executed | Include PIN boxes |
| UX-003 | Loading and duplicate-submit | Manual | Network throttling | Submit every write twice; navigate during request | Controlled test records | One mutation; button progress/disable; stable final state | Not run | Not Executed | High-risk regression |
| UX-004 | Toast timing | Automated | Unit runner | Advance default timer; hover/pause/resume | Controlled timers | Five-second total with remaining duration after hover | Vitest passed | Pass | `toastTiming.test.ts` |
| UX-005 | Truncation/full-value tooltip | Manual | Long labels in all tables/cards | Hover every ellipsized value | Controlled long strings | Full exact value available on hover | Not run | Not Executed | `TruncateText`/title contract |
| UX-006 | Browser refresh/back/deep-link | Manual | Authenticated user on every workflow | Refresh, back/forward and paste nested URLs with/without access | Route matrix | State/auth/guards behave safely; no blank or stale screen | Not run | Not Executed | Regression navigation |

## Execution summary

The numeric summary below is generated from the statuses recorded in this document after the final rerun:

- **Total test cases:** 176
- **Passed:** 76
- **Failed:** 4
- **Blocked:** 1
- **Not executed:** 95

### Blockers

1. The activity workbook shape test is tied to `D:/Users/AMIT/Downloads/Warin-Activity-Upload.xlsx`; that external fixture remains absent.
2. Destructive backup/restore/delete/deployment and data-mutating manual workflows were intentionally not run against the current shared local data. They remain Not Executed until a disposable environment is provided.

### Failures and root causes

1. **SET-011 — Scheduled-settings worker parity:** the API apply path writes `demandPriority`, but the worker update payload does not. Responsible modules: `apps/oneview-api/src/api/settings/settings-schedule.service.ts` and `apps/oneview-worker/src/settings-schedule-apply.service.ts`.
2. **API-005 — Throttling enforcement:** six forgot-PIN requests within one minute all returned 201; the expected sixth response was 429. `ThrottlerModule` and `@Throttle` metadata are present, but no `ThrottlerGuard` is registered. Responsible modules: `apps/oneview-api/src/app.module.ts` and `apps/oneview-api/src/api/auth/auth.module.ts`.
3. **API-011 — API test command:** `apps/oneview-api/package.json` invokes `vitest run --config vitest.config.ts`, but `apps/oneview-api/vitest.config.ts` does not exist and no API test files were discovered. The command fails before executing tests.
4. **DB-009 — Refresh-token referential integrity:** `RefreshToken.employeeId` is indexed but has no Prisma/database FK to `Employee.id`; the live local audit found one orphan refresh token. Responsible schema/migrations: `prisma/schema.prisma` and the auth migrations.

### Critical issues found

- **Confirmed configuration defect (high):** API throttling limits are not enforced because the throttling guard is not registered.
- **Confirmed scheduling defect (high):** worker-applied scheduled settings can leave `demandPriority` stale compared with API-applied settings.
- **Confirmed test-infrastructure defect (high):** the API workspace test command fails at startup because its Vitest config is missing.
- **Confirmed integrity gap (medium):** refresh tokens have no database FK to employees.
- **Coverage risk (high):** controller/service/Prisma integration has no discovered automated API test suite; most authorization, validation, transaction, and FK behavior is not execution-verified here.
- **Resolved harness risk:** authenticated E2E now uses temporary controlled accounts and runs serially to respect the single-session policy; Docker execution completed with zero skipped browser/API tests.
- **Coverage risk (medium):** the operations console has build validation but no automated tests for its destructive safeguards.
- **Test portability issue (medium):** one workbook test uses a machine-specific absolute path.
- **Performance risk (low):** production build reports a JavaScript chunk of about 2.4 MB (about 680 KB gzip).
- **Maintenance risk (low):** lint reports 37 warnings, primarily existing React hook dependency and Fast Refresh warnings.

### Recommended fixes

1. Register `ThrottlerGuard` globally and add a focused HTTP test proving 429 behavior for login and forgot-PIN limits.
2. Make the worker apply every normalized settings field, including `demandPriority`, and add API/worker parity tests.
3. Add the missing API Vitest configuration plus an isolated PostgreSQL integration-test profile whose cases begin/roll back a transaction.
4. Add a `RefreshToken` → `Employee.id` FK with an intentional delete policy and migration after checking existing orphan rows.
5. In CI/full-validation mode, fail authenticated E2E setup when API health/login is unavailable instead of skipping.
6. Move the workbook fixture under a test-fixtures directory or require its path through an explicit environment variable.
7. Add ops-console unit/integration tests for auth, allowlisting, confirmation gates, upload cleanup, retention, and audit.
8. Gradually add Playwright workflows using API-created disposable records and teardown, never shared demo or production data.

## Commands

```powershell
npm run test:unit
npm run build
npm run test:e2e
npm run test:e2e -- --grep-invert "forgot-PIN endpoint"
npx playwright test tests/e2e/login.spec.ts
npm run ops:build
npm run lint
npm run test -w @oneview/api
```
