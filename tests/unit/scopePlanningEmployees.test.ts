import { describe, expect, it } from "vitest";
import { scopePlanningEmployees, type Employee } from "../../data/employees";

const emp = (
  partial: Partial<Employee> & Pick<Employee, "id" | "name">
): Employee => ({
  email: `${partial.id}@acme.io`,
  department: "Engineering",
  skills: ["React"],
  status: "active",
  ...partial,
});

describe("scopePlanningEmployees", () => {
  const owner = emp({ id: "EMP-RO", name: "Owner" });
  const report = emp({ id: "EMP-R1", name: "Report", resourceOwnerId: "EMP-RO" });
  const other = emp({ id: "EMP-X", name: "Other", resourceOwnerId: "EMP-ELSE" });

  it("includes the logged-in Resource Owner plus immediate reports", () => {
    const scoped = scopePlanningEmployees([owner, report, other], {
      ownerHrmsId: "EMP-RO",
      isSuperAdmin: false,
    });
    expect(scoped.map((e) => e.id)).toEqual(["EMP-RO", "EMP-R1"]);
  });

  it("still returns the owner when they have no reports", () => {
    const scoped = scopePlanningEmployees([owner, other], {
      ownerHrmsId: "EMP-RO",
      isSuperAdmin: false,
    });
    expect(scoped.map((e) => e.id)).toEqual(["EMP-RO"]);
  });
});
