/**
 * Dynamic report period labels / month windows based on the current calendar date.
 * Used by Deployment, Performance, Execution, Daily Work, and Utilization dropdowns.
 */

import { workingWeekBounds } from "./workingWeek";

export function todayISO(d = new Date()): string {
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
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + days);
  return todayISO(date);
}

function parseISO(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** e.g. "Jul 20" */
export function formatMonthDay(iso: string): string {
  return parseISO(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** e.g. "Jul 20 – 24" or "Jul 28 – Aug 1" */
export function formatWeekSpan(startIso: string, endIso: string): string {
  const a = parseISO(startIso);
  const b = parseISO(endIso);
  const sameMonth = a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear();
  if (sameMonth) {
    return `${a.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${b.getDate()}`;
  }
  return `${formatMonthDay(startIso)} – ${formatMonthDay(endIso)}`;
}

/** e.g. "January 2026" */
export function formatMonthYear(d = new Date()): string {
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

/** e.g. "Jan 2026" */
export function formatMonthYearShort(d = new Date()): string {
  return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

/** e.g. "Jan 1 – Jan 31, 2026" */
export function formatMonthRangeLabel(d = new Date()): string {
  const start = new Date(d.getFullYear(), d.getMonth(), 1);
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  const left = start.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const right = end.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  return `${left} – ${right}`;
}

export function monthIdFromDate(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Inclusive calendar bounds for a `YYYY-MM` month id. */
export function monthBoundsFromId(monthId: string): { from: string; to: string } {
  const [y, m] = monthId.split("-").map(Number);
  const year = y || new Date().getFullYear();
  const month = m || 1;
  const from = `${year}-${String(month).padStart(2, "0")}-01`;
  const end = new Date(year, month, 0);
  const to = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, "0")}-${String(
    end.getDate()
  ).padStart(2, "0")}`;
  return { from, to };
}

export type ReportMonthOption = {
  id: string;
  label: string;
  shortLabel: string;
  rangeLabel: string;
};

/** Rolling month window: `before` months prior through `after` months ahead (inclusive). */
export function buildMonthOptions(
  anchor = new Date(),
  before = 3,
  after = 1
): ReportMonthOption[] {
  const out: ReportMonthOption[] = [];
  for (let i = -before; i <= after; i++) {
    const d = new Date(anchor.getFullYear(), anchor.getMonth() + i, 1);
    out.push({
      id: monthIdFromDate(d),
      label: formatMonthYear(d),
      shortLabel: formatMonthYearShort(d),
      rangeLabel: formatMonthRangeLabel(d),
    });
  }
  return out;
}

export function currentWeekBounds(
  from = new Date(),
  workingDays?: string[]
): { start: string; end: string } {
  const monday = mondayISO(from);
  return workingWeekBounds(monday, workingDays);
}

export function deploymentPeriodOptions(from = new Date(), workingDays?: string[]) {
  const { start, end } = currentWeekBounds(from, workingDays);
  return [
    { id: "today" as const, label: "Today" },
    { id: "week" as const, label: `This week (${formatWeekSpan(start, end)})` },
    { id: "month" as const, label: formatMonthYear(from) },
  ];
}

export function performancePeriodOptions(from = new Date(), workingDays?: string[]) {
  const { start, end } = currentWeekBounds(from, workingDays);
  return [
    { id: "week" as const, label: `This week (${formatWeekSpan(start, end)})` },
    { id: "month" as const, label: formatMonthYear(from) },
    { id: "custom" as const, label: "Custom range" },
  ];
}

export function dailyWorkPeriodOptions(from = new Date(), workingDays?: string[]) {
  const today = todayISO(from);
  const { start, end } = currentWeekBounds(from, workingDays);
  const prev = new Date(from.getFullYear(), from.getMonth() - 1, 1);
  const threeStart = new Date(from.getFullYear(), from.getMonth() - 2, 1);
  const threeSpan = `${threeStart.toLocaleDateString("en-US", { month: "short" })} – ${from.toLocaleDateString("en-US", { month: "short" })}`;
  return [
    { id: "week" as const, label: `This week (${formatWeekSpan(start, end)})` },
    { id: "today" as const, label: `Today (${formatMonthDay(today)})` },
    { id: "month" as const, label: `This Month (${formatMonthYear(from)})` },
    { id: "last_month" as const, label: `Last Month (${formatMonthYear(prev)})` },
    { id: "last_3_months" as const, label: `Last 3 Months (${threeSpan})` },
  ];
}
