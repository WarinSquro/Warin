import type { DateFormatPattern } from "./settings";
import { formatAppDate, APP_DISPLAY_TIMEZONE } from "../utils/formatAppDate";
import { CONFIRMATION_CODES, CONFIRMATION_CODE_LABELS, type ConfirmationCode } from "./dailyWorkReport";
import { paginateRows } from "./dailyWorkReport";
import { matchesSearchQuery } from "../utils/textSearch";
import { workDateMatchesDay } from "../utils/workDateDayFilter";

export { CONFIRMATION_CODES, CONFIRMATION_CODE_LABELS, paginateRows };
export type { ConfirmationCode };

export const WORKDAY_SUMMARY_WINDOW_DAYS = 14;

export type WorkdaySummaryGroupBy = "none" | "department" | "ro";

export type WorkdaySummarySortKey =
  | "workDate"
  | "employeeName"
  | "dayStart"
  | "lunchStart"
  | "lunchEnd"
  | "dayEnd"
  | "officeTime"
  | "productiveWindow"
  | "allottedHrs"
  | "focusHrs"
  | "actualHrs"
  | "focusPct"
  | "unplannedPct"
  | "compliance";

export interface WorkdaySummaryColumnDef {
  id: WorkdaySummarySortKey;
  label: string;
  defaultVisible: boolean;
  locked?: boolean;
  width: string;
}

export const WORKDAY_SUMMARY_COLUMNS: WorkdaySummaryColumnDef[] = [
  { id: "workDate", label: "WORK DATE", defaultVisible: true, locked: true, width: "7.5rem" },
  { id: "employeeName", label: "EMPLOYEE", defaultVisible: true, locked: true, width: "10rem" },
  { id: "dayStart", label: "DAY START", defaultVisible: true, width: "6rem" },
  { id: "lunchStart", label: "LUNCH START", defaultVisible: true, width: "6.5rem" },
  { id: "lunchEnd", label: "LUNCH END", defaultVisible: true, width: "6rem" },
  { id: "dayEnd", label: "DAY END", defaultVisible: true, width: "6rem" },
  { id: "officeTime", label: "OFFICE TIME", defaultVisible: true, width: "6.5rem" },
  { id: "productiveWindow", label: "PRODUCTIVE WINDOW", defaultVisible: true, width: "8.5rem" },
  { id: "allottedHrs", label: "ALLOTTED WORK HRS", defaultVisible: true, width: "8.5rem" },
  { id: "focusHrs", label: "FOCUS HRS", defaultVisible: true, width: "6rem" },
  { id: "actualHrs", label: "ACTUAL HRS", defaultVisible: true, width: "6.5rem" },
  { id: "focusPct", label: "FOCUS %", defaultVisible: true, width: "5.5rem" },
  { id: "unplannedPct", label: "UNPLANNED %", defaultVisible: true, width: "7rem" },
  { id: "compliance", label: "COMPLIANCE", defaultVisible: true, width: "6.5rem" },
];

export const WORKDAY_SUMMARY_COLUMN_STORAGE_KEY = "oneview_workday_summary_columns_v1";

export interface WorkdaySummaryRow {
  id: string;
  workDate: string;
  employeeId: string;
  employeeName: string;
  department: string;
  resourceOwnerId: string;
  resourceOwnerName: string;
  dayStart?: string;
  lunchStart?: string;
  lunchEnd?: string;
  dayEnd?: string;
  officeMs?: number;
  productiveMs?: number;
  allottedHours?: number;
  focusHours?: number;
  actualHours?: number;
  plannedActualHours?: number;
  unplannedActualHours?: number;
  focusPct?: number;
  unplannedPct?: number;
  compliance?: ConfirmationCode;
  hasSignal: boolean;
}

