// Resource Performance Report (RPR) — mock data for Phase 1.
// Phase 2 will derive metrics from confirmations, utilization, and activity records.

import { EMPLOYEES, resourceOwnerName } from "./employees";
import type { EmpStatus } from "./employees";
import { matchesSearchQuery } from "../utils/textSearch";

export type PerformancePeriodId = "week" | "month" | "custom";

export type PerformanceSortKey =
  | "employee"
  | "planningAccuracy"
  | "confirmationDiscipline"
  | "utilizationHrs"
  | "billablePct"
  | "nonBillablePct"
  | "availableCapacityHrs";

export interface PerformanceRow {
  id: string;
  employeeId: string;
  employeeName: string;
  department: string;
  resourceOwnerId: string;
  resourceOwnerName: string;
  primarySkill: string;
  employmentStatus: EmpStatus;

  planningAccuracy?: number;
  confirmationDiscipline?: number;
  utilizationHrs: number;
  billablePct: number;
  nonBillablePct: number;
  availableCapacityHrs?: number;

  /** Full-period approved leave — metrics show N/A, split bar grey. */
  leaveException?: boolean;

  prior?: Partial<
    Pick<
      PerformanceRow,
      | "planningAccuracy"
      | "confirmationDiscipline"
      | "utilizationHrs"
      | "billablePct"
      | "nonBillablePct"
      | "availableCapacityHrs"
    >
  >;
}

export interface PerformanceFilters {
  search: string;
  departments: string[];
  resourceOwners: string[];
  skills: string[];
  employmentStatuses: EmpStatus[];
}

import {
  buildMonthOptions,
  monthIdFromDate,
  performancePeriodOptions,
} from "../utils/reportPeriods";

export const PERFORMANCE_PERIODS = performancePeriodOptions();

export const PERFORMANCE_CUSTOM_MONTHS = buildMonthOptions();

export type PerformanceCustomMonthId = string;

export const DEFAULT_PERFORMANCE_CUSTOM_MONTH: PerformanceCustomMonthId = monthIdFromDate();

export const EMPLOYMENT_STATUS_OPTIONS: EmpStatus[] = ["active", "inactive"];

export interface PerformanceSummary {
  employeeCount: number;
  avgPlanningAccuracy: number | null;
  avgConfirmationDiscipline: number | null;
  totalUtilizationHrs: number;
  avgBillablePct: number | null;
  totalAvailableCapacityHrs: number | null;
  prior?: Omit<PerformanceSummary, "prior" | "employeeCount">;
}

export interface PerformanceHistoryMonth {
  label: string;
  planningAccuracy?: number;
  confirmationDiscipline?: number;
  utilizationHrs: number;
  billablePct: number;
}

export interface PerformanceHistory {
  employeeId: string;
  months: PerformanceHistoryMonth[];
  remainingCapacityHrs?: number;
}

function row(
  partial: Omit<PerformanceRow, "resourceOwnerName" | "primarySkill" | "employmentStatus"> & {
    primarySkill?: string;
    employmentStatus?: EmpStatus;
  }
): PerformanceRow {
  const emp = EMPLOYEES.find((e) => e.id === partial.employeeId);
  return {
    ...partial,
    employmentStatus: partial.employmentStatus ?? emp?.status ?? "active",
    primarySkill: partial.primarySkill ?? emp?.skills[0] ?? "—",
    resourceOwnerName: resourceOwnerName(partial.resourceOwnerId),
  };
}

