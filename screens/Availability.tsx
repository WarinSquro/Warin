import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import {
  MIN_FREE_HOUR_OPTIONS,
  availAvgDeltaDisplay,
  avgFreeHoursPerPerson,
  availFreeOfCapacityParts,
  availTopFreePeople,
  filterAvailRowsAllSegments,
  filterAvailRowsRollingOffSoon,
} from "../data/availability";
import type { AvailRow, RollingOffPerson } from "../data/availability";
import { AllocationDrawer } from "../components/AllocationDrawer";
import type { AllocationPrefill, AllocationSavePayload } from "../components/AllocationDrawer";
import { buildPlannerRowsFromEmployees, weekCapacityHours } from "../data/planner";
import { DepartmentSelect } from "../components/DepartmentSelect";
import { FilterMultiSelect } from "../components/FilterMultiSelect";
import { MinFreeHoursSelect } from "../components/MinFreeHoursSelect";
import { SortColHeader, useColumnSort } from "../components/SortColHeader";
import { usePlanningEmployees } from "../hooks/usePlanningEmployees";
import { useSharedDataSync, usePauseSharedDataSync, MASTER_TXN_SYNC_INTERVAL_MS } from "../hooks/useSharedDataSync";
import { useMasters } from "../context/MastersContext";
import { useSettings } from "../context/SettingsContext";
import { useToast } from "../context/ToastContext";
import { useAuth } from "../context/AuthContext";
import { allocationBlockedMessage } from "../utils/allocationPermission";
import { WeeklyCheckInWeekPicker } from "../components/WeeklyCheckInWeekPicker";
import { buildAvailRowsFromEmployees, buildRollingOffFromLive, addDaysISO, mondayISO } from "../api/liveViews";
import { createAllocation, fetchAllocations, type ApiAllocation } from "../api/domain";
import { TruncateText } from "../components/TruncateText";
import { formatHoursDecimalLabel, formatHoursLabel, roundHoursToTenth } from "../utils/formatHours";
import { formatWeekLabel, type ReviewWeekOption } from "../data/weeklyCheckIn";

type Segment = "capacity" | "capacityNext" | "all" | "now" | "rolling";
type AvailSortKey = "name" | "freeHours" | "availableFrom" | "resourceOwner" | "skills";

/** Current week + next week for the Availability week picker. */
function getAvailabilityWeeks(workingDays?: string[]): ReviewWeekOption[] {
  const current = mondayISO();
  return [0, 1].map((offset) => {
    const weekStart = addDaysISO(current, offset * 7);
    return {
      weekStart,
      label: formatWeekLabel(weekStart, workingDays),
      isCurrent: offset === 0,
    };
  });
}

/** Current-week Monday → Sunday of the 2nd week (14 calendar days). */
function forwardSupplyBounds(from = new Date()) {
  const start = mondayISO(from);
  const end = addDaysISO(start, 13);
  return { start, end };
}

/** e.g. "Aug 10 – Aug 23, 2026" */
function formatForwardSupplyRange(start: string, end: string): string {
  const a = new Date(`${start}T12:00:00`);
  const b = new Date(`${end}T12:00:00`);
  const left = a.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const right = b.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  return `${left} – ${right}`;
}

function availFromOrder(value: string) {
  if (value === "Now") return 0;
  const parsed = Date.parse(`${value} 2026`);
  return Number.isNaN(parsed) ? Number.MAX_SAFE_INTEGER : parsed;
}

// ─── helpers ────────────────────────────────────────────────────────────────

function FreeOfCapacityDelta({ freeHrs, capacityHrs }: { freeHrs: number; capacityHrs: number }) {
  const { ofHours, pct } = availFreeOfCapacityParts(freeHrs, capacityHrs);
  return (
    <>
      {ofHours}{" "}
      <span className={pct > 20 ? "font-bold text-danger" : undefined}>({pct}%)</span>
    </>
  );
}

