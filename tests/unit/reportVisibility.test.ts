import { describe, expect, it } from "vitest";
import type { Employee } from "../../data/employees";
import {
  scopeReportHierarchyEmployees,
  withoutAdministratorEmployees,
} from "../../utils/reportVisibility";

const emp = (
  partial: Partial<Employee> & Pick<Employee, "id" | "name">
): Employee => ({
  email: `${partial.id}@acme.io`,
  department: "Engineering",
  skills: ["React"],
  status: "active",
  ...partial,
});

describe("withoutAdministratorEmployees", () => {
  it("drops the system Administrator so they are not on operational reports", () => {
    const kept = withoutAdministratorEmployees([
      emp({ id: "EMP-0001", name: "Administrator", isSuperAdmin: true }),
      emp({ id: "111", name: "Digant Shah" }),
    ]);
    expect(kept.map((e) => e.id)).toEqual(["111"]);
  });
});

describe("scopeReportHierarchyEmployees", () => {
  const admin = emp({ id: "EMP-0001", name: "Administrator", isSuperAdmin: true });
  const digant = emp({ id: "111", name: "Digant Shah", resourceOwnerId: "EMP-0001" });
  const gaurav = emp({ id: "113", name: "Gaurav Pithwa", resourceOwnerId: "111" });
  const denish = emp({ id: "EMP001", name: "Denish Khant", resourceOwnerId: "111" });
  const chandan = emp({ id: "EM-1", name: "Chandan Kushwaha", resourceOwnerId: "EMP001" });
  const outsider = emp({ id: "999", name: "Outsider", resourceOwnerId: "OTHER" });
  const inactiveReport = emp({
    id: "INACTIVE",
    name: "Former Report",
    resourceOwnerId: "111",
    status: "inactive",
  });
  const roster = [admin, digant, gaurav, denish, chandan, outsider, inactiveReport];

  it("for Digant includes self, direct reports, and indirect reports (with inactive)", () => {
    const scoped = scopeReportHierarchyEmployees(roster, digant, false);
    expect(scoped.map((e) => e.id).sort()).toEqual(
      ["111", "113", "EM-1", "EMP001", "INACTIVE"].sort()
    );
    expect(scoped.map((e) => e.name)).not.toContain("Outsider");
    expect(scoped.map((e) => e.name)).not.toContain("Administrator");
  });

  it("for Digant does not stop at direct reports only", () => {
    const scoped = scopeReportHierarchyEmployees(roster, digant, false);
    expect(scoped.some((e) => e.id === "EM-1")).toBe(true);
  });
});
