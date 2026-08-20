import { describe, expect, it } from "vitest";
import {
  WORK_DATE_DAYS,
  workDateDayFilterLabel,
  workDateMatchesDay,
} from "../../utils/workDateDayFilter";

describe("workDateMatchesDay", () => {
  it("lists days 1 through 31", () => {
    expect(WORK_DATE_DAYS).toHaveLength(31);
    expect(WORK_DATE_DAYS[0]).toBe(1);
    expect(WORK_DATE_DAYS[30]).toBe(31);
  });

  it("treats null as all dates", () => {
    expect(workDateMatchesDay("2026-02-28", null)).toBe(true);
    expect(workDateMatchesDay("2026-08-20", null)).toBe(true);
  });

  it("matches the day of the selected month", () => {
    expect(workDateMatchesDay("2026-08-20", 20)).toBe(true);
    expect(workDateMatchesDay("2026-08-19", 20)).toBe(false);
    expect(workDateMatchesDay("2026-07-20", 20)).toBe(true);
  });

  it("does not treat non-existent days as the next month", () => {
    expect(workDateMatchesDay("2026-02-31", 31)).toBe(false);
    expect(workDateMatchesDay("2026-03-03", 31)).toBe(false);
    expect(workDateMatchesDay("2026-02-28", 31)).toBe(false);
    expect(workDateMatchesDay("2026-04-31", 31)).toBe(false);
    expect(workDateMatchesDay("2026-04-30", 30)).toBe(true);
  });

  it("rejects leap-day on non-leap years", () => {
    expect(workDateMatchesDay("2026-02-29", 29)).toBe(false);
    expect(workDateMatchesDay("2024-02-29", 29)).toBe(true);
  });

  it("labels the filter for export", () => {
    expect(workDateDayFilterLabel(null)).toBe("All dates");
    expect(workDateDayFilterLabel(15)).toBe("15");
  });
});
