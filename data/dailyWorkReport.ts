// Daily Work Detail Report — line-level planned + confirmed work (Phase 1 mock).

import { CONFIRMATION_TODAY } from "./confirmation";
import { EMPLOYEES, resourceOwnerName, type Employee } from "./employees";
import { PROJECTS, type MilestoneKind, type ProjectType } from "./projects";
import { projectTypeLabel } from "./setup";
import type { DateFormatPattern } from "./settings";
import { matchesSearchQuery } from "../utils/textSearch";
import { formatAppDate } from "../utils/formatAppDate";
import { workDateMatchesDay } from "../utils/workDateDayFilter";

export type DailyWorkPeriodId = "week" | "today" | "month" | "last_month" | "last_3_months";

export type ConfirmationCode = "C" | "CD" | "D" | "DD" | "Pending" | "Leave";
export type PlanKind = "Plan" | "Unplanned";

export type DailyWorkSortKey =
  | "employeeName"
  | "department"
  | "resourceOwner"
  | "workDate"
  | "project"
  | "projectType"
  | "milestone"
  | "milestoneType"
  | "activity"
  | "activityType"
  | "tasks"
  | "allocatedOn"
  | "plannedHrs"
  | "confirmation"
  | "confirmedOn"
  | "delayReason"
  | "deviationReason"
  | "actualHrs"
  | "planUnplanned";

export interface DailyWorkColumnDef {
  id: DailyWorkSortKey;
  label: string;
  /** Optional two-line table header (picker/export still use `label`). */
  stackedHeader?: [string, string];
  defaultVisible: boolean;
  width: string;
}

export const DAILY_WORK_COLUMNS: DailyWorkColumnDef[] = [
  { id: "employeeName", label: "EMPLOYEE NAME", defaultVisible: true, width: "9.25rem" },
  { id: "department", label: "DEPARTMENT", defaultVisible: false, width: "7rem" },
  { id: "resourceOwner", label: "RESOURCE OWNER", defaultVisible: false, width: "9rem" },
  { id: "workDate", label: "WORK DATE", defaultVisible: true, width: "7rem" },
  { id: "project", label: "PROJECT", defaultVisible: true, width: "8rem" },
  { id: "projectType", label: "PROJECT TYPE", defaultVisible: false, width: "6.5rem" },
  { id: "milestone", label: "MILESTONE", defaultVisible: true, width: "11rem" },
  { id: "milestoneType", label: "MILESTONE TYPE", defaultVisible: false, width: "8.5rem" },
  { id: "activity", label: "ACTIVITY", defaultVisible: true, width: "10rem" },
  { id: "activityType", label: "ACTIVITY TYPE", defaultVisible: false, width: "6.5rem" },
  { id: "tasks", label: "TASKS", defaultVisible: true, width: "8rem" },
  { id: "allocatedOn", label: "ALLOCATED ON", stackedHeader: ["ALLOCATED", "ON"], defaultVisible: false, width: "7rem" },
  { id: "plannedHrs", label: "PLANNED HRS", stackedHeader: ["PLANNED", "HRS"], defaultVisible: true, width: "4.5rem" },
  { id: "confirmedOn", label: "CONFIRMED ON", stackedHeader: ["CONFIRMED", "ON"], defaultVisible: false, width: "7rem" },
  { id: "delayReason", label: "DELAY REASON", defaultVisible: false, width: "7.5rem" },
  { id: "deviationReason", label: "DEVIATION REASON", defaultVisible: false, width: "9.5rem" },
  { id: "actualHrs", label: "ACTUAL HRS", stackedHeader: ["ACTUAL", "HRS"], defaultVisible: true, width: "4.5rem" },
  { id: "planUnplanned", label: "PLAN/UNPLANNED", stackedHeader: ["PLAN/", "UNPLANNED"], defaultVisible: false, width: "5.5rem" },
];

export const DAILY_WORK_COLUMN_STORAGE_KEY = "oneview_daily_work_columns_v6";

