import { describe, expect, it } from "vitest";
import type { Employee } from "../../data/employees";
import { withoutAdministratorEmployees } from "../../utils/reportVisibility";

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
