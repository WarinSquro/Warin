import type { PerformanceRow } from "../data/performanceReport";
import type { ProjectHealth } from "../data/executionReport";
import type { DeptHealthRow } from "../data/cockpit";
import type { Employee } from "../data/employees";

function avgDefined(values: (number | null | undefined)[]): number | null {
  const nums = values.filter((v): v is number => v != null && !Number.isNaN(v));
  if (nums.length === 0) return null;
  return Math.round(nums.reduce((a, b) => a + b, 0) / nums.length);
}

/** Utilization component of health: penalize overload and deep idle. */
function utilHealthScore(utilPct: number): number {
  if (utilPct > 100) return Math.max(0, Math.round(100 - (utilPct - 100) * 1.5));
  if (utilPct < 65) return Math.round((utilPct / 65) * 75);
  return Math.round(85 + ((utilPct - 65) / 35) * 15);
}

/**
 * ECP-017 — departments ranked by operational health from live Performance metrics
 * (confirmation discipline, planning accuracy, utilization vs capacity).
 */
export function buildDepartmentHealthFromLive(
  deptNames: string[],
  employees: Employee[],
  perfRows: PerformanceRow[],
  weekCapacityHours: number
): DeptHealthRow[] {
  const rowsInDept = new Map<string, PerformanceRow[]>();
  for (const name of deptNames) rowsInDept.set(name, []);
  for (const r of perfRows) {
    if (r.leaveException) continue;
    const list = rowsInDept.get(r.department);
    if (list) list.push(r);
  }

  const rows: DeptHealthRow[] = deptNames.map((department) => {
    const people = employees.filter((e) => e.department === department && e.status === "active");
    const deptPerf = rowsInDept.get(department) ?? [];
    const bookedHours =
      Math.round(deptPerf.reduce((s, r) => s + (r.utilizationHrs ?? 0), 0) * 10) / 10;
    const capacityHours = people.length * weekCapacityHours;
    const peopleBooked = deptPerf.filter((r) => (r.utilizationHrs ?? 0) > 0).length;
    const peopleFree = Math.max(0, people.length - peopleBooked);

    const discipline = avgDefined(deptPerf.map((r) => r.confirmationDiscipline));
    const accuracy = avgDefined(deptPerf.map((r) => r.planningAccuracy));
    const billablePct = avgDefined(deptPerf.map((r) => r.billablePct)) ?? 0;
    const utilPct = capacityHours > 0 ? Math.round((bookedHours / capacityHours) * 100) : 0;

    const parts: number[] = [];
    if (discipline != null) parts.push(discipline);
    if (accuracy != null) parts.push(accuracy);
    if (deptPerf.length > 0 || people.length > 0) parts.push(utilHealthScore(utilPct));

    const score =
      parts.length > 0
        ? Math.round(parts.reduce((a, b) => a + b, 0) / parts.length)
        : people.length === 0
          ? 0
          : 50;

    let health: ProjectHealth = "green";
    if (score < 70) health = "red";
    else if (score < 80) health = "amber";

    let detail = "On target";
    if (people.length === 0) detail = "No people in department";
    else if (deptPerf.length === 0) detail = "No operational data this week";
    else if (health === "red") {
      detail =
        discipline != null && discipline < 70
          ? "Low confirmation discipline"
          : accuracy != null && accuracy < 70
            ? "Low planning accuracy"
            : "Operational risk";
    } else if (health === "amber") {
      detail =
        utilPct > 100 ? "Overload" : utilPct < 65 ? "Under-utilized" : "Watch metrics";
    } else if (utilPct >= 95) {
      detail = "Near capacity";
    }

    return {
      department,
      health,
      score,
      detail,
      peopleBooked,
      peopleFree,
      billablePct,
      nonBillablePct: Math.max(0, 100 - billablePct),
      bookedHours,
      capacityHours,
    };
  });

  return rows.sort(
    (a, b) => b.score - a.score || a.department.localeCompare(b.department)
  );
}
