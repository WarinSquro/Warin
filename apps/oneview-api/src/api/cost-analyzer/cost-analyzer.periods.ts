/** Period helpers for Cost Analyzer (subset of Performance Card periods). */

export type CostAnalyzerPeriodId =
  | "this_week"
  | "prev_week"
  | "this_month"
  | "prev_month"
  | "custom";

export type DateRange = { from: string; to: string };

function todayISO(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function mondayISO(from = new Date()): string {
  const x = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const day = x.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + diff);
  return todayISO(x);
}

export function addDaysISO(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y!, m! - 1, d!);
  date.setDate(date.getDate() + days);
  return todayISO(date);
}

function sundayOfWeek(monday: string): string {
  return addDaysISO(monday, 6);
}

function weekBoundsFromMonday(monday: string): DateRange {
  return { from: monday, to: sundayOfWeek(monday) };
}

function monthIdFromDate(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function shiftMonthId(monthId: string, delta: number): string {
  const [ys, ms] = monthId.split("-");
  const y = Number(ys);
  const m = Number(ms);
  const d = new Date(y, m - 1 + delta, 1);
  return monthIdFromDate(d);
}

function monthBounds(monthId: string): DateRange {
  const [ys, ms] = monthId.split("-").map(Number);
  const from = `${ys}-${String(ms).padStart(2, "0")}-01`;
  const last = new Date(ys!, ms!, 0).getDate();
  const to = `${ys}-${String(ms).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
  return { from, to };
}

export function areWeeksContinuous(mondays: string[]): boolean {
  const sorted = [...mondays].sort();
  for (let i = 1; i < sorted.length; i++) {
    if (addDaysISO(sorted[i - 1]!, 7) !== sorted[i]) return false;
  }
  return sorted.length > 0;
}

export function customWeeksRange(mondays: string[]): DateRange {
  const sorted = [...mondays].sort();
  return { from: sorted[0]!, to: sundayOfWeek(sorted[sorted.length - 1]!) };
}

export function resolveCostPeriodRange(
  periodId: CostAnalyzerPeriodId,
  opts?: { customWeeks?: string[]; anchor?: Date }
): DateRange {
  const anchor = opts?.anchor ?? new Date();
  if (periodId === "this_week") return weekBoundsFromMonday(mondayISO(anchor));
  if (periodId === "prev_week") return weekBoundsFromMonday(addDaysISO(mondayISO(anchor), -7));
  if (periodId === "this_month") return monthBounds(monthIdFromDate(anchor));
  if (periodId === "prev_month") return monthBounds(shiftMonthId(monthIdFromDate(anchor), -1));
  const weeks = (opts?.customWeeks ?? []).filter(Boolean);
  if (!weeks.length || !areWeeksContinuous(weeks)) {
    throw new Error("Custom weeks require a continuous selection");
  }
  return customWeeksRange(weeks);
}

/** Equivalent previous period for KPI comparison. */
export function previousComparableRange(
  periodId: CostAnalyzerPeriodId,
  current: DateRange,
  opts?: { customWeeks?: string[] }
): DateRange {
  if (periodId === "this_week" || periodId === "prev_week") {
    return { from: addDaysISO(current.from, -7), to: addDaysISO(current.to, -7) };
  }
  if (periodId === "this_month" || periodId === "prev_month") {
    const mid = current.from.slice(0, 7);
    return monthBounds(shiftMonthId(mid, -1));
  }
  const weeks = (opts?.customWeeks ?? []).filter(Boolean).sort();
  const n = weeks.length || 1;
  const first = weeks[0] ?? current.from;
  const prevLastMonday = addDaysISO(first, -7);
  const prevFirstMonday = addDaysISO(prevLastMonday, -7 * (n - 1));
  return { from: prevFirstMonday, to: sundayOfWeek(prevLastMonday) };
}

export function last12WeekStarts(anchor = new Date()): string[] {
  const current = mondayISO(anchor);
  const weeks: string[] = [];
  for (let i = 0; i < 12; i++) weeks.push(addDaysISO(current, -7 * i));
  return weeks;
}

export function isoDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

/** Eligible working calendar days in [from,to] intersecting employment window. */
export function eachEligibleWorkingDay(
  from: string,
  to: string,
  workingDays: string[],
  joiningDate: string | null,
  exitDate: string | null
): string[] {
  const set = new Set(
    (workingDays.length ? workingDays : ["Mon", "Tue", "Wed", "Thu", "Fri"]).map((d) => d.slice(0, 3))
  );
  const out: string[] = [];
  for (let d = from; d <= to; d = addDaysISO(d, 1)) {
    if (joiningDate && d < joiningDate) continue;
    if (exitDate && d > exitDate) continue;
    const dt = new Date(`${d}T12:00:00`);
    const label = DOW[dt.getDay()]!;
    if (!set.has(label)) continue;
    out.push(d);
  }
  return out;
}

export function pctChange(current: number, previous: number): number | null {
  if (!Number.isFinite(previous) || previous === 0) {
    if (!Number.isFinite(current) || current === 0) return 0;
    return null;
  }
  return round2(((current - previous) / Math.abs(previous)) * 100);
}
