import { formatHours } from "../utils/formatHours";

interface MetricDeltaProps {
  current?: number | null;
  prior?: number | null;
  higherIsBetter?: boolean;
  suffix?: string;
  show?: boolean;
}

export function MetricDelta({
  current,
  prior,
  higherIsBetter = true,
  suffix = "",
  show = true,
}: MetricDeltaProps) {
  if (!show) return null;

  if (current == null || prior == null) {
    return <span className="ml-1 text-[10px] text-muted-foreground">NA</span>;
  }

  const delta = parseFloat((current - prior).toFixed(1));
  if (delta === 0) {
    return <span className="ml-1 text-[10px] text-muted-foreground">—</span>;
  }

  const improved = higherIsBetter ? delta > 0 : delta < 0;
  const sign = delta > 0 ? "+" : "";
  const arrow = delta > 0 ? "▲" : "▼";

  return (
    <span
      className={`ml-1 text-[10px] font-medium tabular-nums ${
        improved ? "text-success" : "text-danger"
      }`}
    >
      {arrow} {sign}
      {formatHours(Math.abs(delta))}
      {suffix}
    </span>
  );
}
