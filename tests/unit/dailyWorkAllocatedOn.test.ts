import { describe, expect, it } from "vitest";
import { buildDailyWorkRows } from "../../api/liveViews";
import type { ApiAllocation } from "../../api/domain";
import type { Employee } from "../../data/employees";

const emp: Employee = {
  id: "EMP-1",
  name: "Aarav Shah",
  email: "a@acme.io",
  department: "Engineering",
  skills: ["React"],
  status: "active",
};

function alloc(partial?: Partial<ApiAllocation>): ApiAllocation {
  return {
    id: "99",
    employeeHrmsId: "EMP-1",
    employeeName: "Aarav Shah",
    projectCode: "P1",
    projectName: "SkyView Drone",
    milestoneId: "1",
    milestoneName: "General / Ongoing",
    activity: "Dev",
    tasks: [],
    startDate: "2026-08-10",
    endDate: "2026-08-16",
    hoursPerDay: 8,
    reason: "",
    ...partial,
  };
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

describe("Daily Work allocatedOn", () => {
  it("uses startDate when createdAt is missing (running API without the field)", () => {
    const rows = buildDailyWorkRows(
      [emp],
      [],
      [alloc()],
      [],
      "2026-08-10",
      "2026-08-10",
      WEEKDAYS
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.allocatedOn).toBe("2026-08-10");
  });

  it("prefers createdAt over startDate", () => {
    const rows = buildDailyWorkRows(
      [emp],
      [],
      [alloc({ createdAt: "2026-08-01T06:30:00.000Z" })],
      [],
      "2026-08-10",
      "2026-08-10",
      WEEKDAYS
    );
    expect(rows[0]!.allocatedOn).toBe("2026-08-01");
  });
});