const WEEK_ROWS: PerformanceRow[] = [
  row({
    id: "pr-1",
    employeeId: "EMP-1042",
    employeeName: "Ravi Sharma",
    department: "Engineering",
    resourceOwnerId: "EMP-1088",
    utilizationHrs: 38,
    billablePct: 92,
    nonBillablePct: 8,
    availableCapacityHrs: 2,
    planningAccuracy: 96,
    confirmationDiscipline: 98,
    prior: {
      planningAccuracy: 94,
      confirmationDiscipline: 96,
      utilizationHrs: 36,
      billablePct: 90,
      nonBillablePct: 10,
      availableCapacityHrs: 4,
    },
  }),
  row({
    id: "pr-2",
    employeeId: "EMP-1043",
    employeeName: "Arjun Mehta",
    department: "Engineering",
    resourceOwnerId: "EMP-1042",
    utilizationHrs: 40,
    billablePct: 88,
    nonBillablePct: 12,
    availableCapacityHrs: 0,
    planningAccuracy: 92,
    confirmationDiscipline: 95,
    prior: {
      planningAccuracy: 90,
      confirmationDiscipline: 93,
      utilizationHrs: 38,
      billablePct: 85,
      nonBillablePct: 15,
      availableCapacityHrs: 2,
    },
  }),
  row({
    id: "pr-3",
    employeeId: "EMP-1058",
    employeeName: "Vikram Kaul",
    department: "Engineering",
    resourceOwnerId: "EMP-1042",
    utilizationHrs: 34,
    billablePct: 85,
    nonBillablePct: 15,
    availableCapacityHrs: 6,
    planningAccuracy: 88,
    confirmationDiscipline: 91,
    prior: {
      planningAccuracy: 86,
      confirmationDiscipline: 89,
      utilizationHrs: 32,
      billablePct: 82,
      nonBillablePct: 18,
      availableCapacityHrs: 8,
    },
  }),
  row({
    id: "pr-4",
    employeeId: "EMP-1062",
    employeeName: "Deepa Menon",
    department: "Engineering",
    resourceOwnerId: "EMP-1058",
    utilizationHrs: 28,
    billablePct: 78,
    nonBillablePct: 22,
    availableCapacityHrs: 12,
    confirmationDiscipline: 93,
    prior: {
      confirmationDiscipline: 91,
      utilizationHrs: 26,
      billablePct: 75,
      nonBillablePct: 25,
      availableCapacityHrs: 14,
    },
  }),
  row({
    id: "pr-5",
    employeeId: "EMP-1051",
    employeeName: "Priya Nair",
    department: "QA",
    resourceOwnerId: "EMP-0991",
    utilizationHrs: 32,
    billablePct: 80,
    nonBillablePct: 20,
    availableCapacityHrs: 8,
    planningAccuracy: 78,
    confirmationDiscipline: 72,
    prior: {
      planningAccuracy: 80,
      confirmationDiscipline: 82,
      utilizationHrs: 30,
      billablePct: 78,
      nonBillablePct: 22,
      availableCapacityHrs: 10,
    },
  }),
  row({
    id: "pr-6",
    employeeId: "EMP-1067",
    employeeName: "Sneha Rao",
    department: "Support",
    resourceOwnerId: "EMP-1088",
    utilizationHrs: 0,
    billablePct: 0,
    nonBillablePct: 0,
    leaveException: true,
    prior: {
      planningAccuracy: 97,
      confirmationDiscipline: 96,
      utilizationHrs: 16,
      billablePct: 70,
      nonBillablePct: 30,
      availableCapacityHrs: 24,
    },
  }),
  row({
    id: "pr-7",
    employeeId: "EMP-1071",
    employeeName: "Tara Gupta",
    department: "QA",
    resourceOwnerId: "EMP-1051",
    utilizationHrs: 0,
    billablePct: 0,
    nonBillablePct: 0,
    availableCapacityHrs: 40,
    planningAccuracy: 85,
    confirmationDiscipline: 88,
    prior: {
      planningAccuracy: 84,
      confirmationDiscipline: 86,
      utilizationHrs: 8,
      billablePct: 60,
      nonBillablePct: 40,
      availableCapacityHrs: 32,
    },
  }),
  row({
    id: "pr-8",
    employeeId: "EMP-1088",
    employeeName: "Kiran Bose",
    department: "DevOps",
    resourceOwnerId: "EMP-1042",
    utilizationHrs: 36,
    billablePct: 82,
    nonBillablePct: 18,
    availableCapacityHrs: 4,
    planningAccuracy: 94,
    confirmationDiscipline: 92,
    prior: {
      planningAccuracy: 92,
      confirmationDiscipline: 90,
      utilizationHrs: 34,
      billablePct: 80,
      nonBillablePct: 20,
      availableCapacityHrs: 6,
    },
  }),
  row({
    id: "pr-9",
    employeeId: "EMP-0991",
    employeeName: "Meera Pillai",
    department: "Design",
    resourceOwnerId: "EMP-1042",
    utilizationHrs: 24,
    billablePct: 0,
    nonBillablePct: 100,
    availableCapacityHrs: 16,
    planningAccuracy: 91,
    confirmationDiscipline: 94,
    prior: {
      planningAccuracy: 89,
      confirmationDiscipline: 92,
      utilizationHrs: 22,
      billablePct: 5,
      nonBillablePct: 95,
      availableCapacityHrs: 18,
    },
  }),
  row({
    id: "pr-10",
    employeeId: "EMP-0842",
    employeeName: "Rahul Verma",
    department: "Engineering",
    resourceOwnerId: "EMP-1042",
    employmentStatus: "inactive",
    utilizationHrs: 0,
    billablePct: 0,
    nonBillablePct: 0,
    availableCapacityHrs: 0,
    planningAccuracy: 72,
    confirmationDiscipline: 68,
    prior: {
      planningAccuracy: 75,
      confirmationDiscipline: 70,
      utilizationHrs: 4,
      billablePct: 50,
      nonBillablePct: 50,
      availableCapacityHrs: 36,
    },
  }),
];

