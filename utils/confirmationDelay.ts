import { APP_DISPLAY_TIMEZONE } from "./formatAppDate";

/** Calendar date of an instant in the product timezone (IST). */
export function istCalendarDate(isoOrDate: string | Date): string | undefined {
  const d = isoOrDate instanceof Date ? isoOrDate : new Date(isoOrDate);
  if (Number.isNaN(d.getTime())) {
    if (typeof isoOrDate === "string") {
      const m = /^(\d{4}-\d{2}-\d{2})/.exec(isoOrDate.trim());
      return m?.[1];
    }
    return undefined;
  }
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_DISPLAY_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/** Delayed only when confirmed on a later calendar day than the work date (IST). */
export function isConfirmationDelayed(submittedAt: string | Date, workDate: string): boolean {
  const submittedDay = istCalendarDate(submittedAt);
  if (!submittedDay) return false;
  return submittedDay > workDate.slice(0, 10);
}
