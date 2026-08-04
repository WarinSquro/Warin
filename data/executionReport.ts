// Project Execution Report (PER) — mock data for Phase 1.
// Phase 2 will derive metrics from allocations, confirmations, and portfolio health.

import type { ProjectType } from "./projects";
import { EMPLOYEES } from "./employees";
import { matchesSearchQuery } from "../utils/textSearch";

export type ExecutionPeriodId = "week" | "month" | "custom";

export type ExecutionSortKey =
  | "project"
  | "planningAccuracy"
  | "confirmationDiscipline"
  | "utilizationHrs"
  | "billablePct"
  | "nonBillablePct"
  | "resourceCount"
  | "health";

export type ProjectHealth = "green" | "amber" | "red";

export type ExecutionStatus = "active" | "on_hold" | "completed";

export interface ExecutionRow {
  id: string;
  projectId: string;
  projectName: string;
  projectType: ProjectType;
  department: string;
  resourceOwnerId: string;
  resourceOwnerName: string;

  planningAccuracy?: number;
  confirmationDiscipline?: number;
  utilizationHrs: number;
  billablePct: number;
  nonBillablePct: number;
  resourceCount: number;

  health: ProjectHealth;
  executionStatus: ExecutionStatus;

  /** Unstaffed project — metrics N/A, grey split bar. */
  unstaffedException?: boolean;
  /** All effort is non-billable. */
  nonBillableOnlyException?: boolean;

  prior?: Partial<
    Pick<
      ExecutionRow,
      | "planningAccuracy"
      | "confirmationDiscipline"
      | "utilizationHrs"
      | "billablePct"
      | "nonBillablePct"
      | "resourceCount"
    >
  >;
}

export interface ExecutionFilters {
  search: string;
  projects: string[];
  departments: string[];
  resourceOwners: string[];
  healthStatuses: ProjectHealth[];
  executionStatuses: ExecutionStatus[];
}

import {
  buildMonthOptions,
  monthIdFromDate,
  performancePeriodOptions,
} from "../utils/reportPeriods";

export const EXECUTION_PERIODS = performancePeriodOptions();

export const EXECUTION_CUSTOM_MONTHS = buildMonthOptions();

export type ExecutionCustomMonthId = string;

export const DEFAULT_EXECUTION_CUSTOM_MONTH: ExecutionCustomMonthId = monthIdFromDate();

export const HEALTH_OPTIONS: ProjectHealth[] = ["green", "amber", "red"];

export const HEALTH_LABELS: Record<ProjectHealth, string> = {
  green: "Healthy",
  amber: "Needs Attention",
  red: "Critical",
};

export const EXECUTION_STATUS_OPTIONS: ExecutionStatus[] = ["active", "on_hold", "completed"];

export const EXECUTION_STATUS_LABELS: Record<ExecutionStatus, string> = {
  active: "Active",
  on_hold: "On Hold",
  completed: "Completed",
};

export interface ExecutionSummary {
  projectCount: number;
  avgPlanningAccuracy: number | null;
  avgConfirmationDiscipline: number | null;
  totalUtilizationHrs: number;
  avgBillablePct: number | null;
  prior?: Omit<ExecutionSummary, "prior" | "projectCount">;
}

export interface ExecutionRosterEntry {
  employeeId: string;
  name: string;
  role: string;
  department: string;
  utilizationHrs: number;
  allocationPct: number;
  disciplinePct?: number;
}

export interface ExecutionHistoryMonth {
  label: string;
  planningAccuracy?: number;
  confirmationDiscipline?: number;
  utilizationHrs: number;
  billablePct: number;
}

export interface ExecutionHistory {
  projectId: string;
  months: ExecutionHistoryMonth[];
}