const MONTH_ROWS: PerformanceRow[] = WEEK_ROWS.map((r) => ({
  ...r,
  id: r.id.replace("pr-", "pr-m-"),
  utilizationHrs: Math.round(r.utilizationHrs * 4.2),
  availableCapacityHrs:
    r.availableCapacityHrs != null ? Math.round(r.availableCapacityHrs * 4.2) : undefined,
  prior: r.prior
    ? {
        ...r.prior,
        utilizationHrs: r.prior.utilizationHrs != null ? Math.round(r.prior.utilizationHrs * 4.2) : undefined,
        availableCapacityHrs:
          r.prior.availableCapacityHrs != null
            ? Math.round(r.prior.availableCapacityHrs * 4.2)
            : undefined,
      }
    : undefined,
}));

function priorSnapshot(r: PerformanceRow): PerformanceRow["prior"] {
  return {
    planningAccuracy: r.planningAccuracy,
    confirmationDiscipline: r.confirmationDiscipline,
    utilizationHrs: r.utilizationHrs,
    billablePct: r.billablePct,
    nonBillablePct: r.nonBillablePct,
    availableCapacityHrs: r.availableCapacityHrs,
  };
}

function buildCustomMonthRows(monthId: string, monthIndex: number): PerformanceRow[] {
  const scale = 3.4 + monthIndex * 0.25;
  const metricShift = monthIndex - 2;

  return WEEK_ROWS.map((r) =>
    row({
      id: `pr-cm-${monthId}-${r.employeeId}`,
      employeeId: r.employeeId,
      employeeName: r.employeeName,
      department: r.department,
      resourceOwnerId: r.resourceOwnerId,
      employmentStatus: r.employmentStatus,
      leaveException: r.leaveException,
      planningAccuracy:
        r.leaveException || r.planningAccuracy == null
          ? undefined
          : Math.max(0, Math.min(100, r.planningAccuracy + metricShift)),
      confirmationDiscipline:
        r.leaveException || r.confirmationDiscipline == null
          ? undefined
          : Math.max(0, Math.min(100, r.confirmationDiscipline + metricShift)),
      utilizationHrs: r.leaveException ? 0 : Math.round(r.utilizationHrs * scale),
      billablePct: r.leaveException ? 0 : Math.max(0, Math.min(100, r.billablePct + metricShift)),
      nonBillablePct: r.leaveException ? 0 : Math.max(0, Math.min(100, r.nonBillablePct - metricShift)),
      availableCapacityHrs:
        r.leaveException || r.availableCapacityHrs == null
          ? undefined
          : Math.round(r.availableCapacityHrs * scale),
    })
  );
}

const PERFORMANCE_BY_CUSTOM_MONTH: Record<PerformanceCustomMonthId, PerformanceRow[]> =
  PERFORMANCE_CUSTOM_MONTHS.reduce(
    (acc, m, idx) => {
      acc[m.id] = buildCustomMonthRows(m.id, idx);
      return acc;
    },
    {} as Record<PerformanceCustomMonthId, PerformanceRow[]>
  );