/** Prior keys — cleared on load so stale “all columns” prefs cannot stick. */
const DAILY_WORK_COLUMN_LEGACY_KEYS = [
  "oneview_daily_work_columns",
  "oneview_daily_work_columns_v1",
  "oneview_daily_work_columns_v2",
  "oneview_daily_work_columns_v3",
  "oneview_daily_work_columns_v4",
  "oneview_daily_work_columns_v5",
] as const;

import { dailyWorkPeriodOptions } from "../utils/reportPeriods";

export const DAILY_WORK_PERIODS = dailyWorkPeriodOptions();

export const CONFIRMATION_CODES: ConfirmationCode[] = [
  "C",
  "CD",
  "D",
  "DD",
  "Pending",
  "Leave",
];

export const CONFIRMATION_CODE_LABELS: Record<ConfirmationCode, string> = {
  C: "Confirmed",
  CD: "Confirmed but Delayed",
  D: "Deviation",
  DD: "Deviation and Delayed",
  Pending: "Pending",
  Leave: "Leave",
};

export function confirmationCodeLabel(code: ConfirmationCode): string {
  return CONFIRMATION_CODE_LABELS[code];
}

export interface DailyWorkRow {
  id: string;
  employeeId: string;
  employeeName: string;
  department: string;
  resourceOwnerId: string;
  resourceOwnerName: string;
  workDate: string;
  projectId?: string;
  projectName?: string;
  projectType?: ProjectType;
  milestoneName?: string;
  milestoneType?: MilestoneKind;
  activityName?: string;
  activityType?: "Billable" | "Internal";
  tasks?: string[];
  plannedHours?: number;
  confirmation: ConfirmationCode;
  confirmedOn?: string;
  delayReason?: string;
  deviationReason?: string;
  actualHours?: number;
  planKind: PlanKind;
  /** Calendar date the allocation row was created (planner save). */
  allocatedOn?: string;
}

export interface DailyWorkFilters {
  search: string;
  departments: string[];
  projects: string[];
  confirmations: ConfirmationCode[];
  planKinds: PlanKind[];
  /** Day of month 1–31; null = all dates in the selected period. */
  workDay: number | null;
}

const WEEK_START = "2026-01-06";
const WEEK_END = "2026-01-10";

function getPeriodDateRange(periodId: DailyWorkPeriodId): { start: string; end: string } {
  switch (periodId) {
    case "today":
      return { start: CONFIRMATION_TODAY, end: CONFIRMATION_TODAY };
    case "week":
      return { start: WEEK_START, end: WEEK_END };
    case "month":
      return { start: "2026-01-01", end: "2026-01-31" };
    case "last_month":
      return { start: "2025-12-01", end: "2025-12-31" };
    case "last_3_months":
      return { start: "2025-11-01", end: "2026-01-31" };
  }
}

function isDateInRange(date: string, start: string, end: string): boolean {
  return date >= start && date <= end;
}

function emp(id: string): Employee {
  return EMPLOYEES.find((e) => e.id === id)!;
}

function project(name: string) {
  return PROJECTS.find((p) => p.name === name)!;
}

type LineInput = {
  employeeId: string;
  workDate: string;
  projectName: string;
  milestoneName: string;
  milestoneType: MilestoneKind;
  activityName: string;
  activityType: "Billable" | "Internal";
  tasks: string[];
  plannedHours: number;
  confirmation: ConfirmationCode;
  confirmedOn?: string;
  delayReason?: string;
  deviationReason?: string;
  actualHours?: number;
};

function plannedLine(input: LineInput, seq: number): DailyWorkRow {
  const e = emp(input.employeeId);
  const p = project(input.projectName);
  const delay =
    input.confirmation === "CD" || input.confirmation === "DD"
      ? input.delayReason ?? "Confirmed after 6 PM cutoff"
      : undefined;
  const deviation =
    input.confirmation === "D" || input.confirmation === "DD"
      ? input.deviationReason ?? "Reprioritized to another task"
      : undefined;
  const actual =
    input.confirmation === "D" || input.confirmation === "DD"
      ? (input.actualHours ?? input.plannedHours)
      : undefined;
  const confirmed =
    input.confirmation === "Pending" || input.confirmation === "Leave"
      ? undefined
      : (input.confirmedOn ?? input.workDate);

  return {
    id: `dw-${seq}`,
    employeeId: e.id,
    employeeName: e.name,
    department: e.department,
    resourceOwnerId: e.resourceOwnerId ?? "",
    resourceOwnerName: resourceOwnerName(e.resourceOwnerId),
    workDate: input.workDate,
    projectId: p.id,
    projectName: p.name,
    projectType: p.type,
    milestoneName: input.milestoneName,
    milestoneType: input.milestoneType,
    activityName: input.activityName,
    activityType: input.activityType,
    tasks: input.tasks,
    plannedHours: input.plannedHours,
    confirmation: input.confirmation,
    confirmedOn: confirmed,
    delayReason: delay,
    deviationReason: deviation,
    actualHours: actual,
    planKind: "Plan",
    allocatedOn: input.workDate,
  };
}