const WEEK_ROWS: ExecutionRow[] = [
  {
    id: "pe-1",
    projectId: "PRJ-014",
    projectName: "Project Falcon",
    projectType: "paid",
    department: "Engineering",
    resourceOwnerId: "EMP-1042",
    resourceOwnerName: "Ravi Sharma",
    planningAccuracy: 94,
    confirmationDiscipline: 96,
    utilizationHrs: 312,
    billablePct: 88,
    nonBillablePct: 12,
    resourceCount: 4,
    health: "green",
    executionStatus: "active",
    prior: {
      planningAccuracy: 92,
      confirmationDiscipline: 94,
      utilizationHrs: 298,
      billablePct: 86,
      nonBillablePct: 14,
      resourceCount: 4,
    },
  },
  {
    id: "pe-2",
    projectId: "PRJ-015",
    projectName: "Project Atlas",
    projectType: "paid",
    department: "Engineering",
    resourceOwnerId: "EMP-1042",
    resourceOwnerName: "Ravi Sharma",
    planningAccuracy: 91,
    confirmationDiscipline: 93,
    utilizationHrs: 248,
    billablePct: 85,
    nonBillablePct: 15,
    resourceCount: 3,
    health: "green",
    executionStatus: "active",
    prior: {
      planningAccuracy: 89,
      confirmationDiscipline: 91,
      utilizationHrs: 236,
      billablePct: 83,
      nonBillablePct: 17,
      resourceCount: 3,
    },
  },
  {
    id: "pe-3",
    projectId: "PRJ-016",
    projectName: "Project Orion",
    projectType: "paid",
    department: "Engineering",
    resourceOwnerId: "EMP-1088",
    resourceOwnerName: "Kiran Bose",
    planningAccuracy: 78,
    confirmationDiscipline: 74,
    utilizationHrs: 420,
    billablePct: 72,
    nonBillablePct: 28,
    resourceCount: 5,
    health: "amber",
    executionStatus: "on_hold",
    prior: {
      planningAccuracy: 80,
      confirmationDiscipline: 76,
      utilizationHrs: 408,
      billablePct: 74,
      nonBillablePct: 26,
      resourceCount: 5,
    },
  },
  {
    id: "pe-4",
    projectId: "PRJ-017",
    projectName: "Project Nova",
    projectType: "poc",
    department: "Design",
    resourceOwnerId: "EMP-1042",
    resourceOwnerName: "Ravi Sharma",
    planningAccuracy: 62,
    confirmationDiscipline: 58,
    utilizationHrs: 168,
    billablePct: 55,
    nonBillablePct: 45,
    resourceCount: 2,
    health: "red",
    executionStatus: "active",
    prior: {
      planningAccuracy: 68,
      confirmationDiscipline: 64,
      utilizationHrs: 172,
      billablePct: 58,
      nonBillablePct: 42,
      resourceCount: 2,
    },
  },
  {
    id: "pe-5",
    projectId: "PRJ-018",
    projectName: "Automation Suite",
    projectType: "product",
    department: "DevOps",
    resourceOwnerId: "EMP-1088",
    resourceOwnerName: "Kiran Bose",
    planningAccuracy: 89,
    confirmationDiscipline: 91,
    utilizationHrs: 96,
    billablePct: 40,
    nonBillablePct: 60,
    resourceCount: 1,
    health: "green",
    executionStatus: "active",
    prior: {
      planningAccuracy: 87,
      confirmationDiscipline: 89,
      utilizationHrs: 88,
      billablePct: 38,
      nonBillablePct: 62,
      resourceCount: 1,
    },
  },
  {
    id: "pe-6",
    projectId: "PRJ-019",
    projectName: "Internal R&D",
    projectType: "product",
    department: "Engineering",
    resourceOwnerId: "EMP-1058",
    resourceOwnerName: "Vikram Kaul",
    planningAccuracy: 86,
    confirmationDiscipline: 88,
    utilizationHrs: 320,
    billablePct: 0,
    nonBillablePct: 100,
    resourceCount: 3,
    health: "green",
    executionStatus: "active",
    nonBillableOnlyException: true,
    prior: {
      planningAccuracy: 84,
      confirmationDiscipline: 86,
      utilizationHrs: 304,
      billablePct: 0,
      nonBillablePct: 100,
      resourceCount: 3,
    },
  },
  {
    id: "pe-7",
    projectId: "PRJ-020",
    projectName: "Project Lumen",
    projectType: "paid",
    department: "QA",
    resourceOwnerId: "EMP-0991",
    resourceOwnerName: "Meera Pillai",
    utilizationHrs: 0,
    billablePct: 0,
    nonBillablePct: 0,
    resourceCount: 0,
    health: "amber",
    executionStatus: "active",
    unstaffedException: true,
    prior: {
      utilizationHrs: 0,
      billablePct: 0,
      nonBillablePct: 0,
      resourceCount: 0,
    },
  },
  {
    id: "pe-8",
    projectId: "PRJ-011",
    projectName: "Project Helios",
    projectType: "paid",
    department: "Engineering",
    resourceOwnerId: "EMP-1042",
    resourceOwnerName: "Ravi Sharma",
    planningAccuracy: 95,
    confirmationDiscipline: 97,
    utilizationHrs: 0,
    billablePct: 0,
    nonBillablePct: 0,
    resourceCount: 0,
    health: "green",
    executionStatus: "completed",
    prior: {
      planningAccuracy: 94,
      confirmationDiscipline: 96,
      utilizationHrs: 24,
      billablePct: 80,
      nonBillablePct: 20,
      resourceCount: 2,
    },
  },
  {
    id: "pe-9",
    projectId: "PRJ-012",
    projectName: "Project Vega",
    projectType: "paid",
    department: "Engineering",
    resourceOwnerId: "EMP-1088",
    resourceOwnerName: "Kiran Bose",
    planningAccuracy: 82,
    confirmationDiscipline: 79,
    utilizationHrs: 0,
    billablePct: 0,
    nonBillablePct: 0,
    resourceCount: 0,
    health: "amber",
    executionStatus: "completed",
    prior: {
      planningAccuracy: 84,
      confirmationDiscipline: 81,
      utilizationHrs: 16,
      billablePct: 70,
      nonBillablePct: 30,
      resourceCount: 1,
    },
  },
];