for (let i = 1; i < PERFORMANCE_CUSTOM_MONTHS.length; i++) {
  const currId = PERFORMANCE_CUSTOM_MONTHS[i].id;
  const prevId = PERFORMANCE_CUSTOM_MONTHS[i - 1].id;
  PERFORMANCE_BY_CUSTOM_MONTH[currId] = PERFORMANCE_BY_CUSTOM_MONTH[currId].map((r) => {
    const prev = PERFORMANCE_BY_CUSTOM_MONTH[prevId].find((p) => p.employeeId === r.employeeId);
    return { ...r, prior: prev ? priorSnapshot(prev) : r.prior };
  });
}

const PRIOR_BY_CUSTOM_MONTH: Record<PerformanceCustomMonthId, PerformanceRow[]> =
  PERFORMANCE_CUSTOM_MONTHS.reduce(
    (acc, m, idx) => {
      if (idx === 0) {
        acc[m.id] = PERFORMANCE_BY_CUSTOM_MONTH[m.id].map((r) => ({
          ...r,
          id: `prior-${r.id}`,
          planningAccuracy: r.prior?.planningAccuracy,
          confirmationDiscipline: r.prior?.confirmationDiscipline,
          utilizationHrs: r.prior?.utilizationHrs ?? 0,
          billablePct: r.prior?.billablePct ?? 0,
          nonBillablePct: r.prior?.nonBillablePct ?? 0,
          availableCapacityHrs: r.prior?.availableCapacityHrs,
          prior: undefined,
        }));
      } else {
        const prevId = PERFORMANCE_CUSTOM_MONTHS[idx - 1].id;
        acc[m.id] = PERFORMANCE_BY_CUSTOM_MONTH[prevId].map((r) => ({
          ...r,
          id: `prior-${r.id}`,
          prior: undefined,
        }));
      }
      return acc;
    },
    {} as Record<PerformanceCustomMonthId, PerformanceRow[]>
  );

const PERFORMANCE_BY_PERIOD: Record<Exclude<PerformancePeriodId, "custom">, PerformanceRow[]> = {
  week: WEEK_ROWS,
  month: MONTH_ROWS,
};

const PRIOR_BY_PERIOD: Record<Exclude<PerformancePeriodId, "custom">, PerformanceRow[]> = {
  week: WEEK_ROWS.map((r) => ({
    ...r,
    id: `prior-${r.id}`,
    planningAccuracy: r.prior?.planningAccuracy,
    confirmationDiscipline: r.prior?.confirmationDiscipline,
    utilizationHrs: r.prior?.utilizationHrs ?? 0,
    billablePct: r.prior?.billablePct ?? 0,
    nonBillablePct: r.prior?.nonBillablePct ?? 0,
    availableCapacityHrs: r.prior?.availableCapacityHrs,
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
    availableCapacityHrs: r.prior?.availableCapacityHrs,
    prior: undefined,
  })),
};

const HISTORY_BY_EMPLOYEE: Record<string, PerformanceHistory> = {
  "EMP-1051": {
    employeeId: "EMP-1051",
    remainingCapacityHrs: 8,
    months: [
      { label: "Aug", planningAccuracy: 88, confirmationDiscipline: 94, utilizationHrs: 128, billablePct: 82 },
      { label: "Sep", planningAccuracy: 86, confirmationDiscipline: 91, utilizationHrs: 132, billablePct: 80 },
      { label: "Oct", planningAccuracy: 84, confirmationDiscipline: 88, utilizationHrs: 130, billablePct: 79 },
      { label: "Nov", planningAccuracy: 82, confirmationDiscipline: 85, utilizationHrs: 128, billablePct: 78 },
      { label: "Dec", planningAccuracy: 80, confirmationDiscipline: 80, utilizationHrs: 126, billablePct: 78 },
      { label: "Jan", planningAccuracy: 78, confirmationDiscipline: 72, utilizationHrs: 134, billablePct: 80 },
    ],
  },
  "EMP-1042": {
    employeeId: "EMP-1042",
    remainingCapacityHrs: 2,
    months: [
      { label: "Aug", planningAccuracy: 92, confirmationDiscipline: 94, utilizationHrs: 152, billablePct: 88 },
      { label: "Sep", planningAccuracy: 93, confirmationDiscipline: 95, utilizationHrs: 156, billablePct: 89 },
      { label: "Oct", planningAccuracy: 94, confirmationDiscipline: 96, utilizationHrs: 158, billablePct: 90 },
      { label: "Nov", planningAccuracy: 95, confirmationDiscipline: 97, utilizationHrs: 160, billablePct: 91 },
      { label: "Dec", planningAccuracy: 95, confirmationDiscipline: 97, utilizationHrs: 158, billablePct: 91 },
      { label: "Jan", planningAccuracy: 96, confirmationDiscipline: 98, utilizationHrs: 159, billablePct: 92 },
    ],
  },
};

