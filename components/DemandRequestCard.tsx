import type { Demand } from "../data/planner";

export const DEMAND_PRIORITY: Record<
  Demand["priority"],
  { label: string; text: string; border: string }
> = {
  critical: { label: "CRITICAL", text: "text-danger", border: "border-l-danger" },
  high: { label: "HIGH", text: "text-warning", border: "border-l-warning" },
  medium: { label: "MEDIUM", text: "text-muted", border: "border-l-muted-foreground" },
};

const PRIORITY_ORDER: Record<Demand["priority"], number> = {
  critical: 0,
  high: 1,
  medium: 2,
};

export function sortDemandsByPriority(demands: Demand[]) {
  return [...demands].sort((a, b) => {
    const byPriority = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
    if (byPriority !== 0) return byPriority;
    return a.byDate.localeCompare(b.byDate);
  });
}

interface Props {
  demand: Demand;
  onFindMatches: (demand: Demand) => void;
  className?: string;
}

export function DemandRequestCard({ demand, onFindMatches, className = "" }: Props) {
  const pr = DEMAND_PRIORITY[demand.priority];

  return (
    <div
      className={`rounded-md border border-l-[3px] border-border bg-surface px-3 py-2.5 ${pr.border} ${className}`}
    >
      <div className="mb-1 flex items-center justify-between gap-2">
        <div className="text-[12px] font-semibold text-foreground">{demand.project}</div>
        <div className={`flex-shrink-0 text-[10px] font-semibold ${pr.text}`}>{pr.label}</div>
      </div>
      <div className="text-[11px] text-muted-foreground">
        {demand.count}× {demand.role} · {demand.hoursPerWeek}h/wk · by {demand.byDate}
      </div>
      <button
        type="button"
        onClick={() => onFindMatches(demand)}
        className="mt-1.5 text-[11px] text-primary hover:underline"
      >
        Find matches →
      </button>
    </div>
  );
}
