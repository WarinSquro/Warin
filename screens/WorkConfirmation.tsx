import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check, Plus, X, CheckCircle2, Bell, Timer } from "lucide-react";
import { formatAppDate, formatAppDateTime } from "../utils/formatAppDate";
import { useAppDateFormat } from "../hooks/useAppDateFormat";
import { useSharedDataSync, usePauseSharedDataSync, MASTER_TXN_SYNC_INTERVAL_MS } from "../hooks/useSharedDataSync";
import { AppDateInput } from "../components/AppDateInput";
import { FilterSelect } from "../components/FilterSelect";
import {
  DEVIATION_REASONS,
  MISS_POSTING_REASONS,
  formatPlanDate,
} from "../data/confirmation";
import { Tooltip } from "../components/Tooltip";
import { SortColHeader, useColumnSort } from "../components/SortColHeader";
import {
  AllocationFocusTimer,
  ConfirmationDayCalendar,
  WorkdayTimelinePanel,
} from "../components/ConfirmationProductivity";
import type { PlannedLine, DayStatus, ComplianceRow, DeviationEntry } from "../data/confirmation";
import { useAuth } from "../context/AuthContext";
import { useSettings } from "../context/SettingsContext";
import { useToast } from "../context/ToastContext";
import {
  fetchAllocations,
  fetchMissPostingCount,
  fetchMyConfirmation,
  fetchTeamCompliance,
  remindConfirmation,
  submitConfirmation,
  fetchConfirmationProductivity,
  upsertConfirmationProductivity,
  type ApiConfirmation,
} from "../api/domain";
import {
  type DayProductivity,
  type FocusAllocationState,
  type ProductivityStore,
  type WorkdayMarkKey,
  computeConfirmationWorkHours,
  emptyFocusState,
  focusElapsedMs,
  focusStartBlockedReason,
  getDayProductivity,
  hasAnyUnstoppedFocusSession,
  isConfirmAllAsPlannedBlockedByProductiveWindow,
  isFocusStartBlocked,
  isUnplannedEntryBlocked,
  unplannedEntryBlockedReason,
  CONFIRM_AS_PLANNED_PRODUCTIVE_WINDOW_MESSAGE,
  workdayDurationMs,
  FOCUS_TIMERS_FINALIZED_EVENT,
  loadProductivityStore,
  pauseAllRunningFocusTimers,
  saveProductivityStore,
  stopAllOpenFocusTimers,
  stopFocusTimerOnDay,
  upsertDayProductivity,
  canStampWorkdayAction,
} from "../utils/confirmationProductivity";
import { workingDayHeaderLetters, weekStartMonday, workingDatesInWeek, workingDayStatus } from "../utils/workingCalendar";

const EMPTY_LINES: PlannedLine[] = [];

function complianceWeekGridClass(dayCount: number): string {
  if (dayCount >= 7) return "grid w-[168px] shrink-0 grid-cols-7 place-items-center";
  if (dayCount === 6) return "grid w-[144px] shrink-0 grid-cols-6 place-items-center";
  return "grid w-[120px] shrink-0 grid-cols-5 place-items-center";
}

function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function linesFromAllocations(
  rows: {
    id: string;
    projectName: string;
    milestoneName: string;
    activity: string;
    hoursPerDay: number;
    startDate: string;
    tasks: string[];
  }[]
): PlannedLine[] {
  return rows.map((a) => ({
    id: String(a.id),
    project: a.projectName,
    milestone: a.milestoneName,
    activity: a.activity,
    plannedHours: a.hoursPerDay,
    allocatedOn: a.startDate,
    tasks: a.tasks ?? [],
  }));
}

function hydrateFromConfirmation(c: ApiConfirmation): {
  lines: PlannedLine[];
  states: Record<string, LineState>;
  unplanned: { id: string; project: string; hours: number; reason: string }[];
} {
  const lines: PlannedLine[] = [];
  const states: Record<string, LineState> = {};
  const unplanned: { id: string; project: string; hours: number; reason: string }[] = [];

  for (const l of c.lines) {
    if (l.kind === "unplanned") {
      unplanned.push({
        id: l.id,
        project: l.projectLabel,
        hours: l.actualHours,
        reason: l.reason || "logged",
      });
      continue;
    }
    const allocationId = l.allocationId != null ? String(l.allocationId) : null;
    // Row key must not fall back to confirmation-line id (that is not an allocations.id FK).
    const id = allocationId ?? `orphan-${l.id}`;
    lines.push({
      id,
      project: l.projectLabel,
      milestone: l.milestoneLabel,
      activity: l.activity,
      plannedHours: l.plannedHours,
      allocatedOn: c.workDate,
      tasks: l.tasks ?? [],
    });
    states[id] = {
      mode: l.kind === "deviation" ? "deviation" : "planned",
      actual: l.actualHours,
      reason: l.reason,
    };
  }
  return { lines, states, unplanned };
}

type Mode = "mine" | "team";

export function WorkConfirmation() {
  const [mode, setMode] = useState<Mode>("mine");
  const today = todayISO();
  const { settings } = useSettings();
  const dateFmt = settings.dateFormat ?? "dd/MM/yyyy";
  const todayLabel = formatPlanDate(today, dateFmt);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <header className="flex h-14 flex-shrink-0 items-center justify-between border-b border-border bg-surface px-5">
        <div>
          <div className="text-[15px] font-semibold tracking-tight text-foreground">Work Confirmation</div>
          <div className="text-[12px] text-muted-foreground">Daily · {todayLabel}</div>
        </div>
        <div className="flex overflow-hidden rounded-md border border-border text-[12px]">
          {([["mine", "My day"], ["team", "Team compliance"]] as const).map(([m, label]) => (
            <button
              key={m}
              onClick={() => setMode(m as Mode)}
              className={`px-3.5 py-1.5 ${mode === m ? "bg-brand font-medium text-white" : "text-muted"}`}
            >
              {label}
            </button>
          ))}
        </div>
      </header>

      {mode === "mine" ? <EmployeeConfirm /> : <ManagerCompliance />}
    </div>
  );
}

/* ---------------- Employee view ---------------- */

interface LineState {
  mode: "planned" | "deviation";
  actual: number;
  reason: string;
}

function initLineStates(lines: PlannedLine[]): Record<string, LineState> {
  return Object.fromEntries(
    lines.map((l) => [l.id, { mode: "planned", actual: l.plannedHours, reason: "" }])
  );
}

