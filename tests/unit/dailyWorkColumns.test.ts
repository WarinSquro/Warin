import { describe, expect, it } from "vitest";
import { DAILY_WORK_COLUMNS, defaultVisibleColumnIds } from "../../data/dailyWorkReport";

const OPTIONAL_OFF = [
  "department",
  "resourceOwner",
  "projectType",
  "milestoneType",
  "activityType",
  "allocatedOn",
  "confirmedOn",
  "delayReason",
  "deviationReason",
  "planUnplanned",
];

const DEFAULT_ON = [
  "employeeName",
  "workDate",
  "project",
  "milestone",
  "activity",
  "tasks",
  "plannedHrs",
  "confirmation",
  "actualHrs",
];

describe("Daily Work Detail columns", () => {
  it("keeps optional columns unchecked by default", () => {
    const visible = defaultVisibleColumnIds();
    for (const id of OPTIONAL_OFF) {
      expect(visible.has(id as never), id).toBe(false);
      expect(DAILY_WORK_COLUMNS.find((c) => c.id === id)?.defaultVisible).toBe(false);
    }
  });

  it("defaults to the requested visible column set", () => {
    const visible = [...defaultVisibleColumnIds()];
    expect(visible).toEqual(DEFAULT_ON);
  });

  it("lists Allocated on after Tasks and unchecked by default", () => {
    const ids = DAILY_WORK_COLUMNS.map((c) => c.id);
    expect(ids.indexOf("allocatedOn")).toBe(ids.indexOf("tasks") + 1);
    expect(DAILY_WORK_COLUMNS.find((c) => c.id === "allocatedOn")?.defaultVisible).toBe(false);
    expect(DAILY_WORK_COLUMNS.find((c) => c.id === "allocatedOn")?.label).toBe("ALLOCATED ON");
  });

  it("uses compact rem widths (no fr) so columns do not stretch with leftover space", () => {
    for (const col of DAILY_WORK_COLUMNS) {
      expect(col.width.includes("fr"), col.id).toBe(false);
      expect(col.width.endsWith("rem"), col.id).toBe(true);
    }
  });
});
