// Resource Deployment Report (RDR) — mock data for Phase 1.
// Phase 2 will derive rows from approved allocations, availability, and confirmations.

import { EMPLOYEES, resourceOwnerName } from "./employees";
import { DEFAULT_SETTINGS } from "./settings";
import type { MetricBands } from "./settings";
import { matchesSearchQuery } from "../utils/textSearch";

export type DeploymentStatus = "Available" | "Allocated" | "Reserved" | "Unavailable";
export type MetricBand = "excellent" | "good" | "needs_attention" | "critical" | "not_available";
export type DeploymentGroupBy = "none" | "department" | "project" | "resourceOwner";

export interface DeploymentRow {
  id: string;
  employeeId: string;
  employeeName: string;
  department: string;
  resourceOwnerId: string;
  resourceOwnerName: string;
  primarySkill: string;
  projectId?: string;
  projectName: string;
  allocationHours: number;
  availableFrom: string;
  planningAccuracy?: number;
  confirmationDiscipline?: number;
  status: DeploymentStatus;
  isException?: boolean;
}

export interface DeploymentFilters {
  search: string;
  departments: string[];
  projects: string[];
  resourceOwners: string[];
  skills: string[];
  statuses: DeploymentStatus[];
}

export const DEPLOYMENT_STATUSES: DeploymentStatus[] = [
  "Available",
  "Allocated",
  "Reserved",
  "Unavailable",
];

import { deploymentPeriodOptions, todayISO } from "../utils/reportPeriods";

export const REPORT_PERIODS = deploymentPeriodOptions();

export type ReportPeriodId = (typeof REPORT_PERIODS)[number]["id"];

/** Live "today" ISO for any remaining mock-era callers — always current date. */
export const REPORT_TODAY = todayISO();

function row(
  partial: Omit<DeploymentRow, "resourceOwnerName" | "primarySkill"> & {
    primarySkill?: string;
  }
): DeploymentRow {
  const emp = EMPLOYEES.find((e) => e.id === partial.employeeId);
  return {
    ...partial,
    primarySkill: partial.primarySkill ?? emp?.skills[0] ?? "—",
    resourceOwnerName: resourceOwnerName(partial.resourceOwnerId),
  };
}

