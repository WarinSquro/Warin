import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import {
  WEEKS,
  DAYS,
  CURRENT_WEEK_INDEX,
  CURRENT_DAY_INDEX,
  WEEK_START_ISO,
  DAY_START_ISO,
  parseChipLabel,
  resolveProjectName,
  cellBookedHours,
  buildPlannerRowsFromEmployees,
  buildOpenDemandFromProjects,
  OPEN_DEMAND_RIBBON_MAX,
} from "../data/planner";
import type { Chip, ChipKind, Demand, Candidate, PlannerRow, AllocationSlice } from "../data/planner";
import { AllocationDrawer } from "../components/AllocationDrawer";
import type { AllocationPrefill, AllocationSavePayload, AllocationEditRef } from "../components/AllocationDrawer";
import { FindMatchesPanel } from "../components/FindMatchesPanel";
import { OpenDemandPanel } from "../components/OpenDemandPanel";
import { getHighlightParam, getPanelParam } from "../utils/reportPresets";
import { DemandRequestCard } from "../components/DemandRequestCard";
import { DepartmentSelect } from "../components/DepartmentSelect";
import { useProjects } from "../context/ProjectsContext";
import { usePlanningEmployees } from "../hooks/usePlanningEmployees";
import { useMasters } from "../context/MastersContext";
import { useSettings } from "../context/SettingsContext";
import {
  createAllocation,
  deleteAllocation,
  fetchAllocations,
  updateAllocation,
  type ApiAllocation,
} from "../api/domain";

function clonePlannerRows(rows: PlannerRow[]) {
  return rows.map((row) => ({
    ...row,
    weeks: row.weeks.map((cell) => cell.map((chip) => ({ ...chip }))),
    days: row.days.map((cell) => cell.map((chip) => ({ ...chip }))),
  }));
}

