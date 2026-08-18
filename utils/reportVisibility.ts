import type { ApiAllocation, ApiConfirmation } from "../api/domain";
import type { Employee } from "../data/employees";
import { getVisibleEmployeeIds, getVisibleEmployees } from "./employeeHierarchy";

/** Employees the viewer may see on employee-scoped reports (superadmin = all active). */
export function scopeEmployeesForViewer(
  employees: Employee[],
  viewer: Employee | null,
  isSuperAdmin: boolean
): Employee[] {
  if (isSuperAdmin) {
    return employees.filter((e) => e.status === "active");
  }
  if (!viewer) return [];
  return getVisibleEmployees(viewer, employees, { isSuperAdmin: false });
}

/** System Administrator is not a resource on operational reports. */
export function withoutAdministratorEmployees(employees: Employee[]): Employee[] {
  return employees.filter(
    (e) =>
      !e.isSuperAdmin &&
      e.id !== "EMP-0001" &&
      e.name.trim().toLowerCase() !== "administrator"
  );
}

/** Visible HRMS ids (self + recursive subordinates), or null when superadmin (no filter). */
export function visibleEmployeeIdSet(
  employees: Employee[],
  viewer: Employee | null,
  isSuperAdmin: boolean
): Set<string> | null {
  if (isSuperAdmin) return null;
  if (!viewer) return new Set();
  return getVisibleEmployeeIds(viewer.id, employees);
}

export function scopeAllocationsForViewer(
  allocations: ApiAllocation[],
  visibleIds: Set<string> | null
): ApiAllocation[] {
  if (visibleIds == null) return allocations;
  return allocations.filter((a) => visibleIds.has(a.employeeHrmsId));
}

export function scopeConfirmationsForViewer(
  confirmations: ApiConfirmation[],
  visibleIds: Set<string> | null
): ApiConfirmation[] {
  if (visibleIds == null) return confirmations;
  return confirmations.filter((c) => visibleIds.has(c.employeeHrmsId));
}
