import type { PerfCardPayload } from "../api/domain";
import type { DateFormatPattern } from "../data/settings";
import { UNPLANNED_WORK_REASONS } from "../data/confirmation";
import { PERF_CARD_PERIOD_OPTIONS } from "./performanceCard";
import {
  runMultiSectionPdfExport,
  type MultiSectionPdfInput,
  type PdfTableSection,
} from "./reportExport";

/** jsPDF Helvetica cannot render Unicode arrows; keep PDF cells ASCII-safe. */
function dash(v: string | number | null | undefined): string | number {
  if (v == null || v === "") return "-";
  return v;
}

function fmtScore(v: number | null | undefined, kind: "of5" | "pct"): string {
  if (v == null || !Number.isFinite(v)) return "-";
  if (kind === "of5") return `${Number.isInteger(v) ? v : v.toFixed(1)} / 5`;
  return `${Number.isInteger(v) ? v : Math.round(v * 10) / 10}%`;
}

/**
 * Trend column for PDF — ASCII only.
 * Unicode ↑↓→ corrupt Helvetica output (mojibake + letter-spaced words).
 */
function fmtTrend(
  trend: PerfCardPayload["summary"]["focusPct"]["trend"],
  arrow: PerfCardPayload["summary"]["focusPct"]["arrow"]
): string {
  const dir =
    arrow === "up" ? "Up" : arrow === "down" ? "Down" : arrow === "same" ? "Flat" : "";
  const label =
    trend === "Improving" ||
    trend === "Improved" ||
    trend === "Off Track" ||
    trend === "Concern" ||
    trend === "Same"
      ? trend
      : "";

  if (dir && label && label !== "Same") return `${dir} - ${label}`;
  if (label) return label;
  if (dir) return dir;
  return "-";
}

function periodLabel(periodId: string): string {
  return PERF_CARD_PERIOD_OPTIONS.find((o) => o.id === periodId)?.label ?? periodId;
}

function safeFilePart(name: string): string {
  return name.replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 40) || "Resource";
}

function unplannedReasonLabel(reason: string): string {
  const known = UNPLANNED_WORK_REASONS.find((r) => r.value === reason);
  return known?.value ?? reason;
}