/** Weekly snapshot (Jan 6 – 12) — approved allocation hours for the week. */
const WEEK_ROWS: DeploymentRow[] = [
  row({
    id: "dr-1",
    employeeId: "EMP-1042",
    employeeName: "Ravi Sharma",
    department: "Engineering",
    resourceOwnerId: "EMP-1088",
    projectId: "PRJ-014",
    projectName: "Project Falcon",
    allocationHours: 32,
    availableFrom: "Jan 20",
    planningAccuracy: 96,
    confirmationDiscipline: 98,
    status: "Allocated",
  }),
  row({
    id: "dr-2",
    employeeId: "EMP-1043",
    employeeName: "Arjun Mehta",
    department: "Engineering",
    resourceOwnerId: "EMP-1042",
    projectId: "PRJ-015",
    projectName: "Project Atlas",
    allocationHours: 40,
    availableFrom: "Feb 3",
    planningAccuracy: 92,
    confirmationDiscipline: 95,
    status: "Allocated",
  }),
  row({
    id: "dr-3a",
    employeeId: "EMP-1058",
    employeeName: "Vikram Kaul",
    department: "Engineering",
    resourceOwnerId: "EMP-1042",
    projectId: "PRJ-014",
    projectName: "Project Falcon",
    allocationHours: 24,
    availableFrom: "Jan 17",
    planningAccuracy: 88,
    confirmationDiscipline: 91,
    status: "Allocated",
  }),
  row({
    id: "dr-3b",
    employeeId: "EMP-1058",
    employeeName: "Vikram Kaul",
    department: "Engineering",
    resourceOwnerId: "EMP-1042",
    projectId: "PRJ-015",
    projectName: "Project Atlas",
    allocationHours: 8,
    availableFrom: "Feb 3",
    planningAccuracy: 88,
    confirmationDiscipline: 91,
    status: "Allocated",
  }),
  row({
    id: "dr-4",
    employeeId: "EMP-1062",
    employeeName: "Deepa Menon",
    department: "Engineering",
    resourceOwnerId: "EMP-1058",
    projectId: "PRJ-014",
    projectName: "Project Falcon",
    allocationHours: 24,
    availableFrom: "Jan 17",
    confirmationDiscipline: 93,
    status: "Allocated",
  }),
  row({
    id: "dr-5",
    employeeId: "EMP-1051",
    employeeName: "Priya Nair",
    department: "QA",
    resourceOwnerId: "EMP-0991",
    projectId: "PRJ-015",
    projectName: "Project Atlas",
    allocationHours: 32,
    availableFrom: "Jan 24",
    planningAccuracy: 78,
    confirmationDiscipline: 82,
    status: "Allocated",
  }),
  row({
    id: "dr-6",
    employeeId: "EMP-1067",
    employeeName: "Sneha Rao",
    department: "Support",
    resourceOwnerId: "EMP-1088",
    projectId: "PRJ-016",
    projectName: "Automation Suite",
    allocationHours: 16,
    availableFrom: "Now",
    planningAccuracy: 97,
    confirmationDiscipline: 96,
    status: "Allocated",
  }),
  row({
    id: "dr-7",
    employeeId: "EMP-1071",
    employeeName: "Tara Gupta",
    department: "QA",
    resourceOwnerId: "EMP-1051",
    projectId: "PRJ-014",
    projectName: "Project Falcon",
    allocationHours: 20,
    availableFrom: "Now",
    planningAccuracy: 85,
    confirmationDiscipline: 88,
    status: "Reserved",
  }),
  row({
    id: "dr-8",
    employeeId: "EMP-1088",
    employeeName: "Kiran Bose",
    department: "DevOps",
    resourceOwnerId: "EMP-1042",
    projectId: "PRJ-016",
    projectName: "Automation Suite",
    allocationHours: 28,
    availableFrom: "Jan 27",
    planningAccuracy: 94,
    confirmationDiscipline: 92,
    status: "Allocated",
  }),
  row({
    id: "dr-9",
    employeeId: "EMP-0991",
    employeeName: "Meera Pillai",
    department: "Design",
    resourceOwnerId: "EMP-1042",
    projectId: "PRJ-014",
    projectName: "Project Falcon",
    allocationHours: 22,
    availableFrom: "Now",
    planningAccuracy: 91,
    confirmationDiscipline: 94,
    status: "Allocated",
  }),
  row({
    id: "dr-10",
    employeeId: "EMP-0842",
    employeeName: "Rahul Verma",
    department: "Engineering",
    resourceOwnerId: "EMP-1042",
    projectName: "Unallocated",
    allocationHours: 0,
    availableFrom: "Now",
    status: "Available",
    isException: true,
  }),
];

