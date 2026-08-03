import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { X, FolderKanban } from "lucide-react";
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
import { ProjectHealthBadge } from "./ProjectHealthBadge";
import {
  EXECUTION_STATUS_LABELS,
  type ExecutionHistory,
  type ExecutionRosterEntry,
  type ExecutionRow,
} from "../data/executionReport";

interface Props {
  open: boolean;
  onClose: () => void;
  row: ExecutionRow | null;
  history: ExecutionHistory | null;
  roster: ExecutionRosterEntry[];
  periodLabel: string;
}

const ROSTER_GRID =
  "grid grid-cols-[minmax(0,1.2fr)_minmax(3rem,0.45fr)_minmax(3.5rem,0.5fr)_minmax(3.5rem,0.5fr)] gap-2";

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

export function ProjectExecutionDrawer({ open, onClose, row, history, roster, periodLabel }: Props) {
  const [trendMetric, setTrendMetric] = useState<TrendMetric>("confirmationDiscipline");

  useEffect(() => {
    if (open && row) setTrendMetric("confirmationDiscipline");
  }, [open, row?.projectId]);

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
  const metricsNa = row.unstaffedException;

  return (
    <div className={`fixed inset-0 z-40 ${open ? "" : "pointer-events-none"}`}>
      <div
        onClick={onClose}
        className={`absolute inset-0 bg-brand/30 transition-opacity duration-200 ${open ? "opacity-100" : "opacity-0"}`}
      />
      <div
        className={`absolute right-0 top-0 flex h-full w-[420px] flex-col bg-surface shadow-2xl transition-transform duration-200 ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex flex-shrink-0 items-center justify-between border-b border-border-soft px-[18px] py-3.5">
          <div className="min-w-0">
            <div className="truncate text-[14px] font-semibold text-foreground">{row.projectName}</div>
            <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
              <ExecutionStatusBadge status={row.executionStatus} />
              <ProjectHealthBadge health={row.health} />
              <span>· {periodLabel}</span>
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
              Click a metric to view its 6-month execution trend below.
            </p>
            <div className="grid grid-cols-2 gap-2">
              <KpiCard
                label="Planning Accuracy"
                active={trendMetric === "planningAccuracy"}
                onClick={() => setTrendMetric("planningAccuracy")}
              >
                <MetricChip value={metricsNa ? undefined : row.planningAccuracy} />
              </KpiCard>
              <KpiCard
                label="Confirmation Discipline"
                active={trendMetric === "confirmationDiscipline"}
                onClick={() => setTrendMetric("confirmationDiscipline")}
              >
                <MetricChip value={metricsNa ? undefined : row.confirmationDiscipline} />
              </KpiCard>
              <KpiCard
                label="Utilization"
                active={trendMetric === "utilization"}
                onClick={() => setTrendMetric("utilization")}
              >
                <span className="text-[13px] font-semibold tabular-nums text-foreground">
                  {row.utilizationHrs}h
                </span>
              </KpiCard>
              <KpiCard label="Resources">
                <span className="text-[13px] font-semibold tabular-nums text-foreground">
                  {row.resourceCount}
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
                leaveException={row.unstaffedException}
              />
            </SelectablePanel>
          </section>

          {trendData.length > 0 ? (
            <section>
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted">
                6-month execution trend
              </div>
              <div className="rounded-md border border-border-soft bg-surface-alt p-3">
                <div className="mb-1 text-[11px] font-medium text-foreground">{chartConfig.title}</div>
                <div className="h-[120px] w-full">
                  <ResponsiveContainer
                    key={`${row.projectId}-${trendMetric}`}
                    width="100%"
                    height={120}
                  >
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
                        formatter={(v: number) => [`${v}${chartConfig.suffix}`, chartConfig.tooltipLabel]}
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
                            v != null && !Number.isNaN(v) ? `${v}${chartConfig.suffix}` : ""
                          }
                          style={{ fontSize: 9, fontWeight: 600, fill: "#ffffff" }}
                        />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </section>
          ) : (
            <section>
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted">
                6-month execution trend
              </div>
              <div className="rounded-md border border-border-soft bg-surface-alt px-3 py-4 text-center text-[11px] text-muted-foreground">
                No trend data available for this project yet.
              </div>
            </section>
          )}

          <section>
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted">
              Contributing resources
            </div>
            {roster.length === 0 ? (
              <div className="rounded-md border border-border-soft bg-surface-alt px-3 py-4 text-center text-[11px] text-muted-foreground">
                No resources assigned during this period.
              </div>
            ) : (
              <div className="overflow-hidden rounded-md border border-border-soft">
                <div
                  className={`${ROSTER_GRID} border-b border-border-soft bg-surface-alt px-3 py-1.5 text-[10px] font-semibold uppercase text-muted`}
                >
                  <span>Resource</span>
                  <span className="text-right">Util</span>
                  <span className="text-right">Alloc</span>
                  <span className="text-right">Discipline</span>
                </div>
                {roster.map((entry) => (
                  <div
                    key={entry.employeeId}
                    className={`${ROSTER_GRID} border-b border-border-soft px-3 py-2 last:border-b-0`}
                  >
                    <div className="min-w-0">
                      <Link
                        to={`/employees?highlight=${entry.employeeId}`}
                        onClick={onClose}
                        className="truncate text-[12px] font-medium text-foreground hover:text-primary"
                      >
                        {entry.name}
                      </Link>
                      <div className="truncate text-[10px] text-muted-foreground">{entry.department}</div>
                    </div>
                    <div className="text-right text-[12px] tabular-nums text-foreground">
                      {entry.utilizationHrs}h
                    </div>
                    <div className="text-right text-[12px] tabular-nums text-foreground">
                      {entry.allocationPct}%
                    </div>
                    <div className="text-right text-[12px] tabular-nums text-foreground">
                      {entry.disciplinePct != null ? `${entry.disciplinePct}%` : "—"}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        <div className="flex flex-shrink-0 flex-col gap-2 border-t border-border-soft px-[18px] py-3.5">
          <Link
            to={`/projects?highlight=${row.projectId}`}
            onClick={onClose}
            className="flex items-center justify-center gap-1.5 rounded-md border border-border py-2 text-[12px] font-medium text-foreground hover:bg-surface-alt"
          >
            <FolderKanban className="h-3.5 w-3.5" />
            View in Project Master
          </Link>
        </div>
      </div>
    </div>
  );
}

function ExecutionStatusBadge({ status }: { status: ExecutionRow["executionStatus"] }) {
  const styles: Record<ExecutionRow["executionStatus"], string> = {
    active: "border-success-border bg-success-soft text-success",
    on_hold: "border-warning-border bg-warning-soft text-warning",
    completed: "border-border bg-surface-alt text-muted-foreground",
  };
  return (
    <span
      className={`inline-flex rounded-sm border px-1.5 py-0.5 text-[10px] font-medium ${styles[status]}`}
    >
      {EXECUTION_STATUS_LABELS[status]}
    </span>
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
