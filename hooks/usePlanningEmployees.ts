import { useMemo } from "react";
import { useAuth } from "../context/AuthContext";
import { useEmployees } from "../context/EmployeesContext";
import { scopePlanningEmployees, type Employee } from "../data/employees";

/**
 * Employees visible on Planning screens (Planner, Availability, Utilization,
 * Planning Conflicts): immediate Resource Owner reports, or all for super-admin.
 */
export function usePlanningEmployees(): {
  employees: Employee[];
  allEmployees: Employee[];
  isSuperAdmin: boolean;
  ownerHrmsId: string | undefined;
} {
  const { employees: allEmployees } = useEmployees();
  const { currentEmployee, isSuperAdmin } = useAuth();
  const ownerHrmsId = currentEmployee?.id;

  const employees = useMemo(
    () =>
      scopePlanningEmployees(allEmployees, {
        ownerHrmsId,
        isSuperAdmin,
      }),
    [allEmployees, ownerHrmsId, isSuperAdmin]
  );

  return { employees, allEmployees, isSuperAdmin, ownerHrmsId };
}