/** Today — daily approved hours active on the reporting date. */
const TODAY_ROWS: DeploymentRow[] = [
  row({
    id: "dr-t1",
    employeeId: "EMP-1042",
    employeeName: "Ravi Sharma",
    department: "Engineering",
    resourceOwnerId: "EMP-1088",
    projectId: "PRJ-014",
    projectName: "Project Falcon",
    allocationHours: 8,
    availableFrom: "Jan 20",
    planningAccuracy: 97,
    confirmationDiscipline: 100,
    status: "Allocated",
  }),
  row({
    id: "dr-t2",
    employeeId: "EMP-1043",
    employeeName: "Arjun Mehta",
    department: "Engineering",
    resourceOwnerId: "EMP-1042",
    projectId: "PRJ-015",
    projectName: "Project Atlas",
    allocationHours: 8,
    availableFrom: "Feb 3",
    planningAccuracy: 94,
    confirmationDiscipline: 96,
    status: "Allocated",
  }),
  row({
    id: "dr-t3",
    employeeId: "EMP-1058",
    employeeName: "Vikram Kaul",
    department: "Engineering",
    resourceOwnerId: "EMP-1042",
    projectId: "PRJ-014",
    projectName: "Project Falcon",
    allocationHours: 6,
    availableFrom: "Jan 17",
    planningAccuracy: 90,
    confirmationDiscipline: 92,
    status: "Allocated",
  }),
  row({
    id: "dr-t4",
    employeeId: "EMP-1062",
    employeeName: "Deepa Menon",
    department: "Engineering",
    resourceOwnerId: "EMP-1058",
    projectId: "PRJ-014",
    projectName: "Project Falcon",
    allocationHours: 6,
    availableFrom: "Jan 17",
    confirmationDiscipline: 91,
    status: "Allocated",
  }),
  row({
    id: "dr-t5",
    employeeId: "EMP-1051",
    employeeName: "Priya Nair",
    department: "QA",
    resourceOwnerId: "EMP-0991",
    projectId: "PRJ-015",
    projectName: "Project Atlas",
    allocationHours: 8,
    availableFrom: "Jan 24",
    planningAccuracy: 81,
    confirmationDiscipline: 85,
    status: "Allocated",
  }),
  row({
    id: "dr-t6",
    employeeId: "EMP-1067",
    employeeName: "Sneha Rao",
    department: "Support",
    resourceOwnerId: "EMP-1088",
    projectId: "PRJ-016",
    projectName: "Automation Suite",
    allocationHours: 4,
    availableFrom: "Now",
    planningAccuracy: 98,
    confirmationDiscipline: 97,
    status: "Allocated",
  }),
  row({
    id: "dr-t7",
    employeeId: "EMP-1071",
    employeeName: "Tara Gupta",
    department: "QA",
    resourceOwnerId: "EMP-1051",
    projectId: "PRJ-014",
    projectName: "Project Falcon",
    allocationHours: 6,
    availableFrom: "Now",
    planningAccuracy: 87,
    confirmationDiscipline: 89,
    status: "Reserved",
  }),
  row({
    id: "dr-t8",
    employeeId: "EMP-0991",
    employeeName: "Meera Pillai",
    department: "Design",
    resourceOwnerId: "EMP-1042",
    projectId: "PRJ-014",
    projectName: "Project Falcon",
    allocationHours: 4,
    availableFrom: "Now",
    planningAccuracy: 93,
    confirmationDiscipline: 95,
    status: "Allocated",
  }),
  row({
    id: "dr-t9",
    employeeId: "EMP-0842",
    employeeName: "Rahul Verma",
    department: "Engineering",
    resourceOwnerId: "EMP-1042",
    projectName: "Unallocated",
    allocationHours: 0,
    availableFrom: "Now",
    status: "Available",
    isException: true,
  }),
];