function addDaysISO(iso: string, days: number) {
  const date = new Date(`${iso}T12:00:00`);
  date.setDate(date.getDate() + days);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Header label like "Jul 27" from ISO date. */
function shortMonthDay(iso: string) {
  const date = new Date(`${iso.slice(0, 10)}T12:00:00`);
  return `${SHORT_MONTHS[date.getMonth()]} ${date.getDate()}`;
}

function cellDateRange(view: "day" | "week", cellIndex: number) {
  const start =
    view === "week"
      ? WEEK_START_ISO[cellIndex] ?? WEEK_START_ISO[CURRENT_WEEK_INDEX]
      : DAY_START_ISO[cellIndex] ?? DAY_START_ISO[CURRENT_DAY_INDEX];
  const end = view === "week" ? addDaysISO(start, 4) : start;
  return { start, end };
}

function buildNewPrefill(
  row: PlannerRow,
  view: "day" | "week",
  cellIndex: number,
  cell: Chip[]
): AllocationPrefill {
  const { start, end } = cellDateRange(view, cellIndex);
  const freeChip = cell.find((c) => c.kind === "free");
  const freeHours = freeChip ? parseChipLabel(freeChip.label)?.hours : undefined;
  const hoursPerDay =
    freeHours != null
      ? view === "week"
        ? Math.min(8, freeHours / 5)
        : Math.min(8, freeHours)
      : 8;

  return {
    mode: "create",
    personName: row.name,
    start,
    end,
    hoursPerDay: Number.isInteger(hoursPerDay) ? hoursPerDay : parseFloat(hoursPerDay.toFixed(1)),
    pastAllocationHours: cellBookedHours(cell),
    createRef: {
      rowId: row.id,
      view,
      cellIndex,
    },
  };
}

function toSlice(a: ApiAllocation): AllocationSlice {
  return {
    id: a.id,
    employeeHrmsId: a.employeeHrmsId,
    projectName: a.projectName,
    projectCode: a.projectCode,
    milestoneId: a.milestoneId,
    milestoneName: a.milestoneName,
    activity: a.activity,
    tasks: a.tasks ?? [],
    startDate: a.startDate,
    endDate: a.endDate,
    hoursPerDay: a.hoursPerDay,
    reason: a.reason,
  };
}

function buildEditPrefill(
  row: PlannerRow,
  chip: Chip,
  view: "day" | "week",
  cellIndex: number,
  chipIndex: number,
  cell: Chip[],
  allocLookup: Map<string, AllocationSlice>
): AllocationPrefill | null {
  const parsed = parseChipLabel(chip.label);
  if (!parsed) return null;

  const live = chip.allocationId ? allocLookup.get(chip.allocationId) : undefined;
  const projectName = live?.projectName ?? resolveProjectName(parsed.key);
  const hoursPerDay = live?.hoursPerDay ?? (view === "week" ? parsed.hours / 5 : parsed.hours);
  const { start, end } = cellDateRange(view, cellIndex);
  const pastAllocationHours = cellBookedHours(cell) - parsed.hours;

  return {
    mode: "edit",
    personName: row.name,
    projectName,
    hoursPerDay,
    milestoneId: live?.milestoneId,
    activity: live?.activity,
    tasks: live?.tasks,
    start: live?.startDate ?? start,
    end: live?.endDate ?? end,
    reason: live?.reason,
    replacingHours: parsed.hours,
    pastAllocationHours,
    editRef: {
      rowId: row.id,
      view,
      cellIndex,
      chipIndex,
      allocationId: chip.allocationId,
    },
  };
}

function chipClass(kind: ChipKind) {
  switch (kind) {
    case "normal": return "bg-accent-soft text-accent-softfg";
    case "over": return "bg-danger-soft text-danger-fg";
    case "internal": return "bg-surface-alt text-muted";
    case "free": return "border border-dashed border-border text-muted-foreground";
  }
}

function loadTone(ratio: number) {
  if (ratio > 1) return { text: "text-danger", bar: "bg-danger", track: "bg-danger-soft" };
  if (ratio >= 0.9) return { text: "text-warning", bar: "bg-warning", track: "bg-border-soft" };
  return { text: "text-success", bar: "bg-success", track: "bg-border-soft" };
}

export function ResourcePlanner() {
  const { projects } = useProjects();
  const { employees } = usePlanningEmployees();
  const { departments: deptRows } = useMasters();
  const { settings } = useSettings();
  const location = useLocation();
  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [view, setView] = useState<"day" | "week">("week");
  const [plannerRows, setPlannerRows] = useState<PlannerRow[]>([]);
  const [allocations, setAllocations] = useState<AllocationSlice[]>([]);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [prefill, setPrefill] = useState<AllocationPrefill | null>(null);
  const [matchesDemand, setMatchesDemand] = useState<Demand | null>(null);
  const [openDemandPanel, setOpenDemandPanel] = useState(false);
  const [highlightRowId, setHighlightRowId] = useState<string | null>(null);

  const weekCapacity = Math.round(settings.workingHoursPerDay * settings.workingDays.length) || 40;
  const departments = useMemo(
    () => deptRows.filter((d) => d.status === "active").map((d) => d.name),
    [deptRows]
  );
  const [selectedDepts, setSelectedDepts] = useState<string[]>([]);

  const rangeFrom = WEEK_START_ISO[0];
  const rangeTo = (() => {
    const last = WEEK_START_ISO[WEEK_START_ISO.length - 1];
    return addDaysISO(last, 4);
  })();

  const openDemandRangeLabel = useMemo(() => {
    const from = new Date(`${rangeFrom}T12:00:00`);
    const to = new Date(`${rangeTo}T12:00:00`);
    const fromLabel = `${SHORT_MONTHS[from.getMonth()]} ${from.getDate()}`;
    const toLabel = `${SHORT_MONTHS[to.getMonth()]} ${to.getDate()}, ${to.getFullYear()}`;
    return `${fromLabel} – ${toLabel}`;
  }, [rangeFrom, rangeTo]);

  const openDemand = useMemo(
    () =>
      buildOpenDemandFromProjects(projects, {
        allocations,
        employees: employees.map((e) => ({
          id: e.id,
          status: e.status,
          skills: e.skills,
        })),
        windowFrom: rangeFrom,
        windowTo: rangeTo,
      }),
    [projects, allocations, employees, rangeFrom, rangeTo]
  );
  const ribbonDemand = openDemand.slice(0, OPEN_DEMAND_RIBBON_MAX);

  const allocLookup = useMemo(
    () => new Map(allocations.map((a) => [a.id, a])),
    [allocations]
  );

  const reloadAllocations = useCallback(async () => {
    try {
      const rows = await fetchAllocations({ from: rangeFrom, to: rangeTo });
      setAllocations(rows.map(toSlice));
      setSaveError(null);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Failed to load allocations");
      setAllocations([]);
    }
  }, [rangeFrom, rangeTo]);

  useEffect(() => {
    void reloadAllocations();
  }, [reloadAllocations]);

  useEffect(() => {
    setPlannerRows(
      clonePlannerRows(buildPlannerRowsFromEmployees(employees, weekCapacity, allocations))
    );
  }, [employees, weekCapacity, allocations]);

  useEffect(() => {
    if (departments.length === 0) return;
    setSelectedDepts((prev) => (prev.length === 0 ? [...departments] : prev.filter((d) => departments.includes(d))));
  }, [departments]);

  const deptCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const dept of departments) {
      counts[dept] = plannerRows.filter((r) => r.dept === dept).length;
    }
    return counts;
  }, [plannerRows, departments]);

  const visibleRows = useMemo(
    () => plannerRows.filter((r) => selectedDepts.includes(r.dept)),
    [plannerRows, selectedDepts]
  );

  useEffect(() => {
    const panel = getPanelParam(location.search);
    const highlight = getHighlightParam(location.search);
    if (panel === "demand") setOpenDemandPanel(true);
    if (highlight) {
      const row = plannerRows.find((r) => r.id === highlight);
      if (row) {
        setSelectedDepts((prev) => (prev.includes(row.dept) ? prev : [...prev, row.dept]));
        setHighlightRowId(highlight);
      }
    }
  }, [location.search, plannerRows]);

  useEffect(() => {
    if (!highlightRowId) return;
    const el = rowRefs.current[highlightRowId];
    if (!el) return;
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    const timer = window.setTimeout(() => setHighlightRowId(null), 3000);
    return () => window.clearTimeout(timer);
  }, [highlightRowId, visibleRows]);

  const openAllocate = (p?: AllocationPrefill) => {
    setPrefill(p ?? null);
    setDrawerOpen(true);
  };

  const handleCellClick = (row: PlannerRow, cellIndex: number, cell: Chip[]) => {
    openAllocate(buildNewPrefill(row, view, cellIndex, cell));
  };

  const handleChipClick = (
    row: PlannerRow,
    chip: Chip,
    cellIndex: number,
    chipIndex: number,
    cell: Chip[]
  ) => {
    if (chip.kind === "free") return;
    const editPrefill = buildEditPrefill(
      row,
      chip,
      view,
      cellIndex,
      chipIndex,
      cell,
      allocLookup
    );
    if (editPrefill) openAllocate(editPrefill);
  };

  const handleAllocationSave = async (payload: AllocationSavePayload) => {
    const project = projects.find((p) => p.id === payload.projectId);
    if (!project) return;
    const body = {
      employeeHrmsId: payload.personId,
      projectCode: payload.projectId,
      milestoneId: payload.milestoneId,
      activity: payload.activity,
      tasks: payload.tasks,
      startDate: payload.start,
      endDate: payload.end,
      hoursPerDay: payload.hoursPerDay,
      reason: payload.reason,
    };
    try {
      setSaveError(null);
      if (payload.editRef?.allocationId) {
        await updateAllocation(payload.editRef.allocationId, body);
      } else {
        await createAllocation(body);
      }
      await reloadAllocations();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to save allocation";
      setSaveError(msg);
      throw e;
    }
  };

  const handleAllocationDelete = async (editRef: AllocationEditRef) => {
    try {
      setSaveError(null);
      if (!editRef.allocationId) {
        throw new Error("Cannot delete — allocation is not persisted yet");
      }
      await deleteAllocation(editRef.allocationId);
      await reloadAllocations();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to delete allocation";
      setSaveError(msg);
      throw e;
    }
  };

  const onCandidateAllocate = (c: Candidate) => {
    const demand = matchesDemand;
    setMatchesDemand(null);
    openAllocate({ personName: c.name, projectName: demand?.project, hoursPerDay: 8 });
  };

  const headerRangeLabel =
    view === "week"
      ? `${WEEKS[0]} – ${WEEKS[WEEKS.length - 1]}`
      : `${shortMonthDay(DAY_START_ISO[0]!)} – ${shortMonthDay(DAY_START_ISO[DAY_START_ISO.length - 1]!)}`;

  return (
    <>
      {/* Header */}
      <header className="flex h-14 flex-shrink-0 items-center justify-between border-b border-border bg-surface px-5">
        <div className="flex items-center gap-4">
          <div className="text-[15px] font-semibold tracking-tight text-foreground">Resource Planner</div>
          <div className="flex items-center gap-2 text-[12px] text-foreground">
            <button className="text-muted-foreground hover:text-foreground"><ChevronLeft className="h-4 w-4" /></button>
            <span className="font-medium">{headerRangeLabel}</span>
            <button className="text-muted-foreground hover:text-foreground"><ChevronRight className="h-4 w-4" /></button>
          </div>
          {saveError && (
            <div className="max-w-xs truncate text-[11px] text-danger" title={saveError}>
              {saveError}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex overflow-hidden rounded-md border border-border text-[12px]">
            {(["day", "week"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`px-3 py-1.5 capitalize ${view === v ? "bg-brand font-medium text-white" : "text-muted"}`}
              >
                {v}
              </button>
            ))}
          </div>
          <DepartmentSelect
            departments={departments}
            selected={selectedDepts}
            onChange={setSelectedDepts}
            counts={deptCounts}
            align="end"
          />
          <button
            onClick={() => openAllocate()}
            className="flex items-center gap-1 rounded-md bg-primary px-3.5 py-1.5 text-[12px] font-medium text-primary-foreground"
          >
            <Plus className="h-3.5 w-3.5" /> Allocate
          </button>
        </div>
      </header>

      {/* Open Demand band */}
      <div className="flex-shrink-0 border-b border-border bg-surface-alt px-5 py-3">
        <div className="mb-2.5 flex items-center justify-between">
          <div className="text-[12px] font-semibold text-foreground">
            Open Demand <span className="font-normal text-muted-foreground">· {openDemand.length} unfilled requests</span>
          </div>
          <button
            type="button"
            onClick={() => setOpenDemandPanel(true)}
            className="text-[11px] text-primary hover:underline"
          >
            View all →
          </button>
        </div>
        <div className="flex gap-2.5">
          {ribbonDemand.length === 0 ? (
            <div className="flex-1 rounded-md border border-dashed border-border bg-surface px-3 py-4 text-center text-[12px] text-muted-foreground">
              No open demand · add projects with resource demand in Project Master
            </div>
          ) : (
            ribbonDemand.map((d) => (
              <DemandRequestCard
                key={d.id}
                demand={d}
                onFindMatches={setMatchesDemand}
                className="flex-1"
              />
            ))
          )}
        </div>
      </div>

      {/* Grid */}
      <div className="flex flex-1 flex-col overflow-hidden bg-surface">
        {/* Column header */}
        <div className="flex flex-shrink-0 border-b border-border bg-surface-alt">
          <div className="w-[210px] flex-shrink-0 border-r border-border-soft px-4 py-2.5 text-[11px] font-semibold text-muted">
            TEAM MEMBER
          </div>
          {view === "week"
            ? WEEKS.map((w, i) => (
                <div
                  key={w}
                  className={`flex-1 border-r border-border-soft px-3 py-2.5 text-center text-[11px] ${
                    i === CURRENT_WEEK_INDEX ? "bg-highlight font-semibold text-foreground" : "text-muted-foreground"
                  }`}
                >
                  {w}
                </div>
              ))
            : DAYS.map((d, i) => (
                <div
                  key={d}
                  className={`flex-1 border-r border-border-soft px-3 py-2.5 text-center text-[11px] ${
                    i === CURRENT_DAY_INDEX ? "bg-highlight font-semibold text-foreground" : "text-muted-foreground"
                  }`}
                >
                  {d}
                </div>
              ))}
        </div>

        {/* Rows */}
        <div className="flex flex-1 flex-col overflow-y-auto">
          {visibleRows.length === 0 ? (
            <div className="px-4 py-10 text-center text-[13px] text-muted-foreground">
              No team members match the selected departments.
            </div>
          ) : (
            visibleRows.map((row) => (
              <div
                key={row.id}
                ref={(el) => {
                  rowRefs.current[row.id] = el;
                }}
                className={
                  highlightRowId === row.id
                    ? "ring-2 ring-inset ring-primary/40 bg-accent-soft/30"
                    : undefined
                }
              >
                <PlannerGridRow
                  row={row}
                  view={view}
                  onCellClick={handleCellClick}
                  onChipClick={handleChipClick}
                />
              </div>
            ))
          )}
        </div>
      </div>

      <AllocationDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        prefill={prefill}
        people={plannerRows}
        onSave={handleAllocationSave}
        onDelete={handleAllocationDelete}
      />
      <OpenDemandPanel
        open={openDemandPanel}
        onClose={() => setOpenDemandPanel(false)}
        onFindMatches={setMatchesDemand}
        demands={openDemand}
        rangeLabel={openDemandRangeLabel}
      />
      <FindMatchesPanel
        demand={matchesDemand}
        allocations={allocations}
        onClose={() => setMatchesDemand(null)}
        onAllocate={onCandidateAllocate}
      />
    </>
  );
}

