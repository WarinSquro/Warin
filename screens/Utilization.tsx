import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CalendarClock, X, ArrowRight, FileSpreadsheet, FileText } from "lucide-react";
import { SortColHeader, useColumnSort } from "../components/SortColHeader";
import { DepartmentSelect } from "../components/DepartmentSelect";
import {
  UTIL_MONTHS,
  DEFAULT_UTIL_MONTH,
  computeUtilKpis,
} from "../data/utilization";
import type { Band, UtilRow } from "../data/utilization";
import { usePlanningEmployees } from "../hooks/usePlanningEmployees";
import { useMasters } from "../context/MastersContext";
import { useSettings } from "../context/SettingsContext";
import { useToast } from "../context/ToastContext";
import { addDaysISO, buildUtilRowsFromEmployees } from "../api/liveViews";
import { dayCapacityHours } from "../data/planner";
import { monthBoundsFromId } from "../utils/reportPeriods";
import { fetchAllocations, fetchSettingsSchedules, type ApiAllocation, type SettingsSchedule } from "../api/domain";
import { useSharedDataSync, MASTER_TXN_SYNC_INTERVAL_MS } from "../hooks/useSharedDataSync";
import { runReportExport, summarizeFilter } from "../utils/reportExport";
import type { ReportExportInput } from "../utils/reportExport";

type Segment = "all" | "over" | "optimal" | "idle";
type UtilSortKey = "name" | "pct" | "trend" | "primaryWork";

const BAND_LABEL: Record<Band, string> = {
  over: "Overloaded",
  optimal: "Optimal",
  idle: "Idle / Under",
};

const BAND_BAR: Record<Band, string> = { over: "bg-danger", optimal: "bg-success", idle: "bg-muted-foreground" };
const BAND_TRACK: Record<Band, string> = { over: "bg-danger-soft", optimal: "bg-border-soft", idle: "bg-border-soft" };
const BAND_TEXT: Record<Band, string> = { over: "text-danger", optimal: "text-success", idle: "text-muted" };
const TREND_BAR: Record<Band, string> = { over: "bg-danger", optimal: "bg-success", idle: "bg-muted-foreground" };

function bandFromTrendRatio(ratio: number): Band {
  const pct = ratio * 100;
  if (pct > 100) return "over";
  if (pct < 70) return "idle";
  return "optimal";
}

function trendBarHeight(ratio: number) {
  return `${(Math.min(ratio, 1.2) / 1.2) * 100}%`;
}