/** January 2026 — month-to-date approved hours and period metrics. */
const MONTH_ROWS: DeploymentRow[] = [
  row({
    id: "dr-m1",
    employeeId: "EMP-1042",
    employeeName: "Ravi Sharma",
    department: "Engineering",
    resourceOwnerId: "EMP-1088",
    projectId: "PRJ-014",
    projectName: "Project Falcon",
    allocationHours: 128,
    availableFrom: "Jan 20",
    planningAccuracy: 95,
    confirmationDiscipline: 97,
    status: "Allocated",
  }),
  row({
    id: "dr-m2",
    employeeId: "EMP-1043",
    employeeName: "Arjun Mehta",
    department: "Engineering",
    resourceOwnerId: "EMP-1042",
    projectId: "PRJ-015",
    projectName: "Project Atlas",
    allocationHours: 152,
    availableFrom: "Feb 3",
    planningAccuracy: 91,
    confirmationDiscipline: 94,
    status: "Allocated",
  }),
  row({
    id: "dr-m3a",
    employeeId: "EMP-1058",
    employeeName: "Vikram Kaul",
    department: "Engineering",
    resourceOwnerId: "EMP-1042",
    projectId: "PRJ-014",
    projectName: "Project Falcon",
    allocationHours: 96,
    availableFrom: "Jan 17",
    planningAccuracy: 86,
    confirmationDiscipline: 90,
    status: "Allocated",
  }),
  row({
    id: "dr-m3b",
    employeeId: "EMP-1058",
    employeeName: "Vikram Kaul",
    department: "Engineering",
    resourceOwnerId: "EMP-1042",
    projectId: "PRJ-015",
    projectName: "Project Atlas",
    allocationHours: 32,
    availableFrom: "Feb 3",
    planningAccuracy: 86,
    confirmationDiscipline: 90,
    status: "Allocated",
  }),
  row({
    id: "dr-m4",
    employeeId: "EMP-1062",
    employeeName: "Deepa Menon",
    department: "Engineering",
    resourceOwnerId: "EMP-1058",
    projectId: "PRJ-014",
    projectName: "Project Falcon",
    allocationHours: 88,
    availableFrom: "Jan 17",
    confirmationDiscipline: 92,
    status: "Allocated",
  }),
  row({
    id: "dr-m5",
    employeeId: "EMP-1051",
    employeeName: "Priya Nair",
    department: "QA",
    resourceOwnerId: "EMP-0991",
    projectId: "PRJ-015",
    projectName: "Project Atlas",
    allocationHours: 120,
    availableFrom: "Jan 24",
    planningAccuracy: 76,
    confirmationDiscipline: 80,
    status: "Allocated",
  }),
  row({
    id: "dr-m6",
    employeeId: "EMP-1067",
    employeeName: "Sneha Rao",
    department: "Support",
    resourceOwnerId: "EMP-1088",
    projectId: "PRJ-016",
    projectName: "Automation Suite",
    allocationHours: 64,
    availableFrom: "Now",
    planningAccuracy: 96,
    confirmationDiscipline: 95,
    status: "Allocated",
  }),
  row({
    id: "dr-m7",
    employeeId: "EMP-1071",
    employeeName: "Tara Gupta",
    department: "QA",
    resourceOwnerId: "EMP-1051",
    projectId: "PRJ-014",
    projectName: "Project Falcon",
    allocationHours: 72,
    availableFrom: "Now",
    planningAccuracy: 83,
    confirmationDiscipline: 86,
    status: "Reserved",
  }),
  row({
    id: "dr-m8",
    employeeId: "EMP-1088",
    employeeName: "Kiran Bose",
    department: "DevOps",
    resourceOwnerId: "EMP-1042",
    projectId: "PRJ-016",
    projectName: "Automation Suite",
    allocationHours: 104,
    availableFrom: "Jan 27",
    planningAccuracy: 93,
    confirmationDiscipline: 91,
    status: "Allocated",
  }),
  row({
    id: "dr-m9",
    employeeId: "EMP-0991",
    employeeName: "Meera Pillai",
    department: "Design",
    resourceOwnerId: "EMP-1042",
    projectId: "PRJ-014",
    projectName: "Project Falcon",
    allocationHours: 80,
    availableFrom: "Now",
    planningAccuracy: 90,
    confirmationDiscipline: 93,
    status: "Allocated",
  }),
  row({
    id: "dr-m10",
    employeeId: "EMP-0842",
    employeeName: "Rahul Verma",
    department: "Engineering",
    resourceOwnerId: "EMP-1042",
    projectName: "Unallocated",
    allocationHours: 0,
    availableFrom: "Now",
    status: "Available",
    isException: true,
  }),
];

const DEPLOYMENT_BY_PERIOD: Record<ReportPeriodId, DeploymentRow[]> = {
  today: TODAY_ROWS,
  week: WEEK_ROWS,
  next_week: WEEK_ROWS,
  month: MONTH_ROWS,
};

/** Default export for backward compatibility — week snapshot. */
export const DEPLOYMENT_ROWS = WEEK_ROWS;

export function getDeploymentRowsForPeriod(periodId: ReportPeriodId): DeploymentRow[] {
  return DEPLOYMENT_BY_PERIOD[periodId];
}

export function metricBand(value?: number, thresholds: MetricBands = DEFAULT_SETTINGS.metricBands): MetricBand {
  if (value == null || Number.isNaN(value)) return "not_available";
  if (value >= thresholds.excellent) return "excellent";
  if (value >= thresholds.good) return "good";
  if (value >= thresholds.needsAttention) return "needs_attention";
  return "critical";
}

export function metricBandLabel(band: MetricBand): string {
  switch (band) {
    case "excellent":
      return "Excellent";
    case "good":
      return "Good";
    case "needs_attention":
      return "Needs Attention";
    case "critical":
      return "Critical";
    default:
      return "Not Available";
  }
}

export function deploymentDepartments(rows = DEPLOYMENT_ROWS) {
  return [...new Set(rows.map((r) => r.department))].sort();
}

