import { describe, expect, it } from "vitest";
import { scopeMapEmployees } from "../../utils/employeeProjectMapScope";
import type { Employee } from "../../data/employees";

const employees: Employee[] = [
  {
    id: "EMP-0001",
    name: "Administrator",
    email: "admin@acme.io",
    department: "Engineering",
    skills: [],
    status: "active",
    isSuperAdmin: true,
  },
  {
    id: "EMP-RO",
    name: "Resource Owner",
    email: "ro@acme.io",
    department: "Engineering",
    skills: [],
    status: "active",
  },
  {
    id: "EMP-D1",
    name: "Direct One",
    email: "d1@acme.io",
    department: "QA",
    skills: [],
    status: "active",
    resourceOwnerId: "EMP-RO",
  },
  {
    id: "EMP-I1",
    name: "Indirect One",
    email: "i1@acme.io",
    department: "QA",
    skills: [],
    status: "active",
    resourceOwnerId: "EMP-D1",
  },
  {
    id: "EMP-OTHER",
    name: "Outside",
    email: "o@acme.io",
    department: "Support",
    skills: [],
    status: "active",
  },
  {
    id: "EMP-INACTIVE",
    name: "Inactive",
    email: "x@acme.io",
    department: "Support",
    skills: [],
    status: "inactive",
    resourceOwnerId: "EMP-RO",
  },
];

describe("scopeMapEmployees", () => {
  it("super-admin sees all active except Administrator", () => {
    const ids = scopeMapEmployees(employees, null, true).map((e) => e.id).sort();
    expect(ids).toEqual(["EMP-D1", "EMP-I1", "EMP-OTHER", "EMP-RO"]);
  });

  it("RO sees direct and indirect reports only (not self)", () => {
    const ro = employees.find((e) => e.id === "EMP-RO")!;
    const ids = scopeMapEmployees(employees, ro, false).map((e) => e.id).sort();
    expect(ids).toEqual(["EMP-D1", "EMP-I1"]);
  });

  it("non-RO non-admin sees nobody", () => {
    const other = employees.find((e) => e.id === "EMP-OTHER")!;
    expect(scopeMapEmployees(employees, other, false)).toEqual([]);
  });
});
