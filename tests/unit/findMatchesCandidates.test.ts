import { describe, expect, it } from "vitest";
import { buildCandidatesFromEmployees } from "../../api/liveViews";
import type { Employee } from "../../data/employees";
import type { ApiAllocation } from "../../api/domain";

const emp = (partial: Partial<Employee> & Pick<Employee, "id" | "name">): Employee => ({
  email: `${partial.id}@acme.io`,
  department: "Engineering",
  skills: ["React"],
  status: "active",
  ...partial,
});

describe("buildCandidatesFromEmployees", () => {
  it("subtracts current-week booked hours from free capacity", () => {
    const employees = [emp({ id: "EMP-0001", name: "Digant Shah" })];
    const allocations: ApiAllocation[] = [
      {
        id: "1",
        employeeHrmsId: "EMP-0001",
        employeeName: "Digant Shah",
        projectCode: "PRJ-003",
        projectName: "SkyView Drone",
        milestoneId: "m1",
        milestoneName: "Build",
        activity: "Dev",
        activityId: "1",
        tasks: [],
        startDate: "2026-07-27",
        endDate: "2026-07-31",
        hoursPerDay: 2,
        reason: null,
        createdAt: "",
        modifiedAt: "",
      },
    ];
    const candidates = buildCandidatesFromEmployees(employees, 43, allocations, "2026-07-27");
    expect(candidates).toHaveLength(1);
    // 5 weekdays × 2h = 10 booked → 33 free
    expect(candidates[0]!.freeHours).toBe(33);
    expect(candidates[0]!.availability).toBe("partial fit");
  });

  it("shows full capacity when no allocations", () => {
    const employees = [emp({ id: "EMP-0002", name: "Free Person" })];
    const candidates = buildCandidatesFromEmployees(employees, 43, [], "2026-07-27");
    expect(candidates[0]!.freeHours).toBe(43);
    expect(candidates[0]!.availability).toBe("available now");
  });
});