function defaultHistory(employeeId: string, row: PerformanceRow): PerformanceHistory {
  const base = row.planningAccuracy ?? 85;
  const disc = row.confirmationDiscipline ?? 85;
  return {
    employeeId,
    remainingCapacityHrs: row.availableCapacityHrs,
    months: [
      { label: "Aug", planningAccuracy: base - 4, confirmationDiscipline: disc - 3, utilizationHrs: 120, billablePct: row.billablePct - 4 },
      { label: "Sep", planningAccuracy: base - 3, confirmationDiscipline: disc - 2, utilizationHrs: 124, billablePct: row.billablePct - 3 },
      { label: "Oct", planningAccuracy: base - 2, confirmationDiscipline: disc - 1, utilizationHrs: 126, billablePct: row.billablePct - 2 },
      { label: "Nov", planningAccuracy: base - 1, confirmationDiscipline: disc, utilizationHrs: 128, billablePct: row.billablePct - 1 },
      { label: "Dec", planningAccuracy: base, confirmationDiscipline: disc + 1, utilizationHrs: 130, billablePct: row.billablePct },
      { label: "Jan", planningAccuracy: base, confirmationDiscipline: disc, utilizationHrs: row.utilizationHrs * 4, billablePct: row.billablePct },
    ],
  };
}

export function getPerformanceRowsForPeriod(
  periodId: PerformancePeriodId,
  customMonthId: PerformanceCustomMonthId = DEFAULT_PERFORMANCE_CUSTOM_MONTH
): PerformanceRow[] {
  if (periodId === "custom") {
    return PERFORMANCE_BY_CUSTOM_MONTH[customMonthId] ?? PERFORMANCE_BY_CUSTOM_MONTH[DEFAULT_PERFORMANCE_CUSTOM_MONTH];
  }
  return PERFORMANCE_BY_PERIOD[periodId];
}

export function getPriorPeriodRows(
  periodId: PerformancePeriodId,
  customMonthId: PerformanceCustomMonthId = DEFAULT_PERFORMANCE_CUSTOM_MONTH
): PerformanceRow[] {
  if (periodId === "custom") {
    return PRIOR_BY_CUSTOM_MONTH[customMonthId] ?? PRIOR_BY_CUSTOM_MONTH[DEFAULT_PERFORMANCE_CUSTOM_MONTH];
  }
  return PRIOR_BY_PERIOD[periodId];
}

export function getPerformancePeriodLabel(
  periodId: PerformancePeriodId,
  customMonthId: PerformanceCustomMonthId = DEFAULT_PERFORMANCE_CUSTOM_MONTH
): string {
  if (periodId === "custom") {
    const month = PERFORMANCE_CUSTOM_MONTHS.find((m) => m.id === customMonthId);
    return month ? month.rangeLabel : "Custom range";
  }
  if (periodId === "week") return PERFORMANCE_PERIODS[0].label;
  return PERFORMANCE_PERIODS[1].label;
}

export function getCompareLabel(periodId: PerformancePeriodId): string {
  return periodId === "week" ? "vs Prior Week" : "vs Last Month";
}

export function performanceDepartments(rows: PerformanceRow[]) {
  return [...new Set(rows.map((r) => r.department))].sort();
}

