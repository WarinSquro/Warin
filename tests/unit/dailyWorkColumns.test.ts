import { describe, expect, it } from "vitest";
import { DAILY_WORK_COLUMNS, defaultVisibleColumnIds } from "../../data/dailyWorkReport";

const OPTIONAL_OFF = ["department", "projectType", "activityType"];

const DEFAULT_ON = [
  "employeeName",
  "resourceOwner",
  "workDate",
  "project",
  "milestone",
  "milestoneType",
  "activity",
  "tasks",
  "allocatedOn",
  "plannedHrs",
  "confirmation",
  "confirmedOn",
  "delayReason",
  "deviationReason",
  "actualHrs",
  "planUnplanned",
];

describe("Daily Work Detail columns", () => {
  it("keeps Department, Project Type, and Activity Type unchecked by default", () => {
    const visible = defaultVisibleColumnIds();
    for (const id of OPTIONAL_OFF) {
      expect(visible.has(id as never), id).toBe(false);
      expect(DAILY_WORK_COLUMNS.find((c) => c.id === id)?.defaultVisible).toBe(false);
    }
  });

  it("defaults to the screenshot column set (including Milestone / Milestone Type)", () => {
    const visible = [...defaultVisibleColumnIds()];
    expect(visible).toEqual(DEFAULT_ON);
  });

  it("lists Allocated on after Tasks and selected by default", () => {
    const ids = DAILY_WORK_COLUMNS.map((c) => c.id);
    expect(ids.indexOf("allocatedOn")).toBe(ids.indexOf("tasks") + 1);
    expect(DAILY_WORK_COLUMNS.find((c) => c.id === "allocatedOn")?.defaultVisible).toBe(true);
    expect(DAILY_WORK_COLUMNS.find((c) => c.id === "allocatedOn")?.label).toBe("Allocated on");
  });

  it("uses compact rem widths (no fr) so columns do not stretch with leftover space", () => {
    for (const col of DAILY_WORK_COLUMNS) {
      expect(col.width.includes("fr"), col.id).toBe(false);
      expect(col.width.endsWith("rem"), col.id).toBe(true);
    }
  });
});