function unplannedLine(
  employeeId: string,
  workDate: string,
  tasks: string[],
  actualHours: number,
  seq: number
): DailyWorkRow {
  const e = emp(employeeId);
  return {
    id: `dw-u-${seq}`,
    employeeId: e.id,
    employeeName: e.name,
    department: e.department,
    resourceOwnerId: e.resourceOwnerId ?? "",
    resourceOwnerName: resourceOwnerName(e.resourceOwnerId),
    workDate,
    tasks,
    actualHours,
    confirmation: "D",
    confirmedOn: workDate,
    planKind: "Unplanned",
  };
}

const FALCON = "Project Falcon";
const ATLAS = "Project Atlas";
const INTERNAL = "Automation Suite";

const SEED_LINES: LineInput[] = [
  // Mon Jan 6 — today
  { employeeId: "EMP-1042", workDate: "2026-01-06", projectName: ATLAS, milestoneName: "M2 · Core Build", milestoneType: "commercial_only", activityName: "Feature Development", activityType: "Billable", tasks: ["API integration", "Unit tests"], plannedHours: 5, confirmation: "CD", confirmedOn: "2026-01-06", delayReason: "Confirmed after 6 PM cutoff" },
  { employeeId: "EMP-1042", workDate: "2026-01-06", projectName: FALCON, milestoneName: "M1 · Discovery & Design", milestoneType: "commercial_signoff", activityName: "Code Review", activityType: "Billable", tasks: ["Stakeholder walkthrough"], plannedHours: 2, confirmation: "CD", confirmedOn: "2026-01-06" },
  { employeeId: "EMP-1042", workDate: "2026-01-06", projectName: INTERNAL, milestoneName: "General / Ongoing", milestoneType: "checkpoint_only", activityName: "Team Sync / Standup", activityType: "Internal", tasks: ["Standup"], plannedHours: 1, confirmation: "C", confirmedOn: "2026-01-06" },
  { employeeId: "EMP-1043", workDate: "2026-01-06", projectName: ATLAS, milestoneName: "M2 · Core Build", milestoneType: "commercial_only", activityName: "Feature Development", activityType: "Billable", tasks: ["UI components"], plannedHours: 6, confirmation: "C", confirmedOn: "2026-01-06" },
  { employeeId: "EMP-1043", workDate: "2026-01-06", projectName: FALCON, milestoneName: "M2 · Core Build", milestoneType: "commercial_only", activityName: "Bug Fixing", activityType: "Billable", tasks: ["Defect fixes"], plannedHours: 2, confirmation: "C", confirmedOn: "2026-01-06" },
  { employeeId: "EMP-1051", workDate: "2026-01-06", projectName: ATLAS, milestoneName: "M2 · Core Build", milestoneType: "commercial_only", activityName: "Testing / QA", activityType: "Billable", tasks: ["Regression suite"], plannedHours: 6, confirmation: "C", confirmedOn: "2026-01-06" },
  { employeeId: "EMP-1058", workDate: "2026-01-06", projectName: FALCON, milestoneName: "M2 · Core Build", milestoneType: "commercial_only", activityName: "Feature Development", activityType: "Billable", tasks: ["Backend APIs"], plannedHours: 7, confirmation: "D", confirmedOn: "2026-01-06", deviationReason: "Meeting overran", actualHours: 5 },
  { employeeId: "EMP-1062", workDate: "2026-01-06", projectName: ATLAS, milestoneName: "M2 · Core Build", milestoneType: "commercial_only", activityName: "Feature Development", activityType: "Billable", tasks: ["Data layer"], plannedHours: 6, confirmation: "Pending" },
  { employeeId: "EMP-1067", workDate: "2026-01-06", projectName: INTERNAL, milestoneName: "General / Ongoing", milestoneType: "checkpoint_only", activityName: "Support Queue", activityType: "Billable", tasks: ["Ticket queue"], plannedHours: 8, confirmation: "Leave" },
  { employeeId: "EMP-1071", workDate: "2026-01-06", projectName: ATLAS, milestoneName: "M2 · Core Build", milestoneType: "commercial_only", activityName: "Testing / QA", activityType: "Billable", tasks: ["Smoke tests"], plannedHours: 5, confirmation: "DD", confirmedOn: "2026-01-06", delayReason: "Confirmed next morning", deviationReason: "Blocked / waiting on input", actualHours: 3 },
  { employeeId: "EMP-1088", workDate: "2026-01-06", projectName: FALCON, milestoneName: "M2 · Core Build", milestoneType: "commercial_only", activityName: "Documentation", activityType: "Internal", tasks: ["Runbook update"], plannedHours: 4, confirmation: "C", confirmedOn: "2026-01-06" },
  { employeeId: "EMP-0991", workDate: "2026-01-06", projectName: FALCON, milestoneName: "M1 · Discovery & Design", milestoneType: "commercial_signoff", activityName: "Design & Prototyping", activityType: "Billable", tasks: ["Wireframes"], plannedHours: 6, confirmation: "C", confirmedOn: "2026-01-06" },
  // Tue Jan 7
  { employeeId: "EMP-1042", workDate: "2026-01-07", projectName: ATLAS, milestoneName: "M2 · Core Build", milestoneType: "commercial_only", activityName: "Feature Development", activityType: "Billable", tasks: ["Sprint work"], plannedHours: 6, confirmation: "C", confirmedOn: "2026-01-07" },
  { employeeId: "EMP-1043", workDate: "2026-01-07", projectName: ATLAS, milestoneName: "M2 · Core Build", milestoneType: "commercial_only", activityName: "Feature Development", activityType: "Billable", tasks: ["Refactoring"], plannedHours: 7, confirmation: "CD", confirmedOn: "2026-01-07" },
  { employeeId: "EMP-1051", workDate: "2026-01-07", projectName: ATLAS, milestoneName: "M2 · Core Build", milestoneType: "commercial_only", activityName: "Testing / QA", activityType: "Billable", tasks: ["Automation"], plannedHours: 6, confirmation: "C", confirmedOn: "2026-01-07" },
  { employeeId: "EMP-1058", workDate: "2026-01-07", projectName: FALCON, milestoneName: "M2 · Core Build", milestoneType: "commercial_only", activityName: "Feature Development", activityType: "Billable", tasks: ["Integration"], plannedHours: 6, confirmation: "Pending" },
  { employeeId: "EMP-1062", workDate: "2026-01-07", projectName: ATLAS, milestoneName: "M2 · Core Build", milestoneType: "commercial_only", activityName: "Bug Fixing", activityType: "Billable", tasks: ["Hotfix"], plannedHours: 4, confirmation: "C", confirmedOn: "2026-01-07" },
  { employeeId: "EMP-1071", workDate: "2026-01-07", projectName: ATLAS, milestoneName: "M2 · Core Build", milestoneType: "commercial_only", activityName: "Testing / QA", activityType: "Billable", tasks: ["E2E tests"], plannedHours: 5, confirmation: "D", confirmedOn: "2026-01-07", deviationReason: "Task finished early", actualHours: 3 },
  { employeeId: "EMP-1088", workDate: "2026-01-07", projectName: FALCON, milestoneName: "M2 · Core Build", milestoneType: "commercial_only", activityName: "Internal Meeting", activityType: "Internal", tasks: ["Infra review"], plannedHours: 2, confirmation: "C", confirmedOn: "2026-01-07" },
  { employeeId: "EMP-0991", workDate: "2026-01-07", projectName: FALCON, milestoneName: "M1 · Discovery & Design", milestoneType: "commercial_signoff", activityName: "Design & Prototyping", activityType: "Billable", tasks: ["User flows"], plannedHours: 5, confirmation: "C", confirmedOn: "2026-01-07" },
  // Wed–Fri additional rows
  { employeeId: "EMP-1042", workDate: "2026-01-08", projectName: FALCON, milestoneName: "M2 · Core Build", milestoneType: "commercial_only", activityName: "Feature Development", activityType: "Billable", tasks: ["Build"], plannedHours: 6, confirmation: "Pending" },
  { employeeId: "EMP-1043", workDate: "2026-01-08", projectName: ATLAS, milestoneName: "M2 · Core Build", milestoneType: "commercial_only", activityName: "Code Review", activityType: "Billable", tasks: ["PR review"], plannedHours: 3, confirmation: "Pending" },
  { employeeId: "EMP-1058", workDate: "2026-01-08", projectName: ATLAS, milestoneName: "M2 · Core Build", milestoneType: "commercial_only", activityName: "Feature Development", activityType: "Billable", tasks: ["Services"], plannedHours: 7, confirmation: "Pending" },
  { employeeId: "EMP-1051", workDate: "2026-01-09", projectName: ATLAS, milestoneName: "M2 · Core Build", milestoneType: "commercial_only", activityName: "Testing / QA", activityType: "Billable", tasks: ["UAT support"], plannedHours: 6, confirmation: "Pending" },
  { employeeId: "EMP-1062", workDate: "2026-01-09", projectName: FALCON, milestoneName: "M2 · Core Build", milestoneType: "commercial_only", activityName: "Feature Development", activityType: "Billable", tasks: ["API work"], plannedHours: 6, confirmation: "Pending" },
  { employeeId: "EMP-1071", workDate: "2026-01-10", projectName: ATLAS, milestoneName: "M2 · Core Build", milestoneType: "commercial_only", activityName: "Testing / QA", activityType: "Billable", tasks: ["Release validation"], plannedHours: 5, confirmation: "Pending" },
  { employeeId: "EMP-1088", workDate: "2026-01-10", projectName: FALCON, milestoneName: "M2 · Core Build", milestoneType: "commercial_only", activityName: "Documentation", activityType: "Internal", tasks: ["Deploy notes"], plannedHours: 3, confirmation: "Pending" },
  { employeeId: "EMP-0991", workDate: "2026-01-10", projectName: FALCON, milestoneName: "M1 · Discovery & Design", milestoneType: "commercial_signoff", activityName: "Design & Prototyping", activityType: "Billable", tasks: ["Final mockups"], plannedHours: 4, confirmation: "Pending" },
  // Outside Ravi subtree — visible to super admin only
  { employeeId: "EMP-0765", workDate: "2026-01-06", projectName: INTERNAL, milestoneName: "General / Ongoing", milestoneType: "checkpoint_only", activityName: "Design & Prototyping", activityType: "Billable", tasks: ["Illustration"], plannedHours: 4, confirmation: "C", confirmedOn: "2026-01-06" },
];