/** Build structured multi-section PDF input from the current Performance Card payload. */
export function buildPerformanceCardPdfInput(
  data: PerfCardPayload,
  opts: {
    formatDate: (iso: string) => string;
    dateFormat?: DateFormatPattern;
  }
): MultiSectionPdfInput {
  const s = data.summary;
  const sections: PdfTableSection[] = [];

  sections.push({
    heading: "Summary",
    columns: [
      { header: "Metric" },
      { header: "Selection", align: "right" },
      { header: "Previous", align: "right" },
      { header: "Trend" },
    ],
    rows: [
      [
        "Behavioural competency",
        fmtScore(s.behavioural.current, "of5"),
        fmtScore(s.behavioural.previous, "of5"),
        fmtTrend(s.behavioural.trend, s.behavioural.arrow),
      ],
      [
        "Technical competency",
        fmtScore(s.technical.current, "of5"),
        fmtScore(s.technical.previous, "of5"),
        fmtTrend(s.technical.trend, s.technical.arrow),
      ],
      [
        "Planning Accuracy",
        fmtScore(s.planningAccuracy.current, "pct"),
        fmtScore(s.planningAccuracy.previous, "pct"),
        fmtTrend(s.planningAccuracy.trend, s.planningAccuracy.arrow),
      ],
      [
        "Confirmation Discipline",
        fmtScore(s.confirmationDiscipline.current, "pct"),
        fmtScore(s.confirmationDiscipline.previous, "pct"),
        fmtTrend(s.confirmationDiscipline.trend, s.confirmationDiscipline.arrow),
      ],
      [
        "Focus %",
        fmtScore(s.focusPct.current, "pct"),
        fmtScore(s.focusPct.previous, "pct"),
        fmtTrend(s.focusPct.trend, s.focusPct.arrow),
      ],
      [
        "Unplanned Work %",
        fmtScore(s.unplannedPct.current, "pct"),
        fmtScore(s.unplannedPct.previous, "pct"),
        fmtTrend(s.unplannedPct.trend, s.unplannedPct.arrow),
      ],
      [
        "Billable Split %",
        fmtScore(s.billableSplitPct.current, "pct"),
        fmtScore(s.billableSplitPct.previous, "pct"),
        fmtTrend(s.billableSplitPct.trend, s.billableSplitPct.arrow),
      ],
    ],
  });

  const behaviouralRows = data.competencies.behavioural.map((r) => [
    r.name,
    r.score == null ? "-" : fmtScore(r.score, "of5"),
  ]);
  if (behaviouralRows.length) {
    sections.push({
      heading: `Behavioural Competencies (avg ${fmtScore(data.competencies.behaviouralAvg, "of5")})`,
      columns: [
        { header: "Competency" },
        { header: "Score", align: "right" },
      ],
      rows: behaviouralRows,
    });
  }

  const technicalRows = data.competencies.technical.map((r) => [
    r.name,
    r.score == null ? "-" : fmtScore(r.score, "of5"),
  ]);
  if (technicalRows.length) {
    sections.push({
      heading: `Technical Competencies (avg ${fmtScore(data.competencies.technicalAvg, "of5")})`,
      columns: [
        { header: "Competency" },
        { header: "Score", align: "right" },
      ],
      rows: technicalRows,
    });
  }

  sections.push({
    heading: "Work & Productivity",
    columns: [
      { header: "Metric" },
      { header: "Selection", align: "right" },
      { header: "Previous", align: "right" },
      { header: "Trend" },
    ],
    rows: data.productivity.map((row) => [
      row.countOnly ? `${row.label} (count)` : row.label,
      dash(row.currentDisplay),
      dash(row.previousDisplay),
      row.countOnly ? "-" : fmtTrend(row.trend, row.arrow),
    ]),
  });

  sections.push({
    heading: "Contribution by Project",
    columns: [
      { header: "Project" },
      { header: "Planned (h)", align: "right" },
      { header: "Actual (h)", align: "right" },
      { header: "Share %", align: "right" },
      { header: "Billable (h)", align: "right" },
    ],
    rows: data.contribution.rows.map((r) => [
      r.project,
      r.plannedHrs,
      r.actualHrs,
      r.sharePct == null ? "-" : r.sharePct,
      r.billableHrs,
    ]),
    totalsRow: [
      "TOTAL",
      data.contribution.totals.plannedHrs,
      data.contribution.totals.actualHrs,
      data.contribution.totals.sharePct == null ? "-" : data.contribution.totals.sharePct,
      data.contribution.totals.billableHrs,
    ],
  });

  const unplannedRows =
    data.unplanned?.rows?.length > 0
      ? data.unplanned.rows
      : UNPLANNED_WORK_REASONS.map((r) => ({
          reason: r.value,
          hrs: 0,
          sharePct: null as number | null,
        }));

  sections.push({
    heading: "Unplanned Work",
    columns: [
      { header: "Reason" },
      { header: "Hours", align: "right" },
      { header: "Share %", align: "right" },
    ],
    rows: unplannedRows.map((r) => [
      unplannedReasonLabel(r.reason),
      r.hrs,
      r.sharePct == null ? "-" : r.sharePct,
    ]),
    totalsRow: [
      "TOTAL",
      data.unplanned?.totals?.hrs ?? 0,
      data.unplanned?.totals?.sharePct == null ? "-" : data.unplanned.totals.sharePct,
    ],
  });

  if (data.snapshot.strengths.length || data.snapshot.needsAttention.length) {
    sections.push({
      heading: "Snapshot - Strengths & Needs Attention",
      columns: [
        { header: "Type" },
        { header: "Metric" },
        { header: "Value", align: "right" },
      ],
      rows: [
        ...data.snapshot.strengths.map((x) => ["Strength", x.label, dash(x.value)]),
        ...data.snapshot.needsAttention.map((x) => ["Needs attention", x.label, dash(x.value)]),
      ],
    });
  }

  const kpi = data.snapshot.kpiAchievement;
  if (kpi?.items?.length) {
    sections.push({
      heading: `KPI Achievement - ${kpi.label || `${kpi.assessmentCycle} ${kpi.calendarYear}`}`,
      columns: [
        { header: "KPI" },
        { header: "Result", align: "right" },
        { header: "Score", align: "right" },
        { header: "Unit" },
        { header: "Status" },
      ],
      rows: kpi.items.map((item) => [
        item.name,
        item.result == null ? "-" : item.result,
        item.score == null ? "-" : item.score,
        dash(item.unit),
        dash(item.status),
      ]),
    });
  }

  const histWeeks = data.competencies.historyWeeks ?? [];
  const hist = data.competencies.history ?? [];
  if (histWeeks.length > 0 && hist.length > 0) {
    const weekCols = histWeeks.map((_w, i) => ({
      header: `W${String(i + 1).padStart(2, "0")}`,
      align: "right" as const,
    }));
    const scoreAt = (
      kind: "behavioural" | "technical",
      row: { id: string; code?: string; name: string },
      weekStart: string
    ): string | number => {
      const entry = hist.find((h) => h.weekStart === weekStart);
      if (!entry) return "-";
      const map = kind === "behavioural" ? entry.behavioural : entry.technical;
      const v =
        (row.code ? map?.[row.code] : undefined) ?? map?.[row.id] ?? map?.[row.name];
      return typeof v === "number" && Number.isFinite(v) ? v : "-";
    };

    for (const kind of ["behavioural", "technical"] as const) {
      const list =
        kind === "behavioural" ? data.competencies.behavioural : data.competencies.technical;
      if (!list.length) continue;
      sections.push({
        heading: `Competency Detail 12 weeks - ${kind === "behavioural" ? "Behavioural" : "Technical"}`,
        columns: [{ header: "Competency" }, ...weekCols],
        rows: list.map((r) => [r.name, ...histWeeks.map((w) => scoreAt(kind, r, w))]),
      });
    }
  }

  return {
    title: "Performance Card",
    fileStem: `Performance_Card_${safeFilePart(data.resource.name)}`,
    filterLines: [
      `Resource: ${data.resource.name}${data.resource.department ? ` - ${data.resource.department}` : ""}`,
      `Period: ${periodLabel(data.period.id)} (${opts.formatDate(data.period.from)} - ${opts.formatDate(data.period.to)})`,
      `Compared to: ${opts.formatDate(data.period.previousFrom)} - ${opts.formatDate(data.period.previousTo)}`,
    ],
    sections,
    orientation: histWeeks.length > 0 ? "landscape" : "portrait",
    dateFormat: opts.dateFormat,
  };
}

export function exportPerformanceCardPdf(
  data: PerfCardPayload,
  opts: {
    formatDate: (iso: string) => string;
    dateFormat?: DateFormatPattern;
  }
): { ok: true; message: string } | { ok: false; message: string } {
  return runMultiSectionPdfExport(buildPerformanceCardPdfInput(data, opts));
}
