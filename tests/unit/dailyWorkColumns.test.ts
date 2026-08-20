import { describe, expect, it } from "vitest";
import {
  DAILY_WORK_COLUMNS,
  DAILY_WORK_COLUMN_STORAGE_KEY,
  defaultVisibleColumnIds,
  loadVisibleColumnIds,
} from "../../data/dailyWorkReport";

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

  it("loadVisibleColumnIds ignores legacy v4 all-selected prefs and uses product defaults", () => {
    const memory = new Map<string, string>();
    const storage = {
      getItem: (k: string) => memory.get(k) ?? null,
      setItem: (k: string, v: string) => {
        memory.set(k, v);
      },
      removeItem: (k: string) => {
        memory.delete(k);
      },
    };
    // @ts-expect-error test stub
    globalThis.localStorage = storage;
    memory.set("oneview_daily_work_columns_v4", JSON.stringify(DAILY_WORK_COLUMNS.map((c) => c.id)));
    const loaded = loadVisibleColumnIds();
    expect([...loaded]).toEqual(DEFAULT_ON);
    expect(memory.has("oneview_daily_work_columns_v4")).toBe(false);
    expect(DAILY_WORK_COLUMN_STORAGE_KEY).toBe("oneview_daily_work_columns_v6");
  });
});
