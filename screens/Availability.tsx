import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";
import { MIN_FREE_HOUR_OPTIONS, computeAvailKpis } from "../data/availability";
import type { AvailRow, RollingOffPerson } from "../data/availability";
import { AllocationDrawer } from "../components/AllocationDrawer";
import type { AllocationPrefill, AllocationSavePayload } from "../components/AllocationDrawer";
import { buildPlannerRowsFromEmployees } from "../data/planner";
import { DepartmentSelect } from "../components/DepartmentSelect";
import { FilterMultiSelect } from "../components/FilterMultiSelect";
import { MinFreeHoursSelect } from "../components/MinFreeHoursSelect";
import { SortColHeader, useColumnSort } from "../components/SortColHeader";
import { usePlanningEmployees } from "../hooks/usePlanningEmployees";
import { useMasters } from "../context/MastersContext";
import { useSettings } from "../context/SettingsContext";
import { buildAvailRowsFromEmployees, buildRollingOffFromLive, toLocalISO, addDaysISO } from "../api/liveViews";
import { createAllocation, fetchAllocations, type ApiAllocation } from "../api/domain";

type Segment = "all" | "now" | "rolling";
type AvailSortKey = "name" | "freeHours" | "availableFrom" | "skills";

function availFromOrder(value: string) {
  if (value === "Now") return 0;
  const parsed = Date.parse(`${value} 2026`);
  return Number.isNaN(parsed) ? Number.MAX_SAFE_INTEGER : parsed;
}

// ─── helpers ────────────────────────────────────────────────────────────────

