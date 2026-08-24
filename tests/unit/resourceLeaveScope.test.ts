import { describe, expect, it } from "vitest";
import {
  isLeaveDateAllowed,
  scopeLeaveMutateEmployees,
  scopeLeaveViewEmployees,
  todayIsoLocal,
} from "../../utils/resourceLeaveScope";
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
];

describe("scopeLeaveViewEmployees", () => {
  it("super-admin sees all active except Administrator", () => {
    const ids = scopeLeaveViewEmployees(employees, null, true).map((e) => e.id).sort();
    expect(ids).toEqual(["EMP-D1", "EMP-I1", "EMP-OTHER", "EMP-RO"]);
  });

  it("RO sees self plus direct and indirect reports", () => {
    const ro = employees.find((e) => e.id === "EMP-RO")!;
    const ids = scopeLeaveViewEmployees(employees, ro, false).map((e) => e.id).sort();
    expect(ids).toEqual(["EMP-D1", "EMP-I1", "EMP-RO"]);
  });
});

describe("scopeLeaveMutateEmployees", () => {
  it("super-admin can mutate all active except self and Administrator", () => {
    const admin = employees.find((e) => e.id === "EMP-0001")!;
    const ids = scopeLeaveMutateEmployees(employees, admin, true).map((e) => e.id).sort();
    expect(ids).toEqual(["EMP-D1", "EMP-I1", "EMP-OTHER", "EMP-RO"]);
  });

  it("RO can mutate reportees only (not self)", () => {
    const ro = employees.find((e) => e.id === "EMP-RO")!;
    const ids = scopeLeaveMutateEmployees(employees, ro, false).map((e) => e.id).sort();
    expect(ids).toEqual(["EMP-D1", "EMP-I1"]);
  });

  it("individual contributor cannot mutate anyone", () => {
    const other = employees.find((e) => e.id === "EMP-OTHER")!;
    expect(scopeLeaveMutateEmployees(employees, other, false)).toEqual([]);
  });
});

describe("isLeaveDateAllowed", () => {
  it("allows today and future dates", () => {
    const today = todayIsoLocal();
    expect(isLeaveDateAllowed(today, today)).toBe(true);
    expect(isLeaveDateAllowed("2099-12-31", today)).toBe(true);
  });

  it("blocks past dates", () => {
    expect(isLeaveDateAllowed("2020-01-01", "2026-08-24")).toBe(false);
  });
});
