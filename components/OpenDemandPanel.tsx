import { useMemo, useState } from "react";
import { X } from "lucide-react";
import { OPEN_DEMAND } from "../data/planner";
import type { Demand } from "../data/planner";
import { FilterMultiSelect } from "./FilterMultiSelect";
import { DEMAND_PRIORITY, DemandRequestCard, sortDemandsByPriority } from "./DemandRequestCard";

interface Props {
  open: boolean;
  onClose: () => void;
  onFindMatches: (demand: Demand) => void;
  demands?: Demand[];
  /** Planner window label, e.g. "Jul 27 – Aug 28, 2026" */
  rangeLabel?: string;
}

const PRIORITY_OPTIONS = ["CRITICAL", "HIGH", "MEDIUM"] as const;
const PRIORITY_FILTER_MAP: Record<(typeof PRIORITY_OPTIONS)[number], Demand["priority"]> = {
  CRITICAL: "critical",
  HIGH: "high",
  MEDIUM: "medium",
};

export function OpenDemandPanel({
  open,
  onClose,
  onFindMatches,
  demands: demandsProp,
  rangeLabel,
}: Props) {
  const source = demandsProp ?? OPEN_DEMAND;
  const [selectedPriorities, setSelectedPriorities] = useState<string[]>(() => [...PRIORITY_OPTIONS]);

  const priorityCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const label of PRIORITY_OPTIONS) {
      const priority = PRIORITY_FILTER_MAP[label];
      counts[label] = source.filter((d) => d.priority === priority).length;
    }
    return counts;
  }, [source]);

  const demands = useMemo(() => {
    const prioritiesActive =
      selectedPriorities.length > 0 && selectedPriorities.length < PRIORITY_OPTIONS.length;

    return sortDemandsByPriority(
      source.filter((d) => {
        if (!prioritiesActive) return true;
        const label = DEMAND_PRIORITY[d.priority].label;
        return selectedPriorities.includes(label);
      })
    );
  }, [selectedPriorities, source]);

  const handleFindMatches = (demand: Demand) => {
    onClose();
    onFindMatches(demand);
  };

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
        <div className="flex-shrink-0 border-b border-border-soft px-5 py-4">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-[15px] font-semibold text-foreground">Open Demand</div>
              <div className="mt-0.5 text-[12px] text-muted-foreground">
                {source.length} unfilled requests
                {rangeLabel ? ` · ${rangeLabel}` : ""}
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-3 overflow-visible">
            <FilterMultiSelect
              items={PRIORITY_OPTIONS}
              selected={selectedPriorities}
              onChange={setSelectedPriorities}
              counts={priorityCounts}
              allLabel="All priorities"
              pluralLabel="Priorities"
            />
          </div>
        </div>

        <div className="flex flex-shrink-0 border-b border-border-soft px-5 py-2.5">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">
            {demands.length} requests
          </div>
        </div>

        <div className="flex flex-1 flex-col gap-2.5 overflow-y-auto px-4 py-3">
          {demands.length === 0 ? (
            <div className="px-2 py-8 text-center text-[13px] text-muted-foreground">
              No requests match the selected filters.
            </div>
          ) : (
            demands.map((d) => (
              <DemandRequestCard key={d.id} demand={d} onFindMatches={handleFindMatches} />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
