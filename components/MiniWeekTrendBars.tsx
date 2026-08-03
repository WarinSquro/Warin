function disciplineBarColor(pct: number): string {
  if (pct < 70) return "bg-danger";
  if (pct < 80) return "bg-warning";
  return "bg-success";
}

function barHeight(pct: number, maxPct = 100): string {
  return `${(Math.min(pct, maxPct) / maxPct) * 100}%`;
}

interface MiniWeekTrendBarsProps {
  /** Weekly percentages, oldest → newest (4 values). */
  values: number[];
  className?: string;
}

/** Compact 4-week bar sparkline — matches Utilization page trend bar styling. */
export function MiniWeekTrendBars({ values, className = "" }: MiniWeekTrendBarsProps) {
  return (
    <div
      className={`flex h-[14px] shrink-0 items-end gap-[2px] ${className}`}
      aria-label={`4-week trend: ${values.join(", ")} percent`}
    >
      {values.map((pct, i) => {
        const isCurrent = i === values.length - 1;
        return (
          <div
            key={i}
            title={`${pct}%`}
            className={`w-1 rounded-sm ${disciplineBarColor(pct)} ${
              isCurrent ? "ring-1 ring-foreground/15" : ""
            }`}
            style={{ height: barHeight(pct) }}
          />
        );
      })}
    </div>
  );
}