function EmployeeConfirm() {
  const { currentEmployee } = useAuth();
  const { settings, loading: settingsLoading } = useSettings();
  const dateFmt = settings.dateFormat ?? "dd/MM/yyyy";
  const toast = useToast();
  const today = todayISO();
  const [activeLines, setActiveLines] = useState<PlannedLine[]>(EMPTY_LINES);
  const [planHeading, setPlanHeading] = useState("Your plan for today");
  const [states, setStates] = useState<Record<string, LineState>>(() => initLineStates(EMPTY_LINES));
  const [unplanned, setUnplanned] = useState<{ id: string; project: string; hours: number; reason: string }[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const [submittedAtLabel, setSubmittedAtLabel] = useState("");
  const [saveError, setSaveError] = useState("");
  const [saving, setSaving] = useState(false);
  const [monthMissCount, setMonthMissCount] = useState(0);

  const [missedPosting, setMissedPosting] = useState(false);
  const [missReason, setMissReason] = useState("");
  const [missDate, setMissDate] = useState("");
  const [fetchError, setFetchError] = useState("");
  const [fetchedMissDate, setFetchedMissDate] = useState("");
  const [dayEndConfirmOpen, setDayEndConfirmOpen] = useState(false);
  const {
    sortKey: lineSortKey,
    sortDir: lineSortDir,
    handleSort: handleLineSort,
  } = useColumnSort<"allocation" | "tasks" | "status">("allocation");

  const hrmsId = currentEmployee?.id;
  const workDate = fetchedMissDate || today;
  const isTodayWorkDate = workDate === today;

  const [prodStore, setProdStore] = useState<ProductivityStore>({ days: {} });
  /** Blocks work-hours→API sync until GET productivity finishes (avoids empty PUT wiping focus). */
  const [productivityHydrated, setProductivityHydrated] = useState(false);
  const [calendarDate, setCalendarDate] = useState(today);
  const [tick, setTick] = useState(0);

  /** Working Calendar (Settings): working weekdays + company off-days. */
  const workingCalendar = useMemo(
    () =>
      workingDayStatus(calendarDate, {
        workingDays: settings.workingDays,
        companyOffDays: settings.companyOffDays,
      }),
    [settings.companyOffDays, settings.workingDays, calendarDate]
  );
  const todayWorkingCalendar = useMemo(
    () =>
      workingDayStatus(workDate, {
        workingDays: settings.workingDays,
        companyOffDays: settings.companyOffDays,
      }),
    [settings.companyOffDays, settings.workingDays, workDate]
  );

  /** Timers + Workday Timeline: today only, and only on Working Calendar days. */
  const canUseProductivity = isTodayWorkDate && todayWorkingCalendar.ok;

  useEffect(() => {
    if (!hrmsId) return;
    setProductivityHydrated(false);
    const local = loadProductivityStore(hrmsId);
    setProdStore(local);
    let cancelled = false;
    void (async () => {
      try {
        const from = new Date();
        from.setMonth(from.getMonth() - 2);
        const to = new Date();
        to.setMonth(to.getMonth() + 1);
        const fromIso = `${from.getFullYear()}-${String(from.getMonth() + 1).padStart(2, "0")}-01`;
        const toIso = `${to.getFullYear()}-${String(to.getMonth() + 1).padStart(2, "0")}-${String(
          new Date(to.getFullYear(), to.getMonth() + 1, 0).getDate()
        ).padStart(2, "0")}`;
        const res = await fetchConfirmationProductivity({ from: fromIso, to: toIso });
        if (cancelled) return;
        const merged: ProductivityStore = {
          days: { ...local.days, ...(res.days ?? {}) },
        };
        setProdStore(merged);
        saveProductivityStore(hrmsId, merged);
      } catch {
        /* keep local cache if API unavailable */
      } finally {
        if (!cancelled) setProductivityHydrated(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hrmsId]);

  // App Log out finalizes open timers in localStorage — refresh UI if still mounted.
  useEffect(() => {
    if (!hrmsId) return;
    const onFinalized = (ev: Event) => {
      const detail = (ev as CustomEvent<{ hrmsId?: string }>).detail;
      if (detail?.hrmsId && detail.hrmsId !== hrmsId) return;
      setProdStore(loadProductivityStore(hrmsId));
    };
    window.addEventListener(FOCUS_TIMERS_FINALIZED_EVENT, onFinalized);
    return () => window.removeEventListener(FOCUS_TIMERS_FINALIZED_EVENT, onFinalized);
  }, [hrmsId]);

  const todayProd = useMemo(
    () => getDayProductivity(prodStore, workDate),
    [prodStore, workDate]
  );
  /** Productivity for the calendar-selected day (laps shown read-only on past dates). */
  const viewProd = useMemo(
    () => getDayProductivity(prodStore, calendarDate),
    [prodStore, calendarDate]
  );

  const syncProductivityToApi = (dateIso: string, day: DayProductivity) => {
    void upsertConfirmationProductivity({
      workDate: dateIso,
      workday: {
        dayStart: day.workday.dayStart ?? null,
        lunchOut: day.workday.lunchOut ?? null,
        lunchIn: day.workday.lunchIn ?? null,
        dayEnd: day.workday.dayEnd ?? null,
      },
      focusByAllocation: day.focusByAllocation,
      activeTimerId: day.activeTimerId ?? null,
      workHours: day.workHours ?? null,
    }).catch(() => {
      /* local cache remains source until next successful sync */
    });
  };

  const persistDay = (dateIso: string, day: DayProductivity) => {
    if (!hrmsId) return;
    setProdStore((prev) => {
      const next = upsertDayProductivity(prev, dateIso, day);
      saveProductivityStore(hrmsId, next);
      return next;
    });
    syncProductivityToApi(dateIso, day);
  };

  const stampWorkday = (key: WorkdayMarkKey) => {
    if (!canUseProductivity) return;
    if (!canStampWorkdayAction(todayProd.workday, key)) return;

    if (key === "dayEnd") {
      const allocationRunning = Object.values(todayProd.focusByAllocation).some(
        (s) => !!s?.segmentStartedAt
      );
      if (allocationRunning) {
        setDayEndConfirmOpen(true);
        return;
      }
      // Log Out: finalize every open session (running + paused) into laps and update totals.
      const day = stopAllOpenFocusTimers({
        ...todayProd,
        workday: { ...todayProd.workday, dayEnd: new Date().toISOString() },
      });
      persistDay(workDate, day);
      return;
    }

    if (key === "lunchOut") {
      const day = pauseAllRunningFocusTimers({
        ...todayProd,
        workday: { ...todayProd.workday, lunchOut: new Date().toISOString() },
      });
      persistDay(workDate, day);
      return;
    }

    persistDay(workDate, {
      ...todayProd,
      workday: { ...todayProd.workday, [key]: new Date().toISOString() },
    });
  };

  const confirmDayEndWithAllocationStop = () => {
    if (!canUseProductivity) return;
    if (!canStampWorkdayAction(todayProd.workday, "dayEnd")) {
      setDayEndConfirmOpen(false);
      return;
    }
    const day = stopAllOpenFocusTimers({
      ...todayProd,
      workday: { ...todayProd.workday, dayEnd: new Date().toISOString() },
    });
    persistDay(workDate, day);
    setDayEndConfirmOpen(false);
  };

  const pauseActiveTimer = (day: DayProductivity, exceptId?: string): DayProductivity => {
    const activeId = day.activeTimerId;
    if (!activeId || activeId === exceptId) return day;
    const st = day.focusByAllocation[activeId] ?? emptyFocusState();
    if (!st.segmentStartedAt) return { ...day, activeTimerId: null };
    const added = Math.max(0, Date.now() - new Date(st.segmentStartedAt).getTime());
    return {
      ...day,
      activeTimerId: null,
      focusByAllocation: {
        ...day.focusByAllocation,
        [activeId]: {
          ...st,
          sessionAccumMs: st.sessionAccumMs + added,
          segmentStartedAt: null,
        },
      },
    };
  };

  const handleFocusStartPause = (allocationId: string) => {
    const id = String(allocationId);
    if (!hrmsId || !canUseProductivity || submitted) return;
    if (todayProd.workday.dayEnd) return;
    setProdStore((prev) => {
      let day = { ...getDayProductivity(prev, workDate) };
      const current = day.focusByAllocation[id] ?? emptyFocusState();
      if (current.segmentStartedAt) {
        // Pause is always allowed while a segment is running (e.g. before Lunch Start fires).
        const added = Math.max(0, Date.now() - new Date(current.segmentStartedAt).getTime());
        day = {
          ...day,
          activeTimerId: null,
          focusByAllocation: {
            ...day.focusByAllocation,
            [id]: {
              ...current,
              sessionAccumMs: current.sessionAccumMs + added,
              segmentStartedAt: null,
            },
          },
        };
      } else {
        if (isFocusStartBlocked(day.workday)) return prev;
        day = pauseActiveTimer(day, id);
        day = {
          ...day,
          activeTimerId: id,
          focusByAllocation: {
            ...day.focusByAllocation,
            [id]: {
              ...(day.focusByAllocation[id] ?? current),
              segmentStartedAt: new Date().toISOString(),
            },
          },
        };
      }
      const next = upsertDayProductivity(prev, workDate, day);
      saveProductivityStore(hrmsId, next);
      syncProductivityToApi(workDate, day);
      return next;
    });
  };

  const handleFocusStop = (allocationId: string) => {
    const id = String(allocationId);
    if (!hrmsId || !canUseProductivity || submitted) return;
    if (todayProd.workday.dayEnd) return;
    setProdStore((prev) => {
      const day = stopFocusTimerOnDay({ ...getDayProductivity(prev, workDate) }, id);
      const next = upsertDayProductivity(prev, workDate, day);
      saveProductivityStore(hrmsId, next);
      syncProductivityToApi(workDate, day);
      return next;
    });
  };

  // Keep calendar focus totals fresh while a timer runs
  useEffect(() => {
    const anyRunning = Object.values(todayProd.focusByAllocation).some((s) => s?.segmentStartedAt);
    if (!anyRunning) return;
    const id = window.setInterval(() => setTick((t) => t + 1), 1000);
    return () => window.clearInterval(id);
  }, [todayProd.focusByAllocation]);

  const liveWorkHours = useMemo(
    () => computeConfirmationWorkHours(activeLines, states, unplanned),
    [activeLines, states, unplanned]
  );

  // Keep calendar "Total (Planned/Unplan.) Work Hours" in sync as plan/deviation/unplanned change.
  // Wait for productivity hydrate so we never PUT an empty focus day before GET returns (wipes EC2 laps).
  useEffect(() => {
    if (!hrmsId || !productivityHydrated) return;
    setProdStore((prev) => {
      const current = getDayProductivity(prev, workDate);
      if (current.workHours === liveWorkHours) return prev;
      const day = { ...current, workHours: liveWorkHours };
      const next = upsertDayProductivity(prev, workDate, day);
      saveProductivityStore(hrmsId, next);
      syncProductivityToApi(workDate, day);
      return next;
    });
  }, [liveWorkHours, workDate, hrmsId, productivityHydrated]);

  const liveFocusMs = useMemo(() => {
    void tick;
    return Object.values(todayProd.focusByAllocation).reduce(
      (sum, st) => sum + focusElapsedMs(st),
      0
    );
  }, [todayProd.focusByAllocation, tick]);

  const calendarDayMeta = useMemo(() => {
    const meta: Record<string, { workHours: number; focusMs: number }> = {};
    for (const [iso, day] of Object.entries(prodStore.days)) {
      const focusMs = Object.values(day.focusByAllocation ?? {}).reduce(
        (s, st) => s + focusElapsedMs(st as FocusAllocationState, Date.now()),
        0
      );
      meta[iso] = {
        workHours: day.workHours ?? 0,
        focusMs,
      };
    }
    return meta;
  }, [prodStore.days]);

  const loadPlanForDate = async (date: string) => {
    if (!hrmsId) return [];
    const rows = await fetchAllocations({
      employeeHrmsId: hrmsId,
      from: date,
      to: date,
    });
    return linesFromAllocations(rows);
  };

  /** Show allocations for the calendar-selected day in the plan panel. */
  const loadPlanForCalendarDate = useCallback(
    async (dateIso: string) => {
      if (!hrmsId) return;
      setPlanHeading(
        dateIso === today
          ? "Your plan for today"
          : `Your plan for ${formatPlanDate(dateIso, dateFmt)}`
      );
      setSaveError("");
      try {
        const existing = await fetchMyConfirmation(dateIso);
        if (existing) {
          const hydrated = hydrateFromConfirmation(existing);
          setActiveLines(hydrated.lines);
          setStates(hydrated.states);
          setUnplanned(hydrated.unplanned);
          return;
        }
        const lines = await loadPlanForDate(dateIso);
        setActiveLines(lines);
        setStates(initLineStates(lines));
        setUnplanned([]);
      } catch {
        setActiveLines(EMPTY_LINES);
        setStates(initLineStates(EMPTY_LINES));
        setUnplanned([]);
      }
    },
    // loadPlanForDate closes over hrmsId; include deps used for heading/fetch
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: hrmsId/today/dateFmt
    [hrmsId, today, dateFmt]
  );

  const handleCalendarSelect = (iso: string) => {
    setCalendarDate(iso);
    void loadPlanForCalendarDate(iso);
  };

  /** Plan edit / confirm only for the day being confirmed (today or fetched miss date). */
  const viewingConfirmableDate = calendarDate === workDate;

  const loadMyDay = useCallback(async () => {
    try {
      const [missCount, existing, lines] = await Promise.all([
        fetchMissPostingCount(today.slice(0, 7)),
        fetchMyConfirmation(today),
        hrmsId
          ? fetchAllocations({ employeeHrmsId: hrmsId, from: today, to: today }).then(linesFromAllocations)
          : Promise.resolve([] as PlannedLine[]),
      ]);
      setMonthMissCount(missCount);
      if (existing) {
        const hydrated = hydrateFromConfirmation(existing);
        setActiveLines(hydrated.lines);
        setStates(hydrated.states);
        setUnplanned(hydrated.unplanned);
        setSubmitted(true);
        setSubmittedAtLabel(formatAppDateTime(existing.submittedAt, dateFmt));
        setPlanHeading("Your plan for today");
        setMissedPosting(existing.isMissedPosting);
        setMissReason(existing.missReason ?? "");
      } else {
        setActiveLines(lines);
        setStates(initLineStates(lines));
        setSubmitted(false);
      }
    } catch {
      setActiveLines(EMPTY_LINES);
      setStates(initLineStates(EMPTY_LINES));
    }
  }, [hrmsId, today, dateFmt]);

  useEffect(() => {
    void loadMyDay();
  }, [loadMyDay]);

  useSharedDataSync(submitted, loadMyDay, {
    resources: ["confirmations"],
    intervalMs: MASTER_TXN_SYNC_INTERVAL_MS,
  });
  usePauseSharedDataSync(!submitted);

  /** Reload today's plan lines while staying in edit mode (never bounce to submitted view). */
  const loadTodayPlanForEdit = async () => {
    setPlanHeading("Your plan for today");
    setFetchedMissDate("");
    setCalendarDate(today);
    setFetchError("");
    setSaveError("");
    setSubmitted(false);
    setSubmittedAtLabel("");
    try {
      const existing = await fetchMyConfirmation(today);
      if (existing) {
        const hydrated = hydrateFromConfirmation(existing);
        setActiveLines(hydrated.lines);
        setStates(hydrated.states);
        setUnplanned(hydrated.unplanned);
        return;
      }
      const lines = await loadPlanForDate(today);
      setActiveLines(lines);
      setStates(initLineStates(lines));
      setUnplanned([]);
    } catch {
      setActiveLines(EMPTY_LINES);
      setStates(initLineStates(EMPTY_LINES));
      setUnplanned([]);
    }
  };

  const handleMissedPostingChange = (checked: boolean) => {
    setMissedPosting(checked);
    setMissReason("");
    setMissDate("");
    setFetchError("");
    setFetchedMissDate("");
    if (!checked) {
      void loadTodayPlanForEdit();
    }
    // When enabling: stay on the edit screen — do not reload into "plan confirmed".
  };

  const handleFetch = async () => {
    setFetchError("");
    try {
      const existing = await fetchMyConfirmation(missDate);
      if (existing) {
        const hydrated = hydrateFromConfirmation(existing);
        setActiveLines(hydrated.lines);
        setStates(hydrated.states);
        setUnplanned(hydrated.unplanned);
        // Stay in edit mode — do not bounce to the confirmed summary screen.
        setSubmitted(false);
        setSubmittedAtLabel(formatAppDateTime(existing.submittedAt, dateFmt));
        setFetchedMissDate(missDate);
        setCalendarDate(missDate);
        setPlanHeading(`Your plan for ${formatPlanDate(missDate, dateFmt)}`);
        return;
      }
      const lines = await loadPlanForDate(missDate);
      if (lines.length === 0) {
        setFetchError("No plan found for this date. Try another day.");
        return;
      }
      setActiveLines(lines);
      setStates(initLineStates(lines));
      setUnplanned([]);
      setSubmitted(false);
      setSubmittedAtLabel("");
      setFetchedMissDate(missDate);
      setCalendarDate(missDate);
      setPlanHeading(`Your plan for ${formatPlanDate(missDate, dateFmt)}`);
    } catch (e) {
      setFetchError(e instanceof Error ? e.message : "Failed to load plan");
    }
  };

  const maxMissDate = (() => {
    const d = new Date(`${today}T12:00:00`);
    d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10);
  })();

  const setLine = (id: string, patch: Partial<LineState>) =>
    setStates((s) => ({ ...s, [id]: { ...s[id], ...patch } }));

  const deviationCount =
    activeLines.filter((l) => states[l.id]?.mode === "deviation").length + unplanned.length;
  const plannedTotal = activeLines.reduce((sum, l) => sum + l.plannedHours, 0);

  const sortedLines = useMemo(() => {
    const mul = lineSortDir === "asc" ? 1 : -1;
    return [...activeLines].sort((a, b) => {
      let cmp = 0;
      if (lineSortKey === "allocation") {
        cmp = `${a.project} ${a.milestone} ${a.activity}`.localeCompare(
          `${b.project} ${b.milestone} ${b.activity}`
        );
      } else if (lineSortKey === "tasks") {
        cmp = a.tasks.join(", ").localeCompare(b.tasks.join(", "));
      } else {
        const am = states[a.id]?.mode ?? "";
        const bm = states[b.id]?.mode ?? "";
        cmp = am.localeCompare(bm);
      }
      if (cmp !== 0) return mul * cmp;
      return a.id.localeCompare(b.id);
    });
  }, [activeLines, lineSortKey, lineSortDir, states]);

  const focusTimersAllStopped =
    !canUseProductivity || !hasAnyUnstoppedFocusSession(todayProd.focusByAllocation);

  /** Today: require Day Start before adding unplanned. Miss-posting past days: still allowed. */
  const blockUnplannedAdd =
    isTodayWorkDate && isUnplannedEntryBlocked(todayProd.workday);
  const unplannedAddBlockedReason = blockUnplannedAdd
    ? unplannedEntryBlockedReason(todayProd.workday)
    : undefined;

  const canSubmit =
    activeLines.length + unplanned.length > 0 &&
    activeLines.every((l) => states[l.id]?.mode === "planned" || states[l.id]?.reason !== "") &&
    unplanned.every((u) => u.project.trim() !== "" && u.reason !== "") &&
    focusTimersAllStopped;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    if (canUseProductivity && hasAnyUnstoppedFocusSession(todayProd.focusByAllocation)) {
      toast.error("Stop all focus timers before submitting confirmation.");
      return;
    }
    // Day-end: block "Confirm all as planned" when productive window < planned hours.
    if (canUseProductivity && deviationCount === 0) {
      const { productiveMs } = workdayDurationMs(todayProd.workday);
      if (isConfirmAllAsPlannedBlockedByProductiveWindow(productiveMs, plannedTotal)) {
        setSaveError(CONFIRM_AS_PLANNED_PRODUCTIVE_WINDOW_MESSAGE);
        toast.error(CONFIRM_AS_PLANNED_PRODUCTIVE_WINDOW_MESSAGE);
        return;
      }
    }
    setSaving(true);
    setSaveError("");
    try {
      const lines = [
        ...activeLines.map((l) => {
          const st = states[l.id];
          const isDev = st?.mode === "deviation";
          return {
            allocationId: l.id.startsWith("orphan-") ? null : l.id,
            projectLabel: l.project,
            milestoneLabel: l.milestone,
            activity: l.activity,
            plannedHours: l.plannedHours,
            actualHours: isDev ? st.actual : l.plannedHours,
            kind: (isDev ? "deviation" : "planned") as "planned" | "deviation",
            reason: isDev ? st.reason : "",
            tasks: l.tasks,
          };
        }),
        ...unplanned.map((u) => ({
          allocationId: null as string | null,
          projectLabel: u.project.trim(),
          milestoneLabel: "",
          activity: "Unplanned work",
          plannedHours: 0,
          actualHours: u.hours,
          kind: "unplanned" as const,
          reason: u.reason || "Unplanned work",
          tasks: [] as string[],
        })),
      ];
      const saved = await submitConfirmation({
        workDate,
        isMissedPosting: missedPosting && Boolean(fetchedMissDate),
        missReason: missedPosting ? missReason : null,
        lines,
      });
      setSubmitted(true);
      setSubmittedAtLabel(formatAppDateTime(saved.submittedAt, dateFmt));
      toast.created();
      const hours = computeConfirmationWorkHours(activeLines, states, unplanned);
      persistDay(workDate, {
        ...getDayProductivity(prodStore, workDate),
        workHours: hours,
      });
      if (saved.isMissedPosting) {
        setMonthMissCount(await fetchMissPostingCount(today.slice(0, 7)));
      }
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Failed to submit confirmation");
    } finally {
      setSaving(false);
    }
  };

  const productivitySidebar = (
    <aside className="flex w-full flex-shrink-0 flex-col gap-3 lg:w-[300px]">
      <WorkdayTimelinePanel
        marks={getDayProductivity(prodStore, calendarDate).workday}
        onStamp={stampWorkday}
        disabled={settingsLoading || !canUseProductivity || calendarDate !== workDate}
        disabledReason={
          settingsLoading
            ? undefined
            : !workingCalendar.ok
              ? workingCalendar.reason ?? "Unavailable"
              : calendarDate !== workDate
                ? "Select today to log times"
                : undefined
        }
        selectedDate={calendarDate}
        dateLabel={formatAppDate(calendarDate, dateFmt)}
      />
      <ConfirmationDayCalendar
        selectedDate={calendarDate}
        onSelectDate={handleCalendarSelect}
        dayMeta={calendarDayMeta}
        liveDate={workDate}
        liveWorkHours={liveWorkHours}
        liveFocusMs={canUseProductivity ? liveFocusMs : 0}
      />
    </aside>
  );

  if (submitted) {
    return (
      <div className="flex min-h-0 flex-1 overflow-y-auto overscroll-contain bg-background p-5">
        <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-4 lg:flex-row lg:items-start">
          <div className="min-w-0 flex-1">
            <div className="flex flex-col items-center rounded-lg border border-success-border bg-success-soft/50 px-6 py-8 text-center">
              <CheckCircle2 className="h-10 w-10 text-success" />
              <div className="mt-3 text-[16px] font-semibold text-foreground">
                {fetchedMissDate ? `Plan confirmed for ${formatPlanDate(fetchedMissDate, dateFmt)}` : "Today's plan confirmed"}
              </div>
              <div className="mt-1 text-[12px] text-muted-foreground">
                Submitted at {submittedAtLabel || "—"} ·{" "}
                {deviationCount > 0
                  ? `${deviationCount} deviation${deviationCount > 1 ? "s" : ""} logged`
                  : "All as planned"}
              </div>
            </div>
            <div className="mt-4 rounded-lg border border-border bg-surface">
              {activeLines.map((l, i) => {
                const st = states[l.id];
                const dev = st?.mode === "deviation";
                return (
                  <div key={l.id} className={`px-4 py-3 ${i > 0 ? "border-t border-border-soft" : ""}`}>
                    <div className="flex items-center gap-3">
                      <Check className="h-4 w-4 flex-shrink-0 text-success" />
                      <div className="flex-1">
                        <div className="text-[13px] font-medium text-foreground">
                          {l.project} · {l.milestone}
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                          {l.activity} · {l.plannedHours}h planned
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                          Allocated On · {formatPlanDate(l.allocatedOn, dateFmt)}
                        </div>
                        {l.tasks.length > 0 && (
                          <div className="mt-1.5 flex flex-wrap gap-1">
                            {l.tasks.map((task) => (
                              <span
                                key={task}
                                className="rounded-sm bg-accent-soft px-1.5 py-0.5 text-[10px] text-accent-softfg"
                              >
                                {task}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      {dev ? (
                        <span className="text-[12px] text-warning">
                          {l.plannedHours}h → <b>{st.actual}h</b>
                        </span>
                      ) : (
                        <span className="text-[12px] text-muted-foreground">{l.plannedHours}h as planned</span>
                      )}
                    </div>
                    {canUseProductivity && (
                      <AllocationFocusTimer
                        allocationId={l.id}
                        state={todayProd.focusByAllocation[l.id]}
                        isActiveRunner={todayProd.activeTimerId === l.id}
                        onStartPause={handleFocusStartPause}
                        onStop={handleFocusStop}
                        disabled
                      />
                    )}
                  </div>
                );
              })}
              {unplanned.map((u) => (
                <div key={u.id} className="flex items-center gap-3 border-t border-border-soft px-4 py-3">
                  <Check className="h-4 w-4 flex-shrink-0 text-success" />
                  <div className="flex-1">
                    <div className="text-[13px] font-medium text-foreground">{u.project}</div>
                    <div className="text-[11px] text-muted-foreground">Unplanned work</div>
                  </div>
                  <span className="text-[12px] text-warning">{u.hours}h</span>
                </div>
              ))}
            </div>
            <button
              onClick={() => setSubmitted(false)}
              className="mt-3 text-[12px] text-primary hover:underline"
            >
              Edit confirmation
            </button>
          </div>
          {productivitySidebar}
        </div>
      </div>
    );
  }
  return (
    <div className="flex min-h-0 flex-1 overflow-y-auto overscroll-contain bg-background p-5">
      <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-4 lg:flex-row lg:items-start">
      <div className="min-w-0 flex-1">
        <div className="mb-4 rounded-lg border border-border bg-surface px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <label className="flex cursor-pointer items-center gap-2.5">
              <input
                type="checkbox"
                checked={missedPosting}
                onChange={(e) => handleMissedPostingChange(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-border accent-primary"
              />
              <span className="text-[12px] font-medium text-foreground">I missed my previous day posting</span>
            </label>
            <span className="flex-shrink-0 whitespace-nowrap text-[11px] text-warning">
              Already missed {monthMissCount} {monthMissCount === 1 ? "time" : "times"} this month.
            </span>
          </div>

          {missedPosting && (
            <div className="mt-3 space-y-3 border-t border-border-soft pt-3">
              <div className="flex gap-3">
                <div className="w-1/2">
                  <div className="mb-1.5 text-[11px] font-medium text-muted">Reason for miss</div>
                  <FilterSelect
                    value={missReason}
                    onChange={(v) => {
                      setMissReason(v);
                      setMissDate("");
                      setFetchError("");
                      if (fetchedMissDate) void loadTodayPlanForEdit();
                    }}
                    options={MISS_POSTING_REASONS.map((r) => ({ value: r, label: r }))}
                    placeholder="Select a reason…"
                    aria-label="Reason for miss"
                  />
                </div>

                <div className="w-1/2">
                  <div className="mb-1.5 text-[11px] font-medium text-muted">Date to post</div>
                  <AppDateInput
                    value={missDate}
                    max={maxMissDate}
                    disabled={missReason === ""}
                    onChange={(v) => {
                      setMissDate(v);
                      setFetchError("");
                      if (fetchedMissDate) void loadTodayPlanForEdit();
                    }}
                    inputClassName="py-2 text-[12px] focus:border-accent-line disabled:bg-surface-alt disabled:text-muted-foreground"
                  />
                </div>
              </div>

              {missReason !== "" && missDate !== "" && (
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => void handleFetch()}
                    className="rounded-md border border-accent-line bg-accent-soft px-3.5 py-2 text-[12px] font-semibold text-primary hover:bg-accent-soft/80"
                  >
                    FETCH
                  </button>
                  {fetchError && <span className="text-[11px] text-danger">{fetchError}</span>}
                  {fetchedMissDate && !fetchError && (
                    <span className="text-[11px] text-success">
                      Loaded plan for {formatPlanDate(fetchedMissDate, dateFmt)}
                    </span>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="mb-3 flex items-baseline justify-between">
          <div className="text-[13px] font-semibold text-foreground">{planHeading}</div>
          <div className="text-[12px] text-muted-foreground">
            {plannedTotal}h planned across {activeLines.length} lines
          </div>
        </div>

        {activeLines.length === 0 && unplanned.length === 0 && (
          <div className="mb-3 rounded-lg border border-border bg-surface px-4 py-8 text-center text-[12px] text-muted-foreground">
            No allocations for this date — add one in Resource Planner, or log unplanned work below.
          </div>
        )}

        <div className="overflow-hidden rounded-lg border border-border bg-surface">
          <div className="flex flex-shrink-0 border-b border-border-soft bg-surface-alt px-4 py-2 text-[11px] font-semibold text-muted">
            <SortColHeader
              label="ALLOCATION"
              col="allocation"
              sortKey={lineSortKey}
              sortDir={lineSortDir}
              onSort={handleLineSort}
              className="flex-1"
            />
            <SortColHeader
              label="TASKS"
              col="tasks"
              sortKey={lineSortKey}
              sortDir={lineSortDir}
              onSort={handleLineSort}
              className="w-[220px]"
            />
            <SortColHeader
              label="STATUS"
              col="status"
              sortKey={lineSortKey}
              sortDir={lineSortDir}
              onSort={handleLineSort}
              className="w-[200px] flex-shrink-0 justify-end"
            />
          </div>
          {sortedLines.map((l, i) => (
            <LineRow
              key={l.id}
              line={l}
              state={states[l.id]}
              first={i === 0}
              onChange={(p) => setLine(l.id, p)}
              statusDisabled={!viewingConfirmableDate || submitted}
              showFocus={canUseProductivity}
              focusState={
                canUseProductivity ? viewProd.focusByAllocation[l.id] : undefined
              }
              isActiveRunner={
                canUseProductivity &&
                viewingConfirmableDate &&
                todayProd.activeTimerId === l.id
              }
              onFocusStartPause={
                canUseProductivity && viewingConfirmableDate ? handleFocusStartPause : undefined
              }
              onFocusStop={
                canUseProductivity && viewingConfirmableDate ? handleFocusStop : undefined
              }
              focusShowControls={viewingConfirmableDate}
              focusWorkDateIso={calendarDate}
              focusDayEndIso={viewProd.workday.dayEnd}
              focusDisabled={Boolean(todayProd.workday.dayEnd) || submitted}
              focusStartDisabled={isFocusStartBlocked(todayProd.workday)}
              focusStartDisabledReason={focusStartBlockedReason(todayProd.workday)}
            />
          ))}

          {unplanned.map((u) => (
            <div key={u.id} className="border-t border-border-soft bg-accent-soft/30 px-4 py-3">
              <div className="flex items-center justify-between">
                <div className="text-[12px] font-medium text-primary">Unplanned work</div>
                {viewingConfirmableDate && !submitted && (
                  <button
                    type="button"
                    onClick={() => setUnplanned((arr) => arr.filter((x) => x.id !== u.id))}
                    className="cursor-pointer text-muted-foreground hover:text-danger"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              <div className="mt-2 flex items-center gap-2">
                <input
                  placeholder="What did you work on?"
                  value={u.project}
                  disabled={!viewingConfirmableDate || submitted}
                  onChange={(e) =>
                    setUnplanned((arr) =>
                      arr.map((x) => (x.id === u.id ? { ...x, project: e.target.value } : x))
                    )
                  }
                  className="flex-1 rounded-md border border-border bg-surface px-2.5 py-1.5 text-[12px] text-foreground outline-none focus:border-accent-line disabled:bg-surface-alt disabled:text-muted-foreground"
                />
                <input
                  type="number"
                  step={0.5}
                  min={0}
                  value={u.hours}
                  disabled={!viewingConfirmableDate || submitted}
                  onChange={(e) =>
                    setUnplanned((arr) =>
                      arr.map((x) => (x.id === u.id ? { ...x, hours: Number(e.target.value) } : x))
                    )
                  }
                  className="w-[4.25rem] rounded-md border border-border bg-surface px-2.5 py-1.5 text-[12px] text-foreground outline-none focus:border-accent-line disabled:bg-surface-alt"
                />
                <span className="text-[11px] text-muted-foreground">h</span>
              </div>
            </div>
          ))}

          {viewingConfirmableDate && !submitted && (
          <button
            type="button"
            disabled={blockUnplannedAdd}
            title={unplannedAddBlockedReason}
            onClick={() => {
              if (blockUnplannedAdd) return;
              setUnplanned((arr) => [
                ...arr,
                { id: `u${Date.now()}`, project: "", hours: 1, reason: "logged" },
              ]);
            }}
            className={`flex w-full items-center gap-1.5 border-t border-dashed border-border px-4 py-2.5 text-[12px] ${
              blockUnplannedAdd
                ? "cursor-not-allowed text-muted-foreground opacity-50"
                : "cursor-pointer text-primary hover:bg-surface-alt"
            }`}
          >
            <Plus className="h-3.5 w-3.5" /> Add unplanned work
          </button>
          )}
        </div>

        {viewingConfirmableDate && saveError && (
          <div className="mt-2 text-[12px] text-danger">{saveError}</div>
        )}
        {!viewingConfirmableDate && (
          <div className="mt-2 text-[12px] text-muted-foreground">
            Viewing plan for {formatPlanDate(calendarDate, dateFmt)}. Select{" "}
            {workDate === today ? "today" : formatPlanDate(workDate, dateFmt)} to confirm or edit.
          </div>
        )}
        {viewingConfirmableDate &&
          canUseProductivity &&
          !focusTimersAllStopped &&
          activeLines.length + unplanned.length > 0 && (
            <div className="mt-2 text-[12px] text-warning">
              Stop all focus timers before submitting confirmation.
            </div>
          )}

        {viewingConfirmableDate && !submitted && (
        <div className="mt-4 flex items-center gap-3">
          <button
            disabled={!canSubmit || saving}
            onClick={() => void handleSubmit()}
            title={
              !focusTimersAllStopped
                ? "Stop all focus timers before submitting"
                : undefined
            }
            className={`flex items-center justify-center gap-2 rounded-md px-4 py-2.5 text-[13px] font-semibold ${
              deviationCount === 0 ? "flex-1 bg-primary text-primary-foreground" : "flex-1 bg-brand text-white"
            } ${!canSubmit || saving ? "cursor-not-allowed opacity-50" : ""}`}
          >
            <Check className="h-4 w-4" />
            {saving
              ? "Submitting…"
              : deviationCount === 0
                ? `Confirm all as planned · ${plannedTotal}h`
                : `Submit confirmation · ${deviationCount} deviation${deviationCount > 1 ? "s" : ""}`}
          </button>
        </div>
        )}
      </div>
      {productivitySidebar}
      </div>

      {dayEndConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
          <div
            className="absolute inset-0 bg-brand/50"
            onClick={() => setDayEndConfirmOpen(false)}
            aria-hidden
          />
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="day-end-alloc-title"
            aria-describedby="day-end-alloc-desc"
            className="relative z-10 w-full max-w-[420px] rounded-xl bg-surface p-5 text-center shadow-2xl"
          >
            <div className="flex justify-center">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-warning-soft">
                <Timer className="h-5 w-5 text-warning" />
              </div>
            </div>
            <div id="day-end-alloc-title" className="mt-3 text-[15px] font-semibold text-foreground">
              Allocation timer running
            </div>
            <div id="day-end-alloc-desc" className="mt-1.5 text-[13px] text-muted-foreground">
              Allocation timer is running. Log Out will stop all active timers, save lap(s), and update
              totals. Do you want to continue?
            </div>
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => setDayEndConfirmOpen(false)}
                className="flex-1 cursor-pointer rounded-md border border-border py-2 text-[13px] text-foreground hover:bg-surface-alt"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDayEndWithAllocationStop}
                className="flex-1 cursor-pointer rounded-md bg-primary py-2 text-[13px] font-medium text-primary-foreground hover:bg-brand-active"
              >
                Yes, Continue
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function LineRow({
  line,
  state,
  first,
  onChange,
  statusDisabled = false,
  showFocus = false,
  focusState,
  isActiveRunner,
  onFocusStartPause,
  onFocusStop,
  focusShowControls = true,
  focusWorkDateIso,
  focusDayEndIso,
  focusDisabled = false,
  focusStartDisabled = false,
  focusStartDisabledReason,
}: {
  line: PlannedLine;
  state: LineState | undefined;
  first: boolean;
  onChange: (p: Partial<LineState>) => void;
  statusDisabled?: boolean;
  showFocus?: boolean;
  focusState?: FocusAllocationState;
  isActiveRunner?: boolean;
  onFocusStartPause?: (allocationId: string) => void;
  onFocusStop?: (allocationId: string) => void;
  /** Past-date browse: show Total + laps without Start/Pause/Stop. */
  focusShowControls?: boolean;
  focusWorkDateIso?: string;
  focusDayEndIso?: string | null;
  focusDisabled?: boolean;
  focusStartDisabled?: boolean;
  focusStartDisabledReason?: string;
}) {
  const { settings } = useSettings();
  const dateFmt = settings.dateFormat ?? "dd/MM/yyyy";
  const st = state ?? { mode: "planned" as const, actual: line.plannedHours, reason: "" };
  const dev = st.mode === "deviation";
  return (
    <div className={`px-4 py-3 ${first ? "" : "border-t border-border-soft"} ${dev ? "bg-warning-soft/30" : ""}`}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-medium text-foreground">
            {line.project} · {line.milestone}
          </div>
          <div className="text-[11px] text-muted-foreground">
            {line.activity} · {line.plannedHours}h planned
          </div>
          <div className="text-[11px] text-muted-foreground">
            Allocated On · {formatPlanDate(line.allocatedOn, dateFmt)}
          </div>
          {showFocus && (
            <AllocationFocusTimer
              allocationId={line.id}
              state={focusState}
              isActiveRunner={!!isActiveRunner}
              onStartPause={onFocusStartPause}
              onStop={onFocusStop}
              showControls={focusShowControls}
              workDateIso={focusWorkDateIso}
              dayEndIso={focusDayEndIso}
              disabled={focusDisabled}
              startDisabled={focusStartDisabled}
              startDisabledReason={focusStartDisabledReason}
            />
          )}
        </div>
        <div className="w-[220px] flex-shrink-0">
          {line.tasks.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {line.tasks.map((task) => (
                <span key={task} className="rounded-sm bg-accent-soft px-1.5 py-0.5 text-[10px] text-accent-softfg">
                  {task}
                </span>
              ))}
            </div>
          ) : (
            <span className="text-[11px] text-muted-foreground">—</span>
          )}
        </div>
        <div className="flex w-[200px] flex-shrink-0 justify-end">
          <div className="inline-flex overflow-hidden rounded-md border border-border text-[11px]">
            <button
              type="button"
              disabled={statusDisabled}
              onClick={() => onChange({ mode: "planned" })}
              className={`whitespace-nowrap px-2.5 py-1 ${
                statusDisabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"
              } ${!dev ? "bg-success text-white" : "text-muted"}`}
            >
              As planned
            </button>
            <button
              type="button"
              disabled={statusDisabled}
              onClick={() => onChange({ mode: "deviation" })}
              className={`whitespace-nowrap px-2.5 py-1 ${
                statusDisabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"
              } ${dev ? "bg-warning text-white" : "text-muted"}`}
            >
              Deviation
            </button>
          </div>
        </div>
      </div>
      {dev && (
        <div className="mt-2.5 flex gap-2">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-muted-foreground">Actual</span>
            <input
              type="number"
              step={0.5}
              min={0}
              value={st.actual}
              disabled={statusDisabled}
              onChange={(e) => onChange({ actual: Number(e.target.value) })}
              className="w-[4.25rem] rounded-md border border-border bg-surface px-2 py-1.5 text-[12px] text-foreground outline-none focus:border-accent-line disabled:bg-surface-alt"
            />
            <span className="text-[11px] text-muted-foreground">h</span>
          </div>
          <FilterSelect
            value={st.reason}
            disabled={statusDisabled}
            onChange={(v) => onChange({ reason: v })}
            options={DEVIATION_REASONS.map((r) => ({ value: r, label: r }))}
            placeholder="Reason for deviation…"
            aria-label="Reason for deviation"
            className="flex-1"
          />
        </div>
      )}
    </div>
  );
}

/* ---------------- Manager view ---------------- */

const DAY_DOT: Record<DayStatus, string> = {
  /** Conf. — solid success green */
  confirmed: "bg-success",
  /** CD — lighter green fill */
  confirmed_delayed: "bg-success/40",
  /** Devi. — solid warning/amber (deviation or unplanned, on-time) */
  deviation: "bg-warning",
  /** DD — solid danger red (deviation/unplanned + delayed) */
  deviation_delayed: "bg-danger",
  /** Pending — red ring, soft fill */
  pending: "border-2 border-danger bg-danger-soft",
  /** Leave / no plan */
  leave: "border border-border bg-surface",
  /** Future */
  future: "border border-dashed border-border bg-surface",
};

const COMPLIANCE_STATUS_LEGEND: {
  short: string;
  full: string;
  dot: string;
}[] = [
  { short: "Conf.", full: "Confirmed", dot: DAY_DOT.confirmed },
  { short: "CD", full: "Confirmed but Delayed", dot: DAY_DOT.confirmed_delayed },
  { short: "Devi.", full: "Deviation / unplanned (on time)", dot: DAY_DOT.deviation },
  { short: "DD", full: "Deviation / unplanned and Delayed", dot: DAY_DOT.deviation_delayed },
  { short: "Pending", full: "Pending", dot: DAY_DOT.pending },
  { short: "Leave", full: "No plan / leave", dot: DAY_DOT.leave },
];

const STATUS_FULL_LABEL: Record<DayStatus, string> = {
  confirmed: "Confirmed",
  confirmed_delayed: "Confirmed but Delayed",
  deviation: "Deviation / unplanned",
  deviation_delayed: "Deviation / unplanned and Delayed",
  pending: "Pending",
  leave: "No plan / leave",
  future: "Future",
};

function todayLabelClass(status: DayStatus) {
  if (status === "pending") return "text-danger";
  if (status === "deviation_delayed") return "text-danger";
  if (status === "deviation") return "text-red-400";
  if (status === "confirmed_delayed") return "text-green-600";
  if (status === "leave") return "text-muted-foreground";
  return "text-muted-foreground";
}

function ManagerCompliance() {
  const navigate = useNavigate();
  const toast = useToast();
  const { currentEmployee } = useAuth();
  const { settings } = useSettings();
  const today = todayISO();
  const [kpis, setKpis] = useState({
    confirmedPct: 0,
    confirmedCount: 0,
    team: 0,
    pending: 0,
    deviations: 0,
    onLeave: 0,
  });
  const [rows, setRows] = useState<ComplianceRow[]>([]);
  const [deviations, setDeviations] = useState<DeviationEntry[]>([]);
  const [error, setError] = useState("");
  const [remindingId, setRemindingId] = useState<string | null>(null);
  const {
    sortKey: complianceSortKey,
    sortDir: complianceSortDir,
    handleSort: handleComplianceSort,
  } = useColumnSort<"member" | "today">("member");

  const loadTeam = useCallback(async () => {
    try {
      const res = await fetchTeamCompliance({ asOf: today });
      const visible = res.rows.filter((r) => {
        const n = r.name?.trim().toLowerCase() ?? "";
        if (n === "administrator" || r.id === "EMP-0001") return false;
        return true;
      });
      const todayStatuses = visible.map((r) => r.todayStatus);
      const confirmedCount = todayStatuses.filter((s) =>
        s === "confirmed" || s === "confirmed_delayed"
      ).length;
      const pending = todayStatuses.filter((s) => s === "pending").length;
      const deviationsCount = todayStatuses.filter(
        (s) => s === "deviation" || s === "deviation_delayed"
      ).length;
      const onLeave = todayStatuses.filter((s) => s === "leave").length;
      const team = visible.length;
      setKpis({
        confirmedPct: team > 0 ? Math.round((confirmedCount / team) * 100) : 0,
        confirmedCount,
        team,
        pending,
        deviations: deviationsCount,
        onLeave,
      });
      setRows(
        visible.map((r) => ({
          id: r.id,
          name: r.name,
          initials: r.initials,
          role: r.role,
          week: r.week as DayStatus[],
          todayLabel: r.todayLabel,
        }))
      );
      const visibleNames = new Set(visible.map((r) => r.name));
      setDeviations(
        res.deviations
          .filter((d) => visibleNames.has(d.name))
          .map((d) => {
          const fallback = (res.asOf || today).slice(0, 10);
          const workRaw = String(d.workDate ?? "").trim();
          const addedRaw = String(d.addedAt ?? "").trim();
          const workDate = (workRaw.match(/^(\d{4}-\d{2}-\d{2})/)?.[1] || fallback) as string;
          const addedAt = (addedRaw.match(/^(\d{4}-\d{2}-\d{2})/)?.[1] || workDate) as string;
          return {
            id: d.id,
            name: d.name,
            initials: d.initials,
            line: d.line,
            planned: d.planned,
            actual: d.actual,
            reason: d.reason,
            workDate,
            addedAt,
          };
        })
      );
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load team compliance");
    }
  }, [today, currentEmployee?.id]);

  useEffect(() => {
    void loadTeam();
  }, [loadTeam]);

  useSharedDataSync(true, loadTeam, {
    resources: ["confirmations"],
    intervalMs: MASTER_TXN_SYNC_INTERVAL_MS,
  });

  const days = useMemo(
    () => workingDayHeaderLetters(settings.workingDays),
    [settings.workingDays]
  );
  const todayIndex = useMemo(() => {
    const weekDates = workingDatesInWeek(weekStartMonday(today), settings.workingDays);
    return weekDates.indexOf(today);
  }, [today, settings.workingDays]);

  const sortedCompliance = useMemo(() => {
    const mul = complianceSortDir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      let cmp = 0;
      if (complianceSortKey === "member") cmp = a.name.localeCompare(b.name);
      else cmp = a.todayLabel.localeCompare(b.todayLabel);
      if (cmp !== 0) return mul * cmp;
      return a.name.localeCompare(b.name);
    });
  }, [rows, complianceSortKey, complianceSortDir]);

  const handleRemind = async (row: ComplianceRow) => {
    if (remindingId) return;
    setRemindingId(row.id);
    try {
      const res = await remindConfirmation({ employeeHrmsId: row.id, workDate: today });
      toast.success(res.message || `Reminder sent to ${row.name}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to send reminder");
    } finally {
      setRemindingId(null);
    }
  };

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-background p-5">
      {error && <div className="mb-3 text-[12px] text-danger">{error}</div>}
      <div className="grid flex-shrink-0 grid-cols-4 gap-3">
        <Kpi
          label="Confirmed today"
          value={`${kpis.confirmedPct}%`}
          sub={`${kpis.confirmedCount} of ${kpis.team}`}
          accent="border-l-success"
          valueClass="text-foreground"
        />
        <Kpi label="Pending" value={kpis.pending} sub="not yet confirmed" accent="border-l-danger" valueClass="text-danger" />
        <Kpi label="Deviations" value={kpis.deviations} sub="reported today" accent="border-l-warning" valueClass="text-warning" />
        <Kpi label="On leave" value={kpis.onLeave} sub="excluded from %" />
      </div>

      <div className="mt-4 grid min-h-0 flex-1 grid-cols-[1.4fr_1fr] gap-4">
        <section className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-surface">
          <div className="flex flex-shrink-0 items-center justify-between border-b border-border-soft px-4 py-3">
            <div className="text-[13px] font-semibold text-foreground">This week</div>
            <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
              {COMPLIANCE_STATUS_LEGEND.map((item) => (
                <Legend key={item.short} dot={item.dot} label={item.short} title={item.full} />
              ))}
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            <div className="sticky top-0 z-10 flex items-center border-b border-border-soft bg-surface-alt px-4 py-2 text-[11px] font-semibold text-muted">
              <div className="min-w-0 flex-1">
                <SortColHeader
                  label="TEAM MEMBER"
                  col="member"
                  sortKey={complianceSortKey}
                  sortDir={complianceSortDir}
                  onSort={handleComplianceSort}
                />
              </div>
              <div className={complianceWeekGridClass(days.length)}>
                {days.map((d, i) => (
                  <span key={i} className={i === todayIndex ? "text-foreground" : ""}>
                    {d}
                  </span>
                ))}
              </div>
              <div className="flex w-[120px] shrink-0 justify-end">
                <SortColHeader
                  label="TODAY"
                  col="today"
                  sortKey={complianceSortKey}
                  sortDir={complianceSortDir}
                  onSort={handleComplianceSort}
                />
              </div>
            </div>
            {sortedCompliance.map((r) => (
              <ComplianceRowView
                key={r.id}
                row={r}
                todayIndex={todayIndex}
                weekDayCount={days.length}
                reminding={remindingId === r.id}
                onRemind={() => void handleRemind(r)}
              />
            ))}
            {sortedCompliance.length === 0 && (
              <div className="px-4 py-10 text-center text-[13px] text-muted-foreground">
                No team members report to you yet
              </div>
            )}
          </div>
        </section>

        <section className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-surface">
          <div className="flex flex-shrink-0 items-center justify-between border-b border-border-soft px-4 py-3">
            <div className="text-[13px] font-semibold text-foreground">Deviation feed</div>
            <span className="text-[11px] text-muted-foreground">auto-accepted</span>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            {deviations.map((d) => (
              <DeviationRow key={d.id} d={d} />
            ))}
            {deviations.length === 0 && (
              <div className="px-4 py-8 text-center text-[12px] text-muted-foreground">No deviations today</div>
            )}
          </div>
          <button
            onClick={() => navigate("/utilization")}
            className="flex-shrink-0 border-t border-border-soft px-4 py-2.5 text-left text-[11px] text-primary hover:bg-surface-alt"
          >
            Repeated deviations may signal misallocation — check Utilization →
          </button>
        </section>
      </div>
    </div>
  );
}

function ComplianceRowView({
  row,
  todayIndex,
  weekDayCount,
  reminding,
  onRemind,
}: {
  row: ComplianceRow;
  todayIndex: number;
  weekDayCount: number;
  reminding: boolean;
  onRemind: () => void;
}) {
  const todayStatus = row.week[todayIndex] ?? "pending";
  const pending = todayStatus === "pending";
  const onLeave = todayStatus === "leave";
  return (
    <div className="flex items-center border-b border-border-soft px-4 py-2.5 last:border-b-0">
      <div className="flex flex-1 items-center gap-2.5">
        <div
          className={`flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-semibold ${
            onLeave ? "bg-surface-alt text-muted" : "bg-accent-soft text-accent-softfg"
          }`}
        >
          {row.initials}
        </div>
        <div>
          <div className="text-[12px] font-medium text-foreground">{row.name}</div>
          <div className={`text-[10px] ${todayLabelClass(todayStatus)}`}>{row.todayLabel}</div>
        </div>
      </div>
      <div className={complianceWeekGridClass(weekDayCount)}>
        {row.week.map((s, i) => (
          <span
            key={i}
            title={STATUS_FULL_LABEL[s]}
            className={`h-3.5 w-3.5 rounded-full ${DAY_DOT[s]} ${
              i === todayIndex ? "ring-2 ring-brand/30 ring-offset-1" : ""
            }`}
          />
        ))}
      </div>
      <div className="w-[120px] shrink-0 text-right">
        {pending && (
          <button
            type="button"
            onClick={onRemind}
            disabled={reminding}
            className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-accent-line px-2 py-1 text-[11px] text-primary hover:bg-accent-soft disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Bell className="h-3 w-3" /> {reminding ? "Sending…" : "Remind"}
          </button>
        )}
      </div>
    </div>
  );
}

function DeviationRow({ d }: { d: DeviationEntry }) {
  const { formatDate } = useAppDateFormat();
  const dir = d.actual < d.planned;
  const dateLabel = formatDate(d.addedAt || d.workDate);
  return (
    <div className="flex items-start gap-2.5 border-b border-border-soft px-4 py-3 last:border-b-0">
      <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-warning-soft text-[10px] font-semibold text-warning">
        {d.initials}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <div className="truncate text-[12px] font-medium text-foreground">{d.name}</div>
          <div className="shrink-0 text-[10px] tabular-nums text-muted-foreground">{dateLabel}</div>
        </div>
        <div className="text-[11px] text-muted-foreground">{d.line}</div>
        <div className="mt-1 text-[11px]">
          <span className="text-muted-foreground">{d.planned}h → </span>
          <span className={dir ? "font-semibold text-danger" : "font-semibold text-success"}>{d.actual}h</span>
          <span className="text-muted-foreground"> · {d.reason}</span>
        </div>
      </div>
    </div>
  );
}

function Kpi({
  label,
  value,
  sub,
  accent,
  valueClass,
}: {
  label: string;
  value: string | number;
  sub?: string;
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
      <div className={`text-[23px] font-semibold ${valueClass ?? "text-foreground"}`}>{value}</div>
      {sub && <div className="mt-0.5 text-[11px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

function Legend({ dot, label, title }: { dot: string; label: string; title: string }) {
  return (
    <Tooltip label={title}>
      <span className="flex cursor-default items-center gap-1">
        <span className={`h-2.5 w-2.5 rounded-full ${dot}`} />
        {label}
      </span>
    </Tooltip>
  );
}
