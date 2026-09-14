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
  it("classifies by PARAMETER thresholds, not relative rank", () => {
    const { strengths, needsAttention } = pickStrengthsAndNeeds([
      {
        id: "planningAccuracy",
        label: "Planning Accuracy",
        displayValue: "91%",
        nativeValue: 91,
        rankPct: 91,
      },
      {
        id: "beh_c1",
        label: "Core Understanding",
        displayValue: "5.0 / 5",
        nativeValue: 5,
        rankPct: scoreOutOf5ToRankPct(5),
      },
      {
        id: "confirmationDiscipline",
        label: "Confirmation Discipline",
        displayValue: "96%",
        nativeValue: 96,
        rankPct: 96,
      },
      {
        id: "unplannedPct",
        label: "Unplanned Work",
        displayValue: "21%",
        nativeValue: 21,
        rankPct: invertPctForRank(21),
      },
      {
        id: "beh_gov",
        label: "Customer Governance",
        displayValue: "3.0 / 5",
        nativeValue: 3,
        rankPct: scoreOutOf5ToRankPct(3),
      },
      {
        id: "focusPct",
        label: "Focus %",
        displayValue: "85%",
        nativeValue: 85,
        rankPct: 85,
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
    // Strength: plan 91, conf 96, competency 100%; middle Focus 85 omitted
    expect(strengths.map((s) => s.id)).toEqual([
      "beh_c1",
      "confirmationDiscipline",
      "planningAccuracy",
    ]);
    // Need: unplanned 21, competency 60%; Focus middle omitted
    expect(needsAttention.map((s) => s.id)).toEqual(["beh_gov", "unplannedPct"]);
    expect(strengths[0]?.displayValue).toBe("5.0 / 5");
  });

  it("scenario 2: threshold bands + first competency only when equal %", () => {
    const { strengths, needsAttention } = pickStrengthsAndNeeds(
      [
        { id: "focusPct", label: "Focus %", displayValue: "89%", nativeValue: 89, rankPct: 89 },
        {
          id: "planningAccuracy",
          label: "Planning Accuracy",
          displayValue: "89%",
          nativeValue: 89,
          rankPct: 89,
        },
        {
          id: "confirmationDiscipline",
          label: "Confirmation Discipline",
          displayValue: "89%",
          nativeValue: 89,
          rankPct: 89,
        },
        {
          id: "billableSplitPct",
          label: "Billable Split",
          displayValue: "92%",
          nativeValue: 92,
          rankPct: 92,
        },
        {
          id: "unplannedPct",
          label: "Unplanned Work",
          displayValue: "21%",
          nativeValue: 21,
          rankPct: invertPctForRank(21),
        },
        {
          id: "beh_c1",
          label: "C1",
          displayValue: "3.5 / 5",
          nativeValue: 3.5,
          rankPct: scoreOutOf5ToRankPct(3.5),
        },
        {
          id: "beh_c3",
          label: "C3",
          displayValue: "3.5 / 5",
          nativeValue: 3.5,
          rankPct: scoreOutOf5ToRankPct(3.5),
        },
        {
          id: "beh_c6",
          label: "C6",
          displayValue: "3.5 / 5",
          nativeValue: 3.5,
          rankPct: scoreOutOf5ToRankPct(3.5),
        },
        {
          id: "beh_c7",
          label: "C7",
          displayValue: "5.0 / 5",
          nativeValue: 5,
          rankPct: scoreOutOf5ToRankPct(5),
        },
        {
          id: "beh_c10",
          label: "C10",
          displayValue: "3.0 / 5",
          nativeValue: 3,
          rankPct: scoreOutOf5ToRankPct(3),
        },
      ],
      5
    );
    expect(strengths.map((s) => s.id)).toEqual(["beh_c7", "billableSplitPct"]);
    expect(needsAttention.map((s) => s.id)).toEqual(["beh_c10", "unplannedPct"]);
    // 70% competencies are middle-band — not listed; equal need-attention comps would dedupe
  });

  it("dedupes equal need-attention competencies to the first in order", () => {
    const { needsAttention } = pickStrengthsAndNeeds([
      {
        id: "beh_c1",
        label: "C1",
        displayValue: "2.5 / 5",
        nativeValue: 2.5,
        rankPct: scoreOutOf5ToRankPct(2.5),
      },
      {
        id: "beh_c3",
        label: "C3",
        displayValue: "2.5 / 5",
        nativeValue: 2.5,
        rankPct: scoreOutOf5ToRankPct(2.5),
      },
      {
        id: "unplannedPct",
        label: "Unplanned Work",
        displayValue: "25%",
        nativeValue: 25,
        rankPct: invertPctForRank(25),
      },
    ]);
    expect(needsAttention.map((s) => s.id)).toEqual(["beh_c1", "unplannedPct"]);
  });

  it("puts Unplanned 0% in Strengths, Confirmation 80% in Needs Attention", () => {
    const { strengths, needsAttention } = pickStrengthsAndNeeds([
      {
        id: "focusPct",
        label: "Focus %",
        displayValue: "197%",
        nativeValue: 197,
        rankPct: 197,
      },
      {
        id: "planningAccuracy",
        label: "Planning Accuracy",
        displayValue: "100%",
        nativeValue: 100,
        rankPct: 100,
      },
      {
        id: "billableSplitPct",
        label: "Billable Split",
        displayValue: "100%",
        nativeValue: 100,
        rankPct: 100,
      },
      {
        id: "confirmationDiscipline",
        label: "Confirmation Discipline",
        displayValue: "80%",
        nativeValue: 80,
        rankPct: 80,
      },
      {
        id: "unplannedPct",
        label: "Unplanned Work",
        displayValue: "0%",
        nativeValue: 0,
        rankPct: invertPctForRank(0),
      },
    ]);
    expect(strengths.map((s) => s.id)).toEqual([
      "focusPct",
      "planningAccuracy",
      "billableSplitPct",
    ]);
    expect(needsAttention.map((s) => s.id)).toEqual(["confirmationDiscipline"]);
    expect(strengths.find((s) => s.id === "unplannedPct")).toBeUndefined();
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
