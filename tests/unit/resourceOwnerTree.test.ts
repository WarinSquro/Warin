import { describe, expect, it } from "vitest";
import { descendantEmployeeIds } from "../../apps/oneview-api/src/api/auth/resource-owner-tree";
import { getSubordinateIds } from "../../utils/employeeHierarchy";
import type { Employee } from "../../data/employees";

/** Live-style tree: Administrator → Digant → 6 reports (Denish → Chandan, Sajan). */
const TREE = [
  { id: "1", resourceOwnerId: null, name: "Administrator" },
  { id: "2", resourceOwnerId: "1", name: "Digant Shah" },
  { id: "14", resourceOwnerId: "1", name: "Manya sharma" },
  { id: "25", resourceOwnerId: "1", name: "Nirali Prajapati" },
  { id: "28", resourceOwnerId: "2", name: "Bhavik Kotadiya" },
  { id: "36", resourceOwnerId: "2", name: "Denish Khant" },
  { id: "4", resourceOwnerId: "2", name: "Gaurav Pithwa" },
  { id: "18", resourceOwnerId: "2", name: "Hiren Bhadarka" },
  { id: "12", resourceOwnerId: "2", name: "Kaushal Shah" },
  { id: "13", resourceOwnerId: "2", name: "Kushal Naiyar" },
  { id: "32", resourceOwnerId: "36", name: "Chandan Kushwaha" },
  { id: "30", resourceOwnerId: "36", name: "Sajan Mewada" },
] as const;

describe("descendantEmployeeIds (Resource Owner tree)", () => {
  it("includes Digant, Digant's six reports, and Denish's reports under Administrator", () => {
    const ids = descendantEmployeeIds("1", [...TREE]);
    const names = TREE.filter((e) => ids.includes(e.id)).map((e) => e.name);
    expect(names).toEqual(
      expect.arrayContaining([
        "Digant Shah",
        "Bhavik Kotadiya",
        "Denish Khant",
        "Gaurav Pithwa",
        "Hiren Bhadarka",
        "Kaushal Shah",
        "Kushal Naiyar",
        "Chandan Kushwaha",
        "Sajan Mewada",
        "Manya sharma",
        "Nirali Prajapati",
      ])
    );
    expect(names).not.toContain("Administrator");
    expect(ids).toHaveLength(11);
  });

  it("for Digant includes his six plus nested reports, not siblings", () => {
    const ids = descendantEmployeeIds("2", [...TREE]);
    const names = TREE.filter((e) => ids.includes(e.id)).map((e) => e.name);
    expect(names).toEqual(
      expect.arrayContaining([
        "Bhavik Kotadiya",
        "Denish Khant",
        "Gaurav Pithwa",
        "Hiren Bhadarka",
        "Kaushal Shah",
        "Kushal Naiyar",
        "Chandan Kushwaha",
        "Sajan Mewada",
      ])
    );
    expect(names).not.toContain("Digant Shah");
    expect(names).not.toContain("Manya sharma");
    expect(ids).toHaveLength(8);
  });
});

describe("getSubordinateIds (HRMS ids)", () => {
  const emp = (
    partial: Partial<Employee> & Pick<Employee, "id" | "name">
  ): Employee => ({
    email: `${partial.id}@acme.io`,
    department: "Engineering",
    skills: [],
    status: "active",
    ...partial,
  });

  const employees: Employee[] = [
    emp({ id: "EMP-0001", name: "Administrator" }),
    emp({ id: "111", name: "Digant Shah", resourceOwnerId: "EMP-0001" }),
    emp({ id: "480", name: "Manya sharma", resourceOwnerId: "EMP-0001" }),
    emp({ id: "VCS-006", name: "Nirali Prajapati", resourceOwnerId: "EMP-0001" }),
    emp({ id: "EMP-8001", name: "Bhavik Kotadiya", resourceOwnerId: "111" }),
    emp({ id: "EMP001", name: "Denish Khant", resourceOwnerId: "111" }),
    emp({ id: "113", name: "Gaurav Pithwa", resourceOwnerId: "111" }),
    emp({ id: "3001", name: "Hiren Bhadarka", resourceOwnerId: "111" }),
    emp({ id: "1001", name: "Kaushal Shah", resourceOwnerId: "111" }),
    emp({ id: "2001", name: "Kushal Naiyar", resourceOwnerId: "111" }),
    emp({ id: "EM-1", name: "Chandan Kushwaha", resourceOwnerId: "EMP001" }),
    emp({ id: "EMP-8003", name: "Sajan Mewada", resourceOwnerId: "EMP001" }),
  ];

  it("walks Administrator → Digant → six reports → Denish's reports", () => {
    const ids = getSubordinateIds("EMP-0001", employees);
    expect(ids).toEqual(
      expect.arrayContaining([
        "111",
        "EMP-8001",
        "EMP001",
        "113",
        "3001",
        "1001",
        "2001",
        "EM-1",
        "EMP-8003",
      ])
    );
  });
});
