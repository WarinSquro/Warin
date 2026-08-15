import { describe, expect, it } from "vitest";
import { dayStripForWeekOffset, workingDayOffsetsFromMonday } from "../../data/planner";

/** Saturday 15 Aug 2026 — week Mon 10 … Sun 16. */
const SAT_15_AUG_2026 = new Date(2026, 7, 15);

describe("workingDayOffsetsFromMonday", () => {
  it("defaults to Mon–Fri", () => {
    expect(workingDayOffsetsFromMonday()).toEqual([0, 1, 2, 3, 4]);
  });

  it("includes Saturday when selected", () => {
    expect(
      workingDayOffsetsFromMonday(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"])
    ).toEqual([0, 1, 2, 3, 4, 5]);
  });
});

describe("dayStripForWeekOffset", () => {
  it("shows Mon–Fri by default (Aug 10 – Aug 14)", () => {
    const strip = dayStripForWeekOffset(0, SAT_15_AUG_2026);
    expect(strip.dayStartIso).toEqual([
      "2026-08-10",
      "2026-08-11",
      "2026-08-12",
      "2026-08-13",
      "2026-08-14",
    ]);
    expect(strip.currentDayIndex).toBe(-1);
  });

  it("shows Mon–Sat when Saturday is a working day (Aug 10 – Aug 15)", () => {
    const strip = dayStripForWeekOffset(0, SAT_15_AUG_2026, [
      "Mon",
      "Tue",
      "Wed",
      "Thu",
      "Fri",
      "Sat",
    ]);
    expect(strip.dayStartIso).toEqual([
      "2026-08-10",
      "2026-08-11",
      "2026-08-12",
      "2026-08-13",
      "2026-08-14",
      "2026-08-15",
    ]);
    expect(strip.days[5]).toBe("Sat 15");
    expect(strip.currentDayIndex).toBe(5);
  });
});
