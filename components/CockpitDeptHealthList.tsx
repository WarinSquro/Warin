import { useMemo } from "react";
import { BillableSplitBar } from "./BillableSplitBar";
import { ProjectHealthBadge } from "./ProjectHealthBadge";
import type { DeptHealthRow } from "../data/cockpit";

function hoursLoadStyle(bookedHours: number, capacityHours: number) {
  if (capacityHours <= 0) {
    return { bar: "bg-muted-foreground", track: "bg-border-soft", text: "text-muted-foreground" };
  }
  const ratio = bookedHours / capacityHours;
  if (ratio > 1) return { bar: "bg-danger", track: "bg-danger-soft", text: "text-danger" };
  if (ratio >= 0.9) return { bar: "bg-warning", track: "bg-border-soft", text: "text-warning" };
  if (ratio < 0.7) return { bar: "bg-muted-foreground", track: "bg-border-soft", text: "text-muted" };
  return { bar: "bg-success", track: "bg-border-soft", text: "text-success" };
}

interface CockpitDeptHealthListProps {
  rows: DeptHealthRow[];
  onRowClick?: (department: string) => void;
}

export function CockpitDeptHealthList({ rows, onRowClick }: CockpitDeptHealthListProps) {
  const totalTeam = useMemo(
    () => rows.reduce((sum, row) => sum + row.peopleBooked + row.peopleFree, 0),
    [rows]
  );
  return (
    <div className="flex h-full flex-col rounded-lg border border-border bg-surface p-4 shadow-sm">
      <div className="flex items-baseline justify-between gap-2">
        <div className="text-[12px] font-medium text-muted-foreground">Department Health</div>
        <span className="text-[12px] tabular-nums text-muted-foreground">
          Total Team {totalTeam}
        </span>
      </div>
      <ul className="mt-3 space-y-1">
        {rows.map((row, index) => {
          const load = hoursLoadStyle(row.bookedHours, row.capacityHours);
          const loadPct =
            row.capacityHours > 0
              ? Math.min((row.bookedHours / row.capacityHours) * 100, 100)
              : 0;
          const striped = index % 2 === 1;

          return (
            <li key={row.department}>
              <button
                type="button"
                onClick={() => onRowClick?.(row.department)}
                className={`flex w-full flex-col gap-2 rounded-md px-2 py-3 text-left transition ${
                  striped ? "bg-surface-alt hover:bg-border-soft/60" : "hover:bg-surface-alt"
                }`}
              >
                <div className="flex items-start justify-between gap-3 px-1">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="text-[13px] font-medium text-foreground">{row.department}</div>
                      <ProjectHealthBadge health={row.health} />
                      <span className="text-[11px] tabular-nums text-muted-foreground">
                        Score {row.score}
                      </span>
                    </div>
                    <div className="mt-0.5 text-[11px] text-muted-foreground">{row.detail}</div>
                  </div>
                  <div className="shrink-0 text-[11px] text-muted-foreground">
                    <span className="font-medium text-foreground">{row.peopleBooked}</span> booked
                    <span className="mx-1.5 text-border">·</span>
                    <span className="font-medium text-foreground">{row.peopleFree}</span> free
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 px-1">
                  <div className="min-w-0">
                    <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted">
                      Billable split
                    </div>
                    <BillableSplitBar
                      billablePct={row.billablePct}
                      nonBillablePct={row.nonBillablePct}
                    />
                  </div>

                  <div className="min-w-0">
                    <div className="mb-1 text-[10px] font-medium tracking-wide text-muted">
                      BOOKED vs CAPACITY
                    </div>
                    <div className="flex min-w-0 items-center gap-2">
                      <div className={`h-2 min-w-0 flex-1 overflow-hidden rounded-full ${load.track}`}>
                        <div
                          className={`h-full rounded-full ${load.bar}`}
                          style={{ width: `${loadPct}%` }}
                        />
                      </div>
                      <span className={`shrink-0 text-[10px] font-semibold tabular-nums ${load.text}`}>
                        {row.bookedHours}h / {row.capacityHours}h
                      </span>
                    </div>
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
