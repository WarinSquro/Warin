import { describe, expect, it } from "vitest";
import {
  allocationOverlapsRange,
  markMilestones,
  plannedHoursInRange,
  workingOverlapDays,
} from "../../apps/oneview-api/src/api/team-projects/team-projects.util";

describe("team-projects.util", () => {
  const workingDays = ["Mon", "Tue", "Wed", "Thu", "Fri"];
  const off = new Set<string>();

  it("sums planned hours per allocation overlap in week", () => {
    const hours = plannedHoursInRange(
      [{ startDate: "2026-07-27", endDate: "2026-08-31", hoursPerDay: 4 }],
      "2026-07-27",
      "2026-07-31",
      workingDays,
      off
    );
    expect(hours).toBe(20);
  });

  it("sums planned hours for next working week", () => {
    const hours = plannedHoursInRange(
      [{ startDate: "2026-07-27", endDate: "2026-08-31", hoursPerDay: 4 }],
      "2026-08-03",
      "2026-08-07",
      workingDays,
      off
    );
    expect(hours).toBe(20);
  });

  it("includes future-only allocation rows in next week total", () => {
    const thisWeek = plannedHoursInRange(
      [
        { startDate: "2026-09-01", endDate: "2026-09-04", hoursPerDay: 8 },
        { startDate: "2026-09-07", endDate: "2026-09-07", hoursPerDay: 8 },
      ],
      "2026-08-31",
      "2026-09-04",
      workingDays,
      off
    );
    const nextWeek = plannedHoursInRange(
      [
        { startDate: "2026-09-01", endDate: "2026-09-04", hoursPerDay: 8 },
        { startDate: "2026-09-07", endDate: "2026-09-07", hoursPerDay: 8 },
      ],
      "2026-09-07",
      "2026-09-11",
      workingDays,
      off
    );
    expect(thisWeek).toBe(32);
    expect(nextWeek).toBe(8);
    expect(allocationOverlapsRange("2026-09-07", "2026-09-07", "2026-08-31", "2026-09-11")).toBe(
      true
    );
    expect(allocationOverlapsRange("2026-09-07", "2026-09-07", "2026-08-31", "2026-09-04")).toBe(
      false
    );
  });

  it("counts working overlap days excluding weekends", () => {
    expect(
      workingOverlapDays("2026-07-27", "2026-08-02", "2026-07-27", "2026-08-02", workingDays, off)
    ).toBe(5);
  });

  it("marks next future milestone and overdue when none left", () => {
    const rows = markMilestones(
      [
        { id: 1n, name: "Alpha", date: new Date("2026-04-01T00:00:00.000Z") },
        { id: 2n, name: "Beta", date: new Date("2026-12-01T00:00:00.000Z") },
      ],
      "2026-07-27"
    );
    expect(rows.find((m) => m.name === "Beta")?.isNext).toBe(true);
    expect(rows.find((m) => m.name === "Alpha")?.isOverdue).toBe(false);
  });

  it("marks overdue on latest past when no future milestones", () => {
    const rows = markMilestones(
      [{ id: 1n, name: "Alpha", date: new Date("2026-04-01T00:00:00.000Z") }],
      "2026-07-27"
    );
    expect(rows[0]?.isOverdue).toBe(true);
    expect(rows[0]?.isNext).toBe(false);
  });
});