function TopFreePeopleList({ people }: { people: AvailRow[] }) {
  if (people.length === 0) return null;
  return (
    <ul className="space-y-0.5 text-[11px] leading-tight text-muted-foreground">
      {people.map((p) => {
        const label = `${p.name} (${formatHoursLabel(roundHoursToTenth(p.freeHours))})`;
        return (
          <li key={p.id} className="max-w-[11.5rem]">
            <TruncateText text={label} className="block text-right" />
          </li>
        );
      })}
    </ul>
  );
}

function Kpi({
  label,
  value,
  sub,
  delta,
  deltaClass,
  accent,
  valueClass,
  onClick,
  active,
  subClass,
  aside,
}: {
  label: string;
  value: string | number;
  sub?: string;
  delta?: ReactNode;
  deltaClass?: string;
  accent?: string;
  valueClass?: string;
  onClick?: () => void;
  active?: boolean;
  subClass?: string;
  aside?: ReactNode;
}) {
  const className = [
    "rounded-lg border border-border bg-surface px-3.5 py-3.5 text-left",
    accent ? `border-l-[3px] ${accent}` : "",
    onClick ? "cursor-pointer hover:bg-surface-alt" : "",
    active ? "border-primary/40 bg-highlight ring-2 ring-primary/20" : "",
  ].join(" ");

  const body = (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0 flex-1">
        <div className="mb-1.5 text-[11px] text-muted">{label}</div>
        <div className="flex flex-wrap items-baseline gap-1.5">
          <div className={`text-[23px] font-semibold ${valueClass ?? "text-foreground"}`}>
            {value}
          </div>
          {delta && (
            <div className={`text-[11px] ${deltaClass ?? "text-success"}`}>{delta}</div>
          )}
        </div>
        {sub && (
          <div className="mt-1">
            <span className={subClass ?? "text-[11px] text-muted-foreground"}>{sub}</span>
          </div>
        )}
      </div>
      {aside ? <div className="min-w-0 shrink-0 pt-0.5">{aside}</div> : null}
    </div>
  );

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={className}>
        {body}
      </button>
    );
  }

  return <div className={className}>{body}</div>;
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
      <span className="text-[12px] font-semibold text-success">{formatHoursDecimalLabel(freeHours)} free</span>
    </div>
  );
}

const ROLLING_OFF_PAGE_SIZE = 5;
/** Matches Tailwind `gap-2.5` (10px) between cards. */
const ROLLING_OFF_CARD_GAP_PX = 10;

