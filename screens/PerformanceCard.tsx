import { Fragment, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { FileText, Info, X } from "lucide-react";
import {
  fetchPerformanceCard,
  fetchPerformanceCardResources,
  fetchWeeklyCheckInConfig,
  type PerfCardPayload,
  type PerfCardResource,
} from "../api/domain";
import { CompetencyGuideModal } from "../components/WeeklyCheckInCompetencyRating";
import { FilterSingleSelect } from "../components/FilterSingleSelect";
import { UNPLANNED_WORK_REASONS } from "../data/confirmation";
import type { DepartmentCompetency } from "../data/weeklyCheckIn";
import { useAuth } from "../context/AuthContext";
import { useSettings } from "../context/SettingsContext";
import { useToast } from "../context/ToastContext";
import { useAppDateFormat } from "../hooks/useAppDateFormat";
import {
  DEFAULT_RANKING_LEVELS,
  rankingBarFillClass,
  rankingBarFillForProgress,
  rankingChipClass,
  rankingLevelForScore,
  type RankingLevel,
} from "../data/weeklyCheckIn";
import {
  areWeeksContinuous,
  classifyTrend,
  formatWeekLabelRanges,
  last12WeekStarts,
  PERF_CARD_PERIOD_OPTIONS,
  type PerfCardPeriodId,
  type TrendStatus,
} from "../utils/performanceCard";
import { exportPerformanceCardPdf } from "../utils/performanceCardExport";
import { addDaysISO } from "../utils/reportPeriods";
import { exportReportExcel } from "../utils/reportExport";

/** PDF bar tones — visible slate blues (not near-black brand fill) + brown for low. */
const BAR_BLUE_SOFT = "bg-[#9BB0C4]";
const BAR_BLUE_MID = "bg-[#5B7FA6]";
const BAR_BLUE = "bg-[#2A5580]";
const BAR_BLUE_DEEP = "bg-[#1A3A5C]";
const BAR_BROWN = "bg-[#A67C52]";

/** Contribution share % — higher share is fine: ≥80 green, 70–79 amber, else red. */
function contributionShareBarFill(pct: number | null | undefined): string {
  if (pct == null || !Number.isFinite(pct)) return BAR_BLUE_DEEP;
  if (pct >= 80) return "bg-success";
  if (pct >= 70) return "bg-warning";
  return "bg-danger";
}

/** Unplanned reason share % — lower is better: ≤10 green, 11–15 amber, ≥16 red. */
function unplannedShareBarFill(pct: number | null | undefined): string {
  if (pct == null || !Number.isFinite(pct)) return BAR_BLUE_DEEP;
  if (pct <= 10) return "bg-success";
  if (pct <= 15) return "bg-warning";
  return "bg-danger";
}

function Arrow({ arrow }: { arrow: "up" | "down" | "same" | null }) {
  if (!arrow || arrow === "same") return <span className="text-muted-foreground">→</span>;
  if (arrow === "up") return <span className="text-success">↑</span>;
  return <span className="text-danger">↓</span>;
}

function TrendChip({
  trend,
}: {
  trend: PerfCardPayload["summary"]["focusPct"]["trend"];
}) {
  if (!trend || trend === "Same") return null;
  const tone =
    trend === "Improving"
      ? "border border-[#ABEFC6] bg-[#ECFDF3] text-[#027A48]"
      : trend === "Improved"
        ? "border border-[#D1FADF] bg-[#F6FEF9] text-[#3CCB7F]"
        : trend === "Concern"
          ? "border border-[#FECDCA] bg-[#FEF3F2] text-[#B42318]"
          : "border border-[#FEDF89] bg-[#FFFAEB] text-[#B54708]";
  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold leading-none ${tone}`}>
      {trend}
    </span>
  );
}

/** /5: brown &lt; 3, blue otherwise. %: brown &lt; 60, else blue. */
function progressFillClass(value: number, max: number): string {
  if (max === 5) {
    if (value < 2.5) return BAR_BROWN;
    if (value < 3.5) return BAR_BLUE_MID;
    return BAR_BLUE;
  }
  if (max === 100) {
    if (value < 40) return BAR_BROWN;
    if (value < 70) return BAR_BLUE_MID;
    return BAR_BLUE;
  }
  return BAR_BLUE;
}

function ProgressBar({
  value,
  max = 100,
  fillClass,
}: {
  value: number | null;
  max?: number;
  fillClass?: string;
}) {
  if (value == null) {
    return <div className="h-[6.4px] w-full rounded-full border border-dashed border-border" />;
  }
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className="h-[6.4px] w-full overflow-hidden rounded-full bg-surface-alt">
      <div
        className={`h-full rounded-full ${fillClass ?? progressFillClass(value, max)}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function monthLabel(isoMonday: string): string {
  const d = new Date(`${isoMonday}T12:00:00`);
  return d.toLocaleString("en-GB", { month: "short", year: "numeric" });
}

function weekInRange(monday: string, from: string, to: string): boolean {
  const sun = addDaysISO(monday, 6);
  return monday <= to && sun >= from;
}

function quarterMonthRange(cycle: string): string {
  switch (cycle) {
    case "Q1":
      return "Jan–Mar";
    case "Q2":
      return "Apr–Jun";
    case "Q3":
      return "Jul–Sep";
    case "Q4":
      return "Oct–Dec";
    default:
      return cycle;
  }
}

export function PerformanceCard() {
  const toast = useToast();
  const { formatDate } = useAppDateFormat();
  const { settings } = useSettings();
  const { currentEmployee } = useAuth();
  const [resources, setResources] = useState<PerfCardResource[]>([]);
  const [hrmsId, setHrmsId] = useState("");
  const [period, setPeriod] = useState<PerfCardPeriodId>("prev_week");
  const [customWeeks, setCustomWeeks] = useState<string[]>([]);
  const [data, setData] = useState<PerfCardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [metricModalId, setMetricModalId] = useState<string | null>(null);
  const [compModalOpen, setCompModalOpen] = useState(false);
  const [compModalFocus, setCompModalFocus] = useState<"behavioural" | "technical">("behavioural");
  const [trendHelpOpen, setTrendHelpOpen] = useState(false);
  const [unplannedHelpOpen, setUnplannedHelpOpen] = useState(false);
  const [rankingLevels, setRankingLevels] = useState<RankingLevel[]>(DEFAULT_RANKING_LEVELS);
  const [exportingPdf, setExportingPdf] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const cfg = await fetchWeeklyCheckInConfig();
        const levels = (cfg.rankingLevels ?? [])
          .map((l) => ({
            value: l.value as RankingLevel["value"],
            title: l.title,
            color: l.color as RankingLevel["color"],
          }))
          .filter((l) => l.value >= 1 && l.value <= 5);
        if (levels.length >= 5) setRankingLevels(levels as RankingLevel[]);
      } catch {
        /* keep DEFAULT_RANKING_LEVELS */
      }
    })();
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetchPerformanceCardResources();
        setResources(res.resources);
        const selfInList = res.resources.find((r) => r.hrmsId === currentEmployee?.id);
        const next = selfInList?.hrmsId ?? res.resources[0]?.hrmsId ?? "";
        setHrmsId(next);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to load resources");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = useCallback(async () => {
    if (!hrmsId) {
      setLoading(false);
      setData(null);
      return;
    }
    if (period === "custom") {
      if (customWeeks.length === 0) {
        setError("Select at least one week");
        setLoading(false);
        return;
      }
      if (!areWeeksContinuous(customWeeks)) {
        setError("Custom weeks must be continuous");
        setLoading(false);
        return;
      }
    }
    setLoading(true);
    setError(null);
    try {
      const card = await fetchPerformanceCard({
        employeeHrmsId: hrmsId,
        period,
        weeks: period === "custom" ? customWeeks : undefined,
      });
      setData(card);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to load Performance Card";
      setError(msg);
      toast.error(msg);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [hrmsId, period, customWeeks, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const resourceOptions = useMemo(
    () =>
      resources.map((r) => ({
        value: r.hrmsId,
        label:
          r.relation === "self"
            ? `${r.name} (Self)`
            : `${r.name} (${r.relation === "direct" ? "Direct" : "Indirect"})`,
      })),
    [resources]
  );

  const metricIds = useMemo(() => {
    const fromProd = data?.productivity.filter((p) => !p.countOnly).map((p) => p.id) ?? [];
    for (const extra of ["unplannedPct", "billableSplitPct"] as const) {
      if (!fromProd.includes(extra)) fromProd.push(extra);
    }
    return fromProd;
  }, [data]);
  const metricModalIndex = metricModalId ? metricIds.indexOf(metricModalId) : -1;

  const availableWeekChips = useMemo(() => {
    if (data?.period.availableWeeks?.length) return data.period.availableWeeks;
    return last12WeekStarts().map((monday) => {
      const sun = addDaysISO(monday, 6);
      return {
        monday,
        label: `${monday.slice(5)} – ${sun.slice(5)}`,
      };
    });
  }, [data]);

  const handleExportPdf = useCallback(() => {
    if (!data || loading || exportingPdf) return;
    setExportingPdf(true);
    try {
      const result = exportPerformanceCardPdf(data, {
        formatDate,
        dateFormat: settings.dateFormat,
      });
      if (result.ok) toast.success(result.message);
      else toast.error(result.message);
    } finally {
      setExportingPdf(false);
    }
  }, [data, loading, exportingPdf, formatDate, settings.dateFormat, toast]);

  const toggleWeek = (monday: string) => {
    setCustomWeeks((prev) => {
      const next = prev.includes(monday) ? prev.filter((w) => w !== monday) : [...prev, monday];
      return next;
    });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <header className="flex h-14 flex-shrink-0 items-center justify-between gap-3 border-b border-border bg-surface px-5">
        <div>
          <div className="text-[15px] font-semibold tracking-tight text-foreground">
            Performance Card
          </div>
          <div className="text-[12px] text-muted-foreground">
            Individual performance, contribution and growth · view only
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <FilterSingleSelect
            value={hrmsId}
            onChange={setHrmsId}
            options={resourceOptions}
            aria-label="Resource"
          />
          <FilterSingleSelect
            value={period}
            onChange={(v) => setPeriod(v as PerfCardPeriodId)}
            options={PERF_CARD_PERIOD_OPTIONS.map((o) => ({ value: o.id, label: o.label }))}
            aria-label="Period"
          />
          <button
            type="button"
            onClick={handleExportPdf}
            disabled={!data || loading || exportingPdf}
            className="flex cursor-pointer items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-1.5 text-[12px] font-medium text-foreground hover:bg-surface-alt disabled:cursor-not-allowed disabled:opacity-50"
            title="Export Performance Card as PDF"
          >
            <FileText className="h-3.5 w-3.5" />
            {exportingPdf ? "…" : "PDF"}
          </button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-auto bg-background p-5">
        {period === "custom" && (
          <div className="mb-4 rounded-lg border border-border bg-surface p-3">
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted">
              Custom weeks (continuous selection)
            </div>
            <div className="flex flex-wrap gap-1.5">
              {availableWeekChips.map((w) => {
                const on = customWeeks.includes(w.monday);
                return (
                  <button
                    key={w.monday}
                    type="button"
                    onClick={() => toggleWeek(w.monday)}
                    className={`cursor-pointer rounded-md border px-2.5 py-1 text-[11px] ${
                      on
                        ? "border-brand bg-brand text-white"
                        : "border-border bg-surface text-muted hover:bg-surface-alt"
                    }`}
                  >
                    {w.label}
                  </button>
                );
              })}
            </div>
            {customWeeks.length > 0 && !areWeeksContinuous(customWeeks) && (
              <div className="mt-2 text-[11px] text-danger">
                Selected weeks must form a continuous range.
              </div>
            )}
          </div>
        )}

        {error && <div className="mb-3 text-[12px] text-danger">{error}</div>}
        {loading ? (
          <div className="py-16 text-center text-[12px] text-muted-foreground">Loading…</div>
        ) : !data ? (
          <div className="py-16 text-center text-[12px] text-muted-foreground">No data.</div>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="text-[12px] text-muted-foreground">
              {data.resource.name}
              {data.resource.department ? ` · ${data.resource.department}` : ""} ·{" "}
              {formatDate(data.period.from)} – {formatDate(data.period.to)}
              <span className="text-muted">
                {" "}
                · vs {formatDate(data.period.previousFrom)} – {formatDate(data.period.previousTo)}
              </span>
            </div>

            {/* Summary cards */}
            <div className="perf-card-print-break grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <SummaryCard title="Competency">
                <MiniMetric
                  label="Behavioural"
                  score={data.summary.behavioural.current}
                  prevScore={data.summary.behavioural.previous}
                  trend={data.summary.behavioural.trend}
                  max={5}
                  unit="of5"
                  rankingLevels={rankingLevels}
                />
                <MiniMetric
                  label="Technical"
                  score={data.summary.technical.current}
                  prevScore={data.summary.technical.previous}
                  trend={data.summary.technical.trend}
                  max={5}
                  unit="of5"
                  rankingLevels={rankingLevels}
                />
              </SummaryCard>
              <SummaryCard title="Execution Discipline">
                <MiniMetric
                  label="Planning Accuracy"
                  score={data.summary.planningAccuracy.current}
                  prevScore={data.summary.planningAccuracy.previous}
                  trend={data.summary.planningAccuracy.trend}
                  max={100}
                  unit="percent"
                  rankingLevels={rankingLevels}
                />
                <MiniMetric
                  label="Confirmation Discipline"
                  score={data.summary.confirmationDiscipline.current}
                  prevScore={data.summary.confirmationDiscipline.previous}
                  trend={data.summary.confirmationDiscipline.trend}
                  max={100}
                  unit="percent"
                  rankingLevels={rankingLevels}
                />
              </SummaryCard>
              <BigMetricCard
                title="Focus"
                score={data.summary.focusPct.current}
                prevScore={data.summary.focusPct.previous}
                arrow={data.summary.focusPct.arrow}
                trend={data.summary.focusPct.trend}
                barScale="higher_better"
                onClick={() => setMetricModalId("focusPct")}
                hint="Click for 12-week chart"
              />
              <BigMetricCard
                title="Unplanned Work"
                score={data.summary.unplannedPct.current}
                prevScore={data.summary.unplannedPct.previous}
                arrow={data.summary.unplannedPct.arrow}
                trend={data.summary.unplannedPct.trend}
                barScale="unplanned"
                onClick={() => setMetricModalId("unplannedPct")}
                hint="Click for 12-week chart"
              />
              <BigMetricCard
                title="Billable Split"
                score={data.summary.billableSplitPct.current}
                prevScore={data.summary.billableSplitPct.previous}
                arrow={data.summary.billableSplitPct.arrow}
                trend={data.summary.billableSplitPct.trend}
                barScale="higher_better"
                onClick={() => setMetricModalId("billableSplitPct")}
                hint="Click for 12-week chart"
              />
            </div>

            {/* Behavioural + Technical as separate cards (UI PDF) */}
            <div className="perf-card-print-break grid grid-cols-1 gap-4 lg:grid-cols-2">
              <CompetencyCard
                title="Behavioural Competencies"
                kind="behavioural"
                avg={data.competencies.behaviouralAvg}
                trend={data.summary.behavioural.trend}
                rows={data.competencies.behavioural}
                reviewWeeksInPeriod={countCompetencyReviewWeeks(data, "behavioural")}
                rankingLevels={rankingLevels}
                onViewDetail={() => {
                  setCompModalFocus("behavioural");
                  setCompModalOpen(true);
                }}
              />
              <CompetencyCard
                title="Technical Competencies"
                kind="technical"
                avg={data.competencies.technicalAvg}
                trend={data.summary.technical.trend}
                rows={data.competencies.technical}
                reviewWeeksInPeriod={countCompetencyReviewWeeks(data, "technical")}
                rankingLevels={rankingLevels}
                onViewDetail={() => {
                  setCompModalFocus("technical");
                  setCompModalOpen(true);
                }}
              />
            </div>

            {/* Work & Productivity + Contribution */}
            <div className="perf-card-print-break grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-2">
              <section className="min-w-0 overflow-hidden rounded-lg border border-border bg-surface p-4">
                <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                  <div className="flex items-center gap-1">
                    <h2 className="text-[13px] font-semibold text-foreground">
                      Work &amp; Productivity
                    </h2>
                    <button
                      type="button"
                      onClick={() => setTrendHelpOpen(true)}
                      className="inline-flex cursor-pointer rounded p-0.5 text-muted-foreground hover:bg-surface-alt hover:text-foreground print:hidden"
                      aria-label="Trend values help"
                      title="Trend values"
                    >
                      <Info className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <span className="text-[11px] text-muted-foreground print:hidden">
                    Click a row for last 12 weeks
                  </span>
                </div>
                <table className="w-full text-left text-[12px]">
                  <thead>
                    <tr className="text-[10px] uppercase tracking-wide text-muted">
                      <th className="pb-2 font-semibold">Metric</th>
                      <th className="pb-2 font-semibold">Selection</th>
                      <th className="pb-2 font-semibold">Previous</th>
                      <th className="pb-2 font-semibold">Trend</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.productivity.map((row) => (
                      <tr
                        key={row.id}
                        className={
                          row.countOnly
                            ? "border-t border-border-soft"
                            : "cursor-pointer border-t border-border-soft hover:bg-surface-alt"
                        }
                        onClick={() => {
                          if (!row.countOnly) setMetricModalId(row.id);
                        }}
                      >
                        <td className="py-2 text-foreground">
                          {row.label}
                          {row.countOnly && (
                            <span className="ml-1 text-[10px] text-muted-foreground">(count)</span>
                          )}
                        </td>
                        <td className="py-2">{row.currentDisplay}</td>
                        <td className="py-2 text-muted-foreground">{row.previousDisplay}</td>
                        <td className="py-2">
                          {row.countOnly ? (
                            <span className="text-muted-foreground">—</span>
                          ) : (
                            <span className="inline-flex items-center gap-1">
                              <Arrow arrow={row.arrow} />
                              <TrendChip trend={row.trend} />
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="mt-2 text-[10px] text-muted-foreground">
                  Count-only rows (leaves are not scored by the trend engine)
                </p>
              </section>

              <div className="flex min-w-0 flex-col gap-4">
              <section className="min-w-0 overflow-hidden rounded-lg border border-border bg-surface p-4">
                <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="text-[13px] font-semibold text-foreground">Contribution</h2>
                  <span className="text-[11px] text-muted-foreground">Where the effort went</span>
                </div>
                {data.contribution.rows.length === 0 ? (
                  <div className="py-6 text-center text-[12px] text-muted-foreground">
                    No contribution in this period.
                  </div>
                ) : (
                  <table className="w-full table-fixed text-left text-[12px]">
                    <colgroup>
                      <col className="w-auto" />
                      <col className="w-[4.5rem]" />
                      <col className="w-[4.5rem]" />
                      <col className="w-[3.75rem]" />
                      <col className="w-[4.75rem]" />
                    </colgroup>
                    <thead>
                      <tr className="text-[10px] uppercase tracking-wide text-muted">
                        <th className="pb-2 pr-3 font-semibold">Project</th>
                        <th className="pb-2 px-1.5 text-right font-semibold">Planned</th>
                        <th className="pb-2 px-1.5 text-right font-semibold">Actual</th>
                        <th className="pb-2 px-1.5 text-right font-semibold">Share</th>
                        <th className="pb-2 pl-1.5 text-right font-semibold">Billable</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.contribution.rows.map((r) => (
                        <tr key={`t-${r.project}`} className="border-t border-border-soft">
                          <td className="min-w-0 py-2 pr-3 align-top text-foreground">
                            <div className="min-w-0 break-words [overflow-wrap:anywhere]">
                              {r.project}
                            </div>
                            <div className="mt-1.5 w-full min-w-0">
                              <ProgressBar
                                value={r.sharePct}
                                max={100}
                                fillClass={contributionShareBarFill(r.sharePct)}
                              />
                            </div>
                          </td>
                          <td className="whitespace-nowrap px-1.5 py-2 text-right align-top tabular-nums">
                            {r.plannedHrs}h
                          </td>
                          <td className="whitespace-nowrap px-1.5 py-2 text-right align-top tabular-nums">
                            {r.actualHrs}h
                          </td>
                          <td className="whitespace-nowrap px-1.5 py-2 text-right align-top tabular-nums">
                            {r.sharePct == null ? "—" : `${r.sharePct}%`}
                          </td>
                          <td className="whitespace-nowrap py-2 pl-1.5 text-right align-top tabular-nums">
                            {r.billableHrs}h
                          </td>
                        </tr>
                      ))}
                      <tr className="border-t border-border font-semibold">
                        <td className="py-2 pr-3">TOTAL</td>
                        <td className="whitespace-nowrap px-1.5 py-2 text-right tabular-nums">
                          {data.contribution.totals.plannedHrs}h
                        </td>
                        <td className="whitespace-nowrap px-1.5 py-2 text-right tabular-nums">
                          {data.contribution.totals.actualHrs}h
                        </td>
                        <td className="whitespace-nowrap px-1.5 py-2 text-right tabular-nums">
                          {data.contribution.totals.sharePct == null
                            ? "—"
                            : `${data.contribution.totals.sharePct}%`}
                        </td>
                        <td className="whitespace-nowrap py-2 pl-1.5 text-right tabular-nums">
                          {data.contribution.totals.billableHrs}h
                        </td>
                      </tr>
                    </tbody>
                  </table>
                )}
              </section>

              <section className="min-w-0 overflow-hidden rounded-lg border border-border bg-surface p-4">
                <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                  <div className="flex items-center gap-1">
                    <h2 className="text-[13px] font-semibold text-foreground">Unplanned</h2>
                    <button
                      type="button"
                      onClick={() => setUnplannedHelpOpen(true)}
                      className="inline-flex cursor-pointer rounded p-0.5 text-muted-foreground hover:bg-surface-alt hover:text-foreground print:hidden"
                      aria-label="Unplanned work reasons help"
                      title="Unplanned work reasons"
                    >
                      <Info className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                <table className="w-full table-fixed text-left text-[12px]">
                  <colgroup>
                    <col className="w-auto" />
                    <col className="w-[4.5rem]" />
                    <col className="w-[3.75rem]" />
                  </colgroup>
                  <thead>
                    <tr className="text-[10px] uppercase tracking-wide text-muted">
                      <th className="pb-2 pr-3 font-semibold">Reason</th>
                      <th className="pb-2 px-1.5 text-right font-semibold">Hours</th>
                      <th className="pb-2 pl-1.5 text-right font-semibold">Share</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(
                      data.unplanned?.rows ??
                      UNPLANNED_WORK_REASONS.map((r) => ({
                        reason: r.value,
                        hrs: 0,
                        sharePct: null as number | null,
                      }))
                    ).map((r) => (
                      <tr key={r.reason} className="border-t border-border-soft">
                        <td className="min-w-0 py-2 pr-3 align-top text-foreground">
                          <div className="min-w-0 break-words [overflow-wrap:anywhere]">
                            {r.reason}
                          </div>
                          <div className="mt-1.5 w-full min-w-0">
                            <ProgressBar
                              value={r.sharePct ?? 0}
                              max={100}
                              fillClass={unplannedShareBarFill(r.sharePct)}
                            />
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-1.5 py-2 text-right align-top tabular-nums">
                          {r.hrs}h
                        </td>
                        <td className="whitespace-nowrap py-2 pl-1.5 text-right align-top tabular-nums">
                          {r.sharePct == null ? "—" : `${r.sharePct}%`}
                        </td>
                      </tr>
                    ))}
                    <tr className="border-t border-border font-semibold">
                      <td className="py-2 pr-3">TOTAL</td>
                      <td className="whitespace-nowrap px-1.5 py-2 text-right tabular-nums">
                        {data.unplanned?.totals.hrs ?? 0}h
                      </td>
                      <td className="whitespace-nowrap py-2 pl-1.5 text-right tabular-nums">
                        {data.unplanned?.totals.sharePct == null
                          ? "—"
                          : `${data.unplanned.totals.sharePct}%`}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </section>
              </div>
            </div>

            {/* Snapshot */}
            <section className="perf-card-print-break rounded-lg border border-border bg-surface p-4">
              <h2 className="mb-3 text-[13px] font-semibold text-foreground">Performance Snapshot</h2>
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 lg:gap-0 lg:divide-x lg:divide-[#E4E7EC]">
                <div className="flex min-h-0 flex-col lg:pr-4">
                  <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-success">
                    Strengths
                  </div>
                  <ul className="space-y-1.5 text-[12px]">
                    {data.snapshot.strengths.length === 0 ? (
                      <li className="text-muted-foreground">—</li>
                    ) : (
                      data.snapshot.strengths.map((s) => (
                        <li key={s.id} className="flex justify-between gap-2">
                          <span>{s.label}</span>
                          <span className="font-medium text-foreground">{s.value}</span>
                        </li>
                      ))
                    )}
                  </ul>
                  <p className="mt-auto pt-3 text-[10px] leading-snug text-muted-foreground">
                    Ranked by trend strength, then by value within scale.
                  </p>
                </div>
                <div className="flex min-h-0 flex-col border-t border-border-soft pt-4 lg:border-t-0 lg:px-4 lg:pt-0">
                  <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-danger">
                    Needs Attention
                  </div>
                  <ul className="space-y-1.5 text-[12px]">
                    {data.snapshot.needsAttention.length === 0 ? (
                      <li className="text-muted-foreground">—</li>
                    ) : (
                      data.snapshot.needsAttention.map((s) => (
                        <li key={s.id} className="flex justify-between gap-2">
                          <span>{s.label}</span>
                          <span className="font-medium text-foreground">{s.value}</span>
                        </li>
                      ))
                    )}
                  </ul>
                  <p className="mt-auto pt-3 text-[10px] leading-snug text-muted-foreground">
                    Derived from recorded values and trend only.
                  </p>
                </div>
                <div className="flex min-h-0 flex-col border-t border-border-soft pt-4 lg:border-t-0 lg:pl-4 lg:pt-0">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                      KPI Achievement
                    </div>
                    <span className="rounded-full bg-surface-alt px-2 py-0.5 text-[10px] text-muted-foreground">
                      Last Quarter ·{" "}
                      {quarterMonthRange(data.snapshot.kpiAchievement.assessmentCycle)}{" "}
                      {data.snapshot.kpiAchievement.calendarYear}
                    </span>
                  </div>
                  <ul className="space-y-1.5 text-[12px]">
                    {data.snapshot.kpiAchievement.items.length === 0 ? (
                      <li className="text-muted-foreground">No KPI items for last quarter.</li>
                    ) : (
                      data.snapshot.kpiAchievement.items.map((k) => (
                        <li key={k.id} className="flex justify-between gap-2">
                          <span className="min-w-0 truncate">{k.name}</span>
                          <span className="shrink-0 font-medium">
                            {k.result == null ? "—" : `${k.result}${k.unit ? ` ${k.unit}` : ""}`}
                          </span>
                        </li>
                      ))
                    )}
                  </ul>
                </div>
              </div>
            </section>
          </div>
        )}
      </div>

      {trendHelpOpen && <ProductivityTrendHelpModal onClose={() => setTrendHelpOpen(false)} />}
      {unplannedHelpOpen && (
        <UnplannedReasonsHelpModal onClose={() => setUnplannedHelpOpen(false)} />
      )}

      {data && metricModalId && metricModalIndex >= 0 && (
        <MetricHistoryModal
          data={data}
          metricId={metricModalId}
          metricIds={metricIds}
          onClose={() => setMetricModalId(null)}
          onSelectMetric={setMetricModalId}
        />
      )}

      {data && compModalOpen && (
        <CompetencyHistoryModal
          data={data}
          openedFrom={compModalFocus}
          onClose={() => setCompModalOpen(false)}
        />
      )}
    </div>
  );
}

function ProductivityTrendHelpModal({ onClose }: { onClose: () => void }) {
  const rows: Array<{ trend: string; meaning: string }> = [
    {
      trend: "Improving",
      meaning:
        "Across the last 3 comparable periods, each period is better than the one before (P2 > P1 and P3 > P2).",
    },
    {
      trend: "Improved",
      meaning: "The latest period is better than the middle period (P3 better than P2), but not a full 3-step climb.",
    },
    {
      trend: "Off Track",
      meaning: "The latest period is worse than the middle period (P3 worse than P2).",
    },
    {
      trend: "Concern",
      meaning:
        "Across the last 3 comparable periods, each period is worse than the one before (P2 < P1 and P3 < P2).",
    },
    {
      trend: "Same",
      meaning: "Three periods have data, but there is no clear better/worse step (shown as arrow only or blank chip).",
    },
    {
      trend: "—",
      meaning:
        "Not enough comparable periods with values, empty periods excluded (never treated as 0), or count-only rows.",
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
      <div className="absolute inset-0 bg-brand/40" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="productivity-trend-help-title"
        className="relative z-10 flex max-h-[85vh] w-full max-w-[560px] flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-2xl"
      >
        <div className="flex flex-shrink-0 items-center justify-between border-b border-border-soft px-5 py-3.5">
          <div
            id="productivity-trend-help-title"
            className="text-[15px] font-semibold text-foreground"
          >
            Trend values
          </div>
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer rounded p-1 text-muted-foreground hover:bg-surface-alt hover:text-foreground"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <table className="w-full text-left text-[12px]">
            <thead>
              <tr className="text-[10px] uppercase tracking-wide text-muted">
                <th className="pb-2 pr-3 font-semibold">Trend</th>
                <th className="pb-2 font-semibold">When it shows</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.trend} className="border-t border-border-soft align-top">
                  <td className="py-2 pr-3">
                    {r.trend === "—" ? (
                      <span className="text-muted-foreground">—</span>
                    ) : r.trend === "Same" ? (
                      <span className="font-medium text-foreground">{r.trend}</span>
                    ) : (
                      <TrendChip
                        trend={
                          r.trend as NonNullable<
                            PerfCardPayload["summary"]["focusPct"]["trend"]
                          >
                        }
                      />
                    )}
                  </td>
                  <td className="py-2 text-muted-foreground">{r.meaning}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function UnplannedReasonsHelpModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
      <div className="absolute inset-0 bg-brand/40" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="unplanned-reasons-help-title"
        className="relative z-10 flex max-h-[85vh] w-full max-w-[640px] flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-2xl"
      >
        <div className="flex flex-shrink-0 items-center justify-between border-b border-border-soft px-5 py-3.5">
          <div
            id="unplanned-reasons-help-title"
            className="text-[15px] font-semibold text-foreground"
          >
            Unplanned work reasons
          </div>
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer rounded p-1 text-muted-foreground hover:bg-surface-alt hover:text-foreground"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <div className="overflow-hidden rounded-md border border-border">
            <table className="w-full table-fixed border-collapse text-left text-[12px]">
              <colgroup>
                <col className="w-[38%]" />
                <col />
              </colgroup>
              <thead>
                <tr className="border-b border-border bg-surface-alt">
                  <th className="border-r border-border px-2.5 py-2 font-semibold text-foreground">
                    Reason
                  </th>
                  <th className="px-2.5 py-2 font-semibold text-foreground">Explanation</th>
                </tr>
              </thead>
              <tbody>
                {UNPLANNED_WORK_REASONS.map((r) => (
                  <tr key={r.value} className="border-b border-border last:border-b-0 align-top">
                    <td className="border-r border-border px-2.5 py-2 font-medium text-foreground">
                      {r.value}
                    </td>
                    <td className="break-words px-2.5 py-2 text-muted-foreground">{r.hint}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

function SummaryCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-[#667085]">
        {title}
      </div>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

function MiniTrend({
  trend,
  arrow,
}: {
  trend: TrendStatus;
  arrow?: "up" | "down" | "same" | null;
}) {
  if (!trend || trend === "Same") {
    return <span className="text-[11px] text-[#98A2B3]">—</span>;
  }
  const up =
    arrow === "up"
      ? true
      : arrow === "down"
        ? false
        : trend === "Improving" || trend === "Improved";
  const tone =
    trend === "Improving"
      ? "text-[#067647]"
      : trend === "Improved"
        ? "text-[#3CCB7F]"
        : trend === "Concern"
          ? "text-[#912018]"
          : trend === "Off Track"
            ? "text-[#B54708]"
            : "text-[#667085]";
  return (
    <span className={`text-[11px] font-semibold ${tone}`}>
      {up ? "↑" : "↓"} {trend}
    </span>
  );
}

function MiniMetric({
  label,
  score,
  prevScore,
  trend,
  max = 100,
  unit = "percent",
  rankingLevels = DEFAULT_RANKING_LEVELS,
}: {
  label: string;
  score: number | null;
  prevScore: number | null;
  trend: PerfCardPayload["summary"]["focusPct"]["trend"];
  max?: number;
  unit?: "percent" | "of5";
  rankingLevels?: RankingLevel[];
}) {
  const formatPct = (v: number) =>
    Number.isInteger(v) ? String(v) : (Math.round(v * 10) / 10).toString();
  const scoreText =
    score == null ? "—" : unit === "of5" ? score.toFixed(1) : formatPct(score);
  const prevText =
    prevScore == null
      ? "—"
      : unit === "of5"
        ? prevScore.toFixed(1)
        : `${formatPct(prevScore)}%`;
  const unitLabel = unit === "of5" ? "/ 5" : "%";
  const barFill = rankingBarFillForProgress(score, max, rankingLevels) || BAR_BLUE_DEEP;

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="min-w-0 text-[11.5px] font-medium text-[#101828]">{label}</span>
        <span className="flex shrink-0 items-baseline gap-0.5 tabular-nums">
          <span className="text-[20px] font-semibold leading-none text-[#101828]">{scoreText}</span>
          {score != null && (
            <span className="text-[12px] font-normal text-[#98A2B3]">{unitLabel}</span>
          )}
        </span>
      </div>
      <div className="mt-2">
        <ProgressBar value={score} max={max} fillClass={barFill} />
      </div>
      <div className="mt-1.5 flex items-center justify-between gap-2">
        <span className="text-[11px] text-[#98A2B3]">prev {prevText}</span>
        <MiniTrend trend={trend} />
      </div>
    </div>
  );
}

function BigMetricCard({
  title,
  score,
  prevScore,
  arrow,
  trend,
  barScale = "higher_better",
  onClick,
  hint,
}: {
  title: string;
  score: number | null;
  prevScore: number | null;
  arrow: "up" | "down" | "same" | null;
  trend: PerfCardPayload["summary"]["focusPct"]["trend"];
  barScale?: "higher_better" | "unplanned";
  onClick?: () => void;
  hint?: string;
}) {
  const formatPct = (v: number) =>
    Number.isInteger(v) ? String(v) : (Math.round(v * 10) / 10).toString();
  const scoreText = score == null ? "—" : formatPct(score);
  const prevText = prevScore == null ? "—" : `${formatPct(prevScore)}%`;
  const clickable = Boolean(onClick);
  const barFill =
    barScale === "unplanned"
      ? unplannedShareBarFill(score)
      : contributionShareBarFill(score);

  return (
    <div
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={onClick}
      onKeyDown={
        clickable
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick?.();
              }
            }
          : undefined
      }
      className={`flex h-full min-h-[180px] flex-col rounded-lg border border-border bg-surface p-4 ${
        clickable ? "cursor-pointer hover:border-brand/40 hover:bg-surface-alt" : ""
      }`}
      title={hint}
    >
      <div className="text-[11px] font-semibold uppercase tracking-wide text-[#667085]">
        {title}
      </div>
      <div className="flex min-h-0 flex-1 items-center">
        <div className="flex items-start gap-0.5 tabular-nums text-[#101828]">
          <span className="text-[28px] font-semibold leading-none tracking-tight">{scoreText}</span>
          {score != null && <span className="pt-0.5 text-[13px] font-medium">%</span>}
        </div>
      </div>
      <div className="mt-auto shrink-0">
        <ProgressBar value={score} max={100} fillClass={barFill} />
        <div className="mt-2 flex items-center justify-between gap-2">
          <span className="text-[11px] text-[#98A2B3]">prev {prevText}</span>
          <MiniTrend trend={trend} arrow={arrow} />
        </div>
      </div>
    </div>
  );
}

function countCompetencyReviewWeeks(
  data: PerfCardPayload,
  kind: "behavioural" | "technical"
): number {
  const hist = data.competencies.history ?? [];
  return hist.filter((h) => {
    if (!weekInRange(h.weekStart, data.period.from, data.period.to)) return false;
    const map = kind === "behavioural" ? h.behavioural : h.technical;
    return Object.values(map ?? {}).some((v) => typeof v === "number" && v >= 1 && v <= 5);
  }).length;
}

function CompetencyCard({
  title,
  kind,
  avg,
  trend,
  rows,
  reviewWeeksInPeriod,
  rankingLevels = DEFAULT_RANKING_LEVELS,
  onViewDetail,
}: {
  title: string;
  kind: "behavioural" | "technical";
  avg: number | null;
  trend: PerfCardPayload["summary"]["focusPct"]["trend"];
  rows: Array<{
    id: string;
    name: string;
    score: number | null;
    remark?: string;
    sequence?: number;
  }>;
  reviewWeeksInPeriod: number;
  rankingLevels?: RankingLevel[];
  onViewDetail: () => void;
}) {
  const [guideOpen, setGuideOpen] = useState(false);
  const ordered = [...rows].sort((a, b) => {
    if (a.score == null && b.score == null) return a.name.localeCompare(b.name);
    if (a.score == null) return 1;
    if (b.score == null) return -1;
    if (b.score !== a.score) return b.score - a.score;
    return a.name.localeCompare(b.name);
  });

  const guideCompetencies: DepartmentCompetency[] = rows.map((r, i) => ({
    id: r.id,
    departmentId: "",
    kind,
    label: r.name,
    remark: r.remark ?? "",
    sequence: r.sequence ?? i + 1,
  }));

  const hasUnrated = ordered.some((r) => r.score == null);
  const footerNote = hasUnrated
    ? "Not rated this period — excluded from the average"
    : reviewWeeksInPeriod > 0
      ? `Average of ${reviewWeeksInPeriod} weekly review${
          reviewWeeksInPeriod === 1 ? "" : "s"
        } in this period`
      : "No weekly reviews in this period";

  return (
    <section className="rounded-lg border border-border bg-surface p-4">
      <div className="mb-3">
        <div className="flex items-center gap-1">
          <h2 className="text-[13px] font-semibold text-foreground">{title}</h2>
          <button
            type="button"
            onClick={() => setGuideOpen(true)}
            className="inline-flex cursor-pointer rounded p-0.5 text-muted-foreground hover:bg-surface-alt hover:text-foreground print:hidden"
            aria-label={`${title} guide`}
            title={`${title} guide`}
          >
            <Info className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
          <span>Average: {avg == null ? "—" : `${avg.toFixed(1)} / 5`}</span>
          <TrendChip trend={trend} />
        </div>
      </div>
      {ordered.length === 0 ? (
        <div className="text-[12px] text-muted-foreground">No competencies configured.</div>
      ) : (
        <ul className="space-y-2.5">
          {ordered.map((r) => (
            <li key={r.id}>
              <div className="mb-0.5 flex justify-between text-[12px]">
                <span>{r.name}</span>
                <span className="font-medium">
                  {r.score == null ? "—" : `${r.score.toFixed(1)} / 5`}
                </span>
              </div>
              <ProgressBar
                value={r.score}
                max={5}
                fillClass={scoreBarFill(r.score, rankingLevels) || "bg-warning"}
              />
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3 flex items-end justify-between gap-3 border-t border-border-soft pt-3">
        <p className="min-w-0 flex-1 text-[11px] leading-snug text-muted-foreground">{footerNote}</p>
        <button
          type="button"
          onClick={onViewDetail}
          className="shrink-0 cursor-pointer text-[11px] font-medium text-brand hover:underline print:hidden"
        >
          View 12-week detail →
        </button>
      </div>
      {guideOpen ? (
        <CompetencyGuideModal
          dialogTitle={title}
          showSectionHeaders={false}
          groups={[
            {
              title: kind === "behavioural" ? "Behavioural" : "Technical",
              competencies: guideCompetencies,
            },
          ]}
          onClose={() => setGuideOpen(false)}
        />
      ) : null}
    </section>
  );
}

const METRIC_LABELS: Record<string, string> = {
  focusPct: "Focus %",
  unplannedPct: "Unplanned Work %",
  billableSplitPct: "Billable Split %",
  plannedHrs: "Planned Hrs",
  actualHrs: "Actual Hrs",
  billableHrs: "Billable Hrs",
  focusHrs: "Focus Hrs",
  avgLapDurationMin: "Average Lap Duration",
  unplannedHrs: "Unplanned Hrs",
  planningAccuracy: "Planning Accuracy",
  confirmationDiscipline: "Confirmation Discipline",
};

function metricValue(
  metrics: Record<string, number | null> | undefined,
  id: string
): number | null {
  if (!metrics) return null;
  const v = metrics[id];
  return typeof v === "number" ? v : null;
}

/** Weekly movement: 0 and null both mean “no bar” — show em dash like Planning Accuracy empty weeks. */
function isEmptyWeekValue(v: number | null | undefined): boolean {
  return v == null || v === 0;
}

function metricLabel(id: string, data: PerfCardPayload): string {
  return data.productivity.find((p) => p.id === id)?.label ?? METRIC_LABELS[id] ?? id;
}

function shortMetricLabel(id: string, data: PerfCardPayload): string {
  return metricLabel(id, data).replace(/\bAverage\b/gi, "Avg");
}

function ModalExportClose({
  onExport,
  onClose,
  note,
}: {
  onExport: () => void;
  onClose: () => void;
  note?: string;
}) {
  return (
    <div
      className={`flex gap-3 border-t border-border-soft px-4 py-3 ${
        note ? "items-center justify-between" : "justify-end"
      }`}
    >
      {note ? (
        <p className="min-w-0 flex-1 text-[11px] leading-snug text-[#98A2B3]" title={note}>
          {note}
        </p>
      ) : null}
      <div className="flex shrink-0 gap-2">
        <button
          type="button"
          onClick={onExport}
          className="cursor-pointer rounded-md border border-border bg-surface px-3 py-1.5 text-[12px] font-medium text-foreground hover:bg-surface-alt"
        >
          Export
        </button>
        <button
          type="button"
          onClick={onClose}
          className="cursor-pointer rounded-md bg-brand px-3 py-1.5 text-[12px] font-medium text-white hover:opacity-90"
        >
          Close
        </button>
      </div>
    </div>
  );
}

function MetricHistoryModal({
  data,
  metricId,
  metricIds,
  onClose,
  onSelectMetric,
}: {
  data: PerfCardPayload;
  metricId: string;
  metricIds: string[];
  onClose: () => void;
  onSelectMetric: (id: string) => void;
}) {
  const toast = useToast();
  const { formatDate, formatDateNoYear } = useAppDateFormat();
  const row = data.productivity.find((p) => p.id === metricId);
  const label = metricLabel(metricId, data);
  const direction =
    row?.direction ?? (metricId === "unplannedPct" ? "lower_better" : "higher_better");
  const values = data.weekHistory.map((w) => metricValue(w.metrics, metricId));
  // Match Planning Accuracy: empty weeks (null or 0) are not plotted and not averaged.
  const present = values.filter((v): v is number => !isEmptyWeekValue(v));
  const avg12 = present.length ? present.reduce((a, b) => a + b, 0) / present.length : null;
  const min = present.length ? Math.min(...present) : null;
  const maxVal = present.length ? Math.max(...present) : null;
  const chartMax = Math.max(
    isPctMetric(metricId, label, data) ? 100 : 1,
    ...(present.length ? present : [1])
  );
  const isPct = isPctMetric(metricId, label, data);
  const currentWeek = values[values.length - 1] ?? null;
  const prevWeek = values.length >= 2 ? values[values.length - 2] : null;
  const delta =
    !isEmptyWeekValue(currentWeek) && !isEmptyWeekValue(prevWeek)
      ? Math.round(((currentWeek as number) - (prevWeek as number)) * 10) / 10
      : null;
  const trendForModal =
    row?.trend ??
    (metricId === "unplannedPct"
      ? data.summary.unplannedPct.trend
      : metricId === "billableSplitPct"
        ? data.summary.billableSplitPct.trend
        : metricId === "focusPct"
          ? data.summary.focusPct.trend
          : null);

  const idx = metricIds.indexOf(metricId);
  const prevId = metricIds[(idx - 1 + metricIds.length) % metricIds.length]!;
  const nextId = metricIds[(idx + 1) % metricIds.length]!;

  const missingWeeks = data.weekHistory
    .map((_w, i) => (isEmptyWeekValue(values[i]) ? `W${String(i + 1).padStart(2, "0")}` : null))
    .filter(Boolean) as string[];

  const basisMonthShort = (iso: string) => {
    const d = new Date(`${iso}T12:00:00`);
    return d.toLocaleString("en-US", { month: "short" });
  };
  /** Prefer period mid-point so week/month ranges label the intended month. */
  const basisPeriodMonthShort = (from: string, to: string) => {
    const a = new Date(`${from}T12:00:00`).getTime();
    const b = new Date(`${to}T12:00:00`).getTime();
    if (!Number.isFinite(a) || !Number.isFinite(b)) return basisMonthShort(to);
    const mid = new Date((a + b) / 2);
    return mid.toLocaleString("en-US", { month: "short" });
  };
  const today = new Date();
  const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const currentBasis = data.trendBasis[data.trendBasis.length - 1];
  const currentPeriodInProgress =
    currentBasis != null && todayIso >= currentBasis.from && todayIso <= currentBasis.to;
  const currentBasisMonth = currentBasis ? basisMonthShort(currentBasis.to) : "This period";
  const trendBasisNote =
    trendForModal && currentPeriodInProgress
      ? `The card shows ${trendForModal} because ${currentBasisMonth} is still in progress and counts as a partial period. Trend firms up at month close.`
      : trendForModal
        ? `Trend is ${trendForModal} from the last three comparable periods (empty periods excluded, never treated as 0).`
        : "Empty weeks never count as zero.";

  const footerMissingNote =
    missingWeeks.length > 0
      ? `${formatWeekLabelRanges(missingWeeks)} ${
          missingWeeks.length === 1 ? "has" : "have"
        } no recorded activity — excluded from the average and from trend calculation, never counted as 0%.`
      : undefined;

  const formatBasisValue = (v: number | null) => {
    if (v == null) return "—";
    if (isPct) return `${Number.isInteger(v) ? v : Math.round(v * 10) / 10}%`;
    if (metricId.endsWith("Hrs") || label.includes("Hrs")) {
      return `${Number.isInteger(v) ? v : Math.round(v * 10) / 10}h`;
    }
    return String(Number.isInteger(v) ? v : Math.round(v * 10) / 10);
  };

  const monthBands = useMemo(() => {
    const bands: Array<{ label: string; start: number; span: number }> = [];
    data.weekHistory.forEach((w, i) => {
      const lab = monthLabel(w.weekStart);
      const last = bands[bands.length - 1];
      if (last && last.label === lab) last.span += 1;
      else bands.push({ label: lab, start: i, span: 1 });
    });
    return bands;
  }, [data.weekHistory]);

  const [hoverWeekIdx, setHoverWeekIdx] = useState<number | null>(null);
  useEffect(() => {
    setHoverWeekIdx(null);
  }, [metricId]);

  const weekCount = data.weekHistory.length;
  const midPct = 50;
  const avgPct =
    avg12 == null ? null : Math.max(2, Math.min(100, (avg12 / chartMax) * 100));
  const hoverWeek =
    hoverWeekIdx != null && hoverWeekIdx >= 0 && hoverWeekIdx < weekCount
      ? data.weekHistory[hoverWeekIdx]!
      : null;
  const hoverVal = hoverWeekIdx != null ? values[hoverWeekIdx] ?? null : null;
  const hoverPct = isEmptyWeekValue(hoverVal)
    ? 0
    : Math.max(4, Math.min(100, ((hoverVal as number) / chartMax) * 100));
  const hoverTipLeftPct =
    hoverWeekIdx == null || weekCount === 0
      ? 50
      : Math.min(88, Math.max(12, ((hoverWeekIdx + 0.5) / weekCount) * 100));
  /** Keep tooltip inside the plot (tall bars would otherwise push it outside the modal). */
  const hoverTipBottomPct = isEmptyWeekValue(hoverVal) ? 10 : Math.min(hoverPct + 4, 62);

  const handleExport = () => {
    exportReportExcel({
      title: `${label} — 12 weeks`,
      fileStem: `Performance_Card_${label.replace(/[^a-zA-Z0-9]+/g, "_")}`,
      sheetName: label.slice(0, 31),
      columns: [
        { header: "Week" },
        { header: "Week start" },
        { header: "Value", align: "right" },
      ],
      rows: data.weekHistory.map((w, i) => [
        `W${String(i + 1).padStart(2, "0")}`,
        w.weekStart,
        isEmptyWeekValue(values[i]) ? "—" : values[i],
      ]),
      filterLines: [
        `Resource: ${data.resource.name}`,
        `Period: ${formatDate(data.period.from)} – ${formatDate(data.period.to)}`,
        `12-week average: ${avg12 == null ? "—" : String(Math.round(avg12 * 10) / 10)}`,
        `Coverage: ${present.length} of ${values.length} weeks (empty weeks excluded from average)`,
      ],
    });
    toast.success("Exported Excel");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3 sm:p-5">
      <div className="flex max-h-[min(92vh,860px)] w-full max-w-6xl flex-col overflow-hidden rounded-lg border border-border bg-surface shadow-lg">
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border-soft px-5 py-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <div className="text-[15px] font-semibold text-foreground">{label}</div>
              <TrendChip trend={trendForModal} />
              <span className="rounded-sm bg-surface-alt px-1.5 py-0.5 text-[10px] text-muted-foreground">
                {direction === "lower_better"
                  ? "Lower is better"
                  : direction === "higher_better"
                    ? "Higher is better"
                    : "Neutral"}
              </span>
            </div>
            <div className="mt-0.5 text-[11px] text-muted-foreground">
              {data.resource.name} · Last 12 weeks including current week · W
              {String(data.weekHistory.length).padStart(2, "0")} is in progress
            </div>
          </div>
          <div className="flex shrink-0 items-center justify-end gap-2">
            <div className="flex overflow-hidden rounded-md border border-border">
              <button
                type="button"
                onClick={() => onSelectMetric(prevId)}
                className="cursor-pointer border-r border-border bg-surface px-2.5 py-1 text-[11px] text-foreground hover:bg-surface-alt"
              >
                {shortMetricLabel(prevId, data)}
              </button>
              <button
                type="button"
                onClick={() => onSelectMetric(nextId)}
                className="cursor-pointer bg-surface px-2.5 py-1 text-[11px] text-foreground hover:bg-surface-alt"
              >
                {shortMetricLabel(nextId, data)}
              </button>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="cursor-pointer rounded p-1 hover:bg-surface-alt"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-auto p-5 sm:p-6">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCell
              label="Current week"
              value={isEmptyWeekValue(currentWeek) ? "—" : formatMetricStat(currentWeek as number, isPct)}
              delta={
                delta == null
                  ? undefined
                  : `${delta > 0 ? "↑" : delta < 0 ? "↓" : "→"} ${
                      Number.isInteger(Math.abs(delta))
                        ? Math.abs(delta)
                        : Math.round(Math.abs(delta) * 10) / 10
                    }${isPct ? " pts" : ""}`
              }
              deltaTone={delta == null ? undefined : delta > 0 ? "up" : delta < 0 ? "down" : "flat"}
            />
            <StatCell
              label="12-week average"
              value={avg12 == null ? "—" : formatMetricStat(avg12, isPct)}
            />
            <StatCell
              label="Range"
              value={
                min == null || maxVal == null
                  ? "—"
                  : isPct
                    ? `${formatMetricStat(min, false)}–${formatMetricStat(maxVal, true)}`
                    : `${formatMetricStat(min, false)}–${formatMetricStat(maxVal, false)}`
              }
            />
            <StatCell label="Data coverage" value={`${present.length} of ${values.length} weeks`} />
          </div>

          <div>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                Weekly movement
              </div>
              <div className="flex flex-wrap gap-3 text-[10px] text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <span className={`inline-block h-2.5 w-2.5 rounded-sm ${BAR_BLUE_MID}`} /> Weekly
                  value
                </span>
                {avg12 != null && (
                  <span className="inline-flex items-center gap-1">
                    <span className="inline-block w-4 border-t border-dashed border-[#c47a3a]" />{" "}
                    12-week avg {isPct ? `${Math.round(avg12)}%` : avg12.toFixed(1)}
                  </span>
                )}
                <span className="inline-flex items-center gap-1">
                  <span className="inline-block h-2.5 w-2.5 rounded-sm border border-dashed border-border" />{" "}
                  No data
                </span>
              </div>
            </div>

            <div className="flex gap-2">
              {isPct && (
                <div className="flex h-44 w-8 flex-col justify-between pb-5 pt-3 text-[9px] text-muted-foreground">
                  <span>
                    {chartMax > 100 ? Math.round(chartMax) : 100}%
                  </span>
                  <span>{Math.round(chartMax / 2)}%</span>
                  <span>0</span>
                </div>
              )}
              <div className="min-w-0 flex-1">
                {/*
                  Bars use % height of a fixed plot area (not the label column).
                  Single in-chart tooltip (no per-bar popovers) so hover stays smooth and
                  never expands the modal scroll size.
                */}
                <div className="relative flex h-44 flex-col border-b border-border-soft">
                  <div className="relative min-h-0 flex-1 overflow-hidden pt-4">
                    <div
                      className="relative h-full"
                      onMouseLeave={() => setHoverWeekIdx(null)}
                    >
                      <div
                        className="pointer-events-none absolute left-0 right-0 z-[2] border-t border-[#D0D5DD]"
                        style={{ bottom: `${midPct}%` }}
                      />
                      {avgPct != null && (
                        <div
                          className="pointer-events-none absolute left-0 right-0 z-[2] border-t border-dashed border-[#c47a3a]"
                          style={{ bottom: `${avgPct}%` }}
                        />
                      )}
                      <div className="absolute inset-0 flex items-stretch gap-1">
                        {data.weekHistory.map((w, i) => {
                          const v = values[i];
                          const empty = isEmptyWeekValue(v);
                          // Floor only for positive values — empty weeks match Planning Accuracy (—).
                          const pct = empty
                            ? 0
                            : Math.max(4, Math.min(100, ((v as number) / chartMax) * 100));
                          const isCurrent = i === data.weekHistory.length - 1;
                          const isHovered = hoverWeekIdx === i;
                          const inPeriod = weekInRange(
                            w.weekStart,
                            data.period.from,
                            data.period.to
                          );
                          const fill = empty
                            ? ""
                            : isCurrent
                              ? BAR_BLUE_DEEP
                              : inPeriod
                                ? BAR_BLUE
                                : BAR_BLUE_SOFT;
                          const crossesMid = !empty && pct >= midPct;
                          const crossesAvg = !empty && avgPct != null && pct >= avgPct;
                          return (
                            <div
                              key={w.weekStart}
                              className="relative z-[1] min-w-0 flex-1 cursor-pointer"
                              onMouseEnter={() => setHoverWeekIdx(i)}
                            >
                              {empty ? (
                                <span
                                  className="pointer-events-none absolute left-0 right-0 z-[5] text-center text-[9px] text-muted-foreground"
                                  style={{ bottom: "10px" }}
                                >
                                  —
                                </span>
                              ) : (
                                <span
                                  className={`pointer-events-none absolute left-0 right-0 z-[5] text-center text-[9px] tabular-nums ${
                                    isCurrent || isHovered
                                      ? "font-semibold text-[#101828]"
                                      : "text-muted-foreground"
                                  }`}
                                  style={{ bottom: `calc(${pct}% + 2px)` }}
                                >
                                  {isPct ? Math.round(v as number) : v}
                                </span>
                              )}
                              {empty ? (
                                <div
                                  className="absolute bottom-0 left-0.5 right-0.5 rounded-t border border-dashed border-border bg-transparent"
                                  style={{ height: 8 }}
                                />
                              ) : (
                                <div
                                  className={`absolute bottom-0 left-0.5 right-0.5 rounded-t transition-[box-shadow] duration-150 ${fill} ${
                                    isHovered
                                      ? "shadow-[inset_0_0_0_2px_#175CD3]"
                                      : ""
                                  }`}
                                  style={{ height: `${pct}%` }}
                                />
                              )}
                              {crossesMid && (
                                <div
                                  className="pointer-events-none absolute left-0.5 right-0.5 z-[4] border-t border-white"
                                  style={{ bottom: `${midPct}%` }}
                                  aria-hidden
                                />
                              )}
                              {crossesAvg && (
                                <div
                                  className="pointer-events-none absolute left-0.5 right-0.5 z-[4] border-t border-dashed border-white"
                                  style={{ bottom: `${avgPct}%` }}
                                  aria-hidden
                                />
                              )}
                            </div>
                          );
                        })}
                      </div>
                      {hoverWeek != null && hoverWeekIdx != null && (
                        <div
                          className="pointer-events-none absolute z-30 w-max max-w-[11rem] rounded-md border border-[#E4E7EC] bg-white px-2.5 py-1.5 text-left shadow-md transition-[left,bottom] duration-150 ease-out"
                          style={{
                            left: `${hoverTipLeftPct}%`,
                            bottom: `${hoverTipBottomPct}%`,
                            transform: "translateX(-50%)",
                          }}
                        >
                          <div className="text-[12px] font-semibold leading-tight text-[#101828]">
                            W{String(hoverWeekIdx + 1).padStart(2, "0")}
                          </div>
                          <div className="mt-0.5 text-[11px] leading-tight text-[#667085]">
                            {formatDateNoYear(hoverWeek.weekStart)} –{" "}
                            {formatDateNoYear(addDaysISO(hoverWeek.weekStart, 6))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-1 pb-0.5 pt-1">
                    {data.weekHistory.map((w, i) => {
                      const isCurrent = i === data.weekHistory.length - 1;
                      const isHovered = hoverWeekIdx === i;
                      return (
                        <span
                          key={`lbl-${w.weekStart}`}
                          className={`min-w-0 flex-1 truncate text-center text-[9px] ${
                            isCurrent || isHovered
                              ? "font-semibold text-[#101828]"
                              : "text-muted-foreground"
                          }`}
                        >
                          W{String(i + 1).padStart(2, "0")}
                        </span>
                      );
                    })}
                  </div>
                </div>
                <div className="mt-1 flex text-[9px]">
                  {monthBands.map((b) => {
                    // Mark selected only when a week's Monday falls inside the period
                    // (avoids Aug weeks that spill into Sept marking Aug as selected for This Month).
                    const bandSelected = data.weekHistory
                      .slice(b.start, b.start + b.span)
                      .some(
                        (w) =>
                          w.weekStart >= data.period.from && w.weekStart <= data.period.to
                      );
                    return (
                      <div
                        key={`${b.label}-${b.start}`}
                        className={`truncate px-0.5 pt-0.5 text-center ${
                          bandSelected
                            ? "border-t-2 border-[#101828] font-semibold text-[#101828]"
                            : "border-t border-border-soft text-muted-foreground"
                        }`}
                        style={{ flex: b.span }}
                      >
                        {b.label}
                        {bandSelected ? " · selected" : ""}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="shrink-0 px-5 pb-3 pt-1 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 rounded-md border border-[#E4E7EC] bg-[#F9FAFB] px-4 py-2.5">
            <div className="flex min-w-0 flex-wrap items-center gap-3.5">
              <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.06em] text-[#98A2B3]">
                Trend basis
              </span>
              <div className="flex flex-wrap items-end gap-3">
                {data.trendBasis.map((b, i) => {
                  const isLast = i === data.trendBasis.length - 1;
                  const v = metricValue(b.metrics, metricId);
                  return (
                    <div key={b.from} className="flex items-end gap-3">
                      {i > 0 && (
                        <span className="pb-1 text-[15px] font-medium text-[#D0D5DD]" aria-hidden>
                          →
                        </span>
                      )}
                      <div className="min-w-[2.5rem] text-center">
                        <div
                          className={`mb-0.5 text-[11px] leading-none ${
                            isLast ? "font-medium text-[#667085]" : "text-[#98A2B3]"
                          }`}
                        >
                          {basisPeriodMonthShort(b.from, b.to)}
                        </div>
                        <div
                          className={`text-[20px] font-bold leading-none tabular-nums ${
                            isLast ? "text-[#175CD3]" : "text-[#101828]"
                          }`}
                        >
                          {formatBasisValue(v)}
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div className="flex items-center pb-1">
                  <TrendChip trend={trendForModal} />
                </div>
              </div>
            </div>
            <p className="max-w-md text-[12px] leading-[1.35] text-[#667085] sm:text-right">
              {trendForModal && currentPeriodInProgress ? (
                <>
                  The card shows{" "}
                  <span className="font-semibold text-[#344054]">{trendForModal}</span> because{" "}
                  {currentBasisMonth} is still in progress and counts as a partial period. Trend
                  firms up at month close.
                </>
              ) : (
                trendBasisNote
              )}
            </p>
          </div>
        </div>

        <ModalExportClose
          onExport={handleExport}
          onClose={onClose}
          note={footerMissingNote}
        />
      </div>
    </div>
  );
}

function isPctMetric(id: string, label: string, data?: PerfCardPayload): boolean {
  if (label.includes("%") || id.endsWith("Pct")) return true;
  // API formats these with `%` but ids/labels omit the symbol
  if (id === "planningAccuracy" || id === "confirmationDiscipline") return true;
  const display = data?.productivity.find((p) => p.id === id)?.currentDisplay?.trim();
  if (display?.endsWith("%")) return true;
  return false;
}

function formatMetricStat(value: number, isPct: boolean): string {
  if (isPct) return `${Math.round(value)}%`;
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 10) / 10);
}

function StatCell({
  label,
  value,
  delta,
  deltaTone,
}: {
  label: string;
  value: string;
  delta?: string;
  deltaTone?: "up" | "down" | "flat";
}) {
  const deltaClass =
    deltaTone === "up"
      ? "text-[#027A48]"
      : deltaTone === "down"
        ? "text-[#B42318]"
        : "text-muted-foreground";
  return (
    <div className="rounded-md border border-border-soft px-3 py-2">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-muted">{label}</div>
      <div className="mt-0.5 flex items-baseline gap-2">
        <span className="text-[16px] font-semibold tabular-nums text-foreground">{value}</span>
        {delta ? (
          <span className={`text-[12px] font-medium tabular-nums ${deltaClass}`}>{delta}</span>
        ) : null}
      </div>
    </div>
  );
}

/** 1–5 chip colours from Weekly Check-In Ranking Master. */
function scoreTone(s: number | null, levels: RankingLevel[] = DEFAULT_RANKING_LEVELS): string {
  const level = rankingLevelForScore(s, levels);
  return level ? rankingChipClass(level, true) : "";
}

/** Solid bar fill for week averages — Ranking Master color tokens. */
function scoreBarFill(s: number | null, levels: RankingLevel[] = DEFAULT_RANKING_LEVELS): string {
  const level = rankingLevelForScore(s, levels);
  return level ? rankingBarFillClass(level) : "";
}

/**
 * Competency Detail (12-week modal) average-row bars only.
 * ≤3 red · >3 and ≤4 amber · >4 green.
 */
function competencyDetailAvgBarFill(score: number | null): string {
  if (score == null || !Number.isFinite(score)) return "";
  if (score <= 3) return "bg-danger";
  if (score <= 4) return "bg-warning";
  return "bg-success";
}

function ScoreCell({
  score,
  rankingLevels = DEFAULT_RANKING_LEVELS,
}: {
  score: number | null;
  rankingLevels?: RankingLevel[];
}) {
  // Fill week column width; height tuned for modal density.
  const box =
    "flex h-[26px] w-full items-center justify-center rounded-sm text-[11px] font-semibold tabular-nums";
  if (score == null) {
    return (
      <span
        className={`${box} border border-dashed border-[#D0D5DD] bg-[#F9FAFB] font-normal text-[#98A2B3]`}
        aria-label="No rating"
      >
        —
      </span>
    );
  }
  return <span className={`${box} ${scoreTone(score, rankingLevels)}`}>{score}</span>;
}

function MovementCell({ trend }: { trend: TrendStatus }) {
  if (!trend || trend === "Same") {
    return <span className="text-[11px] text-[#98A2B3]">—</span>;
  }
  return <TrendChip trend={trend} />;
}

function CompetencyHistoryModal({
  data,
  openedFrom: _openedFrom,
  onClose,
}: {
  data: PerfCardPayload;
  openedFrom: "behavioural" | "technical";
  onClose: () => void;
}) {
  const toast = useToast();
  const { formatDate } = useAppDateFormat();
  const [rankingLevels, setRankingLevels] = useState<RankingLevel[]>(DEFAULT_RANKING_LEVELS);
  const weeks = data.competencies.historyWeeks ?? [];
  const history = data.competencies.history ?? [];
  const byWeek = new Map(history.map((h) => [h.weekStart, h]));
  const rater =
    [...history].reverse().find((h) => h.raterName)?.raterName ?? "Resource Owner";

  useEffect(() => {
    void (async () => {
      try {
        const cfg = await fetchWeeklyCheckInConfig();
        const levels = (cfg.rankingLevels ?? [])
          .map((l) => ({
            value: l.value as RankingLevel["value"],
            title: l.title,
            color: l.color as RankingLevel["color"],
          }))
          .filter((l) => l.value >= 1 && l.value <= 5);
        if (levels.length >= 5) setRankingLevels(levels as RankingLevel[]);
      } catch {
        /* keep DEFAULT_RANKING_LEVELS */
      }
    })();
  }, []);

  const scoreScale = useMemo(
    () => [...rankingLevels].sort((a, b) => a.value - b.value),
    [rankingLevels]
  );
  const scoreAt = (
    kind: "behavioural" | "technical",
    row: { id: string; code?: string; name: string },
    weekStart: string
  ): number | null => {
    const h = byWeek.get(weekStart);
    if (!h) return null;
    const map = (kind === "behavioural" ? h.behavioural : h.technical) as Record<string, number>;
    const v =
      (row.code ? map?.[row.code] : undefined) ??
      map?.[row.id] ??
      map?.[row.name];
    return typeof v === "number" && v >= 1 && v <= 5 ? v : null;
  };

  const rowAvg = (
    kind: "behavioural" | "technical",
    row: { id: string; code?: string; name: string }
  ): number | null => {
    const vals = weeks
      .map((w) => scoreAt(kind, row, w))
      .filter((v): v is number => v != null);
    if (!vals.length) return null;
    return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10;
  };

  const rowMovement = (
    kind: "behavioural" | "technical",
    row: { id: string; code?: string; name: string }
  ): TrendStatus => {
    const series = weeks.map((w) => scoreAt(kind, row, w));
    const filled = series.filter((v): v is number => v != null);
    if (filled.length < 3) return null;
    return classifyTrend(filled.slice(-3), "higher_better");
  };

  const weekKindAvg = (kind: "behavioural" | "technical", weekStart: string): number | null => {
    const rows =
      kind === "behavioural" ? data.competencies.behavioural : data.competencies.technical;
    const vals = rows
      .map((r) => scoreAt(kind, r, weekStart))
      .filter((v): v is number => v != null);
    if (!vals.length) return null;
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  };

  const twelveWeekKindAvg = (kind: "behavioural" | "technical"): number | null => {
    const vals = weeks
      .map((w) => weekKindAvg(kind, w))
      .filter((v): v is number => v != null);
    if (!vals.length) return null;
    return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10;
  };

  const missingWeekLabels = weeks
    .map((w, i) => {
      const hasAny =
        data.competencies.behavioural.some((r) => scoreAt("behavioural", r, w) != null) ||
        data.competencies.technical.some((r) => scoreAt("technical", r, w) != null);
      return hasAny ? null : `W${String(i + 1).padStart(2, "0")}`;
    })
    .filter(Boolean) as string[];
  const missingWeekRanges = formatWeekLabelRanges(missingWeekLabels);

  const now = new Date();
  const isCurrentMonthWeek = (weekStart: string): boolean => {
    const [y, m, d] = weekStart.split("-").map(Number);
    if (!y || !m || !d) return false;
    const monday = new Date(y, m - 1, d);
    for (let i = 0; i < 7; i++) {
      const day = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i);
      if (day.getMonth() === now.getMonth() && day.getFullYear() === now.getFullYear()) {
        return true;
      }
    }
    return false;
  };

  const periodWeekIndexes = weeks
    .map((w, i) => (weekInRange(w, data.period.from, data.period.to) ? i : -1))
    .filter((i) => i >= 0);
  const periodWeekLast = periodWeekIndexes[periodWeekIndexes.length - 1];
  const focusWeekIndex =
    periodWeekLast != null ? periodWeekLast : weeks.length > 0 ? weeks.length - 1 : -1;
  const focusWeekStart = focusWeekIndex >= 0 ? weeks[focusWeekIndex]! : null;
  const currentWeekBadge =
    focusWeekStart == null || focusWeekIndex < 0
      ? "—"
      : `W${String(focusWeekIndex + 1).padStart(2, "0")} = ${formatDate(
          focusWeekStart
        )} to ${formatDate(addDaysISO(focusWeekStart, 6))}`;

  const handleExport = () => {
    const columns = [
      { header: "Kind" },
      { header: "Competency" },
      ...weeks.map((w, i) => ({ header: `W${String(i + 1).padStart(2, "0")} (${w})` })),
      { header: "Avg", align: "right" as const },
      { header: "Movement" },
    ];
    const rows: Array<Array<string | number>> = [];
    for (const kind of ["behavioural", "technical"] as const) {
      const list =
        kind === "behavioural" ? data.competencies.behavioural : data.competencies.technical;
      for (const r of list) {
        const mov = rowMovement(kind, r);
        rows.push([
          kind,
          r.name,
          ...weeks.map((w) => scoreAt(kind, r, w) ?? ""),
          rowAvg(kind, r) ?? "",
          mov ?? "—",
        ]);
      }
    }
    exportReportExcel({
      title: "Competency Detail — Last 12 Weeks",
      fileStem: "Performance_Card_Competency_12w",
      sheetName: "Competency 12w",
      columns,
      rows,
      filterLines: [
        `Resource: ${data.resource.name}`,
        `Rater: ${rater}`,
        `Current week: ${currentWeekBadge}`,
      ],
      orientation: "landscape",
    });
    toast.success("Exported Excel");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-1.5 sm:p-2">
      <div className="flex max-h-[min(98vh,1100px)] w-[min(96vw,1180px)] flex-col overflow-hidden rounded-xl border border-[#E4E7EC] bg-white shadow-2xl">
        {/* Header */}
        <div className="flex shrink-0 items-start justify-between gap-4 px-6 pb-2 pt-3">
          <div className="min-w-0">
            <h2 className="text-[17px] font-semibold tracking-tight text-[#101828]">
              Competency Detail — Last 12 Weeks
            </h2>
            <p className="mt-0.5 text-[12px] text-[#667085]">
              {data.resource.name} · Rated weekly by {rater} (Resource Owner) · Scores only — review
              remarks stay in Weekly History
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer rounded-md p-1 text-[#667085] hover:bg-[#F2F4F7]"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Scale + current week (same white bg as header; no border lines) */}
        <div className="mb-2 flex w-full flex-wrap items-center justify-between gap-3 bg-white px-6 py-1.5">
          <div
            className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-[#667085]"
            aria-label="Score scale"
          >
            {scoreScale.map((s, i) => (
              <Fragment key={s.value}>
                {i > 0 && (
                  <span className="select-none text-[#D0D5DD]" aria-hidden>
                    ·
                  </span>
                )}
                <span className="inline-flex items-center gap-1.5">
                  <span
                    className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-[10px] font-semibold ${rankingChipClass(
                      s,
                      true
                    )}`}
                  >
                    {s.value}
                  </span>
                  <span>{s.title}</span>
                </span>
              </Fragment>
            ))}
          </div>
          <span className="shrink-0 rounded-md border border-[#B2DDFF] bg-[#EFF8FF] px-2 py-0.5 text-[11px] font-semibold text-[#101828]">
            {currentWeekBadge}
          </span>
        </div>

        {/* Body — vertical scroll only when content exceeds modal max-h */}
        <div className="min-h-0 shrink overflow-x-hidden overflow-y-auto px-6 pb-2">
          {(["behavioural", "technical"] as const).map((kind) => {
            const rows =
              kind === "behavioural" ? data.competencies.behavioural : data.competencies.technical;
            const periodAvg =
              kind === "behavioural"
                ? data.competencies.behaviouralAvg
                : data.competencies.technicalAvg;
            const gridAvg = twelveWeekKindAvg(kind);
            const displayAvg = periodAvg ?? gridAvg;
            const trend =
              kind === "behavioural"
                ? data.summary.behavioural.trend
                : data.summary.technical.trend;
            const weekAvgs = weeks.map((w) => weekKindAvg(kind, w));
            const presentWeekAvgs = weekAvgs.filter((v): v is number => v != null);
            const weekAvgMax = Math.max(5, ...presentWeekAvgs, 1);
            const gridTrend =
              presentWeekAvgs.length >= 3
                ? classifyTrend(presentWeekAvgs.slice(-3), "higher_better")
                : null;

            return (
              <section key={kind} className={kind === "technical" ? "min-w-0 mt-3" : "min-w-0"}>
                <div className="-mx-6 mb-2 flex flex-wrap items-center justify-between gap-2 border-y border-[#D0E2F0] bg-[#F0F7FC] px-6 py-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-[14px] font-semibold capitalize text-[#101828]">{kind}</h3>
                    <span className="text-[11px] text-[#667085]">
                      Period average{" "}
                      <span className="font-semibold text-[#344054]">
                        {displayAvg == null ? "—" : `${displayAvg.toFixed(1)} / 5`}
                      </span>
                    </span>
                    <TrendChip trend={trend ?? gridTrend} />
                  </div>
                  <span className="text-[10px] text-[#98A2B3]">
                    {kind === "behavioural"
                      ? "12 weeks · W01 oldest, W12 current"
                      : "Same weeks — compare against Behavioural above"}
                  </span>
                </div>

                <div className="w-full">
                  <table className="w-full table-fixed border-collapse text-[11px]">
                    <colgroup>
                      <col className="w-[13%]" />
                      {weeks.map((w) => (
                        <col key={w} />
                      ))}
                      <col className="w-[5%]" />
                      <col className="w-[9%]" />
                    </colgroup>
                    <thead>
                      <tr className="text-[9px] font-semibold uppercase tracking-wide text-[#98A2B3]">
                        <th className="px-2 pb-1 text-left font-semibold">Competency</th>
                        {weeks.map((w, i) => (
                          <th
                            key={w}
                            className={`px-0.5 pb-1 text-center font-semibold ${
                              isCurrentMonthWeek(w) ? "text-black" : ""
                            }`}
                          >
                            W{String(i + 1).padStart(2, "0")}
                          </th>
                        ))}
                        <th className="px-1 pb-1 text-center font-semibold">Avg</th>
                        <th className="px-1 pb-1 text-center font-semibold">Movement</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => {
                        const avgR = rowAvg(kind, r);
                        const movement = rowMovement(kind, r);
                        return (
                          <tr key={r.id}>
                            <td className="px-2 py-0.5 text-[11px] font-medium text-[#344054]">
                              {r.name}
                            </td>
                            {weeks.map((w) => (
                              <td key={w} className="p-0.5 text-center">
                                <ScoreCell
                                  score={scoreAt(kind, r, w)}
                                  rankingLevels={rankingLevels}
                                />
                              </td>
                            ))}
                            <td className="px-1 py-0.5 text-center text-[12px] font-semibold text-[#101828]">
                              {avgR == null ? "—" : avgR.toFixed(1)}
                            </td>
                            <td className="px-1 py-0.5 text-center">
                              <div className="flex justify-center">
                                <MovementCell trend={movement} />
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                      <tr className="border-t border-[#E4E7EC]">
                        <td className="px-2 py-2 text-[12px] font-semibold capitalize text-[#344054]">
                          {kind} average
                        </td>
                        {weekAvgs.map((v, i) => {
                          const isCurrent = i === weekAvgs.length - 1;
                          const barH =
                            v == null || v <= 0
                              ? 0
                              : Math.max(2, Math.round((v / weekAvgMax) * 26 * 10) / 10);
                          const barFill = competencyDetailAvgBarFill(v);
                          return (
                            <td key={weeks[i] ?? i} className="p-0.5 align-bottom">
                              <div className="flex h-[40px] flex-col items-center justify-end gap-0.5">
                                {v == null ? (
                                  <span className="flex h-[26px] w-full items-center justify-center rounded-sm border border-dashed border-[#D0D5DD] bg-white text-[10px] text-[#98A2B3]">
                                    —
                                  </span>
                                ) : (
                                  <>
                                    <span
                                      className={`text-[9px] tabular-nums ${
                                        isCurrent ? "font-semibold text-[#101828]" : "text-[#667085]"
                                      }`}
                                    >
                                      {v.toFixed(1)}
                                    </span>
                                    <div
                                      className={`w-full rounded-sm ${barFill}`}
                                      style={{ height: barH }}
                                      title={v.toFixed(1)}
                                    />
                                  </>
                                )}
                              </div>
                            </td>
                          );
                        })}
                        <td className="px-1 py-2 text-center text-[12px] font-semibold text-[#101828]">
                          {gridAvg == null ? "—" : gridAvg.toFixed(1)}
                        </td>
                        <td className="px-1 py-2 text-center">
                          <div className="flex justify-center">
                            <MovementCell trend={gridTrend} />
                          </div>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </section>
            );
          })}
        </div>

        {/* Footer — compressed (revert: py-[11.2px]) */}
        <div className="flex shrink-0 flex-nowrap items-center justify-between gap-3 border-t border-[#E4E7EC] px-6 py-2">
          <p className="min-w-0 flex-1 truncate whitespace-nowrap text-[11px] text-[#667085]" title={
            missingWeekLabels.length > 0
              ? `${missingWeekRanges} had no weekly review — shown as — everywhere and excluded from all averages (never treated as 0). Row Avg uses only weeks that have ratings.`
              : "Weeks with no weekly review show as — and are excluded from averages (never treated as 0). Row Avg uses only weeks that have ratings."
          }>
            {missingWeekLabels.length > 0
              ? `${missingWeekRanges} had no weekly review — shown as — everywhere and excluded from all averages (never treated as 0).`
              : "Weeks with no weekly review show as — and are excluded from averages (never treated as 0)."}{" "}
            Row Avg uses only weeks that have ratings.
          </p>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={handleExport}
              className="cursor-pointer rounded-md border border-[#D0D5DD] bg-white px-3 py-1.5 text-[12px] font-medium text-[#344054] hover:bg-[#F9FAFB]"
            >
              Export
            </button>
            <button
              type="button"
              onClick={onClose}
              className="cursor-pointer rounded-md bg-[#152F39] px-3 py-1.5 text-[12px] font-medium text-white hover:opacity-90"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

