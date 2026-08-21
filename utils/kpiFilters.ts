import type { AssessmentCycle } from "../api/domain";
import type { Employee } from "../data/employees";
import { withoutAdministratorEmployees } from "./reportVisibility";
import { getVisibleEmployees } from "./employeeHierarchy";

/** Allowed calendar years on KPI Framework / KPI Results. */
export const KPI_CALENDAR_YEARS = [2026, 2027] as const;

export type KpiCalendarYear = (typeof KPI_CALENDAR_YEARS)[number];

export const KPI_CYCLE_OPTIONS: { value: AssessmentCycle; label: string }[] = [
  { value: "Q1", label: "Quarter 1" },
  { value: "Q2", label: "Quarter 2" },
  { value: "Q3", label: "Quarter 3" },
  { value: "Q4", label: "Quarter 4" },
];

/** KPI Results cycle filter: All = full calendar year (no quarter filter). */
export const KPI_RESULTS_CYCLE_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "All" },
  ...KPI_CYCLE_OPTIONS,
];

/** Assessment cycle for a 1-based calendar month (Q3 through September). */
export function assessmentCycleForMonth(month1to12: number): AssessmentCycle {
  if (month1to12 <= 3) return "Q1";
  if (month1to12 <= 6) return "Q2";
  if (month1to12 <= 9) return "Q3";
  return "Q4";
}

export function defaultAssessmentCycle(now = new Date()): AssessmentCycle {
  return assessmentCycleForMonth(now.getMonth() + 1);
}

/** Prefer current year when it is in the allowed list; otherwise nearest allowed year. */
export function defaultKpiCalendarYear(now = new Date()): KpiCalendarYear {
  const y = now.getFullYear();
  if (y <= 2026) return 2026;
  if (y >= 2027) return 2027;
  return 2026;
}

/** RO pages: self + direct + indirect, never Administrator. Super-admin: all active minus Administrator. */
export function scopeKpiResourceEmployees(
  employees: Employee[],
  viewer: Employee | null,
  isSuperAdmin: boolean
): Employee[] {
  const scoped = isSuperAdmin
    ? employees.filter((e) => e.status === "active")
    : viewer
      ? getVisibleEmployees(viewer, employees, { isSuperAdmin: false })
      : [];
  return withoutAdministratorEmployees(scoped);
}

/** True when the resource is an immediate (direct) report of the RO. */
export function isKpiDirectReport(
  ownerHrmsId: string | null | undefined,
  resourceHrmsId: string | null | undefined,
  employees: Employee[]
): boolean {
  if (!ownerHrmsId || !resourceHrmsId) return false;
  const emp = employees.find((e) => e.id === resourceHrmsId);
  return Boolean(emp && emp.resourceOwnerId === ownerHrmsId);
}
