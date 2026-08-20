import { describe, expect, it } from "vitest";
import {
  AVAIL_ROWS,
  availAvgDeltaDisplay,
  avgFreeHoursPerPerson,
  computeAvailKpis,
  filterAvailRowsAllSegments,
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

describe("filterAvailRowsAllSegments", () => {
  it("All is Available now ∪ Rolling off soon, excluding other booked people", () => {
    const rows = [
      row({ id: "now", availableFrom: "Now", freeHours: 40, bookedPct: 0 }),
      row({ id: "rolling", availableFrom: "Partial", freeHours: 8, bookedPct: 80 }),
      row({ id: "both", availableFrom: "Now", freeHours: 40, bookedPct: 0 }),
      row({ id: "booked", availableFrom: "Fully booked", freeHours: 0, bookedPct: 100 }),
    ];
    const all = filterAvailRowsAllSegments(rows, new Set(["rolling", "both"]));
    expect(all.map((r) => r.id).sort()).toEqual(["both", "now", "rolling"]);
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

describe("computeAvailKpis avgDelta", () => {
  it("is current avg free hrs minus prior 2-week avg", () => {
    const current = [row({ id: "a", freeHours: 40 }), row({ id: "b", freeHours: 20 })];
    const prior = [row({ id: "a", freeHours: 30 }), row({ id: "b", freeHours: 10 })];
    const kpis = computeAvailKpis(current, 0, prior);
    expect(kpis.avgFreeHrs).toBe(30);
    expect(kpis.avgDelta).toBe(10);
  });

  it("is null when there is no prior-period roster", () => {
    expect(computeAvailKpis([row({ id: "a", freeHours: 40 })]).avgDelta).toBeNull();
    expect(computeAvailKpis([row({ id: "a", freeHours: 40 })], 0, []).avgDelta).toBeNull();
  });

  it("sums duplicate person-weeks then divides by unique people", () => {
    const twoWeeks = [
      row({ id: "a", freeHours: 10 }),
      row({ id: "a", freeHours: 20 }),
      row({ id: "b", freeHours: 30 }),
      row({ id: "b", freeHours: 40 }),
    ];
    expect(avgFreeHoursPerPerson(twoWeeks)).toBe(50);
  });
});

describe("availAvgDeltaDisplay", () => {
  it("formats up, down, and unchanged vs last 2 weeks", () => {
    expect(availAvgDeltaDisplay(6)).toEqual({
      text: "▲ 6.0h vs last 2 weeks",
      tone: "danger",
    });
    expect(availAvgDeltaDisplay(-2.5)).toEqual({
      text: "▼ 2.5h vs last 2 weeks",
      tone: "success",
    });
    expect(availAvgDeltaDisplay(0)).toEqual({ text: "— vs last 2 weeks", tone: "muted" });
    expect(availAvgDeltaDisplay(null)).toBeNull();
  });
});