const MONTH_ROWS: ExecutionRow[] = WEEK_ROWS.map((r) => ({
  ...r,
  id: r.id.replace("pe-", "pe-m-"),
  utilizationHrs: Math.round(r.utilizationHrs * 4.2),
  prior: r.prior
    ? {
        ...r.prior,
        utilizationHrs:
          r.prior.utilizationHrs != null ? Math.round(r.prior.utilizationHrs * 4.2) : undefined,
      }
    : undefined,
}));

function priorSnapshot(r: ExecutionRow): ExecutionRow["prior"] {
  return {
    planningAccuracy: r.planningAccuracy,
    confirmationDiscipline: r.confirmationDiscipline,
    utilizationHrs: r.utilizationHrs,
    billablePct: r.billablePct,
    nonBillablePct: r.nonBillablePct,
    resourceCount: r.resourceCount,
  };
}

function buildCustomMonthRows(monthId: string, monthIndex: number): ExecutionRow[] {
  const scale = 3.4 + monthIndex * 0.25;
  const metricShift = monthIndex - 2;

  return WEEK_ROWS.map((r) => {
    if (r.unstaffedException) {
      return {
        ...r,
        id: `pe-cm-${monthId}-${r.projectId}`,
      };
    }
    return {
      ...r,
      id: `pe-cm-${monthId}-${r.projectId}`,
      planningAccuracy:
        r.planningAccuracy == null
          ? undefined
          : Math.max(0, Math.min(100, r.planningAccuracy + metricShift)),
      confirmationDiscipline:
        r.confirmationDiscipline == null
          ? undefined
          : Math.max(0, Math.min(100, r.confirmationDiscipline + metricShift)),
      utilizationHrs: Math.round(r.utilizationHrs * scale),
      billablePct: Math.max(0, Math.min(100, r.billablePct + metricShift)),
      nonBillablePct: Math.max(0, Math.min(100, r.nonBillablePct - metricShift)),
    };
  });
}

const EXECUTION_BY_CUSTOM_MONTH: Record<ExecutionCustomMonthId, ExecutionRow[]> =
  EXECUTION_CUSTOM_MONTHS.reduce(
    (acc, m, idx) => {
      acc[m.id] = buildCustomMonthRows(m.id, idx);
      return acc;
    },
    {} as Record<ExecutionCustomMonthId, ExecutionRow[]>
  );

for (let i = 1; i < EXECUTION_CUSTOM_MONTHS.length; i++) {
  const currId = EXECUTION_CUSTOM_MONTHS[i].id;
  const prevId = EXECUTION_CUSTOM_MONTHS[i - 1].id;
  EXECUTION_BY_CUSTOM_MONTH[currId] = EXECUTION_BY_CUSTOM_MONTH[currId].map((r) => {
    const prev = EXECUTION_BY_CUSTOM_MONTH[prevId].find((p) => p.projectId === r.projectId);
    return { ...r, prior: prev ? priorSnapshot(prev) : r.prior };
  });
}