function PlannerGridRow({
  row,
  view,
  onCellClick,
  onChipClick,
}: {
  row: PlannerRow;
  view: "day" | "week";
  onCellClick: (row: PlannerRow, cellIndex: number, cell: Chip[]) => void;
  onChipClick: (row: PlannerRow, chip: Chip, cellIndex: number, chipIndex: number, cell: Chip[]) => void;
}) {
  const ratio = row.bookedHours / row.capacity;
  const tone = loadTone(ratio);
  const pct = Math.min(ratio, 1.25) * 80; // cap visual width
  const cells = view === "week" ? row.weeks : row.days;
  const currentIndex = view === "week" ? CURRENT_WEEK_INDEX : CURRENT_DAY_INDEX;

  return (
    <div className="flex min-h-[72px] flex-1 border-b border-border-soft">
      {/* Left: person + load meter */}
      <div className="flex w-[210px] flex-shrink-0 flex-col justify-center border-r border-border-soft px-4 py-2.5">
        <div className="text-[13px] font-medium text-foreground">{row.name}</div>
        <div className="mb-1.5 text-[11px] text-muted-foreground">{row.dept}</div>
        <div className="flex items-center gap-1.5">
          <div className={`h-[5px] flex-1 rounded-full ${tone.track}`}>
            <div className={`h-full rounded-full ${tone.bar}`} style={{ width: `${pct}%` }} />
          </div>
          <span className={`text-[11px] font-semibold ${tone.text}`}>
            {row.bookedHours}/{row.capacity}h
          </span>
        </div>
      </div>

      {/* Week or day cells */}
      {cells.map((cell, i) => {
        const hasOver = cell.some((c) => c.kind === "over");
        return (
          <div
            key={i}
            role="button"
            tabIndex={0}
            onClick={() => onCellClick(row, i, cell)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onCellClick(row, i, cell);
              }
            }}
            className={`flex flex-1 cursor-pointer flex-col justify-center gap-1 border-r border-border-soft p-1.5 hover:bg-surface-alt/40 ${
              hasOver ? "bg-danger-soft/50" : i === currentIndex ? "bg-highlight" : ""
            }`}
          >
            {cell.map((c: Chip, j) =>
              c.kind === "free" ? (
                <div
                  key={j}
                  className={`pointer-events-none rounded-sm px-1.5 py-1 text-[10px] leading-tight ${chipClass(c.kind)}`}
                >
                  {c.label}
                </div>
              ) : (
                <button
                  key={j}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onChipClick(row, c, i, j, cell);
                  }}
                  className={`rounded-sm px-1.5 py-1 text-left text-[10px] leading-tight ${chipClass(c.kind)} hover:brightness-95`}
                >
                  {c.label}
                </button>
              )
            )}
          </div>
        );
      })}
    </div>
  );
}
