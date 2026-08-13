import type { DateFormatPattern } from "../data/settings";

/** Product display timezone — confirmation / audit times shown in IST. */
export const APP_DISPLAY_TIMEZONE = "Asia/Kolkata";

export const DATE_FORMAT_OPTIONS: { value: DateFormatPattern; label: string }[] = [
  { value: "dd/MM/yyyy", label: "dd/MM/yyyy" },
  { value: "MM/dd/yyyy", label: "MM/dd/yyyy" },
  { value: "yyyy-MM-dd", label: "yyyy-MM-dd" },
  { value: "dd-MMM-yyyy", label: "dd-MMM-yyyy" },
];

const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function partsFromIso(iso: string): { y: number; m: number; d: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso.trim());
  if (!m) return null;
  return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function toDate(value: string | Date | null | undefined): Date | null {
  if (value == null || value === "") return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Format an ISO YYYY-MM-dd (or datetime) date using Settings → Date Format.
 * Returns "—" for empty/invalid input.
 */
export function formatAppDate(
  iso: string | null | undefined,
  pattern: DateFormatPattern = "dd/MM/yyyy"
): string {
  if (!iso) return "—";
  const p = partsFromIso(iso);
  if (!p) {
    const d = toDate(iso);
    if (!d) return iso;
    return formatAppDate(
      `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`,
      pattern
    );
  }
  const dd = pad2(p.d);
  const mm = pad2(p.m);
  const yyyy = String(p.y);
  const mmm = MONTHS_SHORT[p.m - 1] ?? mm;
  switch (pattern) {
    case "MM/dd/yyyy":
      return `${mm}/${dd}/${yyyy}`;
    case "yyyy-MM-dd":
      return `${yyyy}-${mm}-${dd}`;
    case "dd-MMM-yyyy":
      return `${dd}-${mmm}-${yyyy}`;
    case "dd/MM/yyyy":
    default:
      return `${dd}/${mm}/${yyyy}`;
  }
}

/** 12-hour clock in IST: hh:mm AM/PM (hour zero-padded). */
export function formatAppTime12h(value: string | Date | null | undefined): string {
  const d = toDate(value);
  if (!d) return "—";
  const parts = new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: APP_DISPLAY_TIMEZONE,
  }).formatToParts(d);
  const hour = parts.find((p) => p.type === "hour")?.value ?? "12";
  const minute = parts.find((p) => p.type === "minute")?.value ?? "00";
  const dayPeriod = (parts.find((p) => p.type === "dayPeriod")?.value ?? "AM").toUpperCase();
  return `${hour}:${minute} ${dayPeriod}`;
}

/**
 * Settings date format + 12-hour IST time, e.g. `06/08/2026 03:45 PM`.
 */
export function formatAppDateTime(
  value: string | Date | null | undefined,
  pattern: DateFormatPattern = "dd/MM/yyyy"
): string {
  const d = toDate(value);
  if (!d) return "—";
  // Calendar date in IST (not browser/server local), then apply Settings pattern.
  const isoDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_DISPLAY_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
  return `${formatAppDate(isoDate, pattern)} ${formatAppTime12h(d)}`;
}

/** Short weekday + formatted date (e.g. for plan headers). */
export function formatAppDateWithWeekday(
  iso: string | null | undefined,
  pattern: DateFormatPattern = "dd/MM/yyyy"
): string {
  if (!iso) return "—";
  const p = partsFromIso(iso);
  if (!p) return formatAppDate(iso, pattern);
  const weekday = new Date(p.y, p.m - 1, p.d).toLocaleDateString("en-US", { weekday: "short" });
  return `${weekday}, ${formatAppDate(iso, pattern)}`;
}
