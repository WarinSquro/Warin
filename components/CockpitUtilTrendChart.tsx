import { useMemo } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LabelList,
  ReferenceLine,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import { MetricDelta } from "./MetricDelta";
import { useSettings } from "../context/SettingsContext";
import type { UtilizationTrendWeek, WeeklyMetric } from "../data/cockpit";

const CHART = {
  primary: "#152F39",
  grid: "#eef0f3",
  axis: "#6b7280",
  bandLine: "#dc2626",
};

interface UtilTrendTooltipProps {
  active?: boolean;
  payload?: { payload: UtilizationTrendWeek; value: number }[];
}

function UtilTrendTooltip({ active, payload }: UtilTrendTooltipProps) {
  if (!active || !payload?.[0]) return null;
  const point = payload[0].payload;
  return (
    <div className="rounded-md border border-border bg-surface px-2.5 py-2 text-[11px] shadow-md">
      <div className="font-semibold text-foreground">{point.week}</div>
      <div className="text-muted-foreground">{point.dateRange}</div>
      <div className="mt-1 text-foreground">
        Utilization:{" "}
        <span className="font-medium tabular-nums">{point.util}%</span>
      </div>
    </div>
  );
}

interface CockpitUtilTrendChartProps {
  data: UtilizationTrendWeek[];
  avg: WeeklyMetric;
  onClick?: () => void;
}

export function CockpitUtilTrendChart({ data, avg, onClick }: CockpitUtilTrendChartProps) {
  const { settings } = useSettings();
  const idleBelow = settings.bands.idleBelow;
  const optimalTo = settings.bands.optimalTo;

  const yDomain = useMemo((): [number, number] => {
    const utils = data.map((d) => d.util);
    const minVal = Math.min(60, idleBelow - 5, ...utils);
    const maxVal = Math.max(100, optimalTo + 2, ...utils);
    return [Math.floor(minVal / 5) * 5, Math.ceil(maxVal / 5) * 5];
  }, [data, idleBelow, optimalTo]);

  const Wrapper = onClick ? "button" : "div";

  return (
    <Wrapper
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={`flex h-full min-h-full w-full flex-col self-stretch rounded-lg border border-border bg-surface p-4 text-left shadow-sm ${
        onClick ? "transition hover:border-primary/30 hover:shadow-md" : ""
      }`}
    >
      <div className="flex flex-shrink-0 items-start justify-between gap-2">
        <div>
          <div className="text-[12px] font-medium text-muted-foreground">Utilization Trend</div>
          <div className="mt-1 flex items-baseline gap-1">
            {avg.status === "pending" || avg.value == null ? (
              <span className="text-[14px] font-medium text-warning">Pending Calculation</span>
            ) : (
              <>
                <span className="text-[18px] font-semibold tabular-nums text-foreground">
                  Avg {avg.value}
                  {avg.suffix ?? "%"}
                </span>
                <MetricDelta current={avg.value} prior={avg.prior} higherIsBetter />
              </>
            )}
          </div>
        </div>
        <span className="shrink-0 text-[11px] text-muted-foreground">8 weeks</span>
      </div>

      <div className="mt-2 min-h-[120px] flex-1">
        {data.length === 0 ? (
          <div className="flex h-full min-h-[120px] items-center justify-center text-[12px] text-muted-foreground">
            No utilization history yet
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 8, right: 4, left: -20, bottom: 18 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} vertical={false} />
              <XAxis
                dataKey="week"
                tick={{ fontSize: 10, fill: CHART.axis }}
                axisLine={false}
                tickLine={false}
                interval={0}
                height={22}
                tickMargin={6}
              />
              <YAxis
                domain={yDomain}
                tick={{ fontSize: 10, fill: CHART.axis }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip content={<UtilTrendTooltip />} cursor={{ fill: "rgba(79, 70, 229, 0.06)" }} />
              <ReferenceLine
                y={idleBelow}
                stroke={CHART.bandLine}
                strokeOpacity={0.38}
                strokeDasharray="5 4"
                strokeWidth={1.5}
                ifOverflow="extendDomain"
              />
              <ReferenceLine
                y={optimalTo}
                stroke={CHART.bandLine}
                strokeOpacity={0.38}
                strokeDasharray="5 4"
                strokeWidth={1.5}
                ifOverflow="extendDomain"
              />
              <Bar dataKey="util" fill={CHART.primary} radius={[3, 3, 0, 0]} maxBarSize={28}>
                <LabelList
                  dataKey="util"
                  position="insideTop"
                  offset={6}
                  formatter={(v: number) =>
                    v != null && !Number.isNaN(v) ? `${v}%` : ""
                  }
                  style={{ fontSize: 9, fontWeight: 600, fill: "#ffffff" }}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="mt-1.5 flex flex-shrink-0 flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <span
            className="inline-block h-px w-3 border-t border-dashed border-danger/40"
            aria-hidden
          />
          Idle below {idleBelow}%
        </span>
        <span className="inline-flex items-center gap-1">
          <span
            className="inline-block h-px w-3 border-t border-dashed border-danger/40"
            aria-hidden
          />
          Optimal up to {optimalTo}%
        </span>
      </div>
    </Wrapper>
  );
}
