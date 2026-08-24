import { describe, expect, it } from "vitest";
import { isAllCyclesFilter } from "../../apps/oneview-api/src/api/kpi/kpi.util";
import { isKpiCycleExpired } from "../../utils/kpiFilters";

/** Mirrors apps/oneview-api/src/api/kpi/kpi.util.ts monthEndUtc / isPeriodExpired. */
function monthEndUtc(year: number, month1to12: number): Date {
  return new Date(Date.UTC(year, month1to12, 0, 23, 59, 59, 999));
}

function isPeriodExpired(year: number, periodEndMonth: number, now: Date): boolean {
  return now.getTime() > monthEndUtc(year, periodEndMonth).getTime();
}

describe("KPI period vs cycle expiry", () => {
  const midAugust = new Date("2026-08-14T08:00:00.000Z");
  const midJuly = new Date("2026-07-15T08:00:00.000Z");

  it("treats July 2026 period as ended by 14 Aug 2026", () => {
    expect(monthEndUtc(2026, 7).toISOString().startsWith("2026-07-31")).toBe(true);
    expect(isPeriodExpired(2026, 7, midAugust)).toBe(true);
    expect(isPeriodExpired(2026, 7, midJuly)).toBe(false);
  });

  it("does not treat Q3 2026 as ended in mid-August", () => {
    expect(isKpiCycleExpired(2026, "Q3", midAugust)).toBe(false);
    expect(isKpiCycleExpired(2026, "Q2", midAugust)).toBe(true);
  });
});

describe("isAllCyclesFilter", () => {
  it("treats missing, empty, and all as full-year", () => {
    expect(isAllCyclesFilter(undefined)).toBe(true);
    expect(isAllCyclesFilter(null)).toBe(true);
    expect(isAllCyclesFilter("")).toBe(true);
    expect(isAllCyclesFilter("all")).toBe(true);
    expect(isAllCyclesFilter("All")).toBe(true);
    expect(isAllCyclesFilter("Q3")).toBe(false);
  });
});
