const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function todayLocalISO(): string {
  const n = new Date();
  const y = n.getFullYear();
  const m = String(n.getMonth() + 1).padStart(2, "0");
  const day = String(n.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function mondayOfISO(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00`);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return isoDate(d);
}

export function addDaysISO(iso: string, days: number): string {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Working-day ISO dates in a Monday-based week from Settings → Working calendar. */
export function workingWeekDates(
  weekStartMonday: string,
  workingDays: string[] | null | undefined
): string[] {
  const days =
    workingDays && workingDays.length > 0 ? workingDays : ["Mon", "Tue", "Wed", "Thu", "Fri"];
  const set = new Set(days);
  return WEEKDAY_LABELS.map((label, i) => (set.has(label) ? addDaysISO(weekStartMonday, i) : null)).filter(
    (d): d is string => Boolean(d)
  );
}

function dayOfWeekLabel(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00.000Z`);
  const utcDay = d.getUTCDay();
  const idx = utcDay === 0 ? 6 : utcDay - 1;
  return WEEKDAY_LABELS[idx] ?? "Mon";
}

export function isWorkingDay(
  iso: string,
  workingDays: string[],
  companyOffSet: Set<string>
): boolean {
  if (companyOffSet.has(iso.slice(0, 10))) return false;
  const set = new Set(workingDays.length > 0 ? workingDays : ["Mon", "Tue", "Wed", "Thu", "Fri"]);
  return set.has(dayOfWeekLabel(iso));
}

export function workingOverlapDays(
  allocStart: string,
  allocEnd: string,
  rangeStart: string,
  rangeEnd: string,
  workingDays: string[],
  companyOffSet: Set<string>
): number {
  const start = allocStart.slice(0, 10) <= rangeStart.slice(0, 10) ? rangeStart.slice(0, 10) : allocStart.slice(0, 10);
  const end = allocEnd.slice(0, 10) <= rangeEnd.slice(0, 10) ? allocEnd.slice(0, 10) : rangeEnd.slice(0, 10);
  if (end < start) return 0;
  let count = 0;
  let cur = start;
  while (cur <= end) {
    if (isWorkingDay(cur, workingDays, companyOffSet)) count += 1;
    cur = addDaysISO(cur, 1);
  }
  return count;
}

export function plannedHoursInRange(
  allocations: Array<{ startDate: string; endDate: string; hoursPerDay: number }>,
  rangeStart: string,
  rangeEnd: string,
  workingDays: string[],
  companyOffSet: Set<string>
): number {
  let total = 0;
  for (const a of allocations) {
    const days = workingOverlapDays(
      a.startDate,
      a.endDate,
      rangeStart,
      rangeEnd,
      workingDays,
      companyOffSet
    );
    if (days > 0) total += a.hoursPerDay * days;
  }
  return Math.round(total * 10) / 10;
}

/** True when allocation [start, end] overlaps window [rangeStart, rangeEnd] (inclusive ISO dates). */
export function allocationOverlapsRange(
  allocStart: string,
  allocEnd: string,
  rangeStart: string,
  rangeEnd: string
): boolean {
  return (
    allocStart.slice(0, 10) <= rangeEnd.slice(0, 10) &&
    allocEnd.slice(0, 10) >= rangeStart.slice(0, 10)
  );
}

export type MilestoneMark = {
  id: string;
  name: string;
  date: string;
  isNext: boolean;
  isOverdue: boolean;
};

export function markMilestones(
  rows: Array<{ id: bigint; name: string; date: Date }>,
  today: string
): MilestoneMark[] {
  const sorted = [...rows].sort((a, b) => a.date.getTime() - b.date.getTime());
  const mapped = sorted.map((m) => ({
    id: m.id.toString(),
    name: m.name,
    date: isoDate(m.date),
  }));
  const future = mapped.filter((m) => m.date >= today);
  const nextId = future[0]?.id ?? null;
  const noFuture = future.length === 0;
  const latestPastId = noFuture ? mapped[mapped.length - 1]?.id ?? null : null;

  return mapped.map((m) => ({
    ...m,
    isNext: m.id === nextId,
    isOverdue: noFuture && m.id === latestPastId && m.date < today,
  }));
}
