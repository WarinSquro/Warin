/** Server-side period / trend helpers for Performance Card (mirrors utils/performanceCard). */

export type PerfCardPeriodId =
  | "this_week"
  | "prev_week"
  | "this_month"
  | "prev_month"
  | "this_quarter"
  | "prev_quarter"
  | "custom";

export type TrendStatus = "Improving" | "Improved" | "Off Track" | "Concern" | "Same" | null;
export type MetricDirection = "higher_better" | "lower_better" | "neutral";
export type DateRange = { from: string; to: string };

function todayISO(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function mondayISO(from = new Date()): string {
  const x = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const day = x.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + diff);
  return todayISO(x);
}

export function addDaysISO(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y!, m! - 1, d!);
  date.setDate(date.getDate() + days);
  return todayISO(date);
}

function sundayOfWeek(monday: string): string {
  return addDaysISO(monday, 6);
}

function weekBoundsFromMonday(monday: string): DateRange {
  return { from: monday, to: sundayOfWeek(monday) };
}

function monthIdFromDate(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function shiftMonthId(monthId: string, delta: number): string {
  const [y, m] = monthId.split("-").map(Number);
  return monthIdFromDate(new Date(y!, m! - 1 + delta, 1));
}

function monthBoundsFromId(monthId: string): DateRange {
  const [y, m] = monthId.split("-").map(Number);
  const from = `${y}-${String(m).padStart(2, "0")}-01`;
  const endDay = new Date(y!, m!, 0).getDate();
  const to = `${y}-${String(m).padStart(2, "0")}-${String(endDay).padStart(2, "0")}`;
  return { from, to };
}

function quarterIndex(month: number): number {
  return Math.floor((month - 1) / 3);
}

function quarterBounds(year: number, qIndex: number): DateRange {
  const startMonth = qIndex * 3 + 1;
  const endMonth = startMonth + 2;
  const from = `${year}-${String(startMonth).padStart(2, "0")}-01`;
  const endDay = new Date(year, endMonth, 0).getDate();
  const to = `${year}-${String(endMonth).padStart(2, "0")}-${String(endDay).padStart(2, "0")}`;
  return { from, to };
}

export function areWeeksContinuous(weekMondays: string[]): boolean {
  if (weekMondays.length === 0) return false;
  if (weekMondays.length === 1) return true;
  const sorted = [...weekMondays].map((w) => w.slice(0, 10)).sort();
  for (let i = 1; i < sorted.length; i++) {
    if (addDaysISO(sorted[i - 1]!, 7) !== sorted[i]) return false;
  }
  return true;
}

function customWeeksRange(weekMondays: string[]): DateRange | null {
  if (!areWeeksContinuous(weekMondays)) return null;
  const sorted = [...weekMondays].map((w) => w.slice(0, 10)).sort();
  return { from: sorted[0]!, to: sundayOfWeek(sorted[sorted.length - 1]!) };
}

export function resolvePeriodRange(
  periodId: PerfCardPeriodId,
  opts?: { customWeeks?: string[]; anchor?: Date }
): DateRange {
  const anchor = opts?.anchor ?? new Date();
  const thisMonday = mondayISO(anchor);
  switch (periodId) {
    case "this_week":
      return weekBoundsFromMonday(thisMonday);
    case "prev_week":
      return weekBoundsFromMonday(addDaysISO(thisMonday, -7));
    case "this_month":
      return monthBoundsFromId(monthIdFromDate(anchor));
    case "prev_month":
      return monthBoundsFromId(shiftMonthId(monthIdFromDate(anchor), -1));
    case "this_quarter":
      return quarterBounds(anchor.getFullYear(), quarterIndex(anchor.getMonth() + 1));
    case "prev_quarter": {
      let y = anchor.getFullYear();
      let q = quarterIndex(anchor.getMonth() + 1) - 1;
      if (q < 0) {
        q = 3;
        y -= 1;
      }
      return quarterBounds(y, q);
    }
    case "custom": {
      const range = customWeeksRange(opts?.customWeeks ?? []);
      if (!range) throw new Error("Custom weeks must be continuous");
      return range;
    }
    default:
      return weekBoundsFromMonday(thisMonday);
  }
}

export function previousComparableRange(
  periodId: PerfCardPeriodId,
  current: DateRange,
  opts?: { customWeeks?: string[]; anchor?: Date }
): DateRange {
  switch (periodId) {
    case "this_week":
    case "prev_week":
      // Step from `current`, not from today — required for threePeriodBasis chaining.
      return weekBoundsFromMonday(addDaysISO(current.from, -7));
    case "this_month":
    case "prev_month":
      return monthBoundsFromId(shiftMonthId(current.from.slice(0, 7), -1));
    case "this_quarter":
    case "prev_quarter": {
      const [y, m] = current.from.split("-").map(Number);
      let year = y!;
      let q = quarterIndex(m!) - 1;
      if (q < 0) {
        q = 3;
        year -= 1;
      }
      return quarterBounds(year, q);
    }
    case "custom": {
      const weeks = [...(opts?.customWeeks ?? [])].map((w) => w.slice(0, 10)).sort();
      const n = weeks.length || 1;
      const first = weeks[0] ?? current.from;
      const prevFirst = addDaysISO(first, -7 * n);
      return { from: prevFirst, to: sundayOfWeek(addDaysISO(prevFirst, 7 * (n - 1))) };
    }
    default:
      return current;
  }
}

export function threePeriodBasis(
  periodId: PerfCardPeriodId,
  current: DateRange,
  opts?: { customWeeks?: string[]; anchor?: Date }
): DateRange[] {
  const prev = previousComparableRange(periodId, current, opts);
  const n = opts?.customWeeks?.length ?? 1;
  const prev2 = previousComparableRange(periodId, prev, {
    ...opts,
    customWeeks:
      periodId === "custom" && opts?.customWeeks?.length
        ? opts.customWeeks.map((w) => addDaysISO(w, -7 * n))
        : opts?.customWeeks,
  });
  return [prev2, prev, current];
}

export function compareArrow(
  current: number | null | undefined,
  previous: number | null | undefined,
  direction: MetricDirection
): "up" | "down" | "same" | null {
  if (current == null || previous == null || !Number.isFinite(current) || !Number.isFinite(previous)) {
    return null;
  }
  if (Math.abs(current - previous) < 0.05) return "same";
  const higher = current > previous;
  if (direction === "neutral") return higher ? "up" : "down";
  if (direction === "higher_better") return higher ? "up" : "down";
  return higher ? "down" : "up";
}

export function classifyTrend(
  values: Array<number | null | undefined>,
  direction: MetricDirection
): TrendStatus {
  if (direction === "neutral") return null;
  if (values.length < 3) return null;
  const [a, b, c] = values.slice(-3);
  if (a == null || b == null || c == null) return null;
  const better = (x: number, y: number) =>
    direction === "higher_better" ? x > y + 0.05 : x < y - 0.05;
  const worse = (x: number, y: number) =>
    direction === "higher_better" ? x < y - 0.05 : x > y + 0.05;
  const bBetterA = better(b, a);
  const cBetterB = better(c, b);
  const bWorseA = worse(b, a);
  const cWorseB = worse(c, b);
  if (bBetterA && cBetterB) return "Improving";
  if (bWorseA && cWorseB) return "Concern";
  if (cBetterB) return "Improved";
  if (cWorseB) return "Off Track";
  return "Same";
}

/**
 * Prefer 3-period chip. If that is null/Same but Selection vs Previous clearly moved,
 * fall back to Improved / Off Track so the UI is not arrow-only (e.g. Focus 102% vs 77%).
 */
export function resolveTrendChip(
  series: Array<number | null | undefined>,
  current: number | null | undefined,
  previous: number | null | undefined,
  direction: MetricDirection
): TrendStatus {
  const three = classifyTrend(series, direction);
  if (three && three !== "Same") return three;
  const arrow = compareArrow(current, previous, direction);
  if (arrow === "up") return "Improved";
  if (arrow === "down") return "Off Track";
  return three;
}

export function scoreOutOf5ToRankPct(score: number): number {
  return Math.round((score / 5) * 1000) / 10;
}

export function invertPctForRank(pct: number): number {
  return Math.round((100 - pct) * 10) / 10;
}

export type RankableMetric = {
  id: string;
  label: string;
  displayValue: string;
  nativeValue: number;
  rankPct: number;
  excludeFromSnapshot?: boolean;
};

/** Snapshot parameter families — thresholds from Performance Snapshot PARAMETER table. */
export type SnapshotParamId =
  | "focusPct"
  | "planningAccuracy"
  | "confirmationDiscipline"
  | "billableSplitPct"
  | "unplannedPct"
  | "competency";

export type SnapshotBand = "strength" | "needsAttention" | null;

export function resolveSnapshotParam(m: RankableMetric): SnapshotParamId | null {
  if (m.excludeFromSnapshot) return null;
  switch (m.id) {
    case "focusPct":
      return "focusPct";
    case "planningAccuracy":
      return "planningAccuracy";
    case "confirmationDiscipline":
      return "confirmationDiscipline";
    case "billableSplitPct":
      return "billableSplitPct";
    case "unplannedPct":
      return "unplannedPct";
    default:
      break;
  }
  if (
    m.id === "beh_avg" ||
    m.id === "tech_avg" ||
    m.id.startsWith("beh_") ||
    m.id.startsWith("tech_")
  ) {
    return "competency";
  }
  return null;
}

/**
 * Classify a metric into Strength / Needs Attention using fixed PARAMETER cutoffs.
 * Middle-band values return null (omit from both lists).
 */
export function classifySnapshotBand(m: RankableMetric): SnapshotBand {
  const param = resolveSnapshotParam(m);
  if (!param || !Number.isFinite(m.nativeValue)) return null;

  if (param === "competency") {
    if (!Number.isFinite(m.rankPct)) return null;
    if (m.rankPct >= 100) return "strength";
    if (m.rankPct <= 60) return "needsAttention";
    return null;
  }

  const pct = m.nativeValue;
  if (param === "unplannedPct") {
    if (pct <= 10) return "strength";
    if (pct >= 20) return "needsAttention";
    return null;
  }
  if (param === "billableSplitPct") {
    if (pct >= 90) return "strength";
    if (pct <= 70) return "needsAttention";
    return null;
  }
  // Focus %, Planning Accuracy %, Confirmation Discipline %
  if (pct >= 90) return "strength";
  if (pct <= 80) return "needsAttention";
  return null;
}

/** Among competencies with the same %, keep only the first in input order. */
function dedupeEqualCompetencies(
  list: RankableMetric[],
  inputOrder: RankableMetric[]
): RankableMetric[] {
  const order = new Map(inputOrder.map((m, i) => [m.id, i]));
  const sorted = [...list].sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  const seenPct = new Set<number>();
  const out: RankableMetric[] = [];
  for (const m of sorted) {
    if (resolveSnapshotParam(m) === "competency") {
      if (seenPct.has(m.rankPct)) continue;
      seenPct.add(m.rankPct);
    }
    out.push(m);
  }
  return out;
}

/**
 * Strengths / Needs Attention from PARAMETER thresholds (not relative top/bottom).
 * Only metrics that meet a band are included; then ranked and capped at topN.
 */
export function pickStrengthsAndNeeds(
  metrics: RankableMetric[],
  topN = 3
): { strengths: RankableMetric[]; needsAttention: RankableMetric[] } {
  const eligible = metrics.filter(
    (m) => !m.excludeFromSnapshot && Number.isFinite(m.rankPct) && resolveSnapshotParam(m) != null
  );

  let strengths = eligible.filter((m) => classifySnapshotBand(m) === "strength");
  let needsAttention = eligible.filter((m) => classifySnapshotBand(m) === "needsAttention");

  strengths = dedupeEqualCompetencies(strengths, metrics);
  needsAttention = dedupeEqualCompetencies(needsAttention, metrics);

  strengths.sort((a, b) => b.rankPct - a.rankPct || b.nativeValue - a.nativeValue);
  needsAttention.sort((a, b) => a.rankPct - b.rankPct || a.nativeValue - b.nativeValue);

  const strengthSlice = strengths.slice(0, topN);
  const strengthIds = new Set(strengthSlice.map((s) => s.id));
  return {
    strengths: strengthSlice,
    needsAttention: needsAttention.filter((m) => !strengthIds.has(m.id)).slice(0, topN),
  };
}

export function lastCompletedQuarter(anchor = new Date()): {
  calendarYear: number;
  assessmentCycle: "Q1" | "Q2" | "Q3" | "Q4";
} {
  const q = quarterIndex(anchor.getMonth() + 1);
  let year = anchor.getFullYear();
  let prev = q - 1;
  if (prev < 0) {
    prev = 3;
    year -= 1;
  }
  return { calendarYear: year, assessmentCycle: `Q${prev + 1}` as "Q1" | "Q2" | "Q3" | "Q4" };
}

export function last12WeekStarts(anchor = new Date()): string[] {
  const current = mondayISO(anchor);
  const weeks: string[] = [];
  for (let i = 0; i < 12; i++) weeks.push(addDaysISO(current, -7 * i));
  return weeks;
}

export function isoDate(d: Date): string {
  // Prefer calendar date parts — Prisma `Date` columns arrive as UTC midnight.
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function round0(n: number): number {
  return Math.round(n);
}
