import type { Employee } from "../data/employees";
import { getSubordinateIds } from "./employeeHierarchy";
import { scopeEmployeesForViewer, withoutAdministratorEmployees } from "./reportVisibility";

/** View: self + direct + indirect. Super-admin: all active minus Administrator. */
export function scopeLeaveViewEmployees(
  employees: Employee[],
  viewer: Employee | null,
  isSuperAdmin: boolean
): Employee[] {
  return withoutAdministratorEmployees(
    scopeEmployeesForViewer(employees, viewer, isSuperAdmin, { includeInactive: false })
  );
}

/** Mutate: direct + indirect reportees only (never self). */
export function scopeLeaveMutateEmployees(
  employees: Employee[],
  viewer: Employee | null,
  isSuperAdmin: boolean
): Employee[] {
  const active = employees.filter((e) => e.status === "active");
  if (isSuperAdmin) {
    if (!viewer) return withoutAdministratorEmployees(active);
    return withoutAdministratorEmployees(active.filter((e) => e.id !== viewer.id));
  }
  if (!viewer) return [];
  const subIds = new Set(getSubordinateIds(viewer.id, employees));
  if (subIds.size === 0) return [];
  return withoutAdministratorEmployees(active.filter((e) => subIds.has(e.id)));
}

export function todayIsoLocal(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function isLeaveDateAllowed(iso: string, today = todayIsoLocal()): boolean {
  return iso.slice(0, 10) >= today.slice(0, 10);
}
