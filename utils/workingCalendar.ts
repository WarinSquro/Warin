/** Settings → Working calendar. Single source for working vs non-working days. */

export const DOW_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
export const DEFAULT_WORKING_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];

const FULL_TO_SHORT: Record<string, (typeof DOW_SHORT)[number]> = {
  sun: "Sun",
  sunday: "Sun",
  mon: "Mon",
  monday: "Mon",
  tue: "Tue",
  tues: "Tue",
  tuesday: "Tue",
  wed: "Wed",
  wednesday: "Wed",
  thu: "Thu",
  thur: "Thu",
  thurs: "Thu",
  thursday: "Thu",
  fri: "Fri",
  friday: "Fri",
  sat: "Sat",
  saturday: "Sat",
};

export function normalizeWorkingDayLabel(raw: string): (typeof DOW_SHORT)[number] | null {
  const key = raw.trim().toLowerCase();
  if (!key) return null;
  return FULL_TO_SHORT[key] ?? null;
}

export function normalizedWorkingDays(workingDays?: string[] | null): string[] {
  const src = workingDays?.length ? workingDays : DEFAULT_WORKING_DAYS;
  const out: string[] = [];
  for (const d of src) {
    const n = normalizeWorkingDayLabel(d);
    if (n && !out.includes(n)) out.push(n);
  }
  return out.length ? out : [...DEFAULT_WORKING_DAYS];
}

export function weekdayLabel(iso: string): (typeof DOW_SHORT)[number] {
  return DOW_SHORT[new Date(`${iso.slice(0, 10)}T12:00:00`).getDay()]!;
}

const WEEK_FROM_MONDAY = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

function addDaysISO(iso: string, days: number): string {
  const date = new Date(`${iso.slice(0, 10)}T12:00:00`);
  date.setDate(date.getDate() + days);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Monday of the calendar week containing `iso` (YYYY-MM-DD). */
export function weekStartMonday(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00`);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

/** Working-day ISO dates Mon→Sun for a Monday-keyed week (Settings calendar). */
export function workingDatesInWeek(
  weekStartMondayIso: string,
  workingDays?: string[] | null
): string[] {
  const set = new Set(normalizedWorkingDays(workingDays));
  const start = weekStartMondayIso.slice(0, 10);
  const out: string[] = [];
  for (let i = 0; i < 7; i++) {
    if (set.has(WEEK_FROM_MONDAY[i]!)) out.push(addDaysISO(start, i));
  }
  return out;
}

/** Single-letter headers in Mon→Sun order (M T W T F S …). */
export function workingDayHeaderLetters(workingDays?: string[] | null): string[] {
  const set = new Set(normalizedWorkingDays(workingDays));
  return WEEK_FROM_MONDAY.filter((d) => set.has(d)).map((d) => d.slice(0, 1));
}

/** True when the weekday is selected in Settings → Working calendar (ignores holidays). */
export function isWorkingWeekday(iso: string, workingDays?: string[] | null): boolean {
  return normalizedWorkingDays(workingDays).includes(weekdayLabel(iso));
}

export type CompanyOffDayLike = { date: string; label?: string };

function offDayLabel(
  iso: string,
  companyOffDays?: CompanyOffDayLike[] | string[] | null
): string | null {
  if (!companyOffDays?.length) return null;
  const day = iso.slice(0, 10);
  for (const item of companyOffDays) {
    if (typeof item === "string") {
      if (item.slice(0, 10) === day) return "Holiday";
      continue;
    }
    if (item.date.slice(0, 10) === day) return item.label?.trim() || "Holiday";
  }
  return null;
}

export type WorkingDayStatus =
  | { ok: true; reason: null }
  | { ok: false; reason: string };

/** Working calendar: selected weekdays minus company off-days. */
export function workingDayStatus(
  iso: string,
  opts?: {
    workingDays?: string[] | null;
    companyOffDays?: CompanyOffDayLike[] | string[] | null;
  }
): WorkingDayStatus {
  if (!isWorkingWeekday(iso, opts?.workingDays)) {
    return { ok: false, reason: "Non-working day" };
  }
  const holiday = offDayLabel(iso, opts?.companyOffDays);
  if (holiday) {
    return { ok: false, reason: holiday === "Holiday" ? "Holiday" : `Holiday · ${holiday}` };
  }
  return { ok: true, reason: null };
}
