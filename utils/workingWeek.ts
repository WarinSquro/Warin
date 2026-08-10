/**
 * Calendar week bounds: Monday start → Sunday end (inclusive).
 * `weekStartMonday` is always the Monday key for the week.
 * `workingDays` is accepted for call-site compatibility but does not change the span —
 * week display/ranges are Mon–Sun across the app; capacity still uses Settings working days elsewhere.
 */
export function workingWeekBounds(
  weekStartMonday: string,
  _workingDays?: string[]
): { start: string; end: string } {
  return {
    start: weekStartMonday,
    end: addDays(weekStartMonday, 6),
  };
}

function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + days);
  const yy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

/** Inclusive Sunday of the Monday-keyed calendar week. */
export function workingWeekEnd(
  weekStartMonday: string,
  workingDays?: string[]
): string {
  return workingWeekBounds(weekStartMonday, workingDays).end;
}
