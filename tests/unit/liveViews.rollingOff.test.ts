import { describe, expect, it } from "vitest";
import { buildRollingOffFromLive } from "../../api/liveViews";
import type { ApiAllocation } from "../../api/domain";
import type { Employee } from "../../data/employees";

const emp: Employee = {
  id: "EMP-D",
  name: "Denish Khant",
  email: "denish@acme.io",
  department: "Engineering",
  skills: ["React"],
  status: "active",
};

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];

function alloc(partial: Partial<ApiAllocation> & Pick<ApiAllocation, "id">): ApiAllocation {
  return {
    employeeHrmsId: emp.id,
    employeeName: emp.name,
    projectCode: "P1",
    projectName: "IncentivePro-v1",
    milestoneId: "1",
    milestoneName: "General / Ongoing",
    activity: "Dev",
    tasks: [],
    startDate: "2026-08-01",
    endDate: "2026-08-19",
    hoursPerDay: 8.5,
    reason: "",
    ...partial,
  };
}

describe("buildRollingOffFromLive", () => {
  const window = {
    windowFrom: "2026-08-17",
    windowDays: 14,
    workingDays: WEEKDAYS,
  };

  it("does not treat an inclusive allocation end date as the free date", () => {
    const people = buildRollingOffFromLive(
      [emp],
      [alloc({ id: "1", endDate: "2026-08-19", hoursPerDay: 8.5 })],
      window
    );
    expect(people).toHaveLength(1);
    expect(people[0]!.rollsOffDate).toBe("Aug 20");
    expect(people[0]!.rollsOffDate).not.toBe("Aug 19");
  });

  it("uses last booked working day when split allocations keep the person booked", () => {
    // Planner: Wed 8.5h IncentivePro; Thu–Fri 5h IncentivePro + 3.5h SCIP (still 8.5h/day).
    const people = buildRollingOffFromLive(
      [emp],
      [
        alloc({ id: "1", startDate: "2026-08-19", endDate: "2026-08-19", hoursPerDay: 8.5 }),
        alloc({
          id: "2",
          startDate: "2026-08-20",
          endDate: "2026-08-21",
          hoursPerDay: 5,
          projectName: "IncentivePro-v1",
        }),
        alloc({
          id: "3",
          startDate: "2026-08-20",
          endDate: "2026-08-21",
          hoursPerDay: 3.5,
          projectCode: "P2",
          projectName: "SCIP SA-TA",
        }),
      ],
      window
    );
    expect(people).toHaveLength(1);
    expect(people[0]!.rollsOffDate).toBe("Aug 24");
    expect(people[0]!.freeingHours).toBe(42.5);
    expect(people[0]!.currentProject).toBe("IncentivePro-v1");
  });

  it("does not sum weekly hours of every ending allocation (8.5×5 + 5×5 + 3.5×5 ≠ 85)", () => {
    const people = buildRollingOffFromLive(
      [emp],
      [
        alloc({ id: "1", startDate: "2026-08-19", endDate: "2026-08-19", hoursPerDay: 8.5 }),
        alloc({ id: "2", startDate: "2026-08-20", endDate: "2026-08-21", hoursPerDay: 5 }),
        alloc({
          id: "3",
          startDate: "2026-08-20",
          endDate: "2026-08-21",
          hoursPerDay: 3.5,
          projectCode: "P2",
          projectName: "SCIP SA-TA",
        }),
      ],
      window
    );
    expect(people[0]!.freeingHours).not.toBe(85);
    expect(people[0]!.freeingHours).toBe(42.5);
  });

  it("counts only working days in the remaining window, not weekends", () => {
    const people = buildRollingOffFromLive(
      [emp],
      [alloc({ id: "1", startDate: "2026-08-21", endDate: "2026-08-21", hoursPerDay: 8.5 })],
      window
    );
    expect(people[0]!.rollsOffDate).toBe("Aug 24");
    // Mon 24–Fri 28 inside window ending Sun 30; Sat/Sun excluded.
    expect(people[0]!.freeingHours).toBe(42.5);
  });

  it("omits people whose booking continues past the 2-week window", () => {
    const people = buildRollingOffFromLive(
      [emp],
      [
        alloc({ id: "1", startDate: "2026-08-17", endDate: "2026-09-15", hoursPerDay: 8.5 }),
      ],
      window
    );
    expect(people).toEqual([]);
  });

  it("skips company off-days when counting freeing hours", () => {
    const people = buildRollingOffFromLive(
      [emp],
      [alloc({ id: "1", startDate: "2026-08-21", endDate: "2026-08-21", hoursPerDay: 8.5 })],
      { ...window, companyOffDays: ["2026-08-24"] }
    );
    expect(people[0]!.rollsOffDate).toBe("Aug 25");
    expect(people[0]!.freeingHours).toBe(34);
  });
});
