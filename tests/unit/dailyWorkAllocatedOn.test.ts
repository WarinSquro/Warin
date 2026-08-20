import { describe, expect, it } from "vitest";
import { buildDailyWorkRows } from "../../api/liveViews";
import type { ApiAllocation, ApiConfirmation } from "../../api/domain";
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

function confirmation(partial?: Partial<ApiConfirmation>): ApiConfirmation {
  return {
    id: "c1",
    employeeHrmsId: "EMP-1",
    employeeName: "Aarav Shah",
    workDate: "2026-08-19",
    submittedAt: "2026-08-19T12:00:00.000Z",
    submittedAtLabel: "",
    isMissedPosting: false,
    missReason: null,
    hasDeviation: true,
    lines: [
      {
        id: "l1",
        allocationId: "99",
        projectLabel: "SkyView Drone",
        milestoneLabel: "General / Ongoing",
        activity: "Dev",
        plannedHours: 4.5,
        actualHours: 4.5,
        kind: "deviation",
        reason: "Reprioritized",
        tasks: ["Discussion"],
      },
    ],
    ...partial,
  };
}

describe("Daily Work confirmation codes", () => {
  it("same calendar day (IST) with deviation is D, not DD", () => {
    const rows = buildDailyWorkRows(
      [emp],
      [],
      [alloc({ startDate: "2026-08-19", endDate: "2026-08-19" })],
      [confirmation()],
      "2026-08-19",
      "2026-08-19",
      WEEKDAYS
    );
    const confirmed = rows.find((r) => r.id.startsWith("dw-l") || r.confirmation === "D" || r.confirmation === "DD");
    expect(confirmed?.confirmation).toBe("D");
    expect(confirmed?.confirmedOn).toBe("2026-08-19T12:00:00.000Z");
    expect(confirmed?.delayReason).toBeUndefined();
  });

  it("next calendar day (IST) with deviation is DD", () => {
    const rows = buildDailyWorkRows(
      [emp],
      [],
      [alloc({ startDate: "2026-08-19", endDate: "2026-08-19" })],
      [confirmation({ submittedAt: "2026-08-19T18:30:00.000Z" })],
      "2026-08-19",
      "2026-08-19",
      WEEKDAYS
    );
    const confirmed = rows.find((r) => r.confirmation === "D" || r.confirmation === "DD");
    expect(confirmed?.confirmation).toBe("DD");
    expect(confirmed?.confirmedOn).toBe("2026-08-19T18:30:00.000Z");
    expect(confirmed?.delayReason).toBe("Late posting");
  });

  it("skips confirmation lines whose allocation was soft-deleted", () => {
    const rows = buildDailyWorkRows(
      [emp],
      [],
      [],
      [confirmation()],
      "2026-08-19",
      "2026-08-19",
      WEEKDAYS
    );
    expect(rows.filter((r) => r.confirmation !== "Pending")).toHaveLength(0);
  });

  it("resolves Resource Owner name from the full employee lookup list", () => {
    const owner: Employee = {
      id: "EMP-RO",
      name: "Riya Owner",
      email: "ro@acme.io",
      department: "Engineering",
      skills: [],
      status: "active",
    };
    const scoped: Employee = { ...emp, resourceOwnerId: "EMP-RO" };
    const rows = buildDailyWorkRows(
      [scoped],
      [],
      [alloc({ startDate: "2026-08-19", endDate: "2026-08-19" })],
      [],
      "2026-08-19",
      "2026-08-19",
      WEEKDAYS,
      undefined,
      [scoped, owner]
    );
    expect(rows[0]?.resourceOwnerName).toBe("Riya Owner");
  });
});
