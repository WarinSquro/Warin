import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import {
  WEEKS,
  CURRENT_WEEK_INDEX,
  WEEK_START_ISO,
  DAY_START_ISO,
  DAY_WEEK_OFFSET_MIN,
  DAY_WEEK_OFFSET_MAX,
  dayStripForWeekOffset,
  parseChipLabel,
  resolveProjectName,
  cellBookedHours,
  buildPlannerRowsFromEmployees,
  buildOpenDemandFromProjects,
  OPEN_DEMAND_RIBBON_MAX,
  allocationEffectiveDate,
  addDaysToIso,
  isPlannerWorkingDay,
  plannerTodayISO,
  weekCapacityHours,
  type PlannerCalendarOpts,
} from "../data/planner";
import { workingWeekEnd } from "../utils/workingWeek";
import type { Chip, ChipKind, Demand, Candidate, PlannerRow, AllocationSlice } from "../data/planner";
import { AllocationDrawer } from "../components/AllocationDrawer";
import type { AllocationPrefill, AllocationSavePayload, AllocationEditRef } from "../components/AllocationDrawer";
import { FindMatchesPanel } from "../components/FindMatchesPanel";
import { OpenDemandPanel } from "../components/OpenDemandPanel";
import { getHighlightParam, getPanelParam } from "../utils/reportPresets";
import { DemandRequestCard } from "../components/DemandRequestCard";
import { DepartmentSelect } from "../components/DepartmentSelect";
import { SortColHeader, useColumnSort } from "../components/SortColHeader";
import { useProjects } from "../context/ProjectsContext";
import { usePlanningEmployees } from "../hooks/usePlanningEmployees";
import { useSharedDataSync, usePauseSharedDataSync, MASTER_TXN_SYNC_INTERVAL_MS } from "../hooks/useSharedDataSync";
import { useMasters } from "../context/MastersContext";
import { useSettings } from "../context/SettingsContext";
import { useToast } from "../context/ToastContext";
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

const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Header label like "Jul 27" from ISO date. */
function shortMonthDay(iso: string) {
  const date = new Date(`${iso.slice(0, 10)}T12:00:00`);
  return `${SHORT_MONTHS[date.getMonth()]} ${date.getDate()}`;
}

function cellDateRange(
  view: "day" | "week",
  cellIndex: number,
  workingDays?: string[],
  dayStartIso: string[] = DAY_START_ISO,
  weekStartIso: string[] = WEEK_START_ISO
) {
  const start =
    view === "week"
      ? weekStartIso[cellIndex] ?? weekStartIso[CURRENT_WEEK_INDEX]
      : dayStartIso[cellIndex] ?? dayStartIso[0];
  const end = view === "week" ? workingWeekEnd(start!, workingDays) : start!;
  return { start: start!, end };
}