const PRIOR_BY_CUSTOM_MONTH: Record<ExecutionCustomMonthId, ExecutionRow[]> =
  EXECUTION_CUSTOM_MONTHS.reduce(
    (acc, m, idx) => {
      if (idx === 0) {
        acc[m.id] = EXECUTION_BY_CUSTOM_MONTH[m.id].map((r) => ({
          ...r,
          id: `prior-${r.id}`,
          planningAccuracy: r.prior?.planningAccuracy,
          confirmationDiscipline: r.prior?.confirmationDiscipline,
          utilizationHrs: r.prior?.utilizationHrs ?? 0,
          billablePct: r.prior?.billablePct ?? 0,
          nonBillablePct: r.prior?.nonBillablePct ?? 0,
          resourceCount: r.prior?.resourceCount ?? 0,
          prior: undefined,
        }));
      } else {
        const prevId = EXECUTION_CUSTOM_MONTHS[idx - 1].id;
        acc[m.id] = EXECUTION_BY_CUSTOM_MONTH[prevId].map((r) => ({
          ...r,
          id: `prior-${r.id}`,
          prior: undefined,
        }));
      }
      return acc;
    },
    {} as Record<ExecutionCustomMonthId, ExecutionRow[]>
  );

const EXECUTION_BY_PERIOD: Record<Exclude<ExecutionPeriodId, "custom">, ExecutionRow[]> = {
  week: WEEK_ROWS,
  month: MONTH_ROWS,
};

const PRIOR_BY_PERIOD: Record<Exclude<ExecutionPeriodId, "custom">, ExecutionRow[]> = {
  week: WEEK_ROWS.map((r) => ({
    ...r,
    id: `prior-${r.id}`,
    planningAccuracy: r.prior?.planningAccuracy,
    confirmationDiscipline: r.prior?.confirmationDiscipline,
    utilizationHrs: r.prior?.utilizationHrs ?? 0,
    billablePct: r.prior?.billablePct ?? 0,
    nonBillablePct: r.prior?.nonBillablePct ?? 0,
    resourceCount: r.prior?.resourceCount ?? 0,
    prior: undefined,
  })),
  month: MONTH_ROWS.map((r) => ({
    ...r,
    id: `prior-${r.id}`,
    planningAccuracy: r.prior?.planningAccuracy,
    confirmationDiscipline: r.prior?.confirmationDiscipline,
    utilizationHrs: r.prior?.utilizationHrs ?? 0,
    billablePct: r.prior?.billablePct ?? 0,
    nonBillablePct: r.prior?.nonBillablePct ?? 0,
    resourceCount: r.prior?.resourceCount ?? 0,
    prior: undefined,
  })),
};

const ROSTER_BY_PROJECT: Record<string, Omit<ExecutionRosterEntry, "department">[]> = {
  "PRJ-014": [
    { employeeId: "EMP-1042", name: "Ravi Sharma", role: "Sr Developer", utilizationHrs: 96, allocationPct: 40, disciplinePct: 98 },
    { employeeId: "EMP-1058", name: "Vikram Kaul", role: "Sr Backend Dev", utilizationHrs: 84, allocationPct: 35, disciplinePct: 94 },
    { employeeId: "EMP-1043", name: "Arjun Mehta", role: "Developer", utilizationHrs: 72, allocationPct: 30, disciplinePct: 96 },
    { employeeId: "EMP-1051", name: "Priya Nair", role: "QA Engineer", utilizationHrs: 60, allocationPct: 25, disciplinePct: 92 },
  ],
  "PRJ-015": [
    { employeeId: "EMP-1043", name: "Arjun Mehta", role: "Developer", utilizationHrs: 113, allocationPct: 50, disciplinePct: 95 },
    { employeeId: "EMP-1051", name: "Priya Nair", role: "QA Engineer", utilizationHrs: 90, allocationPct: 40, disciplinePct: 88 },
    { employeeId: "EMP-1071", name: "Tara Gupta", role: "QA Engineer", utilizationHrs: 45, allocationPct: 20, disciplinePct: 90 },
  ],
  "PRJ-016": [
    { employeeId: "EMP-1043", name: "Arjun Mehta", role: "Developer", utilizationHrs: 140, allocationPct: 60, disciplinePct: 72 },
    { employeeId: "EMP-1062", name: "Deepa Menon", role: "Backend Dev", utilizationHrs: 105, allocationPct: 45, disciplinePct: 78 },
    { employeeId: "EMP-1088", name: "Kiran Bose", role: "DevOps Lead", utilizationHrs: 70, allocationPct: 30, disciplinePct: 76 },
    { employeeId: "EMP-1058", name: "Vikram Kaul", role: "Sr Backend Dev", utilizationHrs: 58, allocationPct: 25, disciplinePct: 74 },
    { employeeId: "EMP-1071", name: "Tara Gupta", role: "QA Engineer", utilizationHrs: 47, allocationPct: 20, disciplinePct: 70 },
  ],
  "PRJ-017": [
    { employeeId: "EMP-0991", name: "Meera Pillai", role: "UX Designer", utilizationHrs: 105, allocationPct: 50, disciplinePct: 55 },
    { employeeId: "EMP-1062", name: "Deepa Menon", role: "Backend Dev", utilizationHrs: 63, allocationPct: 30, disciplinePct: 60 },
  ],
  "PRJ-018": [
    { employeeId: "EMP-1088", name: "Kiran Bose", role: "DevOps Lead", utilizationHrs: 96, allocationPct: 25, disciplinePct: 91 },
  ],
  "PRJ-019": [
    { employeeId: "EMP-1058", name: "Vikram Kaul", role: "Sr Backend Dev", utilizationHrs: 118, allocationPct: 35, disciplinePct: 90 },
    { employeeId: "EMP-1062", name: "Deepa Menon", role: "Backend Dev", utilizationHrs: 135, allocationPct: 40, disciplinePct: 88 },
    { employeeId: "EMP-1043", name: "Arjun Mehta", role: "Developer", utilizationHrs: 67, allocationPct: 20, disciplinePct: 86 },
  ],
  "PRJ-020": [],
  "PRJ-011": [],
  "PRJ-012": [],
};

