import type { ImpactRow, UtilBands } from "../data/settings";

export type UtilBandKey = "idle" | "optimal" | "over";

export function classifyUtilBand(pct: number, bands: UtilBands): UtilBandKey {
  if (pct > bands.optimalTo) return "over";
  if (pct >= bands.idleBelow) return "optimal";
  return "idle";
}

const BAND_LABEL: Record<UtilBandKey, string> = {
  idle: "Idle / Under",
  optimal: "Optimal",
  over: "Overloaded",
};

const BAND_TONE: Record<UtilBandKey, ImpactRow["tone"]> = {
  idle: "muted",
  optimal: "success",
  over: "danger",
};

export type SettingsBandImpact = {
  rows: ImpactRow[];
  summary: string;
  totalReclassified: number;
};

/** Compare people counts per util band before vs after threshold change. */
export function computeSettingsBandImpact(
  utilizationPcts: number[],
  before: UtilBands,
  after: UtilBands
): SettingsBandImpact {
  const beforeCounts: Record<UtilBandKey, number> = { idle: 0, optimal: 0, over: 0 };
  const afterCounts: Record<UtilBandKey, number> = { idle: 0, optimal: 0, over: 0 };
  const shifts: Record<string, number> = {};

  for (const pct of utilizationPcts) {
    const b = classifyUtilBand(pct, before);
    const a = classifyUtilBand(pct, after);
    beforeCounts[b] += 1;
    afterCounts[a] += 1;
    if (b !== a) {
      const key = `${b}->${a}`;
      shifts[key] = (shifts[key] ?? 0) + 1;
    }
  }

  const rows: ImpactRow[] = (["idle", "optimal", "over"] as UtilBandKey[]).map((band) => ({
    band: BAND_LABEL[band],
    before: beforeCounts[band],
    after: afterCounts[band],
    tone: BAND_TONE[band],
  }));

  const totalReclassified = Object.values(shifts).reduce((s, n) => s + n, 0);

  if (totalReclassified === 0) {
    return {
      rows,
      totalReclassified: 0,
      summary:
        utilizationPcts.length === 0
          ? "No active resources with utilization data — band labels are unchanged."
          : "No people change band labels with these settings. Hours are unchanged — only classification thresholds were reviewed.",
    };
  }

  // Prefer a natural sentence for the largest single shift.
  const top = Object.entries(shifts).sort((a, b) => b[1] - a[1])[0]!;
  const [fromTo, count] = top;
  const [fromKey, toKey] = fromTo.split("->") as [UtilBandKey, UtilBandKey];
  const fromLabel = BAND_LABEL[fromKey].replace(" / Under", "");
  const toLabel = BAND_LABEL[toKey].replace(" / Under", "");

  let directionHint = "Adjusting utilization bands";
  if (fromKey === "optimal" && toKey === "idle" && after.idleBelow > before.idleBelow) {
    directionHint = "Raising the idle threshold";
  } else if (fromKey === "idle" && toKey === "optimal" && after.idleBelow < before.idleBelow) {
    directionHint = "Lowering the idle threshold";
  } else if (fromKey === "optimal" && toKey === "over" && after.optimalTo < before.optimalTo) {
    directionHint = "Lowering the optimal ceiling";
  } else if (fromKey === "over" && toKey === "optimal" && after.optimalTo > before.optimalTo) {
    directionHint = "Raising the optimal ceiling";
  }

  const people = count === 1 ? "1 person" : `${count} people`;
  const extra =
    totalReclassified > count
      ? ` (${totalReclassified} people reclassified in total across bands).`
      : ".";

  return {
    rows,
    totalReclassified,
    summary: `${directionHint} reclassifies ${people} from ${fromLabel} into ${toLabel}${extra} No hours change — only how they're labelled.`,
  };
}
