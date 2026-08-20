import { describe, expect, it } from "vitest";
import {
  buildDeploymentRowsFromEmployees,
  buildPerformanceRowsFromEmployees,
} from "../../api/liveViews";
import type { ApiAllocation, ApiConfirmation } from "../../api/domain";
import type { Employee } from "../../data/employees";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const RANGE_FROM = "2026-08-17";
const RANGE_TO = "2026-08-23";

const emp: Employee = {
  id: "EMP-1",
  name: "Aarav Shah",
  email: "a@acme.io",
  department: "Engineering",
  skills: ["React"],
  status: "active",
};

function confirmation(workDate: string): ApiConfirmation {
  return {
    id: `c-${workDate}`,
    employeeHrmsId: emp.id,
    employeeName: emp.name,
    workDate,
    submittedAt: `${workDate}T12:00:00.000Z`,
    submittedAtLabel: "",
    isMissedPosting: false,
    missReason: null,
    hasDeviation: false,
    lines: [
      {
        id: `l-${workDate}`,
        allocationId: "99",
        projectLabel: "SkyView",
        milestoneLabel: "M1",
        activity: "Dev",
        plannedHours: 8,
        actualHours: 8,
        kind: "planned",
        reason: "",
        tasks: [],
      },
    ],
  };
}

const alloc: ApiAllocation = {
  id: "99",
  employeeHrmsId: emp.id,
  employeeName: emp.name,
  projectCode: "P1",
  projectName: "SkyView",
  milestoneId: "1",
  milestoneName: "M1",
  activity: "Dev",
  tasks: [],
  startDate: RANGE_FROM,
  endDate: RANGE_TO,
  hoursPerDay: 8,
  reason: "",
};

describe("confirmation discipline elapsed working days", () => {
  it("performance: 1 of 3 elapsed days = 33%", () => {
    const rows = buildPerformanceRowsFromEmployees(
      [emp],
      40,
      [alloc],
      [confirmation("2026-08-17")],
      RANGE_FROM,
      RANGE_TO,
      WEEKDAYS,
      [],
      "2026-08-19"
    );
    expect(rows[0]!.confirmationDiscipline).toBe(33);
  });

  it("performance: 1 of 4 elapsed days = 25%", () => {
    const rows = buildPerformanceRowsFromEmployees(
      [emp],
      40,
      [alloc],
      [confirmation("2026-08-17")],
      RANGE_FROM,
      RANGE_TO,
      WEEKDAYS,
      [],
      "2026-08-20"
    );
    expect(rows[0]!.confirmationDiscipline).toBe(25);
  });

  it("deployment: in-progress week uses elapsed days", () => {
    const rows = buildDeploymentRowsFromEmployees(
      [emp],
      [emp],
      [alloc],
      [confirmation("2026-08-17")],
      RANGE_FROM,
      RANGE_TO,
      { workingDays: WEEKDAYS, companyOffDays: [], asOf: "2026-08-19" }
    );
    expect(rows[0]!.confirmationDiscipline).toBe(33);
  });

  it("completed week still uses all working days (1/5 = 20%)", () => {
    const rows = buildPerformanceRowsFromEmployees(
      [emp],
      40,
      [alloc],
      [confirmation("2026-08-17")],
      RANGE_FROM,
      RANGE_TO,
      WEEKDAYS,
      [],
      "2026-08-24"
    );
    expect(rows[0]!.confirmationDiscipline).toBe(20);
  });
});
