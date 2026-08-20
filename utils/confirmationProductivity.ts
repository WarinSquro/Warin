/** Client-only productivity evidence for Work Confirmation (reference only). */

export type WorkdayMarkKey = "dayStart" | "lunchOut" | "lunchIn" | "dayEnd";

export type WorkdayMarks = Partial<Record<WorkdayMarkKey, string>>; // ISO datetime when stamped

export type FocusLap = {
  id: string;
  startedAt: string;
  endedAt: string;
  durationMs: number;
};

export type FocusAllocationState = {
  laps: FocusLap[];
  /** Accumulated ms from completed segments in the current open session (before Stop). */
  sessionAccumMs: number;
  /** When current run segment started; null if paused or idle. */
  segmentStartedAt: string | null;
};

export type DayProductivity = {
  workday: WorkdayMarks;
  focusByAllocation: Record<string, FocusAllocationState>;
  /** Snapshot of planned/unplanned confirmed hours (set on submit; live for today). */
  workHours?: number;
  /** Active timer allocation id for this day (only one running at a time). */
  activeTimerId?: string | null;
};

export type ProductivityStore = {
  days: Record<string, DayProductivity>;
};

const STORAGE_PREFIX = "oneview_confirm_productivity_v1_";

export function emptyDayProductivity(): DayProductivity {
  return { workday: {}, focusByAllocation: {}, activeTimerId: null };
}

export function emptyFocusState(): FocusAllocationState {
  return { laps: [], sessionAccumMs: 0, segmentStartedAt: null };
}

/** True when Start/Pause session is still open (running or paused, Stop not pressed). */
export function hasUnstoppedFocusSession(state: FocusAllocationState | undefined): boolean {
  if (!state) return false;
  return !!state.segmentStartedAt || state.sessionAccumMs > 0;
}

/** True when any allocation still has an unstopped focus session. */
export function hasAnyUnstoppedFocusSession(
  focusByAllocation: Record<string, FocusAllocationState> | undefined
): boolean {
  if (!focusByAllocation) return false;
  return Object.values(focusByAllocation).some(hasUnstoppedFocusSession);
}

function storageKey(hrmsId: string) {
  return `${STORAGE_PREFIX}${hrmsId}`;
}

export function loadProductivityStore(hrmsId: string): ProductivityStore {
  try {
    const raw = localStorage.getItem(storageKey(hrmsId));
    if (!raw) return { days: {} };
    const parsed = JSON.parse(raw) as ProductivityStore;
    return parsed?.days ? parsed : { days: {} };
  } catch {
    return { days: {} };
  }
}

export function saveProductivityStore(hrmsId: string, store: ProductivityStore) {
  try {
    localStorage.setItem(storageKey(hrmsId), JSON.stringify(store));
  } catch {
    /* ignore quota */
  }
}

export function getDayProductivity(store: ProductivityStore, dateIso: string): DayProductivity {
  return store.days[dateIso] ?? emptyDayProductivity();
}

export function upsertDayProductivity(
  store: ProductivityStore,
  dateIso: string,
  day: DayProductivity
): ProductivityStore {
  return { days: { ...store.days, [dateIso]: day } };
}

export function formatClockAmPm(isoOrEmpty?: string | null): string {
  if (!isoOrEmpty) return "00:00";
  const d = new Date(isoOrEmpty);
  if (Number.isNaN(d.getTime())) return "00:00";
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
}

