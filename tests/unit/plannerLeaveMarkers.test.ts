import { describe, expect, it } from "vitest";
import {
  buildPlannerRowsFromEmployees,
  DAY_START_ISO,
  WEEK_START_ISO,
} from "../../data/planner";

const employees = [
  {
    id: "EMP-1",
    name: "Alex",
    department: "Engineering",
    status: "active",
    skills: [],
  },
];

function isoAddDays(iso: string, days: number): string {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00`);
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

describe("buildPlannerRowsFromEmployees leave markers", () => {
  it("shows Leave chip on day view when employee has active leave on that date", () => {
    const leaveDate = DAY_START_ISO[0]!;
    const rows = buildPlannerRowsFromEmployees(employees, 40, [], {}, {
      dayStartIso: DAY_START_ISO,
      leaveDatesByEmployee: { "EMP-1": [leaveDate] },
    });
    expect(rows).toHaveLength(1);
    const dayCell = rows[0]!.days[0]!;
    expect(dayCell).toEqual([{ label: "Leave", kind: "leave" }]);
  });

  it("shows Leave chip on week view when all working days in the week are on leave", () => {
    const weekStart = WEEK_START_ISO[0]!;
    const workingDays = ["Mon", "Tue", "Wed", "Thu", "Fri"];
    const leaveDates = [0, 1, 2, 3, 4].map((i) => isoAddDays(weekStart, i));
    const rows = buildPlannerRowsFromEmployees(
      employees,
      40,
      [],
      { workingDays },
      { leaveDatesByEmployee: { "EMP-1": leaveDates } }
    );
    expect(rows[0]!.weeks[0]).toEqual([{ label: "Leave", kind: "leave" }]);
  });

  it("reduces capacity by leave days (e.g. 1 leave day = capacity - 8.5h)", () => {
    const leaveDate = DAY_START_ISO[0]!;
    const hpd = 8.5;
    const rows = buildPlannerRowsFromEmployees(employees, 40, [], { workingHoursPerDay: hpd }, {
      dayStartIso: DAY_START_ISO,
      leaveDatesByEmployee: { "EMP-1": [leaveDate] },
    });
    const baseDayCap = DAY_START_ISO.length * hpd;
    expect(rows[0]!.dayCapacity).toBeCloseTo(baseDayCap - hpd, 1);
  });

  it("does not show Leave chip when only some days in the week are on leave", () => {
    const rows = buildPlannerRowsFromEmployees(employees, 40, [], {}, {
      leaveDatesByEmployee: { "EMP-1": [DAY_START_ISO[0]!] },
    });
    const weekCell = rows[0]!.weeks[0]!;
    expect(weekCell.some((c) => c.kind === "leave")).toBe(false);
  });
});