export function Utilization() {
  const navigate = useNavigate();
  const { employees } = usePlanningEmployees();
  const { departments: deptMaster } = useMasters();
  const { settings } = useSettings();
  const [monthId, setMonthId] = useState(DEFAULT_UTIL_MONTH);
  const month = UTIL_MONTHS.find((m) => m.id === monthId) ?? UTIL_MONTHS[UTIL_MONTHS.length - 1];
  const monthRange = useMemo(() => monthBoundsFromId(month.id), [month.id]);
  const offDays = useMemo(
    () => settings.companyOffDays.map((d) => d.date.slice(0, 10)),
    [settings.companyOffDays]
  );
  const periodCapacity = useMemo(() => {
    let hours = 0;
    for (let d = monthRange.from; d <= monthRange.to; d = addDaysISO(d, 1)) {
      hours += dayCapacityHours(d, {
        workingDays: settings.workingDays,
        companyOffDays: offDays,
        workingHoursPerDay: settings.workingHoursPerDay,
      });
    }
    return Math.round(hours * 10) / 10 || 40;
  }, [monthRange.from, monthRange.to, settings.workingDays, settings.workingHoursPerDay, offDays]);
  const [allocations, setAllocations] = useState<ApiAllocation[]>([]);
  const [pendingSchedule, setPendingSchedule] = useState<SettingsSchedule | null>(null);

  const load = useCallback(async () => {
    await Promise.all([
      fetchAllocations({ from: monthRange.from, to: monthRange.to })
        .then(setAllocations)
        .catch(() => setAllocations([])),
      fetchSettingsSchedules()
        .then((rows) => setPendingSchedule(rows[0] ?? null))
        .catch(() => setPendingSchedule(null)),
    ]);
  }, [monthRange.from, monthRange.to]);

  useEffect(() => {
    void load();
  }, [load]);

  useSharedDataSync(true, load, {
    resources: ["allocations"],
    intervalMs: MASTER_TXN_SYNC_INTERVAL_MS,
  });

  const utilRows = useMemo(
    () =>
      buildUtilRowsFromEmployees(
        employees,
        periodCapacity,
        allocations,
        offDays,
        monthRange.from,
        monthRange.to,
        settings.workingDays
      ),
    [employees, periodCapacity, allocations, offDays, monthRange.from, monthRange.to, settings.workingDays]
  );
  const utilDepartments = useMemo(
    () => deptMaster.filter((d) => d.status === "active").map((d) => d.name),
    [deptMaster]
  );

  const [seg, setSeg] = useState<Segment>("all");
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const toast = useToast();
  const [selectedDepts, setSelectedDepts] = useState<string[]>([]);
  const { sortKey, sortDir, handleSort } = useColumnSort<UtilSortKey>("pct", "desc");

  useEffect(() => {
    if (utilDepartments.length) setSelectedDepts((p) => (p.length ? p : [...utilDepartments]));
  }, [utilDepartments]);

  const deptRows = useMemo(
    () => utilRows.filter((r) => selectedDepts.includes(r.department)),
    [utilRows, selectedDepts]
  );

  const kpis = useMemo(() => computeUtilKpis(deptRows), [deptRows]);

  const deptCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const dept of utilDepartments) {
      counts[dept] = utilRows.filter((r) => r.department === dept).length;
    }
    return counts;
  }, [utilDepartments, utilRows]);

  const rows = useMemo(() => {
    const filtered = deptRows.filter((r) => (seg === "all" ? true : r.band === seg));

    return [...filtered].sort((a, b) => {
      const mul = sortDir === "asc" ? 1 : -1;

      if (sortKey === "name") {
        return mul * a.name.localeCompare(b.name);
      }
      if (sortKey === "pct") {
        return mul * (a.pct - b.pct);
      }
      if (sortKey === "trend") {
        const ta = a.trend[a.trend.length - 1] ?? 0;
        const tb = b.trend[b.trend.length - 1] ?? 0;
        return mul * (ta - tb);
      }
      return mul * a.primaryWork.localeCompare(b.primaryWork);
    });
  }, [deptRows, seg, sortKey, sortDir]);

  const toggleSeg = (next: Segment) => setSeg((s) => (s === next ? "all" : next));

  const showExportToast = (msg: string) => {
    toast.info(msg);
  };

  const buildExportInput = (): ReportExportInput => {
    const segLabel =
      seg === "all" ? "All" : seg === "over" ? "Overloaded" : seg === "optimal" ? "Optimal" : "Idle / Under";
    const filterLines = [
      `Period: ${month.label} (${month.rangeLabel})`,
      summarizeFilter("Departments", selectedDepts, utilDepartments),
      `Segment: ${segLabel}`,
      `Summary: ${kpis.total} people · Avg ${kpis.avg}% · Overloaded ${kpis.over} · Optimal ${kpis.optimal} · Idle ${kpis.idle}`,
    ];

    return {
      title: "Utilization Report",
      fileStem: "Utilization_Report",
      sheetName: "Utilization",
      columns: [
        { header: "Team Member" },
        { header: "Department" },
        { header: "Role" },
        { header: "Utilization (%)", align: "right" },
        { header: "Band" },
        { header: "Week 1 (%)", align: "right" },
        { header: "Week 2 (%)", align: "right" },
        { header: "Week 3 (%)", align: "right" },
        { header: "Week 4 (%)", align: "right" },
        { header: "Primary Work" },
      ],
      rows: rows.map((r) => [
        r.name,
        r.department,
        r.role,
        r.pct,
        BAND_LABEL[r.band],
        Math.round((r.trend[0] ?? 0) * 100),
        Math.round((r.trend[1] ?? 0) * 100),
        Math.round((r.trend[2] ?? 0) * 100),
        Math.round((r.trend[3] ?? 0) * 100),
        r.primaryWork,
      ]),
      filterLines,
      totalsRow: [
        `Total (${rows.length} of ${kpis.total} in selection)`,
        "",
        "",
        kpis.avg,
        "",
        "",
        "",
        "",
        "",
        "",
      ],
      orientation: "landscape",
      dateFormat: settings.dateFormat,
    };
  };

  const handleExport = (kind: "excel" | "pdf") => {
    showExportToast(runReportExport(kind, buildExportInput()).message);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <header className="flex h-14 flex-shrink-0 items-center justify-between border-b border-border bg-surface px-5">
        <div>
          <div className="text-[15px] font-semibold tracking-tight text-foreground">Utilization</div>
          <div className="text-[12px] text-muted-foreground">
            {kpis.total} people · {month.rangeLabel} · billable basis
          </div>
        </div>
        <div className="flex items-center gap-2">
          <MonthSelect value={monthId} onChange={setMonthId} />
          <DepartmentSelect
            departments={utilDepartments}
            selected={selectedDepts}
            onChange={setSelectedDepts}
            counts={deptCounts}
          />
          <button
            type="button"
            onClick={() => handleExport("excel")}
            className="flex cursor-pointer items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-[12px] text-foreground hover:bg-surface-alt"
          >
            <FileSpreadsheet className="h-3.5 w-3.5" /> Excel
          </button>
          <button
            type="button"
            onClick={() => handleExport("pdf")}
            className="flex cursor-pointer items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-[12px] text-foreground hover:bg-surface-alt"
          >
            <FileText className="h-3.5 w-3.5" /> PDF
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden bg-background p-5">
        {pendingSchedule && !bannerDismissed && (
          <div className="flex flex-shrink-0 items-center gap-2.5 rounded-md border border-accent-line bg-accent-soft px-3.5 py-2.5">
            <CalendarClock className="h-4 w-4 flex-shrink-0 text-primary" />
            <div className="flex-1 text-[12px] text-accent-softfg">
              <b>Scheduled change:</b> {pendingSchedule.changeSummary} on {pendingSchedule.effectiveLabel} — band counts below reflect the current {settings.bands.idleBelow}% idle threshold until then.
            </div>
            <button onClick={() => setBannerDismissed(true)} className="text-primary hover:text-accent-softfg"><X className="h-3.5 w-3.5" /></button>
          </div>
        )}

        {/* KPI row — band cards filter the grid */}
        <div className="grid flex-shrink-0 grid-cols-4 gap-3">
          <Kpi
            label="Avg Utilization"
            value={`${kpis.avg}%`}
            delta={kpis.total ? `▲ ${kpis.avgDelta}% vs last mo` : undefined}
            active={seg === "all"}
            onClick={() => setSeg("all")}
          />
          <Kpi
            label="Overloaded"
            value={kpis.over}
            sub=">100% booked"
            accent="border-l-danger"
            valueClass="text-danger"
            active={seg === "over"}
            onClick={() => toggleSeg("over")}
          />
          <Kpi
            label="Optimal"
            value={kpis.optimal}
            sub="70–100%"
            accent="border-l-success"
            valueClass="text-success"
            active={seg === "optimal"}
            onClick={() => toggleSeg("optimal")}
          />
          <Kpi
            label="Idle / Under"
            value={kpis.idle}
            sub="<70% booked"
            accent="border-l-muted-foreground"
            valueClass="text-muted"
            active={seg === "idle"}
            onClick={() => toggleSeg("idle")}
          />
        </div>

        {/* Table */}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border bg-surface">
          <div className="flex flex-shrink-0 items-center justify-between border-b border-border-soft px-4 py-2.5">
            <div className="flex gap-1">
              <Tab active={seg === "all"} onClick={() => setSeg("all")}>All {kpis.total}</Tab>
              <Tab active={seg === "over"} onClick={() => setSeg("over")} tone="danger">Overloaded {kpis.over}</Tab>
              <Tab active={seg === "optimal"} onClick={() => setSeg("optimal")} tone="success">Optimal {kpis.optimal}</Tab>
              <Tab active={seg === "idle"} onClick={() => setSeg("idle")} tone="muted">Idle / Under {kpis.idle}</Tab>
            </div>
          </div>

          {/* Single scrollport: sticky header + rows share width (scrollbar no longer shifts columns). */}
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            <div className={`${UTIL_GRID} sticky top-0 z-10 border-b border-border-soft bg-surface-alt py-2 text-[11px] font-semibold text-muted`}>
              <SortColHeader
                label="TEAM MEMBER"
                col="name"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={handleSort}
              />
              <SortColHeader
                label="UTILIZATION"
                col="pct"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={handleSort}
              />
              <SortColHeader
                label="4-WEEK TREND"
                col="trend"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={handleSort}
                className="justify-start"
              />
              <SortColHeader
                label="PRIMARY WORK"
                col="primaryWork"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={handleSort}
              />
              <div className="text-right">ACTION</div>
            </div>

            {rows.length === 0 ? (
              <div className="px-4 py-10 text-center text-[13px] text-muted-foreground">
                No people match the selected departments.
              </div>
            ) : (
              rows.map((r) => (
                <UtilTableRow
                  key={r.id}
                  row={r}
                  actionsEnabled={monthId === DEFAULT_UTIL_MONTH}
                  onAct={() => navigate("/planner")}
                />
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const UTIL_GRID =
  "grid w-full grid-cols-[200px_minmax(0,1fr)_120px_150px_90px] items-center gap-x-0 px-4";

function UtilTableRow({
  row,
  onAct,
  actionsEnabled,
}: {
  row: UtilRow;
  onAct: () => void;
  actionsEnabled: boolean;
}) {
  const barW = Math.min(row.pct, 120) / 120 * 100;
  const action = row.band === "over" ? "Rebalance" : row.band === "idle" ? "Assign" : null;
  return (
    <div className={`${UTIL_GRID} border-b border-border-soft py-3 last:border-b-0`}>
      <div className="flex min-w-0 items-center gap-2.5">
        <div className={`flex h-[30px] w-[30px] flex-shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${
          row.band === "over" ? "bg-danger-soft text-danger" : row.band === "idle" ? "bg-surface-alt text-muted" : "bg-success-soft text-success-fg"
        }`}>{row.initials}</div>
        <div className="min-w-0">
          <div className="truncate text-[13px] font-medium text-foreground">{row.name}</div>
          <div className="truncate text-[11px] text-muted-foreground">{row.department}</div>
        </div>
      </div>
      <div className="flex min-w-0 items-center gap-2.5 pr-4">
        <div className={`h-1.5 min-w-0 flex-1 rounded-full ${BAND_TRACK[row.band]}`}>
          <div className={`h-full rounded-full ${BAND_BAR[row.band]}`} style={{ width: `${barW}%` }} />
        </div>
        <span className={`w-10 shrink-0 text-[12px] font-semibold ${BAND_TEXT[row.band]}`}>{row.pct}%</span>
      </div>
      <div className="flex h-[22px] w-full items-end justify-start gap-[3px]">
        {row.trend.map((t, i) => {
          const isCurrent = i === row.trend.length - 1;
          const ratio = isCurrent ? row.pct / 100 : t;
          const band = isCurrent ? row.band : bandFromTrendRatio(t);
          return (
            <div
              key={i}
              title={`Week ${i + 1}: ${Math.round(ratio * 100)}%`}
              className={`w-1.5 rounded-sm ${TREND_BAR[band]} ${isCurrent ? "ring-1 ring-foreground/15" : ""}`}
              style={{ height: trendBarHeight(ratio) }}
            />
          );
        })}
      </div>
      <div className={`min-w-0 truncate text-[12px] ${row.primaryMuted ? "italic text-muted-foreground" : "text-foreground"}`}>{row.primaryWork}</div>
      <div className="text-right">
        {action ? (
          <button
            type="button"
            onClick={onAct}
            disabled={!actionsEnabled}
            title={
              actionsEnabled
                ? undefined
                : "Assign / Rebalance is available only for This Month"
            }
            className={`inline-flex items-center gap-0.5 text-[11px] ${
              actionsEnabled
                ? "text-primary hover:underline"
                : "cursor-not-allowed text-muted-foreground opacity-50"
            }`}
          >
            {action} <ArrowRight className="h-3 w-3" />
          </button>
        ) : (
          <span className="text-[11px] text-muted-foreground">Healthy</span>
        )}
      </div>
    </div>
  );
}

function MonthSelect({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const selected = UTIL_MONTHS.find((m) => m.id === value) ?? UTIL_MONTHS[UTIL_MONTHS.length - 1];
  const triggerLabel = value === DEFAULT_UTIL_MONTH ? "This Month" : selected.shortLabel;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="rounded-md border border-border px-3 py-1.5 text-[12px] text-foreground hover:bg-surface-alt"
      >
        {triggerLabel} ▾
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} aria-hidden />
          <div className="absolute right-0 top-[calc(100%+4px)] z-20 max-h-[280px] min-w-[180px] overflow-y-auto rounded-md border border-border bg-surface py-1 shadow-lg">
            {[...UTIL_MONTHS].reverse().map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => {
                  onChange(m.id);
                  setOpen(false);
                }}
                className={`flex w-full flex-col px-3 py-2 text-left text-[12px] hover:bg-surface-alt ${
                  m.id === value ? "bg-highlight font-medium text-foreground" : "text-foreground"
                }`}
              >
                <span>{m.label}</span>
                <span className="text-[11px] text-muted-foreground">{m.rangeLabel}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function Kpi({
  label,
  value,
  sub,
  delta,
  accent,
  valueClass,
  onClick,
  active,
}: {
  label: string;
  value: string | number;
  sub?: string;
  delta?: string;
  accent?: string;
  valueClass?: string;
  onClick?: () => void;
  active?: boolean;
}) {
  const className = [
    "rounded-lg border border-border bg-surface px-3.5 py-3.5 text-left transition-colors",
    accent ? `border-l-[3px] ${accent}` : "",
    onClick ? "cursor-pointer hover:bg-surface-alt" : "",
    active ? "border-primary/40 bg-highlight ring-2 ring-primary/20" : "",
  ].join(" ");

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={className}>
        <div className="mb-1.5 text-[11px] text-muted">{label}</div>
        <div className="flex items-baseline gap-1.5">
          <div className={`text-[23px] font-semibold ${valueClass ?? "text-foreground"}`}>{value}</div>
          {delta && <div className="text-[11px] text-success">{delta}</div>}
        </div>
        {sub && <div className="mt-0.5 text-[11px] text-muted-foreground">{sub}</div>}
      </button>
    );
  }

  return (
    <div className={className}>
      <div className="mb-1.5 text-[11px] text-muted">{label}</div>
      <div className="flex items-baseline gap-1.5">
        <div className={`text-[23px] font-semibold ${valueClass ?? "text-foreground"}`}>{value}</div>
        {delta && <div className="text-[11px] text-success">{delta}</div>}
      </div>
      {sub && <div className="mt-0.5 text-[11px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

function Tab({ active, onClick, children, tone }: { active: boolean; onClick: () => void; children: React.ReactNode; tone?: "danger" | "success" | "muted" }) {
  const inactive =
    tone === "danger" ? "text-danger" : tone === "success" ? "text-success" : "text-muted";
  return (
    <button onClick={onClick} className={`rounded-md px-3 py-1.5 text-[12px] font-medium ${active ? "bg-brand text-white" : inactive + " hover:bg-surface-alt"}`}>
      {children}
    </button>
  );
}
