import { describe, expect, it } from "vitest";
import { buildPerformanceRowsFromEmployees } from "../../api/liveViews";
import type { Employee } from "../../data/employees";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const emp: Employee = {
  id: "EMP-1",
  name: "Aarav Shah",
  email: "a@acme.io",
  department: "Engineering",
  skills: ["React"],
  status: "active",
};

describe("buildPerformanceRowsFromEmployees leave capacity", () => {
  it("reduces AVAIL CAP by leave working days × hours/day", () => {
    // Aug 2026: Mon–Fri working days in 17–23 Aug = 5 days → 40h at 8h/day
    const withoutLeave = buildPerformanceRowsFromEmployees(
      [emp],
      40,
      [],
      [],
      "2026-08-17",
      "2026-08-23",
      WEEKDAYS,
      [],
      undefined,
      undefined
    )[0]!;
    expect(withoutLeave.availableCapacityHrs).toBe(40);

    const withLeave = buildPerformanceRowsFromEmployees(
      [emp],
      40,
      [],
      [],
      "2026-08-17",
      "2026-08-23",
      WEEKDAYS,
      [],
      undefined,
      { "EMP-1": ["2026-08-18"] }
    )[0]!;
    expect(withLeave.availableCapacityHrs).toBe(32);
  });

  it("ignores leave on company off-days / weekends for capacity", () => {
    const row = buildPerformanceRowsFromEmployees(
      [emp],
      40,
      [],
      [],
      "2026-08-17",
      "2026-08-23",
      WEEKDAYS,
      [],
      undefined,
      { "EMP-1": ["2026-08-22"] } // Saturday
    )[0]!;
    expect(row.availableCapacityHrs).toBe(40);
  });
});
