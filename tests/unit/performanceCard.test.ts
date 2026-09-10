import { describe, expect, it } from "vitest";
import {
  areWeeksContinuous,
  classifyTrend,
  compareArrow,
  customWeeksRange,
  formatWeekLabelRanges,
  invertPctForRank,
  lastCompletedQuarter,
  pickStrengthsAndNeeds,
  previousComparableRange,
  resolvePeriodRange,
  resolveTrendChip,
  scoreOutOf5ToRankPct,
  threePeriodBasis,
} from "../../utils/performanceCard";

describe("performanceCard periods", () => {
  const anchor = new Date("2026-09-09T12:00:00");

  it("resolves this week / prev week", () => {
    expect(resolvePeriodRange("this_week", { anchor })).toEqual({
      from: "2026-09-07",
      to: "2026-09-13",
    });
    expect(resolvePeriodRange("prev_week", { anchor })).toEqual({
      from: "2026-08-31",
      to: "2026-09-06",
    });
  });

  it("requires continuous custom weeks", () => {
    expect(areWeeksContinuous(["2026-09-07", "2026-08-31"])).toBe(true);
    expect(areWeeksContinuous(["2026-09-07", "2026-08-24"])).toBe(false);
    expect(customWeeksRange(["2026-08-31", "2026-09-07"])).toEqual({
      from: "2026-08-31",
      to: "2026-09-13",
    });
  });

  it("builds previous comparable for custom multi-week", () => {
    const weeks = ["2026-08-31", "2026-09-07"];
    const current = resolvePeriodRange("custom", { customWeeks: weeks, anchor });
    const prev = previousComparableRange("custom", current, { customWeeks: weeks, anchor });
    expect(prev).toEqual({ from: "2026-08-17", to: "2026-08-30" });
  });

  it("returns three-period basis", () => {
    const current = resolvePeriodRange("this_month", { anchor });
    const basis = threePeriodBasis("this_month", current, { anchor });
    expect(basis).toHaveLength(3);
    expect(basis[2]).toEqual(current);
    expect(basis[0]).toEqual({ from: "2026-07-01", to: "2026-07-31" });
    expect(basis[1]).toEqual({ from: "2026-08-01", to: "2026-08-31" });
    expect(basis[2]).toEqual({ from: "2026-09-01", to: "2026-09-30" });
  });

  it("chains this_week / this_quarter without collapsing to the same prior period", () => {
    const week = resolvePeriodRange("this_week", { anchor });
    const weekBasis = threePeriodBasis("this_week", week, { anchor });
    expect(weekBasis.map((r) => r.from)).toEqual([
      "2026-08-24",
      "2026-08-31",
      "2026-09-07",
    ]);

    const q = resolvePeriodRange("this_quarter", { anchor });
    const qBasis = threePeriodBasis("this_quarter", q, { anchor });
    expect(qBasis[0]).toEqual({ from: "2026-01-01", to: "2026-03-31" });
    expect(qBasis[1]).toEqual({ from: "2026-04-01", to: "2026-06-30" });
    expect(qBasis[2]).toEqual({ from: "2026-07-01", to: "2026-09-30" });
  });
});
describe("performanceCard trends", () => {
  it("classifies Improving / Concern / Improved / Off Track", () => {
    expect(classifyTrend([72, 76, 80], "higher_better")).toBe("Improving");
    expect(classifyTrend([84, 80, 76], "higher_better")).toBe("Concern");
    expect(classifyTrend([78, 74, 80], "higher_better")).toBe("Improved");
    expect(classifyTrend([78, 81, 76], "higher_better")).toBe("Off Track");
    expect(classifyTrend([30, 20, 10], "lower_better")).toBe("Improving");
  });

  it("compareArrow respects direction", () => {
    expect(compareArrow(80, 70, "higher_better")).toBe("up");
    expect(compareArrow(10, 20, "lower_better")).toBe("up");
    expect(compareArrow(20, 10, "lower_better")).toBe("down");
  });

  it("resolveTrendChip falls back to Selection vs Previous when 3-period is null/Same", () => {
    // Incomplete series (oldest missing) — Focus 102% vs 77% case
    expect(resolveTrendChip([null, 77, 102], 102, 77, "higher_better")).toBe("Improved");
    expect(resolveTrendChip([null, 90, 70], 70, 90, "higher_better")).toBe("Off Track");
    // Flat 3-period (Same) but Selection vs Previous moved
    expect(resolveTrendChip([80, 80, 80], 102, 77, "higher_better")).toBe("Improved");
    // Prefer real 3-period Improving over fallback
    expect(resolveTrendChip([72, 76, 80], 80, 76, "higher_better")).toBe("Improving");
  });
});

describe("performanceCard strengths ranking", () => {
  it("ranks by converted % then returns native display", () => {
    const { strengths, needsAttention } = pickStrengthsAndNeeds([
      {
        id: "plan",
        label: "Planning Accuracy",
        displayValue: "91%",
        nativeValue: 91,
        rankPct: 91,
      },
      {
        id: "core",
        label: "Core Understanding",
        displayValue: "4.4 / 5",
        nativeValue: 4.4,
        rankPct: scoreOutOf5ToRankPct(4.4),
      },
      {
        id: "conf",
        label: "Confirmation Discipline",
        displayValue: "96%",
        nativeValue: 96,
        rankPct: 96,
      },
      {
        id: "unpl",
        label: "Unplanned Work",
        displayValue: "21%",
        nativeValue: 21,
        rankPct: invertPctForRank(21),
      },
      {
        id: "gov",
        label: "Customer Governance",
        displayValue: "3.2 / 5",
        nativeValue: 3.2,
        rankPct: scoreOutOf5ToRankPct(3.2),
      },
      {
        id: "appr",
        label: "Appreciation",
        displayValue: "1",
        nativeValue: 1,
        rankPct: 10,
        excludeFromSnapshot: true,
      },
    ]);
    expect(strengths.map((s) => s.id)).toEqual(["conf", "plan", "core"]);
    expect(needsAttention.map((s) => s.id)).toEqual(["gov", "unpl"]);
    expect(strengths[0]?.displayValue).toBe("96%");
  });

  it("lastCompletedQuarter from mid Q3 is Q2", () => {
    expect(lastCompletedQuarter(new Date("2026-09-09T12:00:00"))).toEqual({
      calendarYear: 2026,
      assessmentCycle: "Q2",
    });
  });

  it("collapses continuous week labels into ranges", () => {
    expect(
      formatWeekLabelRanges(["W01", "W02", "W03", "W04", "W05", "W06", "W07", "W08", "W09", "W12"])
    ).toBe("W01 - W09, W12");
    expect(formatWeekLabelRanges(["W01", "W02", "W03", "W04", "W05", "W06", "W07", "W08", "W09", "W10", "W11", "W12"])).toBe(
      "W01 - W12"
    );
    expect(formatWeekLabelRanges(["W01", "W03", "W04", "W05", "W12"])).toBe("W01, W03 - W05, W12");
    expect(formatWeekLabelRanges(["W07"])).toBe("W07");
  });
});
