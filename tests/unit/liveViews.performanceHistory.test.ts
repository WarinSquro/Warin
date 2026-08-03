import { describe, expect, it } from "vitest";
import { buildPerformanceHistoryFromLive } from "../../api/liveViews";
import type { Employee } from "../../data/employees";
import type { ApiAllocation } from "../../api/domain";

const emp: Employee = {
  id: "EMP-1",
  name: "Test User",
  email: "t@acme.io",
  department: "Engineering",
  skills: ["Node.js"],
  status: "active",
};

function alloc(partial: Partial<ApiAllocation> & Pick<ApiAllocation, "startDate" | "endDate">): ApiAllocation {
  return {
    id: "1",
    employeeHrmsId: "EMP-1",
    employeeName: "Test User",
    projectCode: "PRJ-1",
    projectName: "Demo",
    milestoneId: "m1",
    milestoneName: "M1",
    activity: "Dev",
    tasks: [],
    hoursPerDay: 8,
    reason: "",
    ...partial,
  };
}

describe("buildPerformanceHistoryFromLive (RPR-021)", () => {
  it("returns null for unknown employee", () => {
    expect(buildPerformanceHistoryFromLive("EMP-X", [emp], 40, [], [], 6)).toBeNull();
  });

  it("returns 6 month labels with live utilization when allocated", () => {
    const allocations = [
      alloc({ startDate: "2026-02-01", endDate: "2026-07-31" }),
    ];
    const history = buildPerformanceHistoryFromLive(
      "EMP-1",
      [emp],
      40,
      allocations,
      [],
      6,
      new Date(2026, 6, 15) // Jul 2026
    );
    expect(history).not.toBeNull();
    expect(history!.months).toHaveLength(6);
    expect(history!.months.map((m) => m.label)).toEqual([
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
    ]);
    expect(history!.months.every((m) => m.utilizationHrs > 0)).toBe(true);
  });

  it("returns zero utilization months when no allocations (no fake demo data)", () => {
    const history = buildPerformanceHistoryFromLive(
      "EMP-1",
      [emp],
      40,
      [],
      [],
      6,
      new Date(2026, 6, 15)
    );
    expect(history!.months).toHaveLength(6);
    expect(history!.months.every((m) => m.utilizationHrs === 0)).toBe(true);
    expect(history!.months.every((m) => m.planningAccuracy == null)).toBe(true);
  });
});
