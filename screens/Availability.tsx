import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import {
  MIN_FREE_HOUR_OPTIONS,
  availAvgDeltaDisplay,
  avgFreeHoursPerPerson,
  availFreeOfCapacityParts,
  availTopFreePeople,
  mergeAvailRowsTwoWeeks,
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
import { buildAvailRowsFromEmployees, buildRollingOffFromLive, addDaysISO, mondayISO } from "../api/liveViews";
import {
  createAllocation,
  fetchAllocations,
  fetchActiveLeaveDatesByEmployee,
  fetchResourceLeaves,
  type ApiAllocation,
} from "../api/domain";
import { TruncateText } from "../components/TruncateText";
import { formatHoursDecimalLabel, formatHoursLabel, roundHoursToTenth } from "../utils/formatHours";

type Segment = "all" | "now" | "next" | "rolling";
type AvailSortKey = "name" | "freeHours" | "availableFrom" | "resourceOwner" | "skills";

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

function FreeOfCapacityHours({ freeHrs, capacityHrs }: { freeHrs: number; capacityHrs: number }) {
  return <>{availFreeOfCapacityParts(freeHrs, capacityHrs).ofHours}</>;
}

function FreeOfCapacityPct({ freeHrs, capacityHrs }: { freeHrs: number; capacityHrs: number }) {
  const { pct } = availFreeOfCapacityParts(freeHrs, capacityHrs);
  return <span className={pct > 20 ? "font-bold text-danger" : undefined}>{pct}%</span>;
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
  labelAddon,
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
  labelAddon?: ReactNode;
}) {
  const className = [
    "rounded-lg border border-border bg-surface px-3.5 py-3.5 text-left",
    accent ? `border-l-[3px] ${accent}` : "",
    onClick ? "cursor-pointer hover:bg-surface-alt" : "",
    active ? "border-primary/40 bg-highlight ring-2 ring-primary/20" : "",
  ].join(" ");

  const body = (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0 flex-1">
        <div className="mb-1.5 flex flex-wrap items-baseline gap-1.5 text-[11px] text-muted">
          <span>{label}</span>
          {labelAddon}
        </div>
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
      {aside ? <div className="min-w-0 shrink-0">{aside}</div> : null}
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
  tone?: "success" | "warning" | "muted" | "accent";
}) {
  const inactive =
    tone === "success"
      ? "text-success"
      : tone === "warning"
      ? "text-warning"
      : tone === "accent"
      ? "text-accent-softfg"
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
    <div className="flex min-w-0 items-center gap-1.5">
      <div className="h-1.5 w-[72px] flex-shrink-0 rounded-full bg-border-soft">
        <div
          className="h-full rounded-full bg-success"
          style={{ width: `${freePct}%` }}
        />
      </div>
      <span className="min-w-0 truncate text-[12px] font-semibold text-success">{formatHoursDecimalLabel(freeHours)} free</span>
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

const AVAIL_GRID =
  "grid w-full grid-cols-[minmax(9.75rem,1.3fr)_minmax(9rem,1fr)_minmax(8.25rem,0.85fr)_minmax(7.75rem,1fr)_minmax(4.75rem,0.75fr)_5.5rem] gap-x-3 px-4";

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
    <div className={`${AVAIL_GRID} items-start border-b border-border-soft py-3 last:border-b-0`}>
      {/* Team member */}
      <div className="flex min-w-0 items-center gap-2.5">
        <div
          className={`flex h-[30px] w-[30px] flex-shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${
            isNow
              ? "bg-success-soft text-success-fg"
              : "bg-surface-alt text-muted"
          }`}
        >
          {row.initials}
        </div>
        <div className="min-w-0">
          <TruncateText
            as="div"
            text={row.name}
            className="text-[13px] font-medium text-foreground"
          />
          <TruncateText
            as="div"
            text={row.department}
            className="text-[11px] text-muted-foreground"
          />
        </div>
      </div>

      {/* Free capacity */}
      <div className="min-w-0">
        <FreeCapacityBar freeHours={row.freeHours} capacity={row.capacity} />
        <div className="mt-0.5 text-[11px] text-muted-foreground">
          {row.bookedPct}% booked
          {(row.leaveHours ?? 0) > 0
            ? ` · ${formatHoursDecimalLabel(row.leaveHours!)} leave`
            : ""}
        </div>
      </div>

      {/* Available from */}
      <div className="min-w-0 pt-1">
        <span
          className={`text-[12px] font-medium ${
            isNow ? "text-success" : "text-muted-foreground"
          }`}
        >
          {row.availableFrom}
        </span>
      </div>

      {/* Resource owner */}
      <div className="min-w-0 pt-1">
        <TruncateText
          as="div"
          text={row.resourceOwnerName || "—"}
          className="text-[12px] text-foreground"
        />
      </div>

      {/* Skills */}
      <div className="flex min-w-0 flex-wrap content-start gap-1 pt-0.5">
        {row.skills.map((s) => (
          <SkillChip key={s} label={s} highlight={isNow} />
        ))}
      </div>

      {/* Action */}
      <div className="pt-1 text-right">
        {canAllocate ? (
        <button
          type="button"
          onClick={() => onAllocate(row)}
          className="inline-flex cursor-pointer items-center gap-0.5 whitespace-nowrap text-[11px] text-primary hover:underline"
        >
          Allocate <ArrowRight className="h-3 w-3 shrink-0" />
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
  const [weekStart, setWeekStart] = useState(() => mondayISO());

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
  const [leaveDatesByEmployee, setLeaveDatesByEmployee] = useState<Record<string, string[]>>({});

  const reloadAllocations = useCallback(async () => {
    const from = addDaysISO(supplyFrom, -30);
    const to = addDaysISO(supplyTo, 7);
    try {
      const a = await fetchAllocations({ from, to });
      setAllocations(a);
    } catch {
      setAllocations([]);
    }
    // Same source as Resource Planner so leave markers and free hrs stay in sync.
    try {
      setLeaveDatesByEmployee(await fetchActiveLeaveDatesByEmployee());
    } catch {
      try {
        const rows = await fetchResourceLeaves({ from, to });
        const leaves: Record<string, string[]> = {};
        for (const row of rows) {
          if (row.status !== "Active") continue;
          const key = String(row.employeeHrmsId).trim();
          const iso = row.leaveDate.slice(0, 10);
          if (!leaves[key]) leaves[key] = [];
          if (!leaves[key].includes(iso)) leaves[key].push(iso);
        }
        setLeaveDatesByEmployee(leaves);
      } catch (err) {
        console.warn("[Availability] leave dates unavailable", err);
        setLeaveDatesByEmployee({});
      }
    }
  }, [supplyFrom, supplyTo]);

  useEffect(() => {
    void reloadAllocations();
  }, [reloadAllocations]);

  const hpd = settings.workingHoursPerDay;

  const summaryRows = useMemo(
    () =>
      buildAvailRowsFromEmployees(
        employees,
        summaryWeekCapacity,
        allocations,
        offDayIsos,
        supplyFrom,
        settings.workingDays,
        allEmployees,
        leaveDatesByEmployee,
        hpd
      ),
    [
      employees,
      summaryWeekCapacity,
      allocations,
      offDayIsos,
      supplyFrom,
      settings.workingDays,
      allEmployees,
      leaveDatesByEmployee,
      hpd,
    ]
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
        allEmployees,
        leaveDatesByEmployee,
        hpd
      ),
    [
      employees,
      nextWeekCapacity,
      allocations,
      offDayIsos,
      nextWeekStart,
      settings.workingDays,
      allEmployees,
      leaveDatesByEmployee,
      hpd,
    ]
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
        allEmployees,
        leaveDatesByEmployee,
        hpd
      ),
    [
      employees,
      lastWeekCapacity,
      allocations,
      offDayIsos,
      lastWeekStart,
      settings.workingDays,
      allEmployees,
      leaveDatesByEmployee,
      hpd,
    ]
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
        allEmployees,
        leaveDatesByEmployee,
        hpd
      ),
    [
      employees,
      weekCapacity,
      allocations,
      offDayIsos,
      weekStart,
      settings.workingDays,
      allEmployees,
      leaveDatesByEmployee,
      hpd,
    ]
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

  const [seg, setSeg] = useState<Segment>("now");
  const [rollingOffExpanded, setRollingOffExpanded] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [prefill, setPrefill] = useState<AllocationPrefill | null>(null);
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const [selectedDepts, setSelectedDepts] = useState<string[]>([]);
  const [minFreeHours, setMinFreeHours] = useState(0);
  /** Name sort keeps people findable when leave reduces free hrs (free-hrs desc buries them). */
  const { sortKey, sortDir, handleSort } = useColumnSort<AvailSortKey>("name", "asc");

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
    setPrefill({ personName: row.name });
    setDrawerOpen(true);
  };

  const openPlanAhead = (person: RollingOffPerson) => {
    const blocked = allocationBlockedMessage(selfHrmsId, person.id, allEmployees, allocPermOpts);
    if (blocked) {
      toast.warning(blocked);
      return;
    }
    setPrefill({ personName: person.name });
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
      rows.filter((r) => {
        if (!selectedDepts.includes(r.department)) return false;
        // "All skills" (every master selected, or none) — do not drop people with empty/orphan skills.
        const skillsFilterOff =
          selectedSkills.length === 0 || selectedSkills.length === availSkills.length;
        if (
          !skillsFilterOff &&
          r.skills.length > 0 &&
          !r.skills.some((s) => selectedSkills.includes(s))
        ) {
          return false;
        }
        // Leave-reduced or On leave (0h) must still appear — only Min free hours can hide low free.
        return r.freeHours >= minFreeHours;
      }),
    [selectedDepts, selectedSkills, availSkills.length, minFreeHours]
  );

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

  /** All tab = this week + next week hours per person. */
  const twoWeekRows = useMemo(
    () => mergeAvailRowsTwoWeeks(summaryRows, summaryRowsWeek2),
    [summaryRows, summaryRowsWeek2]
  );
  const twoWeekFilteredRows = useMemo(
    () => applyListFilters(twoWeekRows),
    [applyListFilters, twoWeekRows]
  );

  /** Rolling-off people with two-week hours, plus list filters. */
  const rollingOffRows = useMemo(
    () => filterAvailRowsRollingOffSoon(twoWeekFilteredRows, rollingOffIds),
    [twoWeekFilteredRows, rollingOffIds]
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
      seg === "now"
        ? summaryFilteredRows
        : seg === "next"
          ? summaryFilteredRowsWeek2
          : seg === "rolling"
            ? rollingOffRows
            : twoWeekFilteredRows;

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
  }, [rollingOffRows, seg, sortKey, sortDir, summaryFilteredRows, summaryFilteredRowsWeek2, twoWeekFilteredRows]);

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
                <FreeOfCapacityHours
                  freeHrs={totalFreeHrsThisWeek}
                  capacityHrs={totalCapacityThisWeek}
                />
              ) : undefined
            }
            deltaClass="text-muted-foreground"
            labelAddon={
              totalCapacityThisWeek > 0 ? (
                <FreeOfCapacityPct
                  freeHrs={totalFreeHrsThisWeek}
                  capacityHrs={totalCapacityThisWeek}
                />
              ) : undefined
            }
            sub="this week"
            subClass="inline-flex rounded-sm bg-success-soft px-1.5 py-0.5 text-[10px] font-semibold text-success-fg"
            accent="border-l-success"
            valueClass="text-success"
            aside={<TopFreePeopleList people={topFreeThisWeek} />}
            active={seg === "now"}
            onClick={() => {
              setSeg("now");
              setWeekStart(supplyFrom);
            }}
          />
          <Kpi
            label="Total Free Capacity"
            value={formatHoursDecimalLabel(totalFreeHrsNextWeek)}
            delta={
              totalCapacityNextWeek > 0 ? (
                <FreeOfCapacityHours
                  freeHrs={totalFreeHrsNextWeek}
                  capacityHrs={totalCapacityNextWeek}
                />
              ) : undefined
            }
            deltaClass="text-muted-foreground"
            labelAddon={
              totalCapacityNextWeek > 0 ? (
                <FreeOfCapacityPct
                  freeHrs={totalFreeHrsNextWeek}
                  capacityHrs={totalCapacityNextWeek}
                />
              ) : undefined
            }
            sub="next week"
            subClass="inline-flex rounded-sm bg-accent-soft px-1.5 py-0.5 text-[10px] font-semibold text-accent-softfg"
            accent="border-l-success"
            valueClass="text-success"
            aside={<TopFreePeopleList people={topFreeNextWeek} />}
            active={seg === "next"}
            onClick={() => {
              setSeg("next");
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
          <div className="flex flex-shrink-0 items-center border-b border-border-soft px-4 py-2.5">
            <div className="flex gap-1">
              <Tab active={seg === "all"} onClick={() => setSeg("all")}>
                All {twoWeekFilteredRows.length}
              </Tab>
              <Tab
                active={seg === "now"}
                onClick={() => {
                  setSeg("now");
                  setWeekStart(supplyFrom);
                }}
                tone="success"
              >
                This week
              </Tab>
              <Tab
                active={seg === "next"}
                onClick={() => {
                  setSeg("next");
                  setWeekStart(nextWeekStart);
                }}
                tone="accent"
              >
                Next week
              </Tab>
              <Tab
                active={seg === "rolling"}
                onClick={() => setSeg("rolling")}
                tone="warning"
              >
                Rolling off soon
              </Tab>
            </div>
          </div>

          {/* Single scrollport: sticky header + rows share width (scrollbar no longer shifts columns). */}
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            <div className={`${AVAIL_GRID} sticky top-0 z-10 items-center border-b border-border-soft bg-surface-alt py-2 text-[11px] font-semibold text-muted`}>
              <div className="min-w-0">
                <SortColHeader
                  label="TEAM MEMBER"
                  col="name"
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSort={handleSort}
                />
              </div>
              <div className="min-w-0">
                <SortColHeader
                  label="FREE CAPACITY"
                  col="freeHours"
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSort={handleSort}
                />
              </div>
              <div className="min-w-0">
                <SortColHeader
                  label="AVAILABLE FROM"
                  col="availableFrom"
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSort={handleSort}
                />
              </div>
              <div className="min-w-0">
                <SortColHeader
                  label="RESOURCE OWNER"
                  col="resourceOwner"
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSort={handleSort}
                />
              </div>
              <div className="min-w-0">
                <SortColHeader
                  label="SKILLS"
                  col="skills"
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSort={handleSort}
                />
              </div>
              <div className="text-right">ACTION</div>
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
