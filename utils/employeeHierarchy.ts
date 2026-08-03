import type { Employee } from "../data/employees";
import { EMPLOYEES, resourceOwnerName } from "../data/employees";

/** Direct reports: employees whose resourceOwnerId equals managerId. */
export function getDirectReportIds(managerId: string, employees: Employee[] = EMPLOYEES): string[] {
  return employees.filter((e) => e.resourceOwnerId === managerId).map((e) => e.id);
}

/** All subordinates (direct + indirect), recursive. */
export function getSubordinateIds(employeeId: string, employees: Employee[] = EMPLOYEES): string[] {
  const result: string[] = [];
  const queue = getDirectReportIds(employeeId, employees);
  while (queue.length > 0) {
    const id = queue.shift()!;
    if (result.includes(id)) continue;
    result.push(id);
    queue.push(...getDirectReportIds(id, employees));
  }
  return result;
}

export function getDataReachSummary(
  employeeId: string,
  employees: Employee[] = EMPLOYEES
): { ownName: string; direct: Employee[]; indirect: Employee[] } {
  const self = employees.find((e) => e.id === employeeId);
  const ownName = self?.name ?? "Unknown";
  const allSubs = getSubordinateIds(employeeId, employees);
  const direct = employees.filter((e) => e.resourceOwnerId === employeeId);
  const directIds = new Set(direct.map((e) => e.id));
  const indirect = employees.filter((e) => allSubs.includes(e.id) && !directIds.has(e.id));
  return { ownName, direct, indirect };
}

export function formatDataReachSummary(employeeId: string, employees: Employee[] = EMPLOYEES): string {
  const { ownName, direct, indirect } = getDataReachSummary(employeeId, employees);
  const parts = [`Own data (${ownName})`];
  if (direct.length > 0) {
    parts.push(`${direct.length} direct report${direct.length === 1 ? "" : "s"}`);
  }
  if (indirect.length > 0) {
    parts.push(`${indirect.length} indirect report${indirect.length === 1 ? "" : "s"}`);
  }
  if (direct.length === 0 && indirect.length === 0) {
    parts.push("no subordinates in hierarchy");
  }
  return parts.join(" · ");
}

export function getResourceOwnerDisplay(ownerId: string | undefined, employees: Employee[] = EMPLOYEES): string {
  return resourceOwnerName(ownerId, employees);
}

/** Self + all subordinates visible to a viewer. */
export function getVisibleEmployeeIds(
  viewerId: string,
  employees: Employee[] = EMPLOYEES
): Set<string> {
  return new Set([viewerId, ...getSubordinateIds(viewerId, employees)]);
}

export function getVisibleEmployees(
  viewer: Employee,
  employees: Employee[] = EMPLOYEES,
  opts?: { isSuperAdmin?: boolean; includeInactive?: boolean }
): Employee[] {
  if (opts?.isSuperAdmin) {
    return employees.filter((e) => opts.includeInactive || e.status === "active");
  }
  const visibleIds = getVisibleEmployeeIds(viewer.id, employees);
  return employees.filter(
    (e) => visibleIds.has(e.id) && (opts?.includeInactive || e.status === "active")
  );
}