function RollingOffCard({
  person,
  onPlanAhead,
  widthPx,
}: {
  person: RollingOffPerson;
  onPlanAhead: (person: RollingOffPerson) => void;
  widthPx: number;
}) {
  return (
    <div
      className="flex-shrink-0 rounded-md border border-l-[3px] border-border border-l-warning bg-surface px-3 py-2.5"
      style={{ width: widthPx > 0 ? widthPx : undefined }}
    >
      <div className="mb-1 flex items-center gap-2">
        <div className="flex h-[26px] w-[26px] flex-shrink-0 items-center justify-center rounded-full bg-warning-soft text-[10px] font-semibold text-warning">
          {person.initials}
        </div>
        <div className="truncate text-[12px] font-semibold text-foreground">{person.name}</div>
      </div>
      <div className="line-clamp-2 text-[11px] text-muted-foreground">
        {person.currentProject} · frees on {person.rollsOffDate}
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

/** Horizontal strip: 5 fixed-width cards per page; < > advances one page. */
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
  const [cardWidthPx, setCardWidthPx] = useState(0);

  const updateLayout = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) {
      setCanLeft(false);
      setCanRight(false);
      return;
    }
    const trackW = el.clientWidth;
    const gaps = ROLLING_OFF_CARD_GAP_PX * (ROLLING_OFF_PAGE_SIZE - 1);
    const nextWidth =
      trackW > gaps ? Math.floor((trackW - gaps) / ROLLING_OFF_PAGE_SIZE) : 0;
    setCardWidthPx(nextWidth);
    const max = el.scrollWidth - el.clientWidth;
    setCanLeft(el.scrollLeft > 4);
    setCanRight(max > 4 && el.scrollLeft < max - 4);
  }, []);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    updateLayout();
    el.addEventListener("scroll", updateLayout, { passive: true });
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(updateLayout) : null;
    ro?.observe(el);
    return () => {
      el.removeEventListener("scroll", updateLayout);
      ro?.disconnect();
    };
  }, [people.length, updateLayout]);

  /** After card width settles, re-check whether another page is scrollable. */
  useEffect(() => {
    updateLayout();
  }, [cardWidthPx, people.length, updateLayout]);

  const scrollByPage = (dir: -1 | 1) => {
    const el = scrollerRef.current;
    if (!el || cardWidthPx <= 0) return;
    const pageStep =
      ROLLING_OFF_PAGE_SIZE * (cardWidthPx + ROLLING_OFF_CARD_GAP_PX);
    el.scrollBy({ left: dir * pageStep, behavior: "smooth" });
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
        aria-label="Previous rolling-off cards"
        disabled={!canLeft}
        onClick={() => scrollByPage(-1)}
        className="flex w-8 flex-shrink-0 items-center justify-center self-center rounded-md border border-border bg-surface text-foreground hover:bg-surface-alt disabled:cursor-not-allowed disabled:opacity-35"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
      <div
        ref={scrollerRef}
        className="flex min-w-0 flex-1 overflow-x-auto scroll-smooth pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        style={{ gap: ROLLING_OFF_CARD_GAP_PX }}
      >
        {people.map((person) => (
          <RollingOffCard
            key={person.id}
            person={person}
            onPlanAhead={onPlanAhead}
            widthPx={cardWidthPx}
          />
        ))}
      </div>
      <button
        type="button"
        aria-label="Next rolling-off cards"
        disabled={!canRight}
        onClick={() => scrollByPage(1)}
        className="flex w-8 flex-shrink-0 items-center justify-center self-center rounded-md border border-border bg-surface text-foreground hover:bg-surface-alt disabled:cursor-not-allowed disabled:opacity-35"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}

function AvailTableRow({
  row,
  canAllocate,
  allocateBlockedTitle,
  onAllocate,
}: {
  row: AvailRow;
  canAllocate: boolean;
  allocateBlockedTitle?: string;
  onAllocate: (row: AvailRow) => void;
}) {
  const isNow = row.availableFrom === "Now";
  return (
    <div className="flex items-start border-b border-border-soft px-4 py-3 last:border-b-0">
      {/* Team member */}
      <div className="flex w-[200px] shrink-0 items-center gap-2.5">
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
      <div className="w-[160px] shrink-0">
        <FreeCapacityBar freeHours={row.freeHours} capacity={row.capacity} />
        <div className="mt-0.5 text-[11px] text-muted-foreground">
          {row.bookedPct}% booked
        </div>
      </div>

      {/* Available from */}
      <div className="w-[130px] shrink-0 pt-1">
        <span
          className={`text-[12px] font-medium ${
            isNow ? "text-success" : "text-muted-foreground"
          }`}
        >
          {row.availableFrom}
        </span>
      </div>

      {/* Resource owner */}
      <div className="w-[168px] shrink-0 pt-1 pr-4">
        <TruncateText
          as="div"
          text={row.resourceOwnerName || "—"}
          className="text-[12px] text-foreground"
        />
      </div>

      {/* Skills */}
      <div className="flex w-[140px] min-w-0 shrink flex-wrap content-start gap-1 pr-3 pt-0.5">
        {row.skills.map((s) => (
          <SkillChip key={s} label={s} highlight={isNow} />
        ))}
      </div>

      {/* Action */}
      <div className="w-[100px] shrink-0 pt-1 text-right">
        {canAllocate ? (
        <button
          type="button"
          onClick={() => onAllocate(row)}
          className="inline-flex cursor-pointer items-center gap-0.5 text-[11px] text-primary hover:underline"
        >
          Allocate <ArrowRight className="h-3 w-3" />
        </button>
        ) : (
          <span
            className="text-[11px] text-muted-foreground"
            title={allocateBlockedTitle}
          >
            —
          </span>
        )}
      </div>
    </div>
  );
}

