import { describe, expect, it } from "vitest";
import { buildWorkdaySummaryRows } from "../../api/workdaySummary";
import { formatHoursAsHhMm, filterWorkdaySummaryRows, workdaySummaryRangeEnding } from "../../data/workdaySummaryReport";
import type { ApiAllocation, ApiConfirmation, ApiTeamProductivityDay } from "../../api/domain";
import type { Employee } from "../../data/employees";

const emp: Employee = {
  id: "EMP-1",
  name: "Employee X",
  email: "x@acme.io",
  department: "Engineering",
  skills: ["React"],
  status: "active",
  resourceOwnerId: "EMP-RO",
};

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];

function alloc(): ApiAllocation {
  return {
    id: "99",
    employeeHrmsId: emp.id,
    employeeName: emp.name,
    projectCode: "P1",
    projectName: "SkyView",
    milestoneId: "1",
    milestoneName: "M1",
    activity: "Dev",
    tasks: [],
    startDate: "2026-08-18",
    endDate: "2026-08-18",
    hoursPerDay: 8,
    reason: "",
  };
}

function conf(): ApiConfirmation {
  return {
    id: "c1",
    employeeHrmsId: emp.id,
    employeeName: emp.name,
    workDate: "2026-08-18",
    submittedAt: "2026-08-18T04:00:00.000Z",
    submittedAtLabel: "",
    isMissedPosting: false,
    missReason: null,
    hasDeviation: false,
    lines: [
      {
        id: "l1",
        allocationId: "99",
        projectLabel: "SkyView",
        milestoneLabel: "M1",
        activity: "Dev",
        plannedHours: 8,
        actualHours: 6,
        kind: "planned",
        reason: "",
        tasks: [],
      },
      {
        id: "l2",
        allocationId: null,
        projectLabel: "Ad hoc",
        milestoneLabel: "",
        activity: "Support",
        plannedHours: 0,
        actualHours: 2,
        kind: "unplanned",
        reason: "Interrupt",
        tasks: [],
      },
    ],
  };
}

function prod(): ApiTeamProductivityDay {
  return {
    employeeHrmsId: emp.id,
    workDate: "2026-08-18",
    workday: {
      dayStart: "2026-08-18T03:42:00.000Z",
      lunchOut: "2026-08-18T07:35:00.000Z",
      lunchIn: "2026-08-18T08:12:00.000Z",
      dayEnd: "2026-08-18T12:55:00.000Z",
    },
    focusByAllocation: {
      "99": {
        laps: [
          {
            id: "lap1",
            startedAt: "2026-08-18T04:00:00.000Z",
            endedAt: "2026-08-18T10:20:00.000Z",
            durationMs: 4.8 * 3600000,
          },
        ],
        sessionAccumMs: 0,
        segmentStartedAt: null,
      },
    },
  };
}

describe("workday summary", () => {
  it("builds a 14-day window ending on the given day", () => {
    expect(workdaySummaryRangeEnding("2026-08-18")).toEqual({
      from: "2026-08-05",
      to: "2026-08-18",
    });
  });

  it("formats hours as HH:mm", () => {
    expect(formatHoursAsHhMm(8)).toBe("08:00");
    expect(formatHoursAsHhMm(8.5)).toBe("08:30");
  });

  it("computes unplanned % as unplanned actual / total actual", () => {
    const rows = buildWorkdaySummaryRows(
      [emp],
      [alloc()],
      [conf()],
      [prod()],
      "2026-08-18",
      "2026-08-18",
      WEEKDAYS,
      "2026-08-18"
    );
    const row = rows.find((r) => r.hasSignal);
    expect(row?.allottedHours).toBe(8);
    expect(row?.actualHours).toBe(8);
    expect(row?.unplannedPct).toBe(25);
    expect(row?.compliance).toBe("C");
  });

  it("computes focus % against planned actual hours only", () => {
    const rows = buildWorkdaySummaryRows(
      [emp],
      [alloc()],
      [conf()],
      [prod()],
      "2026-08-18",
      "2026-08-18",
      WEEKDAYS,
      "2026-08-18"
    );
    const row = rows.find((r) => r.hasSignal);
    expect(row?.focusPct).toBe(80);
  });

  it("ignores orphan productivity when allocations and confirmations were cleared", () => {
    const rows = buildWorkdaySummaryRows(
      [emp],
      [],
      [],
      [prod()],
      "2026-08-18",
      "2026-08-18",
      WEEKDAYS,
      "2026-08-18"
    );
    const row = rows.find((r) => r.workDate === "2026-08-18");
    expect(row?.hasSignal).toBe(false);
    expect(row?.dayStart).toBeUndefined();
    expect(row?.focusHours).toBeUndefined();
  });

  it("drops confirmations whose planned lines only reference deleted allocations", () => {
    const orphanConf = conf();
    orphanConf.lines = orphanConf.lines.filter((l) => l.kind !== "unplanned");
    const rows = buildWorkdaySummaryRows(
      [emp],
      [],
      [orphanConf],
      [],
      "2026-08-18",
      "2026-08-18",
      WEEKDAYS,
      "2026-08-18"
    );
    const row = rows.find((r) => r.workDate === "2026-08-18");
    expect(row?.hasSignal).toBe(false);
    expect(row?.actualHours).toBeUndefined();
    expect(row?.compliance).toBe("Pending");
  });

  it("Work Date day filter keeps only that calendar day and ignores invalid days", () => {
    const rows = [
      {
        id: "1",
        workDate: "2026-02-28",
        employeeId: "E1",
        employeeName: "A",
        department: "Eng",
        resourceOwnerId: "RO",
        resourceOwnerName: "RO",
        hasSignal: true,
      },
      {
        id: "2",
        workDate: "2026-02-31",
        employeeId: "E1",
        employeeName: "A",
        department: "Eng",
        resourceOwnerId: "RO",
        resourceOwnerName: "RO",
        hasSignal: true,
      },
    ];
    const empty = {
      search: "",
      departments: [] as string[],
      resourceOwners: [] as string[],
      resources: [] as string[],
      includeEmpty: true,
    };
    expect(filterWorkdaySummaryRows(rows, { ...empty, workDay: 28 }).map((r) => r.id)).toEqual(["1"]);
    expect(filterWorkdaySummaryRows(rows, { ...empty, workDay: 31 })).toEqual([]);
    expect(filterWorkdaySummaryRows(rows, { ...empty, workDay: null })).toHaveLength(2);
  });
});
