import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Pause, Play, Square } from "lucide-react";
import {
  WORKDAY_ACTIONS,
  type DayProductivity,
  type FocusAllocationState,
  type WorkdayMarkKey,
  canStampWorkdayAction,
  emptyFocusState,
  focusElapsedMs,
  formatClockAmPm,
  formatCompactDuration,
  formatHms,
  monthDays,
  nextWorkdayActionKey,
  sessionDisplayMs,
  workdayDurationMs,
} from "../utils/confirmationProductivity";

/* ─── Workday Timeline ───────────────────────────────────────────────────── */

export function WorkdayTimelinePanel({
  marks,
  onStamp,
  disabled = false,
  disabledReason,
}: {
  marks: DayProductivity["workday"];
  onStamp: (key: WorkdayMarkKey) => void;
  /** When true (e.g. company holiday), all actions stay disabled. */
  disabled?: boolean;
  disabledReason?: string;
}) {
  const { officeMs, productiveMs } = workdayDurationMs(marks);
  const nextKey = disabled ? null : nextWorkdayActionKey(marks);

  return (
    <div
      className={`rounded-lg border border-border bg-surface p-3 shadow-sm ${
        disabled ? "opacity-70" : ""
      }`}
    >
      <div className="mb-2.5 flex items-baseline justify-between gap-2">
        <div className="text-[12px] font-semibold text-foreground">Workday Timeline</div>
        <div className="text-[11px] text-muted-foreground">
          {disabled ? disabledReason || "Unavailable" : "Today"}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {WORKDAY_ACTIONS.map(({ key, label }) => {
          const stamped = !!marks[key];
          const isNext = nextKey === key;
          const enabled = !disabled && isNext;
          return (
            <button
              key={key}
              type="button"
              disabled={!enabled}
              onClick={() => {
                if (disabled || !canStampWorkdayAction(marks, key)) return;
                onStamp(key);
              }}
              className={`relative rounded-md border px-2.5 py-2.5 pb-6 text-left transition-colors ${
                stamped
                  ? "cursor-default border-border-soft bg-surface-alt"
                  : enabled
                    ? "cursor-pointer border-border bg-surface hover:border-accent-line hover:bg-accent-soft/40"
                    : "cursor-not-allowed border-border-soft bg-surface opacity-60"
              }`}
            >
              <div className="text-[10px] font-semibold uppercase tracking-wide text-muted">
                {label}
              </div>
              <div
                className={`mt-1 text-[13px] font-semibold tabular-nums ${
                  stamped ? "text-foreground" : "text-muted-foreground"
                }`}
              >
                {formatClockAmPm(marks[key])}
              </div>
              {stamped ? (
                <span
                  className="absolute bottom-1.5 right-1.5 inline-flex h-5 w-5 items-center justify-center rounded-sm border border-border-soft bg-surface text-muted-foreground opacity-50"
                  aria-hidden
                  title="Completed"
                >
                  <Square className="h-2.5 w-2.5 fill-current" />
                </span>
              ) : isNext ? (
                <span
                  className="absolute bottom-1.5 right-1.5 inline-flex h-5 w-5 items-center justify-center rounded-sm bg-primary text-white"
                  aria-hidden
                  title="Next action"
                >
                  <Play className="h-2.5 w-2.5 fill-current" />
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
      <div className="mt-3 space-y-1.5 border-t border-border-soft pt-2.5">
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-muted-foreground">Total Office Time</span>
          <span className="font-medium tabular-nums text-foreground">
            {formatCompactDuration(officeMs)}
          </span>
        </div>
        <div className="flex items-center justify-between rounded-md bg-accent-soft px-2.5 py-1.5 text-[11px]">
          <span className="text-accent-softfg">Productive Window</span>
          <span className="font-semibold tabular-nums text-primary">
            {formatCompactDuration(productiveMs)}
          </span>
        </div>
      </div>
    </div>
  );
}

/* ─── Focus Timer (per allocation) ───────────────────────────────────────── */

export function AllocationFocusTimer({
  allocationId,
  state,
  isActiveRunner,
  onStartPause,
  onStop,
}: {
  allocationId: string;
  state: FocusAllocationState | undefined;
  isActiveRunner: boolean;
  onStartPause: (allocationId: string) => void;
  onStop: (allocationId: string) => void;
}) {
  const st = state ?? emptyFocusState();
  const running = !!st.segmentStartedAt;
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [running]);

  const sessionMs = sessionDisplayMs(st, now);
  const totalMs = focusElapsedMs(st, now);
  const stopDisabled = !running && st.sessionAccumMs <= 0;
  // Started (running) → mint · Paused (session open) → cream · Stopped (Stop disabled) → cool gray
  const tint = running
    ? "border-success-border bg-success-soft"
    : !stopDisabled
      ? "border-warning-border bg-warning-soft"
      : "border-border-soft bg-[#F8F9FC]";

  return (
    <div className={`mt-2.5 max-w-[380px] rounded-md border px-2.5 py-2 ${tint}`}>
      <div className="flex items-center gap-2">
        <div className="inline-flex flex-shrink-0 overflow-hidden rounded-md border border-border">
          <button
            type="button"
            onClick={() => onStartPause(allocationId)}
            aria-label={running ? "Pause" : "Start"}
            title={running ? "Pause" : "Start"}
            className={`inline-flex h-8 w-9 cursor-pointer items-center justify-center text-white ${
              running ? "bg-warning hover:brightness-95" : "bg-primary hover:brightness-95"
            }`}
          >
            {running ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5 fill-current" />}
          </button>
          <button
            type="button"
            onClick={() => onStop(allocationId)}
            disabled={stopDisabled}
            aria-label="Stop"
            title="Stop · complete lap"
            className="inline-flex h-8 w-9 cursor-pointer items-center justify-center border-l border-border bg-surface text-danger hover:bg-danger-soft disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Square className="h-3 w-3 fill-current" />
          </button>
        </div>
        <div className="font-mono text-[14px] font-bold tabular-nums tracking-tight text-foreground">
          {formatHms(sessionMs)}
        </div>
        <div className="ml-auto flex-shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground">
          Total {formatHms(totalMs)}
        </div>
      </div>
      {st.laps.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {st.laps.map((lap) => (
            <span
              key={lap.id}
              className="rounded border border-border-soft bg-surface px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-muted-foreground"
            >
              {formatHms(lap.durationMs)}
            </span>
          ))}
        </div>
      )}
      {!isActiveRunner && running === false && st.laps.length === 0 && st.sessionAccumMs === 0 && (
        <div className="sr-only">Focus timer unused · 00:00:00</div>
      )}
    </div>
  );
}

/* ─── Month calendar summary ─────────────────────────────────────────────── */

export function ConfirmationDayCalendar({
  selectedDate,
  onSelectDate,
  dayMeta,
  liveDate,
  liveWorkHours,
  liveFocusMs,
}: {
  selectedDate: string;
  onSelectDate: (iso: string) => void;
  /** Per-day stored meta */
  dayMeta: Record<string, { workHours: number; focusMs: number }>;
  /** Date whose live (in-progress) hours/focus should be shown when selected */
  liveDate: string;
  liveWorkHours: number;
  liveFocusMs: number;
}) {
  const selected = useMemo(() => new Date(`${selectedDate}T12:00:00`), [selectedDate]);
  const [viewYear, setViewYear] = useState(selected.getFullYear());
  const [viewMonth, setViewMonth] = useState(selected.getMonth());

  useEffect(() => {
    setViewYear(selected.getFullYear());
    setViewMonth(selected.getMonth());
  }, [selected]);

  const cells = useMemo(() => monthDays(viewYear, viewMonth), [viewYear, viewMonth]);
  const monthLabel = new Date(viewYear, viewMonth, 1).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  const shiftMonth = (delta: number) => {
    const d = new Date(viewYear, viewMonth + delta, 1);
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
  };

  const selectedMeta = dayMeta[selectedDate];
  const workHours =
    selectedDate === liveDate ? liveWorkHours : (selectedMeta?.workHours ?? 0);
  const focusMs = selectedDate === liveDate ? liveFocusMs : (selectedMeta?.focusMs ?? 0);

  return (
    <div className="rounded-lg border border-border bg-surface p-3 shadow-sm">
      <div className="mb-2 flex items-center justify-between">
        <button
          type="button"
          onClick={() => shiftMonth(-1)}
          className="rounded p-1 text-muted-foreground hover:bg-surface-alt hover:text-foreground"
          aria-label="Previous month"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="text-[12px] font-semibold text-foreground">{monthLabel}</div>
        <button
          type="button"
          onClick={() => shiftMonth(1)}
          className="rounded p-1 text-muted-foreground hover:bg-surface-alt hover:text-foreground"
          aria-label="Next month"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
      <div className="mb-1 grid grid-cols-7 gap-0.5 text-center text-[9px] font-medium text-muted-foreground">
        {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
          <div key={d}>{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {cells.map((iso, idx) => {
          if (!iso) return <div key={`e-${idx}`} className="h-9" />;
          const dayNum = Number(iso.slice(8, 10));
          const isSelected = iso === selectedDate;
          const hasData =
            (dayMeta[iso]?.workHours ?? 0) > 0 ||
            (dayMeta[iso]?.focusMs ?? 0) > 0 ||
            (iso === liveDate && (liveWorkHours > 0 || liveFocusMs > 0));
          return (
            <button
              key={iso}
              type="button"
              onClick={() => onSelectDate(iso)}
              className={`relative flex h-9 flex-col items-center justify-center rounded-md text-[11px] ${
                isSelected
                  ? "bg-brand font-semibold text-white"
                  : "text-foreground hover:bg-surface-alt"
              }`}
            >
              <span className="leading-none">{dayNum}</span>
              {hasData && (
                <span
                  className={`mt-0.5 h-1 w-1 rounded-full ${
                    isSelected ? "bg-white" : "bg-primary"
                  }`}
                />
              )}
            </button>
          );
        })}
      </div>
      <div className="mt-3 space-y-1.5 border-t border-border-soft pt-2.5">
        <div className="text-[12px] font-semibold text-foreground">
          {selectedDate === todayIsoLocal() ? "Today" : formatDayHeading(selectedDate)}
        </div>
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-muted-foreground">Total (Planned/Unplan.) Work Hours</span>
          <span className="font-medium tabular-nums text-foreground">
            {formatHoursLabel(workHours)}
          </span>
        </div>
        <div className="flex items-center justify-between rounded-md bg-accent-soft px-2.5 py-1.5 text-[11px]">
          <span className="text-accent-softfg">Total Focus Time</span>
          <span className="font-semibold tabular-nums text-primary">
            {formatCompactDuration(focusMs)}
          </span>
        </div>
      </div>
    </div>
  );
}

function formatHoursLabel(hours: number): string {
  if (!hours || hours <= 0) return "00:00";
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function formatDayHeading(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function todayIsoLocal() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
