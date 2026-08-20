import { describe, expect, it } from "vitest";
import { computeSettingsBandImpact } from "../../utils/settingsImpact";
import {
  buildUtilizationPctsForBandImpact,
  utilizationPeriodCapacity,
} from "../../utils/utilizationBandPreview";
import type { ApiAllocation } from "../../api/domain";
import type { Employee } from "../../data/employees";

describe("computeSettingsBandImpact", () => {
  it("moves people from optimal to idle when idle threshold rises", () => {
    const pcts = [82, ...Array(19).fill(50)];
    const before = { idleBelow: 80, optimalTo: 100 };
    const after = { idleBelow: 85, optimalTo: 100 };
    const impact = computeSettingsBandImpact(pcts, before, after);

    expect(impact.rows).toEqual([
      { band: "Idle / Under", before: 19, after: 20, tone: "muted" },
      { band: "Optimal", before: 1, after: 0, tone: "success" },
      { band: "Overloaded", before: 0, after: 0, tone: "danger" },
    ]);
    expect(impact.totalReclassified).toBe(1);
    expect(impact.summary).toContain("Raising the idle threshold");
    expect(impact.summary).toContain("1 person");
  });

  it("reports no reclassification when bands change but nobody crosses", () => {
    const pcts = [90, 95, 40];
    const before = { idleBelow: 70, optimalTo: 100 };
    const after = { idleBelow: 75, optimalTo: 100 };
    const impact = computeSettingsBandImpact(pcts, before, after);
    expect(impact.totalReclassified).toBe(0);
    expect(impact.rows[0]).toMatchObject({ before: 1, after: 1 });
    expect(impact.rows[1]).toMatchObject({ before: 2, after: 2 });
  });
});

describe("buildUtilizationPctsForBandImpact", () => {
  const employees: Employee[] = [
    {
      id: "E1",
      name: "Alex",
      email: "alex@example.com",
      department: "Engineering",
      skills: ["Dev"],
      status: "active",
      isSuperAdmin: false,
    },
    {
      id: "E2",
      name: "Blake",
      email: "blake@example.com",
      department: "Engineering",
      skills: ["Dev"],
      status: "active",
      isSuperAdmin: false,
    },
  ];

  const calendar = {
    workingDays: ["Mon", "Tue", "Wed", "Thu", "Fri"],
    companyOffDays: [] as string[],
    workingHoursPerDay: 8,
    rangeFrom: "2026-08-04",
    rangeTo: "2026-08-08",
  };

  it("derives pct from live allocations, not demo rows", () => {
    const capacity = utilizationPeriodCapacity(calendar.rangeFrom, calendar.rangeTo, calendar);
    expect(capacity).toBe(32);

    const allocations: ApiAllocation[] = [
      {
        id: "1",
        employeeHrmsId: "E1",
        projectCode: "P1",
        projectName: "Alpha",
        milestoneId: "M1",
        milestoneName: "M1",
        activity: "Build",
        tasks: [],
        startDate: "2026-08-04",
        endDate: "2026-08-08",
        hoursPerDay: 8,
      },
    ];

    const pcts = buildUtilizationPctsForBandImpact(employees, allocations, calendar);
    expect(pcts).toHaveLength(2);
    expect(pcts[0]).toBe(100);
    expect(pcts[1]).toBe(0);
  });
});
