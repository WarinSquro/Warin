import { describe, expect, it } from "vitest";
import { computeUtilKpis, utilAvgDeltaDisplay, type UtilRow } from "../../data/utilization";
import { classifyUtilBand } from "../../utils/settingsImpact";
import { shiftMonthId } from "../../utils/reportPeriods";

function row(pct: number, band: UtilRow["band"] = "optimal"): UtilRow {
  return {
    id: `u-${pct}`,
    name: "Test",
    initials: "T",
    role: "Dev",
    department: "Engineering",
    pct,
    band,
    trend: [0, 0, 0, pct / 100],
    primaryWork: "Project",
  };
}

describe("shiftMonthId", () => {
  it("steps back one calendar month, including year wrap", () => {
    expect(shiftMonthId("2026-08", -1)).toBe("2026-07");
    expect(shiftMonthId("2026-01", -1)).toBe("2025-12");
  });
});

describe("computeUtilKpis", () => {
  it("sets avgDelta to current avg minus prior-month avg", () => {
    const current = [row(80), row(100)];
    const prior = [row(70), row(90)];
    const kpis = computeUtilKpis(current, prior);
    expect(kpis.avg).toBe(90);
    expect(kpis.avgDelta).toBe(10);
  });

  it("leaves avgDelta null when there is no prior-month data", () => {
    expect(computeUtilKpis([row(80)]).avgDelta).toBeNull();
    expect(computeUtilKpis([row(80)], []).avgDelta).toBeNull();
  });
});

describe("utilAvgDeltaDisplay", () => {
  it("formats up, down, and unchanged vs last month", () => {
    expect(utilAvgDeltaDisplay(4)).toEqual({ text: "▲ 4% vs last mo", tone: "success" });
    expect(utilAvgDeltaDisplay(-3)).toEqual({ text: "▼ 3% vs last mo", tone: "danger" });
    expect(utilAvgDeltaDisplay(0)).toEqual({ text: "— vs last mo", tone: "muted" });
    expect(utilAvgDeltaDisplay(null)).toBeNull();
  });
});

describe("classifyUtilBand uses System Parameters", () => {
  it("treats below Idle below as idle", () => {
    const bands = { idleBelow: 80, optimalTo: 100 };
    expect(classifyUtilBand(79, bands)).toBe("idle");
    expect(classifyUtilBand(80, bands)).toBe("optimal");
    expect(classifyUtilBand(100, bands)).toBe("optimal");
    expect(classifyUtilBand(101, bands)).toBe("over");
  });
});