function buildNewPrefill(
  row: PlannerRow,
  view: "day" | "week",
  cellIndex: number,
  cell: Chip[],
  workingDays?: string[],
  dayStartIso: string[] = DAY_START_ISO
): AllocationPrefill {
  const { end: cellEnd } = cellDateRange(view, cellIndex, workingDays, dayStartIso);
  const effective = allocationEffectiveDate(view, cellIndex, plannerTodayISO(), dayStartIso);
  const start = effective;
  const end = cellEnd < start ? start : cellEnd;
  const freeChip = cell.find((c) => c.kind === "free");
  const freeHours = freeChip ? parseChipLabel(freeChip.label)?.hours : undefined;
  const spanDays = Math.max(
    1,
    Math.round(
      (new Date(`${end}T12:00:00`).getTime() - new Date(`${start}T12:00:00`).getTime()) / 86400000
    ) + 1
  );
  const workingSpan = view === "week" ? Math.min(workingDays?.length || 5, spanDays) : 1;
  const hoursPerDay =
    freeHours != null
      ? view === "week"
        ? Math.min(8, freeHours / workingSpan)
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
  allocLookup: Map<string, AllocationSlice>,
  workingDays?: string[],
  dayStartIso: string[] = DAY_START_ISO
): AllocationPrefill | null {
  const parsed = parseChipLabel(chip.label);
  if (!parsed) return null;

  const live = chip.allocationId ? allocLookup.get(chip.allocationId) : undefined;
  const projectName = live?.projectName ?? resolveProjectName(parsed.key);
  const weekDayCount = workingDays?.length || 5;
  const hoursPerDay =
    live?.hoursPerDay ?? (view === "week" ? parsed.hours / weekDayCount : parsed.hours);
  const { end: cellEnd } = cellDateRange(view, cellIndex, workingDays, dayStartIso);
  const effective = allocationEffectiveDate(view, cellIndex, plannerTodayISO(), dayStartIso);
  const today = plannerTodayISO();
  // Prefill start = effective date (never past); keep original end (or cell end)
  const rawStart = live?.startDate ?? effective;
  const start = rawStart < effective ? effective : rawStart < today ? today : rawStart;
  const end = live?.endDate ?? cellEnd;
  const pastAllocationHours = cellBookedHours(cell) - parsed.hours;

  return {
    mode: "edit",
    personName: row.name,
    projectName,
    hoursPerDay,
    milestoneId: live?.milestoneId,
    activity: live?.activity,
    tasks: live?.tasks,
    start,
    end: end < start ? start : end,
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
  const toast = useToast();
  const location = useLocation();
  const navigate = useNavigate();
  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [view, setView] = useState<"day" | "week">("week");
  /** Day-view week nav: -1 previous … 0 current … +3 next (Week columns span). */
  const [dayWeekOffset, setDayWeekOffset] = useState(0);
  const dayStrip = useMemo(() => dayStripForWeekOffset(dayWeekOffset), [dayWeekOffset]);
  const dayStartIso = dayStrip.dayStartIso;
  const dayLabels = dayStrip.days;
  const dayCurrentIndex = dayStrip.currentDayIndex;
  const dayAllocateAllowed = dayStrip.allocateAllowed;
  const [plannerRows, setPlannerRows] = useState<PlannerRow[]>([]);
  const [allocations, setAllocations] = useState<AllocationSlice[]>([]);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [prefill, setPrefill] = useState<AllocationPrefill | null>(null);
  const [matchesDemand, setMatchesDemand] = useState<Demand | null>(null);
  const [openDemandPanel, setOpenDemandPanel] = useState(false);
  const [highlightRowId, setHighlightRowId] = useState<string | null>(null);
  /** After the user closes Open Demand, ignore ?panel=demand until the query changes. */
  const demandPanelDismissedRef = useRef(false);
  const demandPanelSearchRef = useRef(location.search);

  const calendarOpts: PlannerCalendarOpts = useMemo(
    () => ({
      workingDays: settings.workingDays,
      companyOffDays: settings.companyOffDays.map((d) => d.date.slice(0, 10)),
      workingHoursPerDay: settings.workingHoursPerDay,
    }),
    [settings.workingDays, settings.companyOffDays, settings.workingHoursPerDay]
  );

  const weekCapacity =
    weekCapacityHours(WEEK_START_ISO[CURRENT_WEEK_INDEX]!, calendarOpts) ||
    Math.round(settings.workingHoursPerDay * settings.workingDays.length) ||
    40;
  const departments = useMemo(
    () => deptRows.filter((d) => d.status === "active").map((d) => d.name),
    [deptRows]
  );
  const [selectedDepts, setSelectedDepts] = useState<string[]>([]);

  const rangeFrom = WEEK_START_ISO[0];
  const rangeTo = (() => {
    const last = WEEK_START_ISO[WEEK_START_ISO.length - 1];
    return workingWeekEnd(last!, settings.workingDays);
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

  // Live cross-user refresh while Planner is open: SSE `allocations` + short poll fallback.
  // Paused while the allocation drawer is open so in-progress edits are not overwritten.
  useSharedDataSync(!drawerOpen, reloadAllocations, {
    resources: ["allocations"],
    intervalMs: MASTER_TXN_SYNC_INTERVAL_MS,
  });
  usePauseSharedDataSync(drawerOpen);

  useEffect(() => {
    setPlannerRows(
      clonePlannerRows(
        buildPlannerRowsFromEmployees(employees, weekCapacity, allocations, calendarOpts, {
          dayStartIso,
        })
      )
    );
  }, [employees, weekCapacity, allocations, calendarOpts, dayStartIso]);

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

  const { sortKey, sortDir, handleSort } = useColumnSort<"name">("name");
  const sortedRows = useMemo(() => {
    const mul = sortDir === "asc" ? 1 : -1;
    return [...visibleRows].sort((a, b) => mul * a.name.localeCompare(b.name));
  }, [visibleRows, sortKey, sortDir]);

  useEffect(() => {
    const prevSearch = demandPanelSearchRef.current;
    demandPanelSearchRef.current = location.search;
    const panel = getPanelParam(location.search);
    const prevPanel = getPanelParam(prevSearch);

    if (panel !== "demand") {
      demandPanelDismissedRef.current = false;
      return;
    }
    // Fresh deep-link navigation (e.g. Executive Cockpit → planner?panel=demand).
    if (prevPanel !== "demand") {
      demandPanelDismissedRef.current = false;
    }
    if (demandPanelDismissedRef.current) return;
    setOpenDemandPanel(true);
  }, [location.search]);

  const openOpenDemandPanel = useCallback(() => {
    demandPanelDismissedRef.current = false;
    setOpenDemandPanel(true);
  }, []);

  const closeOpenDemandPanel = useCallback(() => {
    demandPanelDismissedRef.current = true;
    setOpenDemandPanel(false);
    if (getPanelParam(location.search) !== "demand") return;
    const params = new URLSearchParams(location.search);
    params.delete("panel");
    const next = params.toString();
    navigate(
      { pathname: location.pathname, search: next ? `?${next}` : "" },
      { replace: true }
    );
  }, [location.pathname, location.search, navigate]);

  useEffect(() => {
    const highlight = getHighlightParam(location.search);
    if (!highlight) return;
    const row = plannerRows.find((r) => r.id === highlight);
    if (row) {
      setSelectedDepts((prev) => (prev.includes(row.dept) ? prev : [...prev, row.dept]));
      setHighlightRowId(highlight);
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
    if (view === "day") {
      if (!dayAllocateAllowed) return;
      const iso = dayStartIso[cellIndex];
      if (iso && !isPlannerWorkingDay(iso, calendarOpts)) return;
    }
    openAllocate(buildNewPrefill(row, view, cellIndex, cell, settings.workingDays, dayStartIso));
  };

  const handleChipClick = (
    row: PlannerRow,
    chip: Chip,
    cellIndex: number,
    chipIndex: number,
    cell: Chip[]
  ) => {
    if (chip.kind === "free") return;
    if (view === "day" && !dayAllocateAllowed) return;
    const editPrefill = buildEditPrefill(
      row,
      chip,
      view,
      cellIndex,
      chipIndex,
      cell,
      allocLookup,
      settings.workingDays,
      dayStartIso
    );
    if (editPrefill) openAllocate(editPrefill);
  };

  const handleAllocationSave = async (payload: AllocationSavePayload) => {
    const project = projects.find((p) => p.id === payload.projectId);
    if (!project) return;

    const today = plannerTodayISO();
    // Never write to past dates — clamp start to today
    let start = payload.start.slice(0, 10);
    let end = payload.end.slice(0, 10);
    if (start < today) start = today;
    if (end < start) end = start;

    const bodyBase = {
      employeeHrmsId: payload.personId,
      projectCode: payload.projectId,
      milestoneId: payload.milestoneId,
      activity: payload.activity,
      tasks: payload.tasks,
      reason: payload.reason,
    };

    try {
      setSaveError(null);
      const editId = payload.editRef?.allocationId;
      if (editId) {
        const existing = allocations.find((a) => a.id === editId);
        if (existing && existing.startDate.slice(0, 10) < start) {
          // Preserve historical days: truncate old row, create new from effective date
          const dayBefore = addDaysToIso(start, -1);
          await updateAllocation(editId, {
            employeeHrmsId: existing.employeeHrmsId,
            projectCode: existing.projectCode,
            milestoneId: existing.milestoneId,
            activity: existing.activity,
            tasks: existing.tasks,
            startDate: existing.startDate.slice(0, 10),
            endDate: dayBefore,
            hoursPerDay: existing.hoursPerDay,
            reason: existing.reason ?? payload.reason,
          });
          await createAllocation({
            ...bodyBase,
            startDate: start,
            endDate: end,
            hoursPerDay: payload.hoursPerDay,
          });
        } else {
          await updateAllocation(editId, {
            ...bodyBase,
            startDate: start,
            endDate: end,
            hoursPerDay: payload.hoursPerDay,
          });
        }
        await reloadAllocations();
        toast.updated();
      } else {
        await createAllocation({
          ...bodyBase,
          startDate: start,
          endDate: end,
          hoursPerDay: payload.hoursPerDay,
        });
        await reloadAllocations();
        toast.created();
      }
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
      toast.deleted();
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
      ? `${shortMonthDay(WEEK_START_ISO[0]!)} – ${shortMonthDay(
          addDaysToIso(WEEK_START_ISO[WEEK_START_ISO.length - 1]!, 6)
        )}`
      : `${shortMonthDay(dayStartIso[0]!)} – ${shortMonthDay(dayStartIso[dayStartIso.length - 1]!)}`;

  const canGoPrevDayWeek = view === "day" && dayWeekOffset > DAY_WEEK_OFFSET_MIN;
  const canGoNextDayWeek = view === "day" && dayWeekOffset < DAY_WEEK_OFFSET_MAX;

  return (
    <>
      {/* Header */}
      <header className="flex h-14 flex-shrink-0 items-center justify-between border-b border-border bg-surface px-5">
        <div className="flex items-center gap-4">
          <div className="text-[15px] font-semibold tracking-tight text-foreground">Resource Planner</div>
          <div className="flex items-center gap-2 text-[12px] text-foreground">
            <button
              type="button"
              disabled={!canGoPrevDayWeek}
              onClick={() => setDayWeekOffset((o) => Math.max(DAY_WEEK_OFFSET_MIN, o - 1))}
              className="text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Previous week"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="font-medium">{headerRangeLabel}</span>
            <button
              type="button"
              disabled={!canGoNextDayWeek}
              onClick={() => setDayWeekOffset((o) => Math.min(DAY_WEEK_OFFSET_MAX, o + 1))}
              className="text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Next week"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
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
                onClick={() => {
                  setView(v);
                  if (v === "day") setDayWeekOffset(0);
                }}
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
            onClick={openOpenDemandPanel}
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

      {/* Grid — header + rows share one scrollport so scrollbar never shifts columns */}
      <div className="flex flex-1 flex-col overflow-hidden bg-surface">
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden">
          {/* Column header (sticky within scrollport) */}
          <div className="sticky top-0 z-10 flex flex-shrink-0 border-b border-border bg-surface-alt">
            <div className="w-[210px] flex-shrink-0 border-r border-border-soft px-4 py-2.5 text-[11px] font-semibold text-muted">
              <SortColHeader
                label="TEAM MEMBER"
                col="name"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={handleSort}
              />
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
              : dayLabels.map((d, i) => {
                  const iso = dayStartIso[i]!;
                  const holiday = !isPlannerWorkingDay(iso, calendarOpts);
                  const isToday = i === dayCurrentIndex;
                  return (
                    <div
                      key={`${iso}-${d}`}
                      className={`flex flex-1 border-r border-border-soft px-3 py-2.5 text-center text-[11px] ${
                        holiday
                          ? "bg-surface-alt font-medium text-muted-foreground"
                          : isToday
                            ? "bg-highlight font-semibold text-foreground"
                            : "text-muted-foreground"
                      }`}
                      title={holiday ? "Company holiday / non-working day" : undefined}
                    >
                      {d}
                      {holiday ? <div className="text-[9px] font-normal">Holiday</div> : null}
                    </div>
                  );
                })}
          </div>

          {/* Rows */}
          <div className="flex flex-col">
            {sortedRows.length === 0 ? (
              <div className="px-4 py-10 text-center text-[13px] text-muted-foreground">
                No team members match the selected departments.
              </div>
            ) : (
              sortedRows.map((row) => (
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
                    calendarOpts={calendarOpts}
                    dayStartIso={dayStartIso}
                    dayCurrentIndex={dayCurrentIndex}
                    allocateAllowed={view === "week" || dayAllocateAllowed}
                    onCellClick={handleCellClick}
                    onChipClick={handleChipClick}
                  />
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <AllocationDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        prefill={prefill}
        people={plannerRows}
        allocations={allocations}
        onSave={handleAllocationSave}
        onDelete={handleAllocationDelete}
      />
      <OpenDemandPanel
        open={openDemandPanel}
        onClose={closeOpenDemandPanel}
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
  calendarOpts,
  dayStartIso,
  dayCurrentIndex,
  allocateAllowed,
  onCellClick,
  onChipClick,
}: {
  row: PlannerRow;
  view: "day" | "week";
  calendarOpts: PlannerCalendarOpts;
  dayStartIso: string[];
  dayCurrentIndex: number;
  allocateAllowed: boolean;
  onCellClick: (row: PlannerRow, cellIndex: number, cell: Chip[]) => void;
  onChipClick: (row: PlannerRow, chip: Chip, cellIndex: number, chipIndex: number, cell: Chip[]) => void;
}) {
  const bookedHours = view === "day" ? row.dayBookedHours : row.bookedHours;
  const capacityHours = view === "day" ? row.dayCapacity : row.capacity;
  const capacity = capacityHours > 0 ? capacityHours : 1;
  const ratio = bookedHours / capacity;
  const tone = loadTone(ratio);
  const pct = Math.min(ratio, 1.25) * 80; // cap visual width
  const cells = view === "week" ? row.weeks : row.days;
  const currentIndex = view === "week" ? CURRENT_WEEK_INDEX : dayCurrentIndex;
  const fmtH = (n: number) =>
    Number.isInteger(n) ? String(n) : String(parseFloat(n.toFixed(1)));
  const bookedLabel = fmtH(bookedHours);
  const capacityLabel = fmtH(capacityHours);

  return (
    <div className="flex min-h-[72px] flex-1 border-b border-border-soft">
      {/* Left: person + allocated / total working hours for visible range */}
      <div className="flex w-[210px] flex-shrink-0 flex-col justify-center border-r border-border-soft px-4 py-2.5">
        <div className="text-[13px] font-medium text-foreground">{row.name}</div>
        <div className="mb-1.5 text-[11px] text-muted-foreground">{row.dept}</div>
        <div className="flex items-center gap-1.5">
          <div className={`h-[5px] flex-1 rounded-full ${tone.track}`}>
            <div className={`h-full rounded-full ${tone.bar}`} style={{ width: `${pct}%` }} />
          </div>
          <span
            className={`text-[11px] font-semibold ${tone.text}`}
            title={
              view === "day"
                ? `Allocated ${bookedLabel}h of ${capacityLabel}h working hours (visible days)`
                : `Allocated ${bookedLabel}h of ${capacityLabel}h working hours (all 5 weeks)`
            }
          >
            {bookedLabel}/{capacityLabel}h
          </span>
        </div>
      </div>

      {/* Week or day cells */}
      {cells.map((cell, i) => {
        const hasOver = cell.some((c) => c.kind === "over");
        const dayIso = view === "day" ? dayStartIso[i] : undefined;
        const holiday = view === "day" && dayIso ? !isPlannerWorkingDay(dayIso, calendarOpts) : false;
        const isCurrent = i === currentIndex && !holiday;
        const readOnly = !allocateAllowed || holiday;
        return (
          <div
            key={i}
            role={readOnly ? undefined : "button"}
            tabIndex={readOnly ? undefined : 0}
            onClick={() => {
              if (readOnly) return;
              onCellClick(row, i, cell);
            }}
            onKeyDown={(e) => {
              if (readOnly) return;
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onCellClick(row, i, cell);
              }
            }}
            className={`flex flex-1 flex-col justify-center gap-1 border-r border-border-soft p-1.5 ${
              holiday
                ? "cursor-not-allowed bg-surface-alt"
                : !allocateAllowed
                  ? "cursor-default bg-surface-alt/30"
                  : `cursor-pointer hover:bg-surface-alt/40 ${
                      hasOver ? "bg-danger-soft/50" : isCurrent ? "bg-highlight" : ""
                    }`
            }`}
            title={
              holiday
                ? "Holiday — no allocation"
                : !allocateAllowed
                  ? "Previous week — view only (allocation not allowed)"
                  : undefined
            }
          >
            {holiday ? (
              <div className="pointer-events-none rounded-sm border border-dashed border-border px-1.5 py-1 text-[10px] leading-tight text-muted-foreground">
                Holiday
              </div>
            ) : (
              cell.map((c: Chip, j) =>
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
                    disabled={!allocateAllowed}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!allocateAllowed) return;
                      onChipClick(row, c, i, j, cell);
                    }}
                    className={`rounded-sm px-1.5 py-1 text-left text-[10px] leading-tight ${chipClass(c.kind)} ${
                      allocateAllowed ? "hover:brightness-95" : "cursor-default opacity-90"
                    }`}
                  >
                    <span className="inline-flex max-w-full items-center">
                      <span className="truncate">{c.label}</span>
                      {c.kind === "over" && c.overallocationReason?.trim() && (
                        <>
                          <span className="w-2 shrink-0" aria-hidden />
                          <span
                            className="h-1 w-1 shrink-0 rounded-full bg-danger"
                            aria-hidden
                            title={c.overallocationReason.trim()}
                          />
                        </>
                      )}
                    </span>
                  </button>
                )
              )
            )}
          </div>
        );
      })}
    </div>
  );
}