const REPEAT_TEMPLATES: Omit<LineInput, "workDate" | "confirmedOn">[] = [
  { employeeId: "EMP-1042", projectName: ATLAS, milestoneName: "M2 · Core Build", milestoneType: "commercial_only", activityName: "Feature Development", activityType: "Billable", tasks: ["Sprint delivery"], plannedHours: 6, confirmation: "C" },
  { employeeId: "EMP-1043", projectName: FALCON, milestoneName: "M2 · Core Build", milestoneType: "commercial_only", activityName: "Feature Development", activityType: "Billable", tasks: ["Component work"], plannedHours: 5, confirmation: "C" },
  { employeeId: "EMP-1051", projectName: ATLAS, milestoneName: "M2 · Core Build", milestoneType: "commercial_only", activityName: "Testing / QA", activityType: "Billable", tasks: ["Test cases"], plannedHours: 6, confirmation: "CD", delayReason: "Confirmed after 6 PM cutoff" },
  { employeeId: "EMP-1058", projectName: FALCON, milestoneName: "M2 · Core Build", milestoneType: "commercial_only", activityName: "Feature Development", activityType: "Billable", tasks: ["Backend work"], plannedHours: 7, confirmation: "D", deviationReason: "Scope shift", actualHours: 5 },
  { employeeId: "EMP-1071", projectName: ATLAS, milestoneName: "M2 · Core Build", milestoneType: "commercial_only", activityName: "Testing / QA", activityType: "Billable", tasks: ["Regression"], plannedHours: 4, confirmation: "C" },
];