export function formatHms(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function formatCompactDuration(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}`;
  return `00:${String(m).padStart(2, "0")}`;
}

/** Elapsed ms for an allocation including open segment. */
export function focusElapsedMs(state: FocusAllocationState | undefined, now = Date.now()): number {
  if (!state) return 0;
  const lapsMs = state.laps.reduce((s, l) => s + lapDurationMs(l), 0);
  let open = Math.max(0, state.sessionAccumMs || 0);
  if (state.segmentStartedAt) {
    open += Math.max(0, now - new Date(state.segmentStartedAt).getTime());
  }
  return lapsMs + open;
}

/** Prefer started/ended timestamps; fall back to stored durationMs. */
function lapDurationMs(lap: FocusLap): number {
  const start = new Date(lap.startedAt).getTime();
  const end = new Date(lap.endedAt).getTime();
  if (!Number.isNaN(start) && !Number.isNaN(end) && end >= start) {
    return end - start;
  }
  const stored = Number(lap.durationMs);
  return Number.isFinite(stored) && stored > 0 ? stored : 0;
}

/**
 * End of the work calendar day in the product display timezone (IST).
 * Used to close abandoned open focus segments on historical report days.
 */
export function workDateEndMs(workDateIso: string): number {
  const day = workDateIso.slice(0, 10);
  // Asia/Kolkata is fixed UTC+05:30 (no DST).
  return new Date(`${day}T23:59:59.999+05:30`).getTime();
}

export function workDateStartMs(workDateIso: string): number {
  const day = workDateIso.slice(0, 10);
  return new Date(`${day}T00:00:00.000+05:30`).getTime();
}

/**
 * Focus elapsed for Workday Summary / historical reports.
 * Open timers must not keep accruing against Date.now() after the work date —
 * that produced multi-day totals (e.g. 67h) for a single row.
 *
 * Caps the open segment at Day End (if stamped), else end of that calendar day (IST),
 * and never past `now`. Completed laps use started/ended timestamps.
 */
export function focusElapsedMsForWorkDate(
  state: FocusAllocationState | undefined,
  workDateIso: string,
  opts?: { dayEndIso?: string | null; now?: number }
): number {
  if (!state) return 0;
  const now = opts?.now ?? Date.now();
  const lapsMs = state.laps.reduce((s, l) => s + lapDurationMs(l), 0);
  let open = Math.max(0, state.sessionAccumMs || 0);

  if (state.segmentStartedAt) {
    const segStart = new Date(state.segmentStartedAt).getTime();
    if (!Number.isNaN(segStart)) {
      const dayStart = workDateStartMs(workDateIso);
      const dayEndStamp = opts?.dayEndIso ? new Date(opts.dayEndIso).getTime() : NaN;
      const dayCap = !Number.isNaN(dayEndStamp)
        ? dayEndStamp
        : workDateEndMs(workDateIso);
      const asOf = Math.min(now, dayCap);
      const from = Math.max(segStart, dayStart);
      open += Math.max(0, asOf - from);
    }
  }

  return lapsMs + open;
}

export function sessionDisplayMs(state: FocusAllocationState | undefined, now = Date.now()): number {
  if (!state) return 0;
  let open = state.sessionAccumMs;
  if (state.segmentStartedAt) {
    open += Math.max(0, now - new Date(state.segmentStartedAt).getTime());
  }
  return open;
}

export function workdayDurationMs(marks: WorkdayMarks): {
  officeMs: number;
  lunchMs: number;
  productiveMs: number;
} {
  const start = marks.dayStart ? new Date(marks.dayStart).getTime() : NaN;
  const end = marks.dayEnd ? new Date(marks.dayEnd).getTime() : NaN;
  const out = marks.lunchOut ? new Date(marks.lunchOut).getTime() : NaN;
  const inn = marks.lunchIn ? new Date(marks.lunchIn).getTime() : NaN;

  let officeMs = 0;
  if (!Number.isNaN(start) && !Number.isNaN(end) && end >= start) {
    officeMs = end - start;
  }

  let lunchMs = 0;
  if (!Number.isNaN(out) && !Number.isNaN(inn) && inn >= out) {
    lunchMs = inn - out;
  }
  // Lunch cannot exceed office window when both are known.
  if (officeMs > 0 && lunchMs > officeMs) {
    lunchMs = officeMs;
  }

  const productiveMs = Math.max(0, officeMs - lunchMs);
  return { officeMs, lunchMs, productiveMs };
}

/**
 * Total (Planned/Unplan.) Work Hours:
 *   Σ allocated hours for as-planned lines (plannedHours)
 * + Σ deviation hours (actual hours entered on deviation lines)
 * + Σ unplanned work hours
 */
export function computeConfirmationWorkHours(
  lines: { id: string; plannedHours: number }[],
  states: Record<string, { mode: "planned" | "deviation"; actual: number }>,
  unplanned: { hours: number }[]
): number {
  let allocatedHours = 0;
  let deviationHours = 0;
  for (const l of lines) {
    const st = states[l.id];
    if (!st || st.mode === "planned") {
      allocatedHours += Number(l.plannedHours) || 0;
    } else {
      deviationHours += Number(st.actual) || 0;
    }
  }
  const unplannedHours = unplanned.reduce((sum, u) => sum + (Number(u.hours) || 0), 0);
  return Math.round((allocatedHours + deviationHours + unplannedHours) * 10) / 10;
}

export function monthDays(year: number, monthIndex: number): (string | null)[] {
  const first = new Date(year, monthIndex, 1);
  const startPad = first.getDay(); // Sun=0 (matches confirmation calendar reference)
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const cells: (string | null)[] = [];
  for (let i = 0; i < startPad; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    const m = String(monthIndex + 1).padStart(2, "0");
    const day = String(d).padStart(2, "0");
    cells.push(`${year}-${m}-${day}`);
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export const WORKDAY_ACTIONS: { key: WorkdayMarkKey; label: string }[] = [
  { key: "dayStart", label: "Day Start" },
  { key: "lunchOut", label: "Lunch Start" },
  { key: "lunchIn", label: "Lunch End" },
  { key: "dayEnd", label: "Day End" },
];

/** Lunch was skipped when the day ended without a lunch-out stamp. */
export function isLunchSkipped(marks: WorkdayMarks): boolean {
  return Boolean(marks.dayEnd && !marks.lunchOut);
}

/**
 * Stampable actions given optional lunch:
 * - No dayStart → Day Start only
 * - Day Start done, no lunch, no dayEnd → Lunch Out **or** Day End
 * - Lunch Out without Lunch In → Lunch In only
 * - Lunch In (or no lunch) without Day End → Day End only
 * - Day End done → none
 */
export function allowedWorkdayActionKeys(marks: WorkdayMarks): WorkdayMarkKey[] {
  if (!marks.dayStart) return ["dayStart"];
  if (marks.dayEnd) return [];

  if (marks.lunchOut && !marks.lunchIn) return ["lunchIn"];
  if (marks.lunchOut && marks.lunchIn) return ["dayEnd"];

  // After check-in, lunch is optional — may start lunch or check out directly
  return ["lunchOut", "dayEnd"];
}

/** First stampable step (legacy helpers / single-next UX). Prefer `allowedWorkdayActionKeys`. */
export function nextWorkdayActionKey(marks: WorkdayMarks): WorkdayMarkKey | null {
  return allowedWorkdayActionKeys(marks)[0] ?? null;
}

export function canStampWorkdayAction(marks: WorkdayMarks, key: WorkdayMarkKey): boolean {
  return allowedWorkdayActionKeys(marks).includes(key);
}

/** Structural + chronological rules for persisted marks (client + API). */
export function validateWorkdayMarks(marks: WorkdayMarks): string | null {
  const t = (iso: string | null | undefined) => (iso ? new Date(iso).getTime() : NaN);
  const dayStart = t(marks.dayStart);
  const lunchOut = t(marks.lunchOut);
  const lunchIn = t(marks.lunchIn);
  const dayEnd = t(marks.dayEnd);

  if (marks.lunchIn && !marks.lunchOut) {
    return "Lunch In requires Lunch Out first.";
  }
  if (marks.lunchOut && !marks.dayStart) {
    return "Lunch Out requires Day Start first.";
  }
  if (marks.dayEnd && !marks.dayStart) {
    return "Day End requires Day Start first.";
  }
  if (marks.dayEnd && marks.lunchOut && !marks.lunchIn) {
    return "Complete Lunch In before Day End, or clear Lunch Out if no lunch was taken.";
  }
  if (marks.lunchOut && marks.lunchIn && !Number.isNaN(lunchOut) && !Number.isNaN(lunchIn) && lunchIn < lunchOut) {
    return "Lunch In must be at or after Lunch Out.";
  }
  if (marks.dayStart && marks.lunchOut && !Number.isNaN(dayStart) && !Number.isNaN(lunchOut) && lunchOut < dayStart) {
    return "Lunch Out must be at or after Day Start.";
  }
  if (marks.dayStart && marks.dayEnd && !Number.isNaN(dayStart) && !Number.isNaN(dayEnd) && dayEnd < dayStart) {
    return "Day End must be at or after Day Start.";
  }
  if (marks.lunchIn && marks.dayEnd && !Number.isNaN(lunchIn) && !Number.isNaN(dayEnd) && dayEnd < lunchIn) {
    return "Day End must be at or after Lunch In.";
  }
  return null;
}