export function formatTimeHhMm(iso?: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: APP_DISPLAY_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

export function formatDurationMs(ms?: number | null): string | null {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return null;
  const totalMin = Math.round(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function formatHoursAsHhMm(hours?: number | null): string | null {
  if (hours == null || !Number.isFinite(hours)) return null;
  return formatDurationMs(hours * 3600000);
}

export function formatPct(pct?: number | null): string | null {
  if (pct == null || !Number.isFinite(pct)) return null;
  return `${Math.round(pct)}%`;
}

export function formatWorkdayDate(iso: string, pattern: DateFormatPattern = "dd/MM/yyyy"): string {
  return formatAppDate(iso, pattern);
}

export function defaultVisibleWorkdayColumnIds(): Set<WorkdaySummarySortKey> {
  return new Set(WORKDAY_SUMMARY_COLUMNS.filter((c) => c.defaultVisible).map((c) => c.id));
}

export function loadVisibleWorkdayColumnIds(): Set<WorkdaySummarySortKey> {
  try {
    const raw = localStorage.getItem(WORKDAY_SUMMARY_COLUMN_STORAGE_KEY);
    if (!raw) return defaultVisibleWorkdayColumnIds();
    const ids = JSON.parse(raw) as string[];
    const allowed = new Set(WORKDAY_SUMMARY_COLUMNS.map((c) => c.id));
    const next = ids.filter((id): id is WorkdaySummarySortKey => allowed.has(id as WorkdaySummarySortKey));
    for (const col of WORKDAY_SUMMARY_COLUMNS) {
      if (col.locked) next.push(col.id);
    }
    return new Set(next);
  } catch {
    return defaultVisibleWorkdayColumnIds();
  }
}

export function saveVisibleWorkdayColumnIds(ids: Set<WorkdaySummarySortKey>) {
  localStorage.setItem(WORKDAY_SUMMARY_COLUMN_STORAGE_KEY, JSON.stringify([...ids]));
}

export function filterWorkdaySummaryRows(
  rows: WorkdaySummaryRow[],
  opts: {
    search: string;
    departments: string[];
    resourceOwners: string[];
    resources: string[];
    includeEmpty: boolean;
    workDay: number | null;
  }
): WorkdaySummaryRow[] {
  return rows.filter((r) => {
    if (!opts.includeEmpty && !r.hasSignal) return false;
    if (opts.departments.length > 0 && !opts.departments.includes(r.department)) return false;
    if (opts.resourceOwners.length > 0 && !opts.resourceOwners.includes(r.resourceOwnerName)) return false;
    if (opts.resources.length > 0 && !opts.resources.includes(r.employeeId)) return false;
    if (!workDateMatchesDay(r.workDate, opts.workDay)) return false;
    if (
      opts.search.trim() &&
      !matchesSearchQuery(opts.search, r.employeeName)
    ) {
      return false;
    }
    return true;
  });
}

export function sortWorkdaySummaryRows(
  rows: WorkdaySummaryRow[],
  sortKey: WorkdaySummarySortKey,
  sortDir: "asc" | "desc"
): WorkdaySummaryRow[] {
  const mul = sortDir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const av = sortValue(a, sortKey);
    const bv = sortValue(b, sortKey);
    if (typeof av === "number" && typeof bv === "number") return mul * (av - bv);
    return mul * String(av).localeCompare(String(bv));
  });
}

function sortValue(row: WorkdaySummaryRow, key: WorkdaySummarySortKey): string | number {
  switch (key) {
    case "workDate":
      return row.workDate;
    case "employeeName":
      return row.employeeName;
    case "dayStart":
      return row.dayStart ?? "";
    case "lunchStart":
      return row.lunchStart ?? "";
    case "lunchEnd":
      return row.lunchEnd ?? "";
    case "dayEnd":
      return row.dayEnd ?? "";
    case "officeTime":
      return row.officeMs ?? -1;
    case "productiveWindow":
      return row.productiveMs ?? -1;
    case "allottedHrs":
      return row.allottedHours ?? -1;
    case "focusHrs":
      return row.focusHours ?? -1;
    case "actualHrs":
      return row.actualHours ?? -1;
    case "focusPct":
      return row.focusPct ?? -1;
    case "unplannedPct":
      return row.unplannedPct ?? -1;
    case "compliance":
      return row.compliance ?? "";
    default:
      return "";
  }
}

export interface WorkdaySummaryGroup {
  key: string;
  label: string;
  rows: WorkdaySummaryRow[];
}

export function groupWorkdaySummaryRows(
  rows: WorkdaySummaryRow[],
  groupBy: WorkdaySummaryGroupBy
): WorkdaySummaryGroup[] {
  if (groupBy === "none") return [{ key: "all", label: "", rows }];
  const buckets = new Map<string, WorkdaySummaryRow[]>();
  for (const r of rows) {
    const key = groupBy === "department" ? r.department : r.resourceOwnerName || "—";
    const list = buckets.get(key) ?? [];
    list.push(r);
    buckets.set(key, list);
  }
  return [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, groupRows]) => ({ key, label: key, rows: groupRows }));
}

export function workdaySummaryDepartments(rows: WorkdaySummaryRow[]): string[] {
  return [...new Set(rows.map((r) => r.department).filter(Boolean))].sort();
}

export function workdaySummaryOwners(rows: WorkdaySummaryRow[]): string[] {
  return [...new Set(rows.map((r) => r.resourceOwnerName).filter((n) => n && n !== "—"))].sort();
}

export function workdaySummaryResources(
  rows: WorkdaySummaryRow[]
): { id: string; name: string }[] {
  const map = new Map<string, string>();
  for (const r of rows) map.set(r.employeeId, r.employeeName);
  return [...map.entries()]
    .sort((a, b) => a[1].localeCompare(b[1]))
    .map(([id, name]) => ({ id, name }));
}

/** Last 14 calendar days ending at `endIso` (inclusive). */
export function workdaySummaryRangeEnding(endIso: string): { from: string; to: string } {
  const to = endIso.slice(0, 10);
  const d = new Date(`${to}T12:00:00`);
  d.setDate(d.getDate() - (WORKDAY_SUMMARY_WINDOW_DAYS - 1));
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return { from: `${y}-${m}-${day}`, to };
}
