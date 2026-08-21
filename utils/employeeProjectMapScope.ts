import type { Employee } from "../data/employees";
import { getSubordinateIds } from "./employeeHierarchy";
import { withoutAdministratorEmployees } from "./reportVisibility";

/**
 * Employees eligible for Map Employees utility:
 * - Super Admin: all active minus Administrator
 * - RO (with projects permission assumed by caller): direct + indirect reports only (not self)
 * - Otherwise: empty
 */
export function scopeMapEmployees(
  employees: Employee[],
  viewer: Employee | null,
  isSuperAdmin: boolean
): Employee[] {
  const active = employees.filter((e) => e.status === "active");
  if (isSuperAdmin) {
    return withoutAdministratorEmployees(active);
  }
  if (!viewer) return [];
  const subIds = new Set(getSubordinateIds(viewer.id, employees));
  if (subIds.size === 0) return [];
  return withoutAdministratorEmployees(active.filter((e) => subIds.has(e.id)));
}
