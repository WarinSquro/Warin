import { MetricDelta } from "./MetricDelta";
import { MiniWeekTrendBars } from "./MiniWeekTrendBars";
import { ProjectTypeBadge } from "./ProjectTypeBadge";
import { EXECUTION_STATUS_LABELS } from "../data/executionReport";
import type { CockpitBottomMetricItem, WeeklyMetric } from "../data/cockpit";

function bottomValueClass(value: number): string {
  if (value < 70) return "text-danger";
  if (value < 80) return "text-warning";
  return "text-foreground";
}

interface CockpitWeeklyMetricCardProps {
  title: string;
  metric: WeeklyMetric;
  higherIsBetter?: boolean;
  bottomItems?: CockpitBottomMetricItem[];
  bottomCaption?: string;
  /** Show 4-week mini bars on bottom list rows when item.trend is set. */
  showBottomTrend?: boolean;
  onClick?: () => void;
}

export function CockpitWeeklyMetricCard({
  title,
  metric,
  higherIsBetter = true,
  bottomItems,
  bottomCaption = "Lowest this week",
  showBottomTrend = false,
  onClick,
}: CockpitWeeklyMetricCardProps) {
  const Wrapper = onClick ? "button" : "div";
  const pending = metric.status === "pending";
  const showBottomList = !pending && bottomItems != null && bottomItems.length > 0;

  return (
    <Wrapper
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={`flex h-full min-h-full w-full flex-col self-stretch rounded-lg border border-border bg-surface p-4 text-left shadow-sm ${
        onClick ? "transition hover:border-primary/30 hover:shadow-md" : ""
      }`}
    >
      <div className="flex-shrink-0">
        <div className="text-[12px] font-medium text-muted-foreground">{title}</div>
        {pending ? (
          <div className="mt-3 text-[14px] font-medium text-warning">Pending Calculation</div>
        ) : (
          <div className="mt-2 flex items-baseline gap-1">
            <span className="text-[28px] font-semibold tabular-nums text-foreground">
              {metric.value}
              {metric.suffix ?? ""}
            </span>
            <MetricDelta
              current={metric.value}
              prior={metric.prior}
              higherIsBetter={higherIsBetter}
              suffix={metric.suffix}
            />
          </div>
        )}
      </div>

      {showBottomList ? (
        <div className="mt-3 flex min-h-0 flex-1 flex-col border-t border-border-soft pt-3">
          <div className="mb-2 flex-shrink-0 text-[10px] font-medium uppercase tracking-wide text-muted">
            {bottomCaption}
          </div>
          <ul className="flex min-h-0 flex-1 flex-col justify-evenly gap-1">
            {bottomItems.map((item) => (
              <li
                key={item.label}
                className="flex items-center justify-between gap-3 rounded-md bg-surface-alt/70 px-2.5 py-2 text-[11px]"
              >
                <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
                  <span className="min-w-0 truncate font-medium text-foreground">{item.label}</span>
                  {showBottomTrend && item.trend != null && item.trend.length > 0 && (
                    <MiniWeekTrendBars values={item.trend} />
                  )}
                  {item.projectType != null && (
                    <>
                      <ProjectTypeBadge type={item.projectType} />
                      {item.executionStatus != null && (
                        <>
                          <span className="shrink-0 text-[10px] text-muted-foreground">·</span>
                          <span className="shrink-0 text-[10px] text-muted-foreground">
                            {EXECUTION_STATUS_LABELS[item.executionStatus]}
                          </span>
                        </>
                      )}
                    </>
                  )}
                </div>
                <span
                  className={`shrink-0 font-semibold tabular-nums ${bottomValueClass(item.value)}`}
                >
                  {item.value}
                  {item.suffix ?? ""}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        !pending && (
          <div className="mt-auto flex-shrink-0 pt-2 text-[11px] text-muted-foreground">
            vs prior week
          </div>
        )
      )}
    </Wrapper>
  );
}