export function performanceResourceOwners(rows: PerformanceRow[]) {
  const map = new Map<string, string>();
  for (const r of rows) {
    map.set(r.resourceOwnerId, r.resourceOwnerName);
  }
  return [...map.entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function performanceSkills(rows: PerformanceRow[]) {
  return [...new Set(rows.map((r) => r.primarySkill))].sort();
}

export function filterPerformanceRows(rows: PerformanceRow[], filters: PerformanceFilters) {
  return rows.filter((r) => {
    if (
      !matchesSearchQuery(
        filters.search,
        r.employeeName,
        r.employeeId,
        r.department,
        r.resourceOwnerName,
        r.primarySkill,
        r.employmentStatus,
        r.planningAccuracy,
        r.confirmationDiscipline,
        r.utilizationHrs,
        r.billablePct,
        r.nonBillablePct,
        r.availableCapacityHrs
      )
    ) {
      return false;
    }
    if (filters.departments.length > 0 && !filters.departments.includes(r.department)) return false;
    if (
      filters.resourceOwners.length > 0 &&
      !filters.resourceOwners.includes(r.resourceOwnerName)
    ) {
      return false;
    }
    if (filters.skills.length > 0 && !filters.skills.includes(r.primarySkill)) return false;
    if (
      filters.employmentStatuses.length > 0 &&
      !filters.employmentStatuses.includes(r.employmentStatus)
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

export function computePerformanceSummary(
  rows: PerformanceRow[],
  priorRows?: PerformanceRow[]
): PerformanceSummary {
  const accuracyRows = rows.filter((r) => !r.leaveException && r.planningAccuracy != null);
  const disciplineRows = rows.filter((r) => !r.leaveException && r.confirmationDiscipline != null);
  const billableRows = rows.filter((r) => !r.leaveException);
  const capacityRows = rows.filter((r) => !r.leaveException && r.availableCapacityHrs != null);

  const summary: PerformanceSummary = {
    employeeCount: rows.length,
    avgPlanningAccuracy: avgDefined(accuracyRows.map((r) => r.planningAccuracy)),
    avgConfirmationDiscipline: avgDefined(disciplineRows.map((r) => r.confirmationDiscipline)),
    totalUtilizationHrs: rows.reduce((s, r) => s + r.utilizationHrs, 0),
    avgBillablePct: avgDefined(billableRows.map((r) => r.billablePct)),
    totalAvailableCapacityHrs: capacityRows.length
      ? capacityRows.reduce((s, r) => s + (r.availableCapacityHrs ?? 0), 0)
      : null,
  };

  if (priorRows) {
    summary.prior = computePerformanceSummary(priorRows);
  }

  return summary;
}

export function sortPerformanceRows(
  rows: PerformanceRow[],
  sortKey: PerformanceSortKey,
  sortDir: "asc" | "desc"
) {
  if (sortKey === "employee" && rows.length > 0) {
    const mul = sortDir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => mul * a.employeeName.localeCompare(b.employeeName));
  }

  const mul = sortDir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    switch (sortKey) {
      case "employee":
        return mul * a.employeeName.localeCompare(b.employeeName);
      case "planningAccuracy": {
        const av = a.leaveException || a.planningAccuracy == null ? -1 : a.planningAccuracy;
        const bv = b.leaveException || b.planningAccuracy == null ? -1 : b.planningAccuracy;
        return mul * (av - bv);
      }
      case "confirmationDiscipline": {
        const av = a.leaveException || a.confirmationDiscipline == null ? -1 : a.confirmationDiscipline;
        const bv = b.leaveException || b.confirmationDiscipline == null ? -1 : b.confirmationDiscipline;
        return mul * (av - bv);
      }
      case "utilizationHrs":
        return mul * (a.utilizationHrs - b.utilizationHrs);
      case "billablePct":
        return mul * (a.billablePct - b.billablePct);
      case "nonBillablePct":
        return mul * (a.nonBillablePct - b.nonBillablePct);
      case "availableCapacityHrs": {
        const av = a.availableCapacityHrs ?? -1;
        const bv = b.availableCapacityHrs ?? -1;
        return mul * (av - bv);
      }
      default:
        return 0;
    }
  });
}

export function getPerformanceHistory(employeeId: string): PerformanceHistory | null {
  if (HISTORY_BY_EMPLOYEE[employeeId]) {
    return HISTORY_BY_EMPLOYEE[employeeId];
  }
  const row = WEEK_ROWS.find((r) => r.employeeId === employeeId);
  if (!row) return null;
  return defaultHistory(employeeId, row);
}

export function findPerformanceRow(
  employeeId: string,
  periodId: PerformancePeriodId,
  customMonthId: PerformanceCustomMonthId = DEFAULT_PERFORMANCE_CUSTOM_MONTH
): PerformanceRow | undefined {
  return getPerformanceRowsForPeriod(periodId, customMonthId).find((r) => r.employeeId === employeeId);
}
