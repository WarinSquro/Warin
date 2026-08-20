/** Day-of-month options for report Work Date filters. */
export const WORK_DATE_DAYS: readonly number[] = Array.from({ length: 31 }, (_, i) => i + 1);

/**
 * True when `iso` is a real calendar date (`YYYY-MM-DD`) whose day-of-month is `day`.
 * Invalid dates (e.g. 2026-02-31) never match — they must not roll into the next month.
 * `day == null` means all dates.
 */
export function workDateMatchesDay(iso: string | undefined, day: number | null): boolean {
  if (day == null) return true;
  if (!Number.isInteger(day) || day < 1 || day > 31) return false;
  const slice = (iso ?? "").slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(slice);
  if (!m) return false;
  const y = Number(m[1]);
  const month = Number(m[2]);
  const d = Number(m[3]);
  if (d !== day) return false;
  const dt = new Date(y, month - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === month - 1 && dt.getDate() === d;
}

export function workDateDayFilterLabel(day: number | null): string {
  return day == null ? "All dates" : String(day);
}

/** Day-of-month from an ISO date for Work Date dropdown preselection; null if missing/invalid. */
export function workDayFromIso(iso: string | undefined | null): number | null {
  if (!iso) return null;
  const slice = iso.slice(0, 10);
  const day = Number(slice.slice(8, 10));
  if (!Number.isInteger(day) || day < 1 || day > 31) return null;
  return workDateMatchesDay(slice, day) ? day : null;
}
