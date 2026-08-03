import { useMemo } from "react";
import { SortColHeader, useColumnSort } from "./SortColHeader";
import type { TeamLoadRow, TeamLoadTone } from "../data/cockpit";

type TeamLoadSortKey = "pct";

const TONE: Record<
  TeamLoadTone,
  { bar: string; track: string; text: string; avatarBg: string; avatarText: string }
> = {
  over: {
    bar: "bg-danger",
    track: "bg-danger-soft",
    text: "text-danger",
    avatarBg: "bg-danger-soft",
    avatarText: "text-danger",
  },
  optimal: {
    bar: "bg-success",
    track: "bg-border-soft",
    text: "text-success",
    avatarBg: "bg-success-soft",
    avatarText: "text-success-fg",
  },
  idle: {
    bar: "bg-warning",
    track: "bg-border-soft",
    text: "text-warning",
    avatarBg: "bg-warning-soft",
    avatarText: "text-warning",
  },
};

function wowDelta(pct: number, priorPct: number, tone: TeamLoadTone) {
  const delta = pct - priorPct;
  if (delta === 0) return { label: "—", className: "text-muted-foreground" };

  const arrow = delta > 0 ? "▲" : "▼";
  const abs = Math.abs(delta);

  let className = "text-muted-foreground";
  if (tone === "over" && delta > 0) className = "text-danger";
  else if (tone === "idle" && delta < 0) className = "text-warning";
  else if (tone === "optimal") className = "text-primary";

  return { label: `${arrow}${abs}%`, className };
}

interface CockpitTeamLoadPanelProps {
  rows: TeamLoadRow[];
  onRowClick?: (plannerRowId: string) => void;
}

export function CockpitTeamLoadPanel({ rows, onRowClick }: CockpitTeamLoadPanelProps) {
  const { sortKey, sortDir, handleSort } = useColumnSort<TeamLoadSortKey>("pct", "desc");

  const sortedRows = useMemo(() => {
    const mul = sortDir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => mul * (a.pct - b.pct));
  }, [rows, sortDir]);

  const avg = rows.length
    ? Math.round(rows.reduce((s, r) => s + r.pct, 0) / rows.length)
    : 0;

  return (
    <div className="flex h-full flex-col rounded-lg border border-border bg-surface p-4 shadow-sm">
      <div className="flex items-baseline justify-between gap-2">
        <div className="text-[12px] font-medium text-muted-foreground">Team Load</div>
        <div className="flex items-center gap-3">
          <span className="text-[12px] tabular-nums text-muted-foreground">Avg {avg}%</span>
          <SortColHeader
            label="%"
            col="pct"
            sortKey={sortKey}
            sortDir={sortDir}
            onSort={handleSort}
            className="text-[11px] font-medium text-muted-foreground"
          />
        </div>
      </div>

      <ul className="mt-3 space-y-3">
        {sortedRows.map((row) => {
          const style = TONE[row.tone];
          const delta = wowDelta(row.pct, row.priorPct, row.tone);

          return (
            <li key={row.id}>
              <button
                type="button"
                onClick={() => onRowClick?.(row.plannerRowId)}
                className="flex w-full items-center gap-3 rounded-md px-1 py-1 text-left transition hover:bg-surface-alt"
              >
                <span
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${style.avatarBg} ${style.avatarText}`}
                >
                  {row.initials}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-[13px] font-medium text-foreground">
                      {row.name}
                    </span>
                    <span className={`shrink-0 text-[12px] font-semibold tabular-nums ${style.text}`}>
                      {row.pct}%
                      <span className={`ml-1 text-[10px] font-medium ${delta.className}`}>
                        {delta.label}
                      </span>
                    </span>
                  </div>
                  <div className="text-[11px] text-muted-foreground">{row.department}</div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-border-soft">
                    <div
                      className={`h-full rounded-full ${style.bar}`}
                      style={{ width: `${Math.min(row.pct, 100)}%` }}
                    />
                  </div>
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
