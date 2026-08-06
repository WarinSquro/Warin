import { ALL_DAYS, DEFAULT_SETTINGS } from "../data/settings";

function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + days);
  const yy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

/**
 * Monday-based week bounds from Settings → Working calendar.
 * `weekStartMonday` is always the Monday key; start/end are the first and last
 * configured working days in that Mon–Sun window (e.g. Mon–Fri → Aug 3–7).
 */
export function workingWeekBounds(
  weekStartMonday: string,
  workingDays: string[] = DEFAULT_SETTINGS.workingDays
): { start: string; end: string } {
  const days = workingDays.length > 0 ? workingDays : DEFAULT_SETTINGS.workingDays;
  const set = new Set(days);
  const offsets = ALL_DAYS.map((label, i) => (set.has(label) ? i : -1)).filter((i) => i >= 0);
  if (offsets.length === 0) {
    return { start: weekStartMonday, end: addDays(weekStartMonday, 4) };
  }
  const first = Math.min(...offsets);
  const last = Math.max(...offsets);
  return {
    start: addDays(weekStartMonday, first),
    end: addDays(weekStartMonday, last),
  };
}

export function workingWeekEnd(
  weekStartMonday: string,
  workingDays: string[] = DEFAULT_SETTINGS.workingDays
): string {
  return workingWeekBounds(weekStartMonday, workingDays).end;
}
