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
  const lapsMs = state.laps.reduce((s, l) => s + l.durationMs, 0);
  let open = state.sessionAccumMs;
  if (state.segmentStartedAt) {
    open += Math.max(0, now - new Date(state.segmentStartedAt).getTime());
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
  { key: "lunchOut", label: "Lunch Out" },
  { key: "lunchIn", label: "Lunch In" },
  { key: "dayEnd", label: "Day End" },
];

/** Next stampable step in mandatory order, or null when Day End is done. */
export function nextWorkdayActionKey(marks: WorkdayMarks): WorkdayMarkKey | null {
  for (const { key } of WORKDAY_ACTIONS) {
    if (!marks[key]) return key;
  }
  return null;
}

/** True only when `key` is the next required step (strict sequence). */
export function canStampWorkdayAction(marks: WorkdayMarks, key: WorkdayMarkKey): boolean {
  return nextWorkdayActionKey(marks) === key;
}