const HISTORY_BY_PROJECT: Record<string, ExecutionHistory> = {
  "PRJ-017": {
    projectId: "PRJ-017",
    months: [
      { label: "Aug", planningAccuracy: 78, confirmationDiscipline: 72, utilizationHrs: 140, billablePct: 62 },
      { label: "Sep", planningAccuracy: 74, confirmationDiscipline: 68, utilizationHrs: 152, billablePct: 58 },
      { label: "Oct", planningAccuracy: 70, confirmationDiscipline: 64, utilizationHrs: 160, billablePct: 56 },
      { label: "Nov", planningAccuracy: 66, confirmationDiscipline: 60, utilizationHrs: 164, billablePct: 54 },
      { label: "Dec", planningAccuracy: 64, confirmationDiscipline: 58, utilizationHrs: 166, billablePct: 54 },
      { label: "Jan", planningAccuracy: 62, confirmationDiscipline: 58, utilizationHrs: 168, billablePct: 55 },
    ],
  },
  "PRJ-016": {
    projectId: "PRJ-016",
    months: [
      { label: "Aug", planningAccuracy: 86, confirmationDiscipline: 84, utilizationHrs: 380, billablePct: 78 },
      { label: "Sep", planningAccuracy: 84, confirmationDiscipline: 82, utilizationHrs: 392, billablePct: 76 },
      { label: "Oct", planningAccuracy: 82, confirmationDiscipline: 80, utilizationHrs: 400, billablePct: 75 },
      { label: "Nov", planningAccuracy: 80, confirmationDiscipline: 78, utilizationHrs: 408, billablePct: 74 },
      { label: "Dec", planningAccuracy: 79, confirmationDiscipline: 76, utilizationHrs: 414, billablePct: 73 },
      { label: "Jan", planningAccuracy: 78, confirmationDiscipline: 74, utilizationHrs: 420, billablePct: 72 },
    ],
  },
};

function defaultHistory(projectId: string, row: ExecutionRow): ExecutionHistory {
  const base = row.planningAccuracy ?? 85;
  const disc = row.confirmationDiscipline ?? 85;
  return {
    projectId,
    months: [
      { label: "Aug", planningAccuracy: base - 4, confirmationDiscipline: disc - 3, utilizationHrs: Math.round(row.utilizationHrs * 0.85), billablePct: row.billablePct - 4 },
      { label: "Sep", planningAccuracy: base - 3, confirmationDiscipline: disc - 2, utilizationHrs: Math.round(row.utilizationHrs * 0.88), billablePct: row.billablePct - 3 },
      { label: "Oct", planningAccuracy: base - 2, confirmationDiscipline: disc - 1, utilizationHrs: Math.round(row.utilizationHrs * 0.91), billablePct: row.billablePct - 2 },
      { label: "Nov", planningAccuracy: base - 1, confirmationDiscipline: disc, utilizationHrs: Math.round(row.utilizationHrs * 0.94), billablePct: row.billablePct - 1 },
      { label: "Dec", planningAccuracy: base, confirmationDiscipline: disc + 1, utilizationHrs: Math.round(row.utilizationHrs * 0.97), billablePct: row.billablePct },
      { label: "Jan", planningAccuracy: base, confirmationDiscipline: disc, utilizationHrs: row.utilizationHrs, billablePct: row.billablePct },
    ],
  };
}

