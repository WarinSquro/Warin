import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { X, CalendarRange, ClipboardCheck } from "lucide-react";
import {
  BarChart,
  Bar,
  LabelList,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { MetricChip } from "./MetricChip";
import { BillableSplitBar } from "./BillableSplitBar";
import type { PerformanceHistory, PerformanceRow } from "../data/performanceReport";
import { formatHours, formatHoursLabel } from "../utils/formatHours";

interface Props {
  open: boolean;
  onClose: () => void;
  row: PerformanceRow | null;
  history: PerformanceHistory | null;
  periodLabel: string;
}

type TrendMetric = "planningAccuracy" | "confirmationDiscipline" | "utilization" | "billableSplit";

type TrendPoint = {
  label: string;
  planningAccuracy: number | null;
  confirmationDiscipline: number | null;
  utilization: number;
  billable: number;
};

const CHART = {
  primary: "#152F39",
  success: "#16a34a",
  grid: "#eef0f3",
  axis: "#9ca3af",
};

const TREND_METRICS: Record<
  TrendMetric,
  {
    title: string;
    dataKey: keyof TrendPoint;
    yDomain: [number, number] | [number, "auto"];
    suffix: string;
    tooltipLabel: string;
    fill: string;
  }
> = {
  planningAccuracy: {
    title: "Planning Accuracy",
    dataKey: "planningAccuracy",
    yDomain: [0, 100],
    suffix: "%",
    tooltipLabel: "Accuracy",
    fill: CHART.primary,
  },
  confirmationDiscipline: {
    title: "Confirmation Discipline",
    dataKey: "confirmationDiscipline",
    yDomain: [0, 100],
    suffix: "%",
    tooltipLabel: "Discipline",
    fill: CHART.primary,
  },
  utilization: {
    title: "Utilization",
    dataKey: "utilization",
    yDomain: [0, "auto"],
    suffix: "h",
    tooltipLabel: "Utilization",
    fill: CHART.primary,
  },
  billableSplit: {
    title: "Billable %",
    dataKey: "billable",
    yDomain: [0, 100],
    suffix: "%",
    tooltipLabel: "Billable",
    fill: CHART.success,
  },
};

export function PerformanceHistoryDrawer({ open, onClose, row, history, periodLabel }: Props) {
  const [trendMetric, setTrendMetric] = useState<TrendMetric>("confirmationDiscipline");

  useEffect(() => {
    if (open && row) setTrendMetric("confirmationDiscipline");
  }, [open, row?.employeeId]);

  const trendData = useMemo<TrendPoint[]>(
    () =>
      history?.months.map((m) => ({
        label: m.label,
        planningAccuracy: m.planningAccuracy ?? null,
        confirmationDiscipline: m.confirmationDiscipline ?? null,
        utilization: m.utilizationHrs,
        billable: m.billablePct,
      })) ?? [],
    [history]
  );

  if (!row) return null;

  const chartConfig = TREND_METRICS[trendMetric];

  return (
    <div className={`fixed inset-0 z-40 ${open ? "" : "pointer-events-none"}`}>
      <div
        onClick={onClose}
        className={`absolute inset-0 bg-brand/30 transition-opacity duration-200 ${open ? "opacity-100" : "opacity-0"}`}
      />
      <div
        className={`absolute right-0 top-0 flex h-full w-[400px] flex-col bg-surface shadow-2xl transition-transform duration-200 ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex flex-shrink-0 items-center justify-between border-b border-border-soft px-[18px] py-3.5">
          <div>
            <div className="text-[14px] font-semibold text-foreground">{row.employeeName}</div>
            <div className="text-[11px] text-muted-foreground">
              {row.department} · {periodLabel}
            </div>
          </div>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-[18px] py-[18px]">
          <section>
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted">
              This period
            </div>
            <p className="mb-2 text-[10px] text-muted-foreground">
              Click a metric to view its 6-month trend below.
            </p>
            <div className="grid grid-cols-2 gap-2">
              <KpiCard
                label="Planning Accuracy"
                active={trendMetric === "planningAccuracy"}
                onClick={() => setTrendMetric("planningAccuracy")}
              >
                <MetricChip value={row.leaveException ? undefined : row.planningAccuracy} />
              </KpiCard>
              <KpiCard
                label="Confirmation Discipline"
                active={trendMetric === "confirmationDiscipline"}
                onClick={() => setTrendMetric("confirmationDiscipline")}
              >
                <MetricChip value={row.leaveException ? undefined : row.confirmationDiscipline} />
              </KpiCard>
              <KpiCard
                label="Utilization"
                active={trendMetric === "utilization"}
                onClick={() => setTrendMetric("utilization")}
              >
                <span className="text-[13px] font-semibold tabular-nums text-foreground">
                  {formatHoursLabel(row.utilizationHrs)}
                </span>
              </KpiCard>
              <KpiCard label="Available Capacity">
                <span className="text-[13px] font-semibold tabular-nums text-foreground">
                  {row.leaveException || row.availableCapacityHrs == null
                    ? "—"
                    : formatHoursLabel(row.availableCapacityHrs)}
                </span>
              </KpiCard>
            </div>
            <SelectablePanel
              label="Billable split"
              active={trendMetric === "billableSplit"}
              onClick={() => setTrendMetric("billableSplit")}
            >
              <BillableSplitBar
                billablePct={row.billablePct}
                nonBillablePct={row.nonBillablePct}
                leaveException={row.leaveException}
              />
            </SelectablePanel>
          </section>

          {trendData.length > 0 && (
            <section>
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted">
                6-month trend
              </div>
              <div className="rounded-md border border-border-soft bg-surface-alt p-3">
                <div className="mb-1 text-[11px] font-medium text-foreground">{chartConfig.title}</div>
                <div className="h-[120px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={trendData} margin={{ top: 8, right: 4, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} vertical={false} />
                      <XAxis
                        dataKey="label"
                        tick={{ fontSize: 10, fill: CHART.axis }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        domain={chartConfig.yDomain}
                        tick={{ fontSize: 10, fill: CHART.axis }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip
                        contentStyle={{ fontSize: 11, borderRadius: 6, border: "1px solid #e5e7eb" }}
                        formatter={(v: number) => [
                          `${formatHours(v)}${chartConfig.suffix}`,
                          chartConfig.tooltipLabel,
                        ]}
                      />
                      <Bar
                        dataKey={chartConfig.dataKey}
                        fill={chartConfig.fill}
                        radius={[3, 3, 0, 0]}
                        maxBarSize={28}
                      >
                        <LabelList
                          dataKey={chartConfig.dataKey}
                          position="insideTop"
                          offset={6}
                          formatter={(v: number) =>
                            v != null && !Number.isNaN(v)
                              ? `${formatHours(v)}${chartConfig.suffix}`
                              : ""
                          }
                          style={{ fontSize: 9, fontWeight: 600, fill: "#ffffff" }}
                        />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </section>
          )}

        </div>

        <div className="flex flex-shrink-0 flex-col gap-2 border-t border-border-soft px-[18px] py-3.5">
          <Link
            to="/planner"
            onClick={onClose}
            className="flex items-center justify-center gap-1.5 rounded-md border border-border py-2 text-[12px] font-medium text-foreground hover:bg-surface-alt"
          >
            <CalendarRange className="h-3.5 w-3.5" />
            Edit plan in Resource Planner
          </Link>
          <Link
            to="/confirmations"
            onClick={onClose}
            className="flex items-center justify-center gap-1.5 rounded-md border border-border py-2 text-[12px] font-medium text-foreground hover:bg-surface-alt"
          >
            <ClipboardCheck className="h-3.5 w-3.5" />
            View Work Confirmations
          </Link>
        </div>
      </div>
    </div>
  );
}

function selectableCardClass(active: boolean, clickable: boolean) {
  return [
    "rounded-md border px-3 py-2.5 transition-colors",
    active ? "border-primary bg-accent-soft/40 ring-1 ring-primary/30" : "border-border-soft bg-surface-alt",
    clickable ? "cursor-pointer hover:border-primary/50" : "",
  ].join(" ");
}

function KpiCard({
  label,
  active = false,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  const clickable = !!onClick;
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
      className={selectableCardClass(active, clickable)}
    >
      <div className="mb-1 text-[10px] text-muted-foreground">{label}</div>
      {children}
    </div>
  );
}

function SelectablePanel({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      className={`mt-2 ${selectableCardClass(active, true)}`}
    >
      <div className="mb-1.5 text-[10px] font-medium text-muted-foreground">{label}</div>
      {children}
    </div>
  );
}