const HISTORICAL_DATES = [
  "2025-12-02",
  "2025-12-03",
  "2025-12-09",
  "2025-12-10",
  "2025-12-16",
  "2025-11-04",
  "2025-11-05",
  "2025-11-18",
  "2025-11-19",
];

function expandHistoricalLines(): LineInput[] {
  return HISTORICAL_DATES.flatMap((workDate) =>
    REPEAT_TEMPLATES.map((t) => {
      const pending = t.confirmation === "Pending" || t.confirmation === "Leave";
      return {
        ...t,
        workDate,
        confirmedOn: pending ? undefined : workDate,
      };
    })
  );
}

const ALL_SEED_LINES: LineInput[] = [...SEED_LINES, ...expandHistoricalLines()];

const ALL_ROWS: DailyWorkRow[] = [
  ...ALL_SEED_LINES.map((l, i) => plannedLine(l, i + 1)),
  unplannedLine("EMP-1058", "2026-01-06", ["Ad-hoc production support"], 2, 1),
  unplannedLine("EMP-1062", "2026-01-07", ["Client call — scope clarification"], 1.5, 2),
  unplannedLine("EMP-1043", "2026-01-08", ["Emergency patch review"], 1, 3),
  unplannedLine("EMP-1058", "2025-12-09", ["Year-end deployment support"], 1.5, 4),
  unplannedLine("EMP-1043", "2025-11-18", ["Ad-hoc client demo prep"], 2, 5),
];

