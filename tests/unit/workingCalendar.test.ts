import { describe, expect, it } from "vitest";
import {
  isWorkingWeekday,
  normalizedWorkingDays,
  weekStartMonday,
  workingDatesInWeek,
  workingDayHeaderLetters,
  workingDayStatus,
} from "../../utils/workingCalendar";

/** Saturday 15 Aug 2026 */
const SAT = "2026-08-15";
const FRI = "2026-08-14";
const SUN = "2026-08-16";
const MON_SAT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

describe("workingCalendar", () => {
  it("defaults to Mon–Fri when working days are omitted", () => {
    expect(normalizedWorkingDays()).toEqual(["Mon", "Tue", "Wed", "Thu", "Fri"]);
    expect(isWorkingWeekday(FRI)).toBe(true);
    expect(isWorkingWeekday(SAT)).toBe(false);
    expect(workingDayStatus(SAT).reason).toBe("Non-working day");
  });

  it("treats Saturday as a working day when Settings includes Sat", () => {
    expect(isWorkingWeekday(SAT, MON_SAT)).toBe(true);
    expect(workingDayStatus(SAT, { workingDays: MON_SAT })).toEqual({
      ok: true,
      reason: null,
    });
    expect(workingDayStatus(SUN, { workingDays: MON_SAT }).ok).toBe(false);
  });

  it("normalizes Saturday / sat labels from Settings", () => {
    expect(normalizedWorkingDays(["Monday", "sat"])).toEqual(["Mon", "Sat"]);
    expect(isWorkingWeekday(SAT, ["Saturday"])).toBe(true);
  });

  it("marks company off-days as holidays even on a working weekday", () => {
    const status = workingDayStatus(SAT, {
      workingDays: MON_SAT,
      companyOffDays: [{ date: SAT, label: "Independence Day" }],
    });
    expect(status.ok).toBe(false);
    expect(status.reason).toBe("Holiday · Independence Day");
  });

  it("builds Mon–Sat week dates and headers from Settings", () => {
    expect(weekStartMonday(SAT)).toBe("2026-08-10");
    expect(workingDatesInWeek("2026-08-10", MON_SAT)).toEqual([
      "2026-08-10",
      "2026-08-11",
      "2026-08-12",
      "2026-08-13",
      "2026-08-14",
      "2026-08-15",
    ]);
    expect(workingDayHeaderLetters(MON_SAT)).toEqual(["M", "T", "W", "T", "F", "S"]);
  });
});
