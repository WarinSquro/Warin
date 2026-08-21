import { describe, expect, it } from "vitest";
import {
  AVAIL_ROWS,
  availAvgDeltaDisplay,
  availFreeOfCapacityLabel,
  availFreeOfCapacityParts,
  availTopFreePeople,
  avgFreeHoursPerPerson,
  computeAvailKpis,
  filterAvailRowsAllSegments,
  filterAvailRowsRollingOffSoon,
  mergeAvailRowsTwoWeeks,
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

describe("mergeAvailRowsTwoWeeks", () => {
  it("sums free hours and capacity and recomputes booked percent", () => {
    const week1 = [row({ id: "a", name: "Ada", freeHours: 40, capacity: 40, bookedPct: 0 })];
    const week2 = [row({ id: "a", name: "Ada", freeHours: 32, capacity: 40, bookedPct: 20 })];
    expect(mergeAvailRowsTwoWeeks(week1, week2)).toEqual([
      expect.objectContaining({
        id: "a",
        freeHours: 72,
        capacity: 80,
        bookedPct: 10,
        availableFrom: "Partial",
      }),
    ]);
  });

  it("includes a person who appears in only one week", () => {
    const week1 = [row({ id: "a", name: "Ada", freeHours: 40, capacity: 40, bookedPct: 0 })];
    const week2 = [row({ id: "b", name: "Bea", freeHours: 34, capacity: 34, bookedPct: 0 })];
    expect(mergeAvailRowsTwoWeeks(week1, week2).map((r) => r.id).sort()).toEqual(["a", "b"]);
  });

  it("is Now when both weeks are fully free", () => {
    const week1 = [row({ id: "a", freeHours: 40, capacity: 40, bookedPct: 0 })];
    const week2 = [row({ id: "a", freeHours: 34, capacity: 34, bookedPct: 0 })];
    expect(mergeAvailRowsTwoWeeks(week1, week2)[0]?.availableFrom).toBe("Now");
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

  it("averages free hours across list rows (no 2-week double-count)", () => {
    // Selected-week free hours from the All list (user sample). Sum = 519.0 → avg 27.3.
    const freeTenths = [
      425, 425, 425, 425, 425, 375, 340, 310, 255, 250, 250, 245, 170, 170, 170, 170, 170, 105, 85,
    ];
    expect(freeTenths).toHaveLength(19);
    expect(freeTenths.reduce((s, n) => s + n, 0)).toBe(5190);
    const listWeek = freeTenths.map((t, i) => row({ id: `p${i}`, freeHours: t / 10 }));
    expect(avgFreeHoursPerPerson(listWeek)).toBe(27.3);
  });

  it("does not inflate the average by concatenating a second week of the same people", () => {
    const week1 = [row({ id: "a", freeHours: 40 }), row({ id: "b", freeHours: 20 })];
    const week2 = [row({ id: "a", freeHours: 40 }), row({ id: "b", freeHours: 20 })];
    // Wrong historical approach: sum both weeks / unique people → 60
    expect(avgFreeHoursPerPerson([...week1, ...week2])).toBe(30);
    expect(avgFreeHoursPerPerson(week1)).toBe(30);
  });
});

describe("availAvgDeltaDisplay", () => {
  it("formats up, down, and unchanged vs prior week", () => {
    expect(availAvgDeltaDisplay(6)).toEqual({
      text: "▲ 6.0h vs prior week",
      tone: "danger",
    });
    expect(availAvgDeltaDisplay(-2.5)).toEqual({
      text: "▼ 2.5h vs prior week",
      tone: "success",
    });
    expect(availAvgDeltaDisplay(0)).toEqual({ text: "— vs prior week", tone: "muted" });
    expect(availAvgDeltaDisplay(null)).toBeNull();
  });
});

describe("availFreeOfCapacityLabel", () => {
  it("formats of-capacity hours and rounded percent", () => {
    expect(availFreeOfCapacityLabel(170, 250)).toBe("of 250.0h (68%)");
    expect(availFreeOfCapacityLabel(1165, 2500)).toBe("of 2500.0h (47%)");
  });

  it("is 0% when capacity is 0", () => {
    expect(availFreeOfCapacityLabel(10, 0)).toBe("of 0.0h (0%)");
  });
});

describe("availFreeOfCapacityParts", () => {
  it("splits hours suffix from percent", () => {
    expect(availFreeOfCapacityParts(170, 250)).toEqual({ ofHours: "of 250.0h", pct: 68 });
  });

  it("marks percents above 20 as the critical threshold for the KPI", () => {
    expect(availFreeOfCapacityParts(50, 250).pct).toBe(20);
    expect(availFreeOfCapacityParts(52.5, 250).pct).toBeGreaterThan(20);
  });
});

describe("availTopFreePeople", () => {
  it("returns up to 3 people with the highest free hours", () => {
    const rows = [
      row({ id: "a", name: "Ada", freeHours: 10 }),
      row({ id: "b", name: "Bea", freeHours: 40 }),
      row({ id: "c", name: "Cal", freeHours: 38 }),
      row({ id: "d", name: "Dee", freeHours: 32 }),
    ];
    expect(availTopFreePeople(rows).map((r) => r.id)).toEqual(["b", "c", "d"]);
  });

  it("omits people with no free hours and returns fewer than 3 when needed", () => {
    const rows = [
      row({ id: "a", name: "Ada", freeHours: 8 }),
      row({ id: "b", name: "Bea", freeHours: 0 }),
    ];
    expect(availTopFreePeople(rows).map((r) => r.id)).toEqual(["a"]);
  });
});