export function getDailyWorkRowsForPeriod(periodId: DailyWorkPeriodId): DailyWorkRow[] {
  const { start, end } = getPeriodDateRange(periodId);
  return ALL_ROWS.filter((r) => isDateInRange(r.workDate, start, end));
}

export function filterDailyWorkRows(
  rows: DailyWorkRow[],
  filters: DailyWorkFilters,
  visibleEmployeeIds: Set<string>
): DailyWorkRow[] {
  return rows.filter((r) => {
    if (!visibleEmployeeIds.has(r.employeeId)) return false;
    if (filters.departments.length > 0 && !filters.departments.includes(r.department)) return false;
    // Unplanned lines use free-text labels, not Project Master — gated by Plan/Unplanned only.
    if (
      filters.projects.length > 0 &&
      r.planKind !== "Unplanned" &&
      r.projectName &&
      !filters.projects.includes(r.projectName)
    ) {
      return false;
    }
    if (filters.confirmations.length > 0 && !filters.confirmations.includes(r.confirmation)) return false;
    if (filters.planKinds.length > 0 && !filters.planKinds.includes(r.planKind)) return false;
    if (!workDateMatchesDay(r.workDate, filters.workDay)) return false;
    if (!matchesSearchQuery(filters.search, r.employeeName)) {
      return false;
    }
    return true;
  });
}

