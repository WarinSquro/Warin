import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { buildPlanningConflictsFromLive } from "../api/cockpitDaily";
import { fetchAllocations, type ApiAllocation } from "../api/domain";
import { mondayISO } from "../api/liveViews";
import { workingWeekEnd } from "../utils/workingWeek";
import { SortColHeader, useColumnSort } from "../components/SortColHeader";
import { usePlanningEmployees } from "../hooks/usePlanningEmployees";
import { useSettings } from "../context/SettingsContext";
import { useSharedDataSync } from "../hooks/useSharedDataSync";
import type { PlanningConflictRow } from "../data/cockpit";

type ConflictSortKey = "employee" | "type" | "projects" | "detail";

export function PlanningConflicts() {
  const { employees } = usePlanningEmployees();
  const { settings } = useSettings();
  const [allocations, setAllocations] = useState<ApiAllocation[]>([]);
  const [loaded, setLoaded] = useState(false);
  const { sortKey, sortDir, handleSort } = useColumnSort<ConflictSortKey>("employee");

  const weekCapacity = Math.round(settings.workingHoursPerDay * settings.workingDays.length) || 40;
  const hoursPerDay = settings.workingHoursPerDay || 8;
  const weekFrom = mondayISO();
  const weekTo = workingWeekEnd(weekFrom, settings.workingDays);

  const load = useCallback(async () => {
    try {
      const rows = await fetchAllocations({ from: weekFrom, to: weekTo });
      setAllocations(rows);
      setLoaded(true);
    } catch {
      setAllocations([]);
      setLoaded(true);
    }
  }, [weekFrom, weekTo]);

  useEffect(() => {
    void load();
  }, [load]);

  useSharedDataSync(true, load, { resources: ["allocations"] });

  const conflicts: PlanningConflictRow[] = useMemo(() => {
    if (!loaded) return [];
    return buildPlanningConflictsFromLive(
      employees.filter((e) => e.status === "active"),
      allocations,
      weekCapacity,
      weekFrom,
      weekTo,
      hoursPerDay
    );
  }, [loaded, employees, allocations, weekCapacity, weekFrom, weekTo, hoursPerDay]);

  const sorted = useMemo(() => {
    const mul = sortDir === "asc" ? 1 : -1;
    return [...conflicts].sort((a, b) => {
      let cmp = 0;
      if (sortKey === "employee") cmp = a.employeeName.localeCompare(b.employeeName);
      else if (sortKey === "type") cmp = a.conflictType.localeCompare(b.conflictType);
      else if (sortKey === "projects")
        cmp = (a.projects.join(", ") || "").localeCompare(b.projects.join(", ") || "");
      else cmp = a.detail.localeCompare(b.detail);
      if (cmp !== 0) return mul * cmp;
      return a.employeeName.localeCompare(b.employeeName);
    });
  }, [conflicts, sortKey, sortDir]);

  return (
    <>
      <header className="flex h-14 flex-shrink-0 items-center justify-between border-b border-border bg-surface px-5">
        <div>
          <nav className="mb-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
            <Link to="/cockpit" className="hover:text-primary">
              My Workspace
            </Link>
            <ChevronRight className="h-3 w-3" />
            <span className="text-foreground">Planning Conflicts</span>
          </nav>
          <div className="text-[15px] font-semibold tracking-tight text-foreground">
            Planning Conflicts
          </div>
        </div>
        <Link
          to="/cockpit"
          className="rounded-md border border-border px-3 py-1.5 text-[12px] text-foreground hover:bg-surface-alt"
        >
          ← Back to My Workspace
        </Link>
      </header>

      <div className="flex flex-1 flex-col overflow-y-auto bg-background p-5">
        {!loaded ? (
          <div className="rounded-lg border border-border bg-surface px-6 py-16 text-center text-[13px] text-muted-foreground">
            Loading conflicts…
          </div>
        ) : conflicts.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-surface px-6 py-16 text-center">
            <div className="text-[15px] font-medium text-foreground">All clear</div>
            <div className="mt-1 text-[13px] text-muted-foreground">
              No planning conflicts for the week of {weekFrom}
            </div>
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-border bg-surface">
            <table className="w-full text-left text-[13px]">
              <thead className="border-b border-border bg-surface-alt text-[11px] uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5 font-medium">
                    <SortColHeader
                      label="Employee"
                      col="employee"
                      sortKey={sortKey}
                      sortDir={sortDir}
                      onSort={handleSort}
                    />
                  </th>
                  <th className="px-4 py-2.5 font-medium">
                    <SortColHeader
                      label="Type"
                      col="type"
                      sortKey={sortKey}
                      sortDir={sortDir}
                      onSort={handleSort}
                    />
                  </th>
                  <th className="px-4 py-2.5 font-medium">
                    <SortColHeader
                      label="Projects"
                      col="projects"
                      sortKey={sortKey}
                      sortDir={sortDir}
                      onSort={handleSort}
                    />
                  </th>
                  <th className="px-4 py-2.5 font-medium">
                    <SortColHeader
                      label="Detail"
                      col="detail"
                      sortKey={sortKey}
                      sortDir={sortDir}
                      onSort={handleSort}
                    />
                  </th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((c) => (
                  <tr key={c.id} className="border-b border-border-soft last:border-0">
                    <td className="px-4 py-3">
                      <div className="font-medium text-foreground">{c.employeeName}</div>
                      <div className="text-[11px] text-muted-foreground">{c.department}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={
                          c.severity === "high"
                            ? "font-medium text-danger"
                            : "font-medium text-warning"
                        }
                      >
                        {c.conflictType}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {c.projects.length > 0 ? c.projects.join(", ") : "—"}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{c.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
