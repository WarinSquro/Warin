import type { AssessmentCycle, KpiRowStatus } from "@prisma/client";

export const CYCLE_MONTHS: Record<AssessmentCycle, number[]> = {
  Q1: [1, 2, 3],
  Q2: [4, 5, 6],
  Q3: [7, 8, 9],
  Q4: [10, 11, 12],
};

export function cycleEndDate(year: number, cycle: AssessmentCycle): Date {
  const endMonth = CYCLE_MONTHS[cycle][2]!; // 1-based month
  // Last day of quarter, end of day UTC
  return new Date(Date.UTC(year, endMonth, 0, 23, 59, 59, 999));
}

export function isCycleExpired(year: number, cycle: AssessmentCycle, now = new Date()): boolean {
  return now.getTime() > cycleEndDate(year, cycle).getTime();
}

export function validatePeriodMonths(
  cycle: AssessmentCycle,
  startMonth: number,
  endMonth: number
): string | null {
  const allowed = CYCLE_MONTHS[cycle];
  if (!allowed.includes(startMonth) || !allowed.includes(endMonth)) {
    return `Period months must fall within ${cycle}`;
  }
  if (startMonth > endMonth) return "Period start month must be <= end month";
  return null;
}

export function monthsLabel(startMonth: number, endMonth: number, year: number): string {
  const names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  if (startMonth === endMonth) return `${names[startMonth - 1]} ${year}`;
  return `${names[startMonth - 1]} – ${names[endMonth - 1]} ${year}`;
}

export function statusLabel(s: KpiRowStatus): string {
  if (s === "draft") return "Draft";
  if (s === "pending_result") return "Pending Result";
  return "Completed";
}

export function parseCycle(v: string | undefined): AssessmentCycle | null {
  if (v === "Q1" || v === "Q2" || v === "Q3" || v === "Q4") return v;
  return null;
}