const HEALTH_RANK: Record<ProjectHealth, number> = { red: 0, amber: 1, green: 2 };

export function getExecutionRowsForPeriod(
  periodId: ExecutionPeriodId,
  customMonthId: ExecutionCustomMonthId = DEFAULT_EXECUTION_CUSTOM_MONTH
): ExecutionRow[] {
  if (periodId === "custom") {
    return EXECUTION_BY_CUSTOM_MONTH[customMonthId] ?? EXECUTION_BY_CUSTOM_MONTH[DEFAULT_EXECUTION_CUSTOM_MONTH];
  }
  return EXECUTION_BY_PERIOD[periodId];
}

export function getPriorPeriodRows(
  periodId: ExecutionPeriodId,
  customMonthId: ExecutionCustomMonthId = DEFAULT_EXECUTION_CUSTOM_MONTH
): ExecutionRow[] {
  if (periodId === "custom") {
    return PRIOR_BY_CUSTOM_MONTH[customMonthId] ?? PRIOR_BY_CUSTOM_MONTH[DEFAULT_EXECUTION_CUSTOM_MONTH];
  }
  return PRIOR_BY_PERIOD[periodId];
}

export function getExecutionPeriodLabel(
  periodId: ExecutionPeriodId,
  customMonthId: ExecutionCustomMonthId = DEFAULT_EXECUTION_CUSTOM_MONTH
): string {
  if (periodId === "custom") {
    const month = EXECUTION_CUSTOM_MONTHS.find((m) => m.id === customMonthId);
    return month ? month.rangeLabel : "Custom range";
  }
  if (periodId === "week") return EXECUTION_PERIODS[0].label;
  return EXECUTION_PERIODS[1].label;
}

export function getCompareLabel(periodId: ExecutionPeriodId): string {
  return periodId === "week" ? "vs Prior Week" : "vs Last Month";
}

export function executionProjects(rows: ExecutionRow[]) {
  return [...new Set(rows.map((r) => r.projectName))].sort();
}

export function executionDepartments(rows: ExecutionRow[]) {
  return [...new Set(rows.map((r) => r.department))].sort();
}