export function deploymentProjects(rows = DEPLOYMENT_ROWS) {
  // Include sentinel labels (e.g. Unallocated) so Available rows stay visible when
  // "all projects" are selected — otherwise search cannot find free people.
  return [...new Set(rows.map((r) => r.projectName).filter(Boolean))].sort();
}

export function deploymentResourceOwners(rows = DEPLOYMENT_ROWS) {
  const map = new Map<string, string>();
  for (const r of rows) {
    map.set(r.resourceOwnerId, r.resourceOwnerName);
  }
  return [...map.entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function deploymentSkills(rows = DEPLOYMENT_ROWS) {
  return [...new Set(rows.map((r) => r.primarySkill))].sort();
}

export function filterDeploymentRows(rows: DeploymentRow[], filters: DeploymentFilters) {
  return rows.filter((r) => {
    if (
      !matchesSearchQuery(
        filters.search,
        r.employeeName,
        r.employeeId,
        r.department,
        r.projectName,
        r.resourceOwnerName,
        r.primarySkill,
        r.availableFrom,
        r.status,
        r.allocationHours,
        r.planningAccuracy,
        r.confirmationDiscipline
      )
    ) {
      return false;
    }
    if (filters.departments.length > 0 && !filters.departments.includes(r.department)) return false;
    if (filters.projects.length > 0 && !filters.projects.includes(r.projectName)) return false;
    if (
      filters.resourceOwners.length > 0 &&
      !filters.resourceOwners.includes(r.resourceOwnerName)
    ) {
      return false;
    }
    if (filters.skills.length > 0 && !filters.skills.includes(r.primarySkill)) return false;
    if (filters.statuses.length > 0 && !filters.statuses.includes(r.status)) return false;
    return true;
  });
}

export interface DeploymentTotals {
  rowCount: number;
  employeeCount: number;
  totalHours: number;
}

export function computeDeploymentTotals(rows: DeploymentRow[]): DeploymentTotals {
  const employees = new Set(rows.map((r) => r.employeeId));
  return {
    rowCount: rows.length,
    employeeCount: employees.size,
    totalHours: rows.reduce((sum, r) => sum + r.allocationHours, 0),
  };
}

export interface DeploymentGroup {
  key: string;
  label: string;
  rows: DeploymentRow[];
  totals: DeploymentTotals;
}

export function groupDeploymentRows(
  rows: DeploymentRow[],
  groupBy: DeploymentGroupBy
): DeploymentGroup[] {
  if (groupBy === "none") {
    return [{ key: "all", label: "", rows, totals: computeDeploymentTotals(rows) }];
  }

  const buckets = new Map<string, DeploymentRow[]>();
  for (const r of rows) {
    const key =
      groupBy === "department"
        ? r.department
        : groupBy === "project"
          ? r.projectName
          : r.resourceOwnerName;
    const list = buckets.get(key) ?? [];
    list.push(r);
    buckets.set(key, list);
  }

  return [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, groupRows]) => ({
      key,
      label: key,
      rows: groupRows,
      totals: computeDeploymentTotals(groupRows),
    }));
}

export type DeploymentSortKey =
  | "employee"
  | "project"
  | "allocation"
  | "availableFrom"
  | "planningAccuracy"
  | "confirmationDiscipline";

export function sortDeploymentRows(
  rows: DeploymentRow[],
  sortKey: DeploymentSortKey,
  sortDir: "asc" | "desc"
) {
  const mul = sortDir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    switch (sortKey) {
      case "employee":
        return mul * a.employeeName.localeCompare(b.employeeName);
      case "project":
        return mul * a.projectName.localeCompare(b.projectName);
      case "allocation":
        return mul * (a.allocationHours - b.allocationHours);
      case "availableFrom": {
        const av = a.availableFrom === "Now" ? "0" : a.availableFrom;
        const bv = b.availableFrom === "Now" ? "0" : b.availableFrom;
        return mul * av.localeCompare(bv);
      }
      case "planningAccuracy": {
        const av = a.planningAccuracy ?? -1;
        const bv = b.planningAccuracy ?? -1;
        return mul * (av - bv);
      }
      case "confirmationDiscipline": {
        const av = a.confirmationDiscipline ?? -1;
        const bv = b.confirmationDiscipline ?? -1;
        return mul * (av - bv);
      }
      default:
        return 0;
    }
  });
}
