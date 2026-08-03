# Settings — Schedule / Effective-Dated Save: Functional Analysis

**Status: IMPLEMENTED (FR-033)** — see `app_settings_schedule`, `SettingsScheduleService`, worker apply job, and Settings/Utilization banners.
Analysis below remains as the design rationale.

---

## 1. Why this needs a design pass first

`screens/Settings.tsx` already has UI for the decision ("Review impact before saving" → **Immediately** vs **Schedule for later**), but only the "Immediately" path is wired to anything real:

- `ImpactModal` lets the user pick `when: "now" | "future"` and an effective date, but `onSave` always calls the same `handleSave()` → `persistSettings(s)` → `PUT /settings`, regardless of `when`. Choosing "Schedule for later" today silently behaves exactly like "Immediately" — the picked date is discarded.
- `SCHEDULED_CHANGES` (the array that would drive the "N scheduled change" banner at the top of the screen) and the matching banner in `screens/Utilization.tsx` are both hardcoded to empty/`false` — there is no live data source for "a change is pending."
- The database has **no concept of a pending/future-dated change**. `AppSettings` (`prisma/schema.prisma`) is a single active row (`code = "default"`) with a `version` int that increments on every `PUT` — there's no history table and no scheduled-change table.
- `Utilization.tsx` and all live views (`api/liveViews.ts`) read `useSettings().settings` — i.e. **whatever is in the DB right now** — to classify people into idle/optimal/overloaded. There is no "as of this date, these were the effective bands" lookup.

Given that, implementing "Schedule for later" is not a small UI tweak — it changes what "current settings" means, requires new persistence, and touches every screen that classifies utilization/metrics. This document lays out the intended behavior so it can be reviewed before any of that is built.

---

## 2. Key terms used below

| Term | Meaning here |
|---|---|
| **Active settings** | The one row of `AppSettings` that is currently in effect and that live screens should read. |
| **Current data** | Anything computed live against *active settings* right now (Utilization bands, Planning & confirmation bands, capacity math, etc.). |
| **Existing records** | Rows already persisted before this save (allocations, confirmations, weekly check-ins, reports) whose *displayed* classification was computed at some point in the past. |
| **Pending schedule** | A change the user chose to apply on a future date; not yet in effect. |
| **Version history** | An immutable trail of what the settings values were, when, and who changed them — broader than the Change History audit log (item 8), which only records *that* a change happened, not a restorable snapshot. |

---

## 3. What should happen on "Save & apply" (immediate) — already the target behavior

This is the path item 7's fix restores/completes. On click:

1. Validate the draft (`s`) client-side (already done implicitly by disabling Save when nothing changed).
2. `PUT /settings` with the full draft body (now including `capacityBasis`, per item 7).
3. Server updates the single active `AppSettings` row in place and increments `version`.
4. Client `refresh()`s from `GET /settings` and clears `dirty`.
5. An audit entry is recorded (item 8) describing the field-level diff, timestamped **now**, with the change already in effect.
6. Every screen reading `useSettings().settings` immediately reflects the new values on next render — utilization bands, Access Rights capacity math, planner overallocation guardrail, etc.

No "current data / existing records" ambiguity here: nothing retroactively recalculates, because the change takes effect now and forward, same as today.

---

## 4. What should happen on "Schedule for later" (future effective date) — NOT implemented

### 4.1 On Save click (future date selected)

The **active** `AppSettings` row must **not** change immediately. Instead:

1. Validate the draft and the chosen effective date (must be **today or later**; "today" would behave like immediate and could be disallowed or coerced to "Immediately" in the UI to avoid ambiguity).
2. Persist a **pending schedule** record — this requires new state that does not exist today, e.g. a `SettingsSchedule` table (or a JSON "pending" column) with:
   - the full target values (or just the diffed fields) to apply,
   - `effectiveDate`,
   - `status`: `pending | applied | cancelled | superseded`,
   - `createdBy`, `createdAt`.
3. Do **not** call the same `PUT /settings` that mutates the active row. Either a new endpoint (`POST /settings/schedule`) or a mode flag on the existing one.
4. Record an audit entry immediately, but phrased as *scheduled*, not *changed* — e.g. "Scheduled: Optimal floor 70% → 85%, effective Aug 12, 2026" — distinct from an "applied" entry that appears later.
5. Show the "N scheduled changes" banner (Settings screen) and the matching banner on Utilization, sourced from the real pending-schedule record instead of the current dead/hardcoded arrays.
6. The draft (`dirty`) state clears, but the **active** settings the rest of the app reads are unchanged until the effective date.

### 4.2 What "current data" should show while a schedule is pending

- All live screens (Utilization, Access Rights capacity, Planner overallocation guardrail, dashboards) continue to classify against the **currently active** values — *not* the pending ones. This matches the existing (unwired) banner copy: *"band counts below reflect the current 70% threshold until then."*
- The Settings screen itself should show the pending schedule distinctly from the live values (e.g. the banner + a way to see/cancel it), so admins know a change is queued without it affecting today's numbers.

### 4.3 What should happen on/after the effective date

1. Something has to notice the date has arrived and apply the change — either:
   - a scheduled job/cron (e.g. daily) that finds `status = pending AND effectiveDate <= today` and applies them, or
   - a lazy check on relevant read paths (e.g. `GET /settings`) that applies any due schedule before responding.
   A real cron/worker is the more correct choice (the `apps/oneview-worker` service already exists in this monorepo and is a natural home for this), since lazy-apply-on-read can silently skip applying if nobody calls `GET /settings` on the due date, and can race multiple concurrent requests.