// ─── main screen ────────────────────────────────────────────────────────────

export function Availability() {
  const navigate = useNavigate();
  const { employees, allEmployees, isSuperAdmin } = usePlanningEmployees();
  const { currentEmployee } = useAuth();
  const selfHrmsId = currentEmployee?.id;
  const allocPermOpts = useMemo(() => ({ isSuperAdmin }), [isSuperAdmin]);
  const { departments: deptRows, skills: skillRows } = useMasters();
  const { settings } = useSettings();
  const toast = useToast();
  const { start: supplyFrom, end: supplyTo } = useMemo(() => forwardSupplyBounds(), []);
  const nextWeekStart = useMemo(() => addDaysISO(supplyFrom, 7), [supplyFrom]);
  const lastWeekStart = useMemo(() => addDaysISO(supplyFrom, -7), [supplyFrom]);
  const supplyRangeLabel = useMemo(
    () => formatForwardSupplyRange(supplyFrom, supplyTo),
    [supplyFrom, supplyTo]
  );
  const availabilityWeeks = useMemo(
    () => getAvailabilityWeeks(settings.workingDays),
    [settings.workingDays]
  );
  const [weekStart, setWeekStart] = useState(() => mondayISO());
  useEffect(() => {
    if (!availabilityWeeks.some((w) => w.weekStart === weekStart)) {
      setWeekStart(availabilityWeeks[0]?.weekStart ?? mondayISO());
    }
  }, [availabilityWeeks, weekStart]);

  const offDayIsos = useMemo(
    () => settings.companyOffDays.map((d) => d.date.slice(0, 10)),
    [settings.companyOffDays]
  );
  const calendarOpts = useMemo(
    () => ({
      workingDays: settings.workingDays,
      companyOffDays: offDayIsos,
      workingHoursPerDay: settings.workingHoursPerDay,
    }),
    [settings.workingDays, offDayIsos, settings.workingHoursPerDay]
  );
  const fallbackWeekCapacity =
    Math.round(settings.workingHoursPerDay * settings.workingDays.length) || 40;

  /** Capacity / free hrs for this-week KPI — locked to forward-supply week 1. */
  const summaryWeekCapacity =
    weekCapacityHours(supplyFrom, calendarOpts) || fallbackWeekCapacity;
  const nextWeekCapacity =
    weekCapacityHours(nextWeekStart, calendarOpts) || fallbackWeekCapacity;
  const lastWeekCapacity =
    weekCapacityHours(lastWeekStart, calendarOpts) || fallbackWeekCapacity;
  /** Capacity for the table — follows week picker. */
  const weekCapacity = weekCapacityHours(weekStart, calendarOpts) || fallbackWeekCapacity;
  const [allocations, setAllocations] = useState<ApiAllocation[]>([]);

  const reloadAllocations = useCallback(async () => {
    const from = addDaysISO(supplyFrom, -30);
    const to = addDaysISO(supplyTo, 7);
    try {
      setAllocations(await fetchAllocations({ from, to }));
    } catch {
      setAllocations([]);
    }
  }, [supplyFrom, supplyTo]);

  useEffect(() => {
    void reloadAllocations();
  }, [reloadAllocations]);

  const summaryRows = useMemo(
    () =>
      buildAvailRowsFromEmployees(
        employees,
        summaryWeekCapacity,
        allocations,
        offDayIsos,
        supplyFrom,
        settings.workingDays,
        allEmployees
      ),
    [employees, summaryWeekCapacity, allocations, offDayIsos, supplyFrom, settings.workingDays, allEmployees]
  );

  const summaryRowsWeek2 = useMemo(
    () =>
      buildAvailRowsFromEmployees(
        employees,
        nextWeekCapacity,
        allocations,
        offDayIsos,
        nextWeekStart,
        settings.workingDays,
        allEmployees
      ),
    [employees, nextWeekCapacity, allocations, offDayIsos, nextWeekStart, settings.workingDays, allEmployees]
  );

  const summaryRowsLastWeek = useMemo(
    () =>
      buildAvailRowsFromEmployees(
        employees,
        lastWeekCapacity,
        allocations,
        offDayIsos,
        lastWeekStart,
        settings.workingDays,
        allEmployees
      ),
    [employees, lastWeekCapacity, allocations, offDayIsos, lastWeekStart, settings.workingDays, allEmployees]
  );

  const availRows = useMemo(
    () =>
      buildAvailRowsFromEmployees(
        employees,
        weekCapacity,
        allocations,
        offDayIsos,
        weekStart,
        settings.workingDays,
        allEmployees
      ),
    [employees, weekCapacity, allocations, offDayIsos, weekStart, settings.workingDays, allEmployees]
  );
  const rollingOffAll = useMemo(
    () =>
      buildRollingOffFromLive(employees, allocations, {
        windowFrom: supplyFrom,
        windowDays: 14,
        workingDays: settings.workingDays,
        companyOffDays: offDayIsos,
      }),
    [employees, allocations, settings.workingDays, offDayIsos, supplyFrom]
  );
  const availDepartments = useMemo(
    () => deptRows.filter((d) => d.status === "active").map((d) => d.name),
    [deptRows]
  );
  const availSkills = useMemo(
    () => skillRows.filter((s) => s.status === "active").map((s) => s.name).sort(),
    [skillRows]
  );

  const [seg, setSeg] = useState<Segment>("capacity");
  const [rollingOffExpanded, setRollingOffExpanded] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [prefill, setPrefill] = useState<AllocationPrefill | null>(null);
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const [selectedDepts, setSelectedDepts] = useState<string[]>([]);
  const [minFreeHours, setMinFreeHours] = useState(0);
  const { sortKey, sortDir, handleSort } = useColumnSort<AvailSortKey>("freeHours", "desc");

  useSharedDataSync(!drawerOpen, reloadAllocations, {
    resources: ["allocations"],
    intervalMs: MASTER_TXN_SYNC_INTERVAL_MS,
  });
  usePauseSharedDataSync(drawerOpen);

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
    const blocked = allocationBlockedMessage(selfHrmsId, row.id, allEmployees, allocPermOpts);
    if (blocked) {
      toast.warning(blocked);
      return;
    }
    setPrefill({ personName: row.name, hoursPerDay: 8 });
    setDrawerOpen(true);
  };

  const openPlanAhead = (person: RollingOffPerson) => {
    const blocked = allocationBlockedMessage(selfHrmsId, person.id, allEmployees, allocPermOpts);
    if (blocked) {
      toast.warning(blocked);
      return;
    }
    setPrefill({ personName: person.name, hoursPerDay: 8 });
    setDrawerOpen(true);
  };

  const handleAllocationSave = async (payload: AllocationSavePayload) => {
    const blocked = allocationBlockedMessage(
      selfHrmsId,
      payload.personId,
      allEmployees,
      allocPermOpts
    );
    if (blocked) {
      toast.warning(blocked);
      throw new Error(blocked);
    }
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
    toast.created();
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

  const applyListFilters = useCallback(
    (rows: AvailRow[]) =>
      rows.filter(
        (r) =>
          selectedDepts.includes(r.department) &&
          (selectedSkills.length === 0
            ? true
            : r.skills.length === 0 || r.skills.some((s) => selectedSkills.includes(s))) &&
          r.freeHours >= minFreeHours
      ),
    [selectedDepts, selectedSkills, minFreeHours]
  );

  const filteredRows = useMemo(() => applyListFilters(availRows), [applyListFilters, availRows]);

  /** Header KPI cards — same skill/dept/min filters, locked to this week (forward-supply week 1). */
  const summaryFilteredRows = useMemo(
    () => applyListFilters(summaryRows),
    [applyListFilters, summaryRows]
  );

  const summaryFilteredRowsWeek2 = useMemo(
    () => applyListFilters(summaryRowsWeek2),
    [applyListFilters, summaryRowsWeek2]
  );

  const summaryFilteredRowsLastWeek = useMemo(
    () => applyListFilters(summaryRowsLastWeek),
    [applyListFilters, summaryRowsLastWeek]
  );

  /** Total Free Capacity for this week only. */
  const totalFreeHrsThisWeek = useMemo(
    () => roundHoursToTenth(summaryFilteredRows.reduce((s, r) => s + r.freeHours, 0)),
    [summaryFilteredRows]
  );

  const totalCapacityThisWeek = useMemo(
    () => roundHoursToTenth(summaryFilteredRows.reduce((s, r) => s + r.capacity, 0)),
    [summaryFilteredRows]
  );

  const totalFreeHrsNextWeek = useMemo(
    () => roundHoursToTenth(summaryFilteredRowsWeek2.reduce((s, r) => s + r.freeHours, 0)),
    [summaryFilteredRowsWeek2]
  );

  const totalCapacityNextWeek = useMemo(
    () => roundHoursToTenth(summaryFilteredRowsWeek2.reduce((s, r) => s + r.capacity, 0)),
    [summaryFilteredRowsWeek2]
  );

  const rollingOffIds = useMemo(
    () => new Set(rollingOffAll.map((p) => p.id)),
    [rollingOffAll]
  );

  /** Same people as the KPI card: 14-day allocation end, plus list filters. */
  const rollingOffRows = useMemo(
    () => filterAvailRowsRollingOffSoon(filteredRows, rollingOffIds),
    [filteredRows, rollingOffIds]
  );

  /** All tab = Available now ∪ Rolling off soon (no ongoing Partial / Fully booked). */
  const allSegmentRows = useMemo(
    () => filterAvailRowsAllSegments(filteredRows, rollingOffIds),
    [filteredRows, rollingOffIds]
  );

  const rollingOff = useMemo(() => {
    const visible = new Set(rollingOffRows.map((r) => r.id));
    return rollingOffAll.filter((p) => visible.has(p.id));
  }, [rollingOffAll, rollingOffRows]);

  const topFreeThisWeek = useMemo(
    () => availTopFreePeople(summaryFilteredRows),
    [summaryFilteredRows]
  );
  const topFreeNextWeek = useMemo(
    () => availTopFreePeople(summaryFilteredRowsWeek2),
    [summaryFilteredRowsWeek2]
  );

  const avgSourceRows =
    weekStart === nextWeekStart ? summaryFilteredRowsWeek2 : summaryFilteredRows;
  const avgFreeHrs = useMemo(
    () => avgFreeHoursPerPerson(avgSourceRows),
    [avgSourceRows]
  );

  const priorAvgRows =
    weekStart === nextWeekStart ? summaryFilteredRows : summaryFilteredRowsLastWeek;
  const avgFreeHrsDelta = useMemo(() => {
    if (priorAvgRows.length === 0) return null;
    return roundHoursToTenth(avgFreeHrs - avgFreeHoursPerPerson(priorAvgRows));
  }, [avgFreeHrs, priorAvgRows]);

  const rows = useMemo(() => {
    const filtered =
      seg === "capacity"
        ? summaryFilteredRows
        : seg === "capacityNext"
          ? summaryFilteredRowsWeek2
          : seg === "now"
            ? filteredRows.filter((r) => r.availableFrom === "Now")
            : seg === "rolling"
              ? rollingOffRows
              : allSegmentRows;

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
      if (sortKey === "resourceOwner") {
        return mul * (a.resourceOwnerName ?? "—").localeCompare(b.resourceOwnerName ?? "—");
      }
      return mul * a.skills.join(", ").localeCompare(b.skills.join(", "));
    });
  }, [allSegmentRows, filteredRows, rollingOffRows, seg, sortKey, sortDir, summaryFilteredRows, summaryFilteredRowsWeek2]);

  const allFiltersActive =
    selectedDepts.length === availDepartments.length &&
    selectedSkills.length === availSkills.length &&
    minFreeHours === 0;
  const avgDeltaDisplay = useMemo(
    () => (allFiltersActive ? availAvgDeltaDisplay(avgFreeHrsDelta) : null),
    [allFiltersActive, avgFreeHrsDelta]
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {/* Header */}
      <header className="flex h-14 flex-shrink-0 items-center justify-between border-b border-border bg-surface px-5">
        <div>
          <div className="text-[15px] font-semibold tracking-tight text-foreground">
            Availability
          </div>
          <div className="text-[12px] text-muted-foreground">
            Forward supply · {supplyRangeLabel} · hours free
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
        <div className="grid flex-shrink-0 grid-cols-[minmax(0,1.4fr)_minmax(0,1.4fr)_minmax(11.5rem,0.85fr)] gap-3">
          <Kpi
            label="Total Free Capacity"
            value={formatHoursDecimalLabel(totalFreeHrsThisWeek)}
            delta={
              totalCapacityThisWeek > 0 ? (
                <FreeOfCapacityDelta
                  freeHrs={totalFreeHrsThisWeek}
                  capacityHrs={totalCapacityThisWeek}
                />
              ) : undefined
            }
            deltaClass="text-muted-foreground"
            sub="this week"
            subClass="inline-flex rounded-sm bg-success-soft px-1.5 py-0.5 text-[10px] font-semibold text-success-fg"
            accent="border-l-success"
            valueClass="text-success"
            aside={<TopFreePeopleList people={topFreeThisWeek} />}
            active={seg === "capacity"}
            onClick={() => {
              setSeg("capacity");
              setWeekStart(supplyFrom);
            }}
          />
          <Kpi
            label="Total Free Capacity"
            value={formatHoursDecimalLabel(totalFreeHrsNextWeek)}
            delta={
              totalCapacityNextWeek > 0 ? (
                <FreeOfCapacityDelta
                  freeHrs={totalFreeHrsNextWeek}
                  capacityHrs={totalCapacityNextWeek}
                />
              ) : undefined
            }
            deltaClass="text-muted-foreground"
            sub="next week"
            subClass="inline-flex rounded-sm bg-accent-soft px-1.5 py-0.5 text-[10px] font-semibold text-accent-softfg"
            accent="border-l-success"
            valueClass="text-success"
            aside={<TopFreePeopleList people={topFreeNextWeek} />}
            active={seg === "capacityNext"}
            onClick={() => {
              setSeg("capacityNext");
              setWeekStart(nextWeekStart);
            }}
          />
          <Kpi
            label="Avg Free Hrs / Person"
            value={formatHoursDecimalLabel(avgFreeHrs)}
            sub={weekStart === nextWeekStart ? "next week" : "this week"}
            subClass={
              weekStart === nextWeekStart
                ? "inline-flex rounded-sm bg-accent-soft px-1.5 py-0.5 text-[10px] font-semibold text-accent-softfg"
                : "inline-flex rounded-sm bg-success-soft px-1.5 py-0.5 text-[10px] font-semibold text-success-fg"
            }
            delta={avgDeltaDisplay?.text}
            deltaClass={
              avgDeltaDisplay?.tone === "danger"
                ? "text-danger"
                : avgDeltaDisplay?.tone === "muted"
                  ? "text-muted-foreground"
                  : "text-success"
            }
          />
        </div>

        {/* Rolling off soon band */}
        <div className="flex-shrink-0 rounded-lg border border-border bg-surface-alt px-4 py-3">
          <div
            className={`flex items-center justify-between ${rollingOffExpanded ? "mb-2.5" : ""}`}
          >
            <div className="text-[12px] font-semibold text-foreground">
              Rolling off soon{" "}
              <span className="font-normal text-muted-foreground">
                · {rollingOff.length} people freeing up within 2 weeks
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => navigate("/planner")}
                className="cursor-pointer text-[11px] text-primary"
              >
                View in planner →
              </button>
              <button
                type="button"
                aria-expanded={rollingOffExpanded}
                aria-label={
                  rollingOffExpanded
                    ? "Collapse rolling off soon"
                    : "Expand rolling off soon"
                }
                onClick={() => setRollingOffExpanded((open) => !open)}
                className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md border border-border bg-surface text-foreground hover:bg-surface-alt"
              >
                <ChevronDown
                  className={`h-4 w-4 transition-transform ${rollingOffExpanded ? "rotate-180" : ""}`}
                />
              </button>
            </div>
          </div>
          {rollingOffExpanded ? (
            <RollingOffCarousel people={rollingOff} onPlanAhead={openPlanAhead} />
          ) : null}
        </div>

        {/* Supply table */}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border bg-surface">
          {/* Table toolbar */}
          <div className="flex flex-shrink-0 items-center justify-between border-b border-border-soft px-4 py-2.5">
            <div className="flex gap-1">
              <Tab active={seg === "all"} onClick={() => setSeg("all")}>
                All {allSegmentRows.length}
              </Tab>
              <Tab
                active={seg === "now"}
                onClick={() => setSeg("now")}
                tone="success"
              >
                This week
              </Tab>
              <Tab
                active={seg === "rolling"}
                onClick={() => setSeg("rolling")}
                tone="warning"
              >
                Rolling off soon
              </Tab>
            </div>
            <WeeklyCheckInWeekPicker
              weekStart={weekStart}
              onChange={(ws) => {
                setWeekStart(ws);
                if (seg === "capacity" || seg === "capacityNext") {
                  if (ws === supplyFrom) setSeg("capacity");
                  else if (ws === nextWeekStart) setSeg("capacityNext");
                  else setSeg("all");
                }
              }}
              weeks={availabilityWeeks}
            />
          </div>

          {/* Single scrollport: sticky header + rows share width (scrollbar no longer shifts columns). */}
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            <div className="sticky top-0 z-10 flex items-center border-b border-border-soft bg-surface-alt px-4 py-2 text-[11px] font-semibold text-muted">
              <div className="w-[200px] shrink-0">
                <SortColHeader
                  label="TEAM MEMBER"
                  col="name"
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSort={handleSort}
                />
              </div>
              <div className="w-[160px] shrink-0">
                <SortColHeader
                  label="FREE CAPACITY"
                  col="freeHours"
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSort={handleSort}
                />
              </div>
              <div className="w-[130px] shrink-0">
                <SortColHeader
                  label="AVAILABLE FROM"
                  col="availableFrom"
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSort={handleSort}
                />
              </div>
              <div className="w-[168px] shrink-0 pr-4">
                <SortColHeader
                  label="RESOURCE OWNER"
                  col="resourceOwner"
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSort={handleSort}
                />
              </div>
              <div className="w-[140px] min-w-0 shrink pr-3">
                <SortColHeader
                  label="SKILLS"
                  col="skills"
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSort={handleSort}
                />
              </div>
              <div className="w-[100px] shrink-0 text-right">ACTION</div>
            </div>

            {rows.length === 0 ? (
              <div className="px-4 py-10 text-center text-[13px] text-muted-foreground">
                No people match the selected filters.
              </div>
            ) : (
              rows.map((r) => {
                const blocked = allocationBlockedMessage(
                  selfHrmsId,
                  r.id,
                  allEmployees,
                  allocPermOpts
                );
                return (
                <AvailTableRow
                  key={r.id}
                  row={r}
                  canAllocate={!blocked}
                  allocateBlockedTitle={blocked ?? undefined}
                  onAllocate={openAllocate}
                />
                );
              })
            )}
          </div>
        </div>
      </div>

      <AllocationDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        prefill={prefill}
        people={plannerPeople}
        allocations={allocations.map((a) => ({
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
        }))}
        onSave={handleAllocationSave}
      />
    </div>
  );
}