function Kpi({
  label,
  value,
  sub,
  delta,
  accent,
  valueClass,
}: {
  label: string;
  value: string | number;
  sub?: string;
  delta?: string;
  accent?: string;
  valueClass?: string;
}) {
  return (
    <div
      className={`rounded-lg border border-border bg-surface px-3.5 py-3.5 ${
        accent ? `border-l-[3px] ${accent}` : ""
      }`}
    >
      <div className="mb-1.5 text-[11px] text-muted">{label}</div>
      <div className="flex items-baseline gap-1.5">
        <div className={`text-[23px] font-semibold ${valueClass ?? "text-foreground"}`}>
          {value}
        </div>
        {delta && <div className="text-[11px] text-success">{delta}</div>}
      </div>
      {sub && <div className="mt-0.5 text-[11px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

function Tab({
  active,
  onClick,
  children,
  tone,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  tone?: "success" | "warning" | "muted";
}) {
  const inactive =
    tone === "success"
      ? "text-success"
      : tone === "warning"
      ? "text-warning"
      : "text-muted";
  return (
    <button
      onClick={onClick}
      className={`rounded-md px-3 py-1.5 text-[12px] font-medium ${
        active ? "bg-brand text-white" : inactive + " hover:bg-surface-alt"
      }`}
    >
      {children}
    </button>
  );
}

function SkillChip({ label, highlight }: { label: string; highlight?: boolean }) {
  return (
    <span
      className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-medium ${
        highlight
          ? "bg-success-soft text-success-fg"
          : "bg-surface-alt text-muted-foreground"
      }`}
    >
      {label}
    </span>
  );
}

function FreeCapacityBar({ freeHours, capacity }: { freeHours: number; capacity: number }) {
  const freePct = capacity > 0 ? (freeHours / capacity) * 100 : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-[80px] flex-shrink-0 rounded-full bg-border-soft">
        <div
          className="h-full rounded-full bg-success"
          style={{ width: `${freePct}%` }}
        />
      </div>
      <span className="text-[12px] font-semibold text-success">{freeHours}h free</span>
    </div>
  );
}

function RollingOffCard({
  person,
  onPlanAhead,
}: {
  person: RollingOffPerson;
  onPlanAhead: (person: RollingOffPerson) => void;
}) {
  return (
    <div className="w-[200px] flex-shrink-0 rounded-md border border-l-[3px] border-border border-l-warning bg-surface px-3 py-2.5">
      <div className="mb-1 flex items-center gap-2">
        <div className="flex h-[26px] w-[26px] flex-shrink-0 items-center justify-center rounded-full bg-warning-soft text-[10px] font-semibold text-warning">
          {person.initials}
        </div>
        <div className="truncate text-[12px] font-semibold text-foreground">{person.name}</div>
      </div>
      <div className="line-clamp-2 text-[11px] text-muted-foreground">
        {person.currentProject} · frees {person.freeingHours}h on {person.rollsOffDate}
      </div>
      <button
        type="button"
        onClick={() => onPlanAhead(person)}
        className="mt-1.5 text-[11px] text-primary hover:underline"
      >
        Plan ahead →
      </button>
    </div>
  );
}

/** Horizontal strip with < > when cards overflow the viewport. */
function RollingOffCarousel({
  people,
  onPlanAhead,
}: {
  people: RollingOffPerson[];
  onPlanAhead: (person: RollingOffPerson) => void;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);

  const updateScrollState = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) {
      setCanLeft(false);
      setCanRight(false);
      return;
    }
    const max = el.scrollWidth - el.clientWidth;
    setCanLeft(el.scrollLeft > 4);
    setCanRight(max > 4 && el.scrollLeft < max - 4);
  }, []);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    updateScrollState();
    el.addEventListener("scroll", updateScrollState, { passive: true });
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(updateScrollState) : null;
    ro?.observe(el);
    return () => {
      el.removeEventListener("scroll", updateScrollState);
      ro?.disconnect();
    };
  }, [people.length, updateScrollState]);

  const scrollByCards = (dir: -1 | 1) => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * 220, behavior: "smooth" });
  };

  if (people.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-border bg-surface px-3 py-4 text-center text-[12px] text-muted-foreground">
        No allocations ending in the next 2 weeks
      </div>
    );
  }

  return (
    <div className="flex items-stretch gap-1.5">
      <button
        type="button"
        aria-label="Scroll rolling-off cards left"
        disabled={!canLeft}
        onClick={() => scrollByCards(-1)}
        className="flex w-8 flex-shrink-0 items-center justify-center self-center rounded-md border border-border bg-surface text-foreground hover:bg-surface-alt disabled:cursor-not-allowed disabled:opacity-35"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
      <div
        ref={scrollerRef}
        className="flex min-w-0 flex-1 gap-2.5 overflow-x-auto scroll-smooth pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {people.map((person) => (
          <RollingOffCard key={person.id} person={person} onPlanAhead={onPlanAhead} />
        ))}
      </div>
      <button
        type="button"
        aria-label="Scroll rolling-off cards right"
        disabled={!canRight}
        onClick={() => scrollByCards(1)}
        className="flex w-8 flex-shrink-0 items-center justify-center self-center rounded-md border border-border bg-surface text-foreground hover:bg-surface-alt disabled:cursor-not-allowed disabled:opacity-35"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}

function AvailTableRow({
  row,
  onAllocate,
}: {
  row: AvailRow;
  onAllocate: (row: AvailRow) => void;
}) {
  const isNow = row.availableFrom === "Now";
  return (
    <div className="flex items-center border-b border-border-soft px-4 py-3 last:border-b-0">
      {/* Team member */}
      <div className="flex w-[200px] items-center gap-2.5">
        <div
          className={`flex h-[30px] w-[30px] flex-shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${
            isNow
              ? "bg-success-soft text-success-fg"
              : "bg-surface-alt text-muted"
          }`}
        >
          {row.initials}
        </div>
        <div>
          <div className="text-[13px] font-medium text-foreground">{row.name}</div>
          <div className="text-[11px] text-muted-foreground">{row.department}</div>
        </div>
      </div>

      {/* Free capacity */}
      <div className="w-[160px]">
        <FreeCapacityBar freeHours={row.freeHours} capacity={row.capacity} />
        <div className="mt-0.5 text-[11px] text-muted-foreground">
          {row.bookedPct}% booked
        </div>
      </div>

      {/* Available from */}
      <div className="w-[130px]">
        <span
          className={`text-[12px] font-medium ${
            isNow ? "text-success" : "text-muted-foreground"
          }`}
        >
          {row.availableFrom}
        </span>
      </div>

      {/* Skills */}
      <div className="flex flex-1 flex-wrap gap-1 pr-4">
        {row.skills.map((s) => (
          <SkillChip key={s} label={s} highlight={isNow} />
        ))}
      </div>

      {/* Action */}
      <div className="w-[100px] text-right">
        <button
          onClick={() => onAllocate(row)}
          className="inline-flex items-center gap-0.5 text-[11px] text-primary hover:underline"
        >
          Allocate <ArrowRight className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}

// ─── main screen ────────────────────────────────────────────────────────────

export function Availability() {
  const navigate = useNavigate();
  const { employees } = usePlanningEmployees();
  const { departments: deptRows, skills: skillRows } = useMasters();
  const { settings } = useSettings();
  const weekCapacity = Math.round(settings.workingHoursPerDay * settings.workingDays.length) || 40;
  const [allocations, setAllocations] = useState<ApiAllocation[]>([]);

  const reloadAllocations = useCallback(async () => {
    const from = addDaysISO(toLocalISO(new Date()), -30);
    const to = addDaysISO(toLocalISO(new Date()), 13);
    try {
      setAllocations(await fetchAllocations({ from, to }));
    } catch {
      setAllocations([]);
    }
  }, []);

  useEffect(() => {
    void reloadAllocations();
  }, [reloadAllocations]);

  const availRows = useMemo(
    () => buildAvailRowsFromEmployees(employees, weekCapacity, allocations),
    [employees, weekCapacity, allocations]
  );
  const rollingOffAll = useMemo(
    () =>
      buildRollingOffFromLive(employees, allocations, {
        windowFrom: toLocalISO(new Date()),
        windowDays: 14,
        workingDaysPerWeek: settings.workingDays.length || 5,
      }),
    [employees, allocations, settings.workingDays.length]
  );
  const availDepartments = useMemo(
    () => deptRows.filter((d) => d.status === "active").map((d) => d.name),
    [deptRows]
  );
  const availSkills = useMemo(
    () => skillRows.filter((s) => s.status === "active").map((s) => s.name).sort(),
    [skillRows]
  );

  const [seg, setSeg] = useState<Segment>("all");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [prefill, setPrefill] = useState<AllocationPrefill | null>(null);
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const [selectedDepts, setSelectedDepts] = useState<string[]>([]);
  const [minFreeHours, setMinFreeHours] = useState(0);
  const { sortKey, sortDir, handleSort } = useColumnSort<AvailSortKey>("freeHours", "desc");

  useEffect(() => {
    if (availDepartments.length) setSelectedDepts((p) => (p.length ? p : [...availDepartments]));
  }, [availDepartments]);
  useEffect(() => {
    if (availSkills.length) setSelectedSkills((p) => (p.length ? p : [...availSkills]));
  }, [availSkills]);

  const plannerPeople = useMemo(
    () => buildPlannerRowsFromEmployees(employees, weekCapacity, []),
    [employees, weekCapacity]
  );

  const openAllocate = (row: AvailRow) => {
    setPrefill({ personName: row.name, hoursPerDay: 8 });
    setDrawerOpen(true);
  };

  const openPlanAhead = (person: RollingOffPerson) => {
    setPrefill({ personName: person.name, hoursPerDay: 8 });
    setDrawerOpen(true);
  };

  const handleAllocationSave = async (payload: AllocationSavePayload) => {
    await createAllocation({
      employeeHrmsId: payload.personId,
      projectCode: payload.projectId,
      milestoneId: payload.milestoneId,
      activity: payload.activity,
      tasks: payload.tasks,
      startDate: payload.start,
      endDate: payload.end,
      hoursPerDay: payload.hoursPerDay,
      reason: payload.reason,
    });
    await reloadAllocations();
  };

  const deptCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const dept of availDepartments) {
      counts[dept] = availRows.filter((r) => r.department === dept).length;
    }
    return counts;
  }, [availDepartments, availRows]);

  const skillCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const skill of availSkills) {
      counts[skill] = availRows.filter((r) => r.skills.includes(skill)).length;
    }
    return counts;
  }, [availSkills, availRows]);

  const minFreeHourCounts = useMemo(() => {
    const counts: Record<number, number> = {};
    for (const option of MIN_FREE_HOUR_OPTIONS) {
      counts[option.value] = availRows.filter((r) => r.freeHours >= option.value).length;
    }
    return counts;
  }, [availRows]);

  const filteredRows = useMemo(
    () =>
      availRows.filter(
        (r) =>
          selectedDepts.includes(r.department) &&
          (selectedSkills.length === 0
            ? true
            : r.skills.length === 0 || r.skills.some((s) => selectedSkills.includes(s))) &&
          r.freeHours >= minFreeHours
      ),
    [availRows, selectedDepts, selectedSkills, minFreeHours]
  );

  const rollingOff = useMemo(() => {
    return rollingOffAll.filter((p) => {
      const emp = employees.find((e) => e.id === p.id);
      return emp ? selectedDepts.includes(emp.department) : false;
    });
  }, [rollingOffAll, employees, selectedDepts]);

  const kpis = useMemo(() => {
    const base = computeAvailKpis(filteredRows);
    return { ...base, rollingOffSoon: rollingOff.length };
  }, [filteredRows, rollingOff]);

  const rows = useMemo(() => {
    const filtered = filteredRows.filter((r) => {
      if (seg === "now") return r.availableFrom === "Now";
      if (seg === "rolling") return r.availableFrom !== "Now";
      return true;
    });

    return [...filtered].sort((a, b) => {
      const mul = sortDir === "asc" ? 1 : -1;

      if (sortKey === "name") {
        return mul * a.name.localeCompare(b.name);
      }
      if (sortKey === "freeHours") {
        return mul * (a.freeHours - b.freeHours);
      }
      if (sortKey === "availableFrom") {
        return mul * (availFromOrder(a.availableFrom) - availFromOrder(b.availableFrom));
      }
      return mul * a.skills.join(", ").localeCompare(b.skills.join(", "));
    });
  }, [filteredRows, seg, sortKey, sortDir]);

  const nowCount = filteredRows.filter((r) => r.availableFrom === "Now").length;
  const rollingCount = filteredRows.filter((r) => r.availableFrom !== "Now").length;
  const allFiltersActive =
    selectedDepts.length === availDepartments.length &&
    selectedSkills.length === availSkills.length &&
    minFreeHours === 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {/* Header */}
      <header className="flex h-14 flex-shrink-0 items-center justify-between border-b border-border bg-surface px-5">
        <div>
          <div className="text-[15px] font-semibold tracking-tight text-foreground">
            Availability
          </div>
          <div className="text-[12px] text-muted-foreground">
            Forward supply · Jan 6 – Feb 9, 2026 · hours free per week
          </div>
        </div>
        <div className="flex items-center gap-2">
          <FilterMultiSelect
            items={availSkills}
            selected={selectedSkills}
            onChange={setSelectedSkills}
            counts={skillCounts}
            allLabel="All Skills"
            pluralLabel="Skills"
            align="end"
          />
          <MinFreeHoursSelect
            options={MIN_FREE_HOUR_OPTIONS}
            value={minFreeHours}
            onChange={setMinFreeHours}
            counts={minFreeHourCounts}
            defaultLabel="Min free hours"
            align="end"
          />
          <DepartmentSelect
            departments={availDepartments}
            selected={selectedDepts}
            onChange={setSelectedDepts}
            counts={deptCounts}
            align="end"
          />
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden bg-background p-5">
        {/* KPI row */}
        <div className="grid flex-shrink-0 grid-cols-4 gap-3">
          <Kpi
            label="Total Free Capacity"
            value={`${kpis.totalFreeHrs}h`}
            sub="hrs/wk across team"
            accent="border-l-success"
            valueClass="text-success"
          />
          <Kpi
            label="Fully Available"
            value={kpis.fullyAvailable}
            sub="0% booked · ready now"
            accent="border-l-success"
            valueClass="text-success"
          />
          <Kpi
            label="Rolling Off Soon"
            value={kpis.rollingOffSoon}
            sub="within 2 weeks"
            accent="border-l-warning"
            valueClass="text-warning"
          />
          <Kpi
            label="Avg Free Hrs / Person"
            value={`${kpis.avgFreeHrs}h`}
            sub="per week"
            delta={allFiltersActive ? "▲ 6h vs last mo" : undefined}
          />
        </div>

        {/* Rolling off soon band */}
        <div className="flex-shrink-0 rounded-lg border border-border bg-surface-alt px-4 py-3">
          <div className="mb-2.5 flex items-center justify-between">
            <div className="text-[12px] font-semibold text-foreground">
              Rolling off soon{" "}
              <span className="font-normal text-muted-foreground">
                · {rollingOff.length} people freeing up within 2 weeks
              </span>
            </div>
            <button
              onClick={() => navigate("/planner")}
              className="text-[11px] text-primary"
            >
              View in planner →
            </button>
          </div>
          <RollingOffCarousel people={rollingOff} onPlanAhead={openPlanAhead} />
        </div>

        {/* Supply table */}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border bg-surface">
          {/* Table toolbar */}
          <div className="flex flex-shrink-0 items-center justify-between border-b border-border-soft px-4 py-2.5">
            <div className="flex gap-1">
              <Tab active={seg === "all"} onClick={() => setSeg("all")}>
                All {filteredRows.length}
              </Tab>
              <Tab
                active={seg === "now"}
                onClick={() => setSeg("now")}
                tone="success"
              >
                Available now {nowCount}
              </Tab>
              <Tab
                active={seg === "rolling"}
                onClick={() => setSeg("rolling")}
                tone="warning"
              >
                Rolling off soon {rollingCount}
              </Tab>
            </div>
          </div>

          {/* Column headers */}
          <div className="flex flex-shrink-0 border-b border-border-soft bg-surface-alt px-4 py-2 text-[11px] font-semibold text-muted">
            <SortColHeader
              label="TEAM MEMBER"
              col="name"
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={handleSort}
              className="w-[200px]"
            />
            <SortColHeader
              label="FREE CAPACITY"
              col="freeHours"
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={handleSort}
              className="w-[160px]"
            />
            <SortColHeader
              label="AVAILABLE FROM"
              col="availableFrom"
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={handleSort}
              className="w-[130px]"
            />
            <SortColHeader
              label="SKILLS"
              col="skills"
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={handleSort}
              className="flex-1"
            />
            <div className="w-[100px] text-right">ACTION</div>
          </div>

          {/* Body rows */}
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            {rows.length === 0 ? (
              <div className="px-4 py-10 text-center text-[13px] text-muted-foreground">
                No people match the selected filters.
              </div>
            ) : (
              rows.map((r) => (
                <AvailTableRow key={r.id} row={r} onAllocate={openAllocate} />
              ))
            )}
          </div>
        </div>
      </div>

      <AllocationDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        prefill={prefill}
        people={plannerPeople}
        onSave={handleAllocationSave}
      />
    </div>
  );
}
