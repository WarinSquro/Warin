import { describe, expect, it } from "vitest";
import {
  AVAIL_ROWS,
  computeAvailKpis,
  filterAvailRowsRollingOffSoon,
  type AvailRow,
} from "../../data/availability";

function row(partial: Partial<AvailRow> & Pick<AvailRow, "id">): AvailRow {
  return {
    name: partial.name ?? partial.id,
    initials: "X",
    role: "Dev",
    department: "Engineering",
    freeHours: 8,
    capacity: 40,
    availableFrom: "Partial",
    skills: ["React"],
    bookedPct: 80,
    ...partial,
  };
}

describe("filterAvailRowsRollingOffSoon", () => {
  it("keeps people whose allocation is ending, even if availableFrom is Now", () => {
    const rows = [
      row({ id: "booked-ongoing", availableFrom: "Fully booked" }),
      row({ id: "rolling", availableFrom: "Now", freeHours: 40, bookedPct: 0 }),
      row({ id: "partial-ongoing", availableFrom: "Partial" }),
    ];
    expect(filterAvailRowsRollingOffSoon(rows, new Set(["rolling"])).map((r) => r.id)).toEqual([
      "rolling",
    ]);
  });

  it("does not treat Partial or Fully booked as rolling off", () => {
    const rows = [
      row({ id: "a", availableFrom: "Partial" }),
      row({ id: "b", availableFrom: "Fully booked" }),
    ];
    expect(filterAvailRowsRollingOffSoon(rows, new Set()).map((r) => r.id)).toEqual([]);
  });
});

describe("computeAvailKpis rollingOffSoon", () => {
  it("uses the live rolling-off count, not availableFrom !== Now", () => {
    const notNow = AVAIL_ROWS.filter((r) => r.availableFrom !== "Now").length;
    const kpis = computeAvailKpis(AVAIL_ROWS, 9);
    expect(kpis.rollingOffSoon).toBe(9);
    expect(notNow).not.toBe(9);
  });
});
