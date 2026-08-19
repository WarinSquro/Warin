import { describe, expect, it } from "vitest";
import {
  canManageAllocation,
  isDirectResourceOwner,
} from "../../utils/allocationPermission";
import type { Employee } from "../../data/employees";

const employees: Employee[] = [
  { id: "RO", name: "Digant", email: "d@x.io", department: "Eng", skills: [], status: "active" },
  {
    id: "R1",
    name: "Denish",
    email: "n@x.io",
    department: "Eng",
    skills: [],
    status: "active",
    resourceOwnerId: "RO",
  },
  {
    id: "R2",
    name: "Chandan",
    email: "c@x.io",
    department: "Eng",
    skills: [],
    status: "active",
    resourceOwnerId: "R1",
  },
];

describe("isDirectResourceOwner", () => {
  it("is true for immediate reports only", () => {
    expect(isDirectResourceOwner("RO", "R1", employees)).toBe(true);
    expect(isDirectResourceOwner("RO", "R2", employees)).toBe(false);
    expect(isDirectResourceOwner("R1", "R2", employees)).toBe(true);
  });
});

describe("canManageAllocation", () => {
  it("allows direct RO and super-admin, blocks self and indirect RO", () => {
    expect(canManageAllocation("RO", "R1", employees)).toBe(true);
    expect(canManageAllocation("RO", "R2", employees)).toBe(false);
    expect(canManageAllocation("R1", "R2", employees)).toBe(true);
    expect(canManageAllocation("R1", "R1", employees)).toBe(false);
    expect(canManageAllocation("RO", "RO", employees)).toBe(false);
    expect(canManageAllocation("OTHER", "R1", employees)).toBe(false);
    expect(canManageAllocation("OTHER", "R1", employees, { isSuperAdmin: true })).toBe(true);
  });
});
