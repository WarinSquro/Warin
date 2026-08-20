import type { ApiAllocation } from "../api/domain";
import { buildUtilRowsFromEmployees, addDaysISO } from "../api/liveViews";
import type { Employee } from "../data/employees";
import { dayCapacityHours } from "../data/planner";
import { monthBoundsFromId, monthIdFromDate } from "./reportPeriods";

export type UtilizationCalendar = {
  workingDays: string[];
  companyOffDays: string[];
  workingHoursPerDay: number;
};

/** Billable capacity hours for a calendar range (matches Utilization report). */
export function utilizationPeriodCapacity(
  from: string,
  to: string,
  calendar: UtilizationCalendar
): number {
  let hours = 0;
  for (let d = from; d <= to; d = addDaysISO(d, 1)) {
    hours += dayCapacityHours(d, {
      workingDays: calendar.workingDays,
      companyOffDays: calendar.companyOffDays,
      workingHoursPerDay: calendar.workingHoursPerDay,
    });
  }
  return Math.round(hours * 10) / 10 || 40;
}

/** Current calendar month bounds — same window as the Utilization screen default. */
export function currentUtilizationMonthBounds(): { from: string; to: string } {
  return monthBoundsFromId(monthIdFromDate());
}

/** Live utilization % per active employee for band-impact preview (no mock rows). */
export function buildUtilizationPctsForBandImpact(
  employees: Employee[],
  allocations: ApiAllocation[],
  calendar: UtilizationCalendar & { rangeFrom: string; rangeTo: string }
): number[] {
  const periodCapacity = utilizationPeriodCapacity(calendar.rangeFrom, calendar.rangeTo, calendar);
  const rows = buildUtilRowsFromEmployees(
    employees,
    periodCapacity,
    allocations,
    calendar.companyOffDays,
    calendar.rangeFrom,
    calendar.rangeTo,
    calendar.workingDays
  );
  return rows.map((r) => r.pct);
}