export function executionResourceOwners(rows: ExecutionRow[]) {
  const map = new Map<string, string>();
  for (const r of rows) {
    map.set(r.resourceOwnerId, r.resourceOwnerName);
  }
  return [...map.entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function filterExecutionRows(rows: ExecutionRow[], filters: ExecutionFilters) {
  return rows.filter((r) => {
    if (
      !matchesSearchQuery(
        filters.search,
        r.projectName,
        r.projectId,
        r.projectType,
        r.department,
        r.resourceOwnerName,
        HEALTH_LABELS[r.health],
        r.health,
        EXECUTION_STATUS_LABELS[r.executionStatus],
        r.executionStatus,
        r.planningAccuracy,
        r.confirmationDiscipline,
        r.utilizationHrs,
        r.billablePct,
        r.nonBillablePct,
        r.resourceCount
      )
    ) {
      return false;
    }
    if (filters.projects.length > 0 && !filters.projects.includes(r.projectName)) return false;
    if (filters.departments.length > 0 && !filters.departments.includes(r.department)) return false;
    if (
      filters.resourceOwners.length > 0 &&
      !filters.resourceOwners.includes(r.resourceOwnerName)
    ) {
      return false;
    }
    if (filters.healthStatuses.length > 0 && !filters.healthStatuses.includes(r.health)) {
      return false;
    }
    if (
      filters.executionStatuses.length > 0 &&
      !filters.executionStatuses.includes(r.executionStatus)
    ) {
      return false;
    }
    return true;
  });
}

function avgDefined(values: (number | undefined)[]): number | null {
  const nums = values.filter((v): v is number => v != null && !Number.isNaN(v));
  if (nums.length === 0) return null;
  return Math.round(nums.reduce((a, b) => a + b, 0) / nums.length);
}

export function computeExecutionSummary(
  rows: ExecutionRow[],
  priorRows?: ExecutionRow[]
): ExecutionSummary {
  const metricRows = rows.filter((r) => !r.unstaffedException);
  const accuracyRows = metricRows.filter((r) => r.planningAccuracy != null);
  const disciplineRows = metricRows.filter((r) => r.confirmationDiscipline != null);
  const billableRows = metricRows.filter((r) => !r.unstaffedException);

  const summary: ExecutionSummary = {
    projectCount: rows.length,
    avgPlanningAccuracy: avgDefined(accuracyRows.map((r) => r.planningAccuracy)),
    avgConfirmationDiscipline: avgDefined(disciplineRows.map((r) => r.confirmationDiscipline)),
    totalUtilizationHrs: rows.reduce((s, r) => s + r.utilizationHrs, 0),
    avgBillablePct: avgDefined(billableRows.map((r) => r.billablePct)),
  };

  if (priorRows) {
    summary.prior = computeExecutionSummary(priorRows);
  }

  return summary;
}

export function sortExecutionRows(
  rows: ExecutionRow[],
  sortKey: ExecutionSortKey,
  sortDir: "asc" | "desc"
) {
  const mul = sortDir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    switch (sortKey) {
      case "project":
        return mul * a.projectName.localeCompare(b.projectName);
      case "planningAccuracy": {
        const av = a.unstaffedException || a.planningAccuracy == null ? -1 : a.planningAccuracy;
        const bv = b.unstaffedException || b.planningAccuracy == null ? -1 : b.planningAccuracy;
        return mul * (av - bv);
      }
      case "confirmationDiscipline": {
        const av = a.unstaffedException || a.confirmationDiscipline == null ? -1 : a.confirmationDiscipline;
        const bv = b.unstaffedException || b.confirmationDiscipline == null ? -1 : b.confirmationDiscipline;
        return mul * (av - bv);
      }
      case "utilizationHrs":
        return mul * (a.utilizationHrs - b.utilizationHrs);
      case "billablePct":
        return mul * (a.billablePct - b.billablePct);
      case "nonBillablePct":
        return mul * (a.nonBillablePct - b.nonBillablePct);
      case "resourceCount":
        return mul * (a.resourceCount - b.resourceCount);
      case "health":
        return mul * (HEALTH_RANK[a.health] - HEALTH_RANK[b.health]);
      default:
        return 0;
    }
  });
}

export function getExecutionRoster(
  projectId: string,
  projectUtilizationHrs?: number
): ExecutionRosterEntry[] {
  const base = ROSTER_BY_PROJECT[projectId] ?? [];
  const baseTotal = base.reduce((s, e) => s + e.utilizationHrs, 0);
  const scale =
    projectUtilizationHrs != null && baseTotal > 0 ? projectUtilizationHrs / baseTotal : 1;

  return base.map((entry) => ({
    ...entry,
    department: EMPLOYEES.find((e) => e.id === entry.employeeId)?.department ?? "—",
    utilizationHrs: Math.round(entry.utilizationHrs * scale),
  }));
}

export function getExecutionHistory(projectId: string): ExecutionHistory | null {
  if (HISTORY_BY_PROJECT[projectId]) {
    return HISTORY_BY_PROJECT[projectId];
  }
  const row = WEEK_ROWS.find((r) => r.projectId === projectId);
  if (!row || row.unstaffedException) return null;
  return defaultHistory(projectId, row);
}

export function healthFilterLabels(): string[] {
  return HEALTH_OPTIONS.map((h) => HEALTH_LABELS[h]);
}

export function healthFromLabel(label: string): ProjectHealth | undefined {
  const entry = Object.entries(HEALTH_LABELS).find(([, v]) => v === label);
  return entry ? (entry[0] as ProjectHealth) : undefined;
}

export function executionStatusFilterLabels(): string[] {
  return EXECUTION_STATUS_OPTIONS.map((s) => EXECUTION_STATUS_LABELS[s]);
}

export function executionStatusFromLabel(label: string): ExecutionStatus | undefined {
  const entry = Object.entries(EXECUTION_STATUS_LABELS).find(([, v]) => v === label);
  return entry ? (entry[0] as ExecutionStatus) : undefined;
}
