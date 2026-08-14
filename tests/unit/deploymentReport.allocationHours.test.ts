import { describe, expect, it } from "vitest";
import { buildDeploymentRowsFromEmployees } from "../../api/liveViews";
import type { ApiAllocation } from "../../api/domain";
import type { Employee } from "../../data/employees";
import { filterDeploymentRows } from "../../data/deploymentReport";
import { forgetStaleUnallocatedSentinel } from "../../utils/reportFilterPersistence";

const CALENDAR = {
  workingDays: ["Mon", "Tue", "Wed", "Thu", "Fri"],
  companyOffDays: [] as string[],
};

function emp(id: string, name: string): Employee {
  return {
    id,
    name,
    email: `${id.toLowerCase()}@acme.io`,
    department: "Engineering",
    skills: ["React"],
    status: "active",
  };
}

function alloc(
  partial: Pick<
    ApiAllocation,
    "employeeHrmsId" | "projectCode" | "projectName" | "startDate" | "endDate" | "hoursPerDay"
  > &
    Partial<ApiAllocation>
): ApiAllocation {
  return {
    id: partial.id ?? `${partial.employeeHrmsId}-${partial.projectCode}`,
    employeeName: partial.employeeName ?? partial.employeeHrmsId,
    milestoneId: "1",
    milestoneName: "Delivery",
    activity: "Development",
    tasks: [],
    reason: "",
    ...partial,
  };
}

/** Shapes matching Resource Planner allocations that overlap Aug 2026. */
const EMPLOYEES: Employee[] = [
  emp("EMP-2001", "Aarav Shah"),
  emp("EMP-2002", "Ajay Singh"),
  emp("EMP-2003", "Amit Gupta"),
  emp("EMP-2099", "Unassigned Person"),
];

const ALLOCATIONS: ApiAllocation[] = [
  alloc({
    employeeHrmsId: "EMP-2001",
    employeeName: "Aarav Shah",
    projectCode: "AMUL",
    projectName: "Amul",
    startDate: "2026-08-11",
    endDate: "2026-08-14",
    hoursPerDay: 6,
  }),
  alloc({
    employeeHrmsId: "EMP-2001",
    employeeName: "Aarav Shah",
    projectCode: "SKY",
    projectName: "SkyView",
    startDate: "2026-08-14",
    endDate: "2026-08-14",
    hoursPerDay: 0.5,
  }),
  alloc({
    employeeHrmsId: "EMP-2002",
    employeeName: "Ajay Singh",
    projectCode: "PZ",
    projectName: "Project Z",
    startDate: "2026-08-10",
    endDate: "2026-08-14",
    hoursPerDay: 6,
  }),
  alloc({
    employeeHrmsId: "EMP-2003",
    employeeName: "Amit Gupta",
    projectCode: "AMUL",
    projectName: "Amul",
    startDate: "2026-08-11",
    endDate: "2026-08-21",
    hoursPerDay: 6,
  }),
];

function hoursFor(
  rangeFrom: string,
  rangeTo: string
): { total: number; byName: Record<string, number>; projects: string[] } {
  const rows = buildDeploymentRowsFromEmployees(
    EMPLOYEES,
    EMPLOYEES,
    ALLOCATIONS,
    [],
    rangeFrom,
    rangeTo,
    CALENDAR
  );
  const byName: Record<string, number> = {};
  for (const r of rows) {
    byName[`${r.employeeName}:${r.projectName}`] = r.allocationHours;
  }
  return {
    total: rows.reduce((s, r) => s + r.allocationHours, 0),
    byName,
    projects: rows.map((r) => r.projectName),
  };
}

describe("Deployment Report allocation hours from Resource Planner records", () => {
  it("Today (Fri 14 Aug 2026) shows overlapping planner allocations", () => {
    const { total, byName, projects } = hoursFor("2026-08-14", "2026-08-14");
    expect(byName["Aarav Shah:Amul"]).toBe(6);
    expect(byName["Aarav Shah:SkyView"]).toBe(0.5);
    expect(byName["Ajay Singh:Project Z"]).toBe(6);
    expect(byName["Amit Gupta:Amul"]).toBe(6);
    expect(total).toBe(18.5);
    expect(projects).toEqual(expect.arrayContaining(["Amul", "SkyView", "Project Z", "Unallocated"]));
  });

  it("This week (Mon 10 – Sun 16 Aug 2026) rolls up weekday hours", () => {
    const { total, byName } = hoursFor("2026-08-10", "2026-08-16");
    // Aarav Amul: Tue–Fri = 4 * 6 = 24; SkyView Fri 0.5; Ajay Mon–Fri = 5 * 6 = 30; Amit Tue–Fri = 4 * 6 = 24
    expect(byName["Aarav Shah:Amul"]).toBe(24);
    expect(byName["Aarav Shah:SkyView"]).toBe(0.5);
    expect(byName["Ajay Singh:Project Z"]).toBe(30);
    expect(byName["Amit Gupta:Amul"]).toBe(24);
    expect(total).toBe(78.5);
  });

  it("August 2026 includes allocations that extend past the current week", () => {
    const { total, byName } = hoursFor("2026-08-01", "2026-08-31");
    expect(byName["Amit Gupta:Amul"]).toBe(54); // 11–21 Aug weekdays = 9 * 6
    expect(byName["Aarav Shah:Amul"]).toBe(24);
    expect(total).toBeGreaterThan(78.5);
  });

  it("does not treat Unallocated-only stored filter as an explicit project filter", () => {
    expect(forgetStaleUnallocatedSentinel(["Unallocated"])).toEqual([]);
    expect(forgetStaleUnallocatedSentinel(["Amul"])).toEqual(["Amul"]);
  });

  it("project filter Unallocated hides allocated rows (empty filter shows them)", () => {
    const rows = buildDeploymentRowsFromEmployees(
      EMPLOYEES,
      EMPLOYEES,
      ALLOCATIONS,
      [],
      "2026-08-14",
      "2026-08-14",
      CALENDAR
    );
    const empty = filterDeploymentRows(rows, {
      search: "",
      departments: [],
      projects: [],
      resourceOwners: [],
      skills: [],
      statuses: [],
    });
    const unallocatedOnly = filterDeploymentRows(rows, {
      search: "",
      departments: [],
      projects: ["Unallocated"],
      resourceOwners: [],
      skills: [],
      statuses: [],
    });
    expect(empty.reduce((s, r) => s + r.allocationHours, 0)).toBe(18.5);
    expect(unallocatedOnly.every((r) => r.projectName === "Unallocated")).toBe(true);
    expect(unallocatedOnly.reduce((s, r) => s + r.allocationHours, 0)).toBe(0);
  });
});