2. Applying a due schedule means: update the active `AppSettings` row with the scheduled values, increment `version`, mark the schedule `status = applied`, and write an audit entry ("Applied scheduled change: …") distinct from the original "Scheduled: …" entry.
3. From that moment, current data (bands, guardrails, dashboards) reflects the new values — same as an immediate save, just deferred.

### 4.4 What should happen to "existing records" (already-computed history)

Per the existing (unimplemented) UI copy: *"Effective-dated from today — historical utilization keeps its original band labels."* That implies:

- Already-computed/displayed classifications for **past** periods (e.g. a utilization report for last month, a weekly check-in evidence snapshot, a confirmation's historical deviation flag) must **not** be retroactively relabeled when settings change — whether by immediate save or by a schedule taking effect.
- Today, nothing actually freezes a classification at computation time — `buildUtilRowsFromEmployees`/`buildLiveWeeklyEvidence` (in `api/liveViews.ts`) always recompute live against **current** `AppSettings` on every fetch. There is no per-record snapshot of "which band-thresholds were in effect when this was computed."
- To honor the existing UI promise precisely, either:
  - (a) capture and store the applicable thresholds alongside any persisted computed artifact at the time it's created (e.g. a weekly check-in submission's evidence snapshot already has a `capturedAt` — the same idea would need to extend to the specific band values used), or
  - (b) accept that only a coarse, whole-history "settings effective as of date X" table is needed, and any report that needs point-in-time accuracy joins against "the AppSettings version active on date X" instead of always using "the current one."
- This is a materially larger change than anything else in this analysis and should be scoped/approved separately — it affects every report/screen that currently reads `useSettings()` live.

### 4.5 Version history vs. Change History audit log

- Item 8 (implemented, localStorage-based) answers "what changed and who changed it," which is sufficient for a simple audit trail but is **not** a restorable version history (it's client-side only, per-browser, and doesn't store the actual before/after full snapshot needed to reconstruct "settings as of date X").
- True version history (needed for 4.4's "historical utilization keeps its original band labels" to be provable/auditable server-side, and to survive across browsers/users) would need either:
  - keeping every historical `AppSettings` row instead of updating in place (soft-versioning: never `UPDATE`, always insert a new version row and flip `isActive`), or
  - a dedicated `AppSettingsHistory` table populated on every apply (immediate or scheduled).
- No DB migration was made for this — flagged here as a prerequisite decision, not an assumption.

### 4.6 "Active records"

- At any point in time there is exactly one **active** `AppSettings` row (`isActive = true`, `code = "default"`) that live screens read. With scheduling, "active" needs to stay a well-defined, single row even while a schedule is pending — the pending schedule is explicitly **not** active until applied.
- If version history (4.5) is adopted, "active" becomes "the current version," and past versions remain queryable but are never read by live screens by default.

---

## 5. Open questions to resolve before implementation

1. **Multiple pending schedules**: can a user queue more than one future change (e.g. one for bands, a separate one for working hours, each with different effective dates)? Or is there only ever one pending schedule for the whole settings object (simplest, matches the singleton `AppSettings` row)?
2. **Editing/cancelling a pending schedule**: does the UI need a way to view, edit, or cancel a queued schedule before it applies? (The current banner design implies at least "view," per the existing copy pattern.)
3. **Conflict handling**: if a new "Save" (immediate or scheduled) is made while a schedule is already pending, does it replace/supersede the pending one, stack, or is a second schedule blocked until the first resolves?
4. **Apply mechanism**: cron/worker (`apps/oneview-worker`) vs. lazy-apply-on-read — worker is recommended (see 4.3) but needs infra confirmation (does the worker already run a daily scheduler, or does one need to be added?).
5. **Timezone for "effective date"**: settings dates are plain `YYYY-MM-DD` (no timezone) elsewhere in the app (e.g. company off days) — should "effective at midnight" be evaluated in server time, IST, or per-org configured timezone?
6. **Point-in-time historical accuracy (4.4/4.5)**: is a full `AppSettingsHistory`/versioning table in scope, or is "current settings always apply, no retroactive relabeling of already-rendered UI" (i.e., don't recompute what's already on screen, but don't guarantee a report re-run next week shows the old bands either) an acceptable interim scope?
7. **Permissions**: is scheduling a change gated by the same `settings` permission as immediate save, or does it need a separate approval step (the FRD language "Review impact before saving" hints at an approval-style flow that isn't built)?

---

## 6. Suggested minimal-risk sequencing (for when this is approved)

1. Add a `SettingsSchedule` table (Prisma migration) + `POST /settings/schedule`, `GET /settings/schedule` (list pending), `DELETE /settings/schedule/:id` (cancel).
2. Wire `ImpactModal`'s `when === "future"` path to the new endpoint instead of `handleSave()`; keep "Immediately" exactly as-is.
3. Replace the dead `SCHEDULED_CHANGES` arrays (Settings + Utilization banners) with real data from `GET /settings/schedule`.
4. Add an apply mechanism (favor the existing worker app) that applies due schedules, updates `AppSettings`, and writes both a "scheduled" and an "applied" audit entry.
5. Only after the above is approved and stable, evaluate whether full version history / point-in-time report accuracy (4.4/4.5) is required, given its wider blast radius across reports and live views.

---

**Awaiting approval before implementation.**
