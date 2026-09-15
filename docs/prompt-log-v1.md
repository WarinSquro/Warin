# OneView — prompt & output log (v1)

Continuation of `docs/prompt-log.md`. Newest entries appear first.

---

## Entries

### 2026-09-15 18:53 IST

**Prompt:**  
> Docker is running now. Run all pending/related test cases and generate a proper report.

**Output:**  
- Verified all Compose services; API health/database and clock returned 200; Prisma reported all 27 migrations applied.
- Replaced unreliable seeded-admin/skipping E2E behavior with temporary controlled admin/restricted fixtures, serial execution for the single-session policy, and guaranteed teardown. Verified zero fixture employees remained afterward.
- Added `tests/e2e/api-smoke.spec.ts` covering health/clock, DTO whitelist, 401, restricted-user 403, rate limiting, and 30 authenticated read-only module endpoints.
- Final full Playwright result: 12 passed, 1 failed, 0 skipped. The failing forgot-PIN throttle test expected the sixth request to return 429 but received 201, confirming the missing `ThrottlerGuard`.
- Passing-only Playwright verification (`--grep-invert "forgot-PIN endpoint"`): 12 passed.
- Unit: 57 files passed; 280 passed, 1 external-workbook test skipped. Main/API/worker/ops builds passed. Lint: 0 errors, 37 existing warnings; focused E2E lint clean.
- API workspace test command still fails before execution because `apps/oneview-api/vitest.config.ts` is missing.
- Live read-only DB audit found one orphan refresh token and no FK on `refresh_tokens.employee_id`; no duplicate employee-cost effective dates or active leave dates. Controlled E2E data was removed.
- Prometheus, Grafana, Loki, Redis, RabbitMQ and Mailpit checks passed; Loki initially returned 503 during warm-up then 200 `ready`.
- Updated `docs/comprehensive-test-cases.md`: 176 total; 76 Passed; 4 Failed; 1 Blocked; 95 Not Executed. Destructive/current-data mutations remain unexecuted pending a disposable environment.

### 2026-09-15 18:28 IST

**Prompt:**  
> Analyze the complete application, generate comprehensive functional/UI/API/RBAC/database/regression test cases with unique IDs, implement automatable coverage, execute it through Cursor, record actual statuses, and report totals, blockers, failures, root causes, and recommendations without treating demo/fabricated data as live validation.

**Output:**  
- Added `docs/comprehensive-test-cases.md`: application/API/data inventory plus 170 test cases with required preconditions, steps, test data, expected/actual results, status, automation/manual classification, remarks, blockers, risks, and recommendations.
- Expanded `tests/e2e/login.spec.ts` with deterministic public-auth browser tests for incomplete credentials/no API call, numeric-only and PIN visibility behavior, forgot-PIN navigation/email gating, and missing reset-token handling.
- Executed `npm run test:unit`: 57 files passed; 280 tests passed; 1 external-workbook test skipped.
- Executed `npm run build` and `npm run ops:build`: both passed; main build emitted a non-failing large-chunk warning.
- Executed final `npm run test:e2e`: 5 passed and 3 authenticated tests skipped because the API was unavailable; skipped checks are recorded as Blocked, not Passed.
- Executed `npm run lint`: 0 errors and 37 existing warnings; no warning from the added E2E coverage.
- Follow-up API command `npm run test -w @oneview/api` failed before test execution because its configured `apps/oneview-api/vitest.config.ts` is missing.
- Follow-up static verification recorded three additional confirmed defects: no registered `ThrottlerGuard`, worker settings apply omits `demandPriority`, and `refresh_tokens.employee_id` has no FK to `employees.id`.
- Final catalog result: 173 total; 66 Passed; 4 Failed; 4 Blocked; 99 Not Executed. No live/production records were changed and no destructive/database/deployment tests were run without a disposable rollback-safe environment.