export function sortDailyWorkRows(
  rows: DailyWorkRow[],
  sortKey: DailyWorkSortKey,
  sortDir: "asc" | "desc"
): DailyWorkRow[] {
  const mul = sortDir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const str = (v: string | undefined) => v ?? "";
    const num = (v: number | undefined) => v ?? -1;
    switch (sortKey) {
      case "employeeName":
        return mul * a.employeeName.localeCompare(b.employeeName);
      case "department":
        return mul * a.department.localeCompare(b.department);
      case "resourceOwner":
        return mul * a.resourceOwnerName.localeCompare(b.resourceOwnerName);
      case "workDate":
        return mul * a.workDate.localeCompare(b.workDate);
      case "project":
        return mul * str(a.projectName).localeCompare(str(b.projectName));
      case "projectType":
        return mul * str(a.projectType && projectTypeLabel(a.projectType)).localeCompare(
          str(b.projectType && projectTypeLabel(b.projectType))
        );
      case "milestone":
        return mul * str(a.milestoneName).localeCompare(str(b.milestoneName));
      case "milestoneType":
        return mul * str(a.milestoneType).localeCompare(str(b.milestoneType));
      case "activity":
        return mul * str(a.activityName).localeCompare(str(b.activityName));
      case "activityType":
        return mul * str(a.activityType).localeCompare(str(b.activityType));
      case "tasks":
        return mul * (a.tasks ?? []).join(", ").localeCompare((b.tasks ?? []).join(", "));
      case "allocatedOn":
        return mul * str(a.allocatedOn).localeCompare(str(b.allocatedOn));
      case "plannedHrs":
        return mul * (num(a.plannedHours) - num(b.plannedHours));
      case "confirmation":
        return mul * a.confirmation.localeCompare(b.confirmation);
      case "confirmedOn":
        return mul * str(a.confirmedOn).localeCompare(str(b.confirmedOn));
      case "delayReason":
        return mul * str(a.delayReason).localeCompare(str(b.delayReason));
      case "deviationReason":
        return mul * str(a.deviationReason).localeCompare(str(b.deviationReason));
      case "actualHrs":
        return mul * (num(a.actualHours) - num(b.actualHours));
      case "planUnplanned":
        return mul * a.planKind.localeCompare(b.planKind);
      default:
        return 0;
    }
  });
}

export function paginateRows<T>(rows: T[], page: number, pageSize: number): T[] {
  const start = (page - 1) * pageSize;
  return rows.slice(start, start + pageSize);
}

export function dailyWorkDepartments(rows: DailyWorkRow[]): string[] {
  return [...new Set(rows.map((r) => r.department))].sort();
}

/**
 * Project filter options for Daily Work Detail.
 * Only Project Master names — never free-text unplanned `projectLabel` values
 * (e.g. meeting titles stored on confirmation lines).
 *
 * When `knownProjectNames` is provided, return those names (sorted), typically
 * active projects from Project Master. When omitted (mocks), fall back to
 * distinct planned-row project names excluding unplanned-only free text.
 */
export function dailyWorkProjects(
  rows: DailyWorkRow[],
  knownProjectNames?: readonly string[]
): string[] {
  if (knownProjectNames && knownProjectNames.length > 0) {
    return [...new Set(knownProjectNames.filter((n) => !!n.trim()))].sort((a, b) =>
      a.localeCompare(b)
    );
  }
  const names = rows
    .filter((r) => r.planKind !== "Unplanned")
    .map((r) => r.projectName)
    .filter((n): n is string => !!n);
  return [...new Set(names)].sort();
}

export function formatWorkDate(iso: string, pattern: DateFormatPattern = "dd/MM/yyyy"): string {
  return formatAppDate(iso, pattern);
}

export function formatProjectTypeDisplay(type: ProjectType | undefined): string {
  if (!type) return "—";
  return projectTypeLabel(type);
}

export function loadVisibleColumnIds(): Set<DailyWorkSortKey> {
  try {
    for (const key of DAILY_WORK_COLUMN_LEGACY_KEYS) {
      localStorage.removeItem(key);
    }
    const raw = localStorage.getItem(DAILY_WORK_COLUMN_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as string[];
      const allowed = new Set(DAILY_WORK_COLUMNS.map((c) => c.id));
      const next = parsed.filter((id): id is DailyWorkSortKey =>
        allowed.has(id as DailyWorkSortKey)
      );
      if (next.length > 0) return new Set(next);
    }
  } catch {
    /* use defaults */
  }
  return defaultVisibleColumnIds();
}

export function saveVisibleColumnIds(ids: Set<DailyWorkSortKey>): void {
  localStorage.setItem(DAILY_WORK_COLUMN_STORAGE_KEY, JSON.stringify([...ids]));
}

export function defaultVisibleColumnIds(): Set<DailyWorkSortKey> {
  return new Set(DAILY_WORK_COLUMNS.filter((c) => c.defaultVisible).map((c) => c.id));
}
