import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Pause, Play, Square } from "lucide-react";
import { useSettings } from "../context/SettingsContext";
import { formatAppDate } from "../utils/formatAppDate";
import {
  WORKDAY_ACTIONS,
  type DayProductivity,
  type FocusAllocationState,
  type WorkdayMarkKey,
  allowedWorkdayActionKeys,
  canStampWorkdayAction,
  emptyFocusState,
  focusElapsedMs,
  formatClockAmPm,
  formatCompactDuration,
  formatHms,
  isLunchSkipped,
  monthDays,
  sessionDisplayMs,
  workdayDurationMs,
} from "../utils/confirmationProductivity";

/* ─── Workday Timeline ───────────────────────────────────────────────────── */

export function WorkdayTimelinePanel({
  marks,
  onStamp,
  disabled = false,
  disabledReason,
  selectedDate,
  dateLabel,
}: {
  marks: DayProductivity["workday"];
  onStamp: (key: WorkdayMarkKey) => void;
  /** When true (e.g. company holiday), all actions stay disabled. */
  disabled?: boolean;
  disabledReason?: string;
  /** ISO date shown in the timeline header (from calendar selection). */
  selectedDate?: string;
  dateLabel?: string;
}) {
  const { settings } = useSettings();
  const dateFmt = settings.dateFormat ?? "dd/MM/yyyy";
  const { officeMs, productiveMs } = workdayDurationMs(marks);
  const allowed = disabled ? [] : allowedWorkdayActionKeys(marks);
  const lunchSkipped = isLunchSkipped(marks);
  const heading =
    dateLabel ||
    formatAppDate(selectedDate || todayIsoLocal(), dateFmt);

  return (
    <div
      className={`rounded-lg border border-border bg-surface p-3 shadow-sm ${
        disabled ? "opacity-70" : ""
      }`}
      title={disabled && disabledReason ? disabledReason : undefined}
      aria-disabled={disabled || undefined}
    >
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <div className="text-[12px] font-semibold text-foreground">Workday Timeline</div>
        <div className="text-[11px] text-muted-foreground">
          {heading}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        {WORKDAY_ACTIONS.map(({ key, label }) => {
          const stamped = !!marks[key];
          const isLunchStep = key === "lunchOut" || key === "lunchIn";
          const skipped = isLunchStep && lunchSkipped;
          const isAllowed = allowed.includes(key);
          const enabled = !disabled && isAllowed;
          const stepHint =
            isLunchStep && key === "lunchIn" && marks.lunchOut && !marks.lunchIn
              ? "Required"
              : null;

          return (
            <button
              key={key}
              type="button"
              disabled={!enabled}
              onClick={() => {
                if (disabled || !canStampWorkdayAction(marks, key)) return;
                onStamp(key);
              }}
              className={`rounded-md border px-2 py-1 text-left transition-colors ${
                stamped
                  ? "cursor-default border-border-soft bg-surface-alt"
                  : skipped
                    ? "cursor-default border-dashed border-border-soft bg-surface-alt/50"
                    : enabled
                      ? "cursor-pointer border-border bg-surface hover:border-accent-line hover:bg-accent-soft/40"
                      : "cursor-not-allowed border-border-soft bg-surface opacity-60"
              }`}
            >
              <div className="flex items-center justify-between gap-1">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-muted">
                  {label}
                </div>
                {stepHint && (
                  <span className="text-[9px] font-medium uppercase tracking-wide text-muted-foreground">
                    {stepHint}
                  </span>
                )}
                {skipped && (
                  <span className="text-[9px] font-medium uppercase tracking-wide text-muted-foreground">
                    Skipped
                  </span>
                )}
              </div>
              <div className="mt-0.5 flex items-center justify-between gap-1">
                <div
                  className={`text-[13px] font-semibold tabular-nums ${
                    stamped
                      ? "text-foreground"
                      : skipped
                        ? "text-muted-foreground"
                        : "text-muted-foreground"
                  }`}
                >
                  {skipped ? "—" : formatClockAmPm(marks[key])}
                </div>
                {stamped ? (
                  <span
                    className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border border-border-soft bg-surface text-muted-foreground opacity-50"
                    aria-hidden
                    title="Completed"
                  >
                    <Square className="h-2 w-2 fill-current" />
                  </span>
                ) : skipped ? null : isAllowed ? (
                  <span
                    className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-sm bg-primary text-white"
                    aria-hidden
                    title="Available action"
                  >
                    <Play className="h-2 w-2 fill-current" />
                  </span>
                ) : null}
              </div>
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
  disabled = false,
}: {
  allocationId: string;
  state: FocusAllocationState | undefined;
  isActiveRunner: boolean;
  onStartPause: (allocationId: string) => void;
  onStop: (allocationId: string) => void;
  /** When true (e.g. confirmation already submitted), Start/Pause/Stop are locked. */
  disabled?: boolean;
}) {
  const st = state ?? emptyFocusState();
  const running = !!st.segmentStartedAt;
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!running || disabled) return;
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [running, disabled]);

  const sessionMs = sessionDisplayMs(st, now);
  const totalMs = focusElapsedMs(st, now);
  const stopDisabled = disabled || (!running && st.sessionAccumMs <= 0);
  // Started (running) → mint · Paused (session open) → cream · Stopped (Stop disabled) → cool gray
  const tint = running && !disabled
    ? "border-success-border bg-success-soft"
    : !stopDisabled && !disabled
      ? "border-warning-border bg-warning-soft"
      : "border-border-soft bg-[#F8F9FC]";

  return (
    <div className={`mt-2.5 max-w-[380px] rounded-md border px-2.5 py-2 ${tint}`}>
      <div className="flex items-center gap-2">
        <div className="inline-flex flex-shrink-0 overflow-hidden rounded-md border border-border">
          <button
            type="button"
            onClick={() => onStartPause(allocationId)}
            disabled={disabled}
            aria-label={running ? "Pause" : "Start"}
            title={
              disabled
                ? "Focus timer locked"
                : running
                  ? "Pause"
                  : "Start"
            }
            className={`inline-flex h-8 w-9 items-center justify-center text-white disabled:cursor-not-allowed disabled:opacity-40 ${
              running ? "bg-warning hover:brightness-95" : "bg-primary hover:brightness-95"
            } ${disabled ? "" : "cursor-pointer"}`}
          >
            {running ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5 fill-current" />}
          </button>
          <button
            type="button"
            onClick={() => onStop(allocationId)}
            disabled={stopDisabled}
            aria-label="Stop"
            title={
              disabled
                ? "Focus timer locked"
                : "Stop · complete lap"
            }
            className="inline-flex h-8 w-9 cursor-pointer items-center justify-center border-l border-border bg-surface text-danger hover:bg-danger-soft disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Square className="h-3 w-3 fill-current" />
          </button>
        </div>
        <div className="font-mono text-[13px] font-bold tabular-nums tracking-tight text-foreground">
          {formatHms(sessionMs)}
        </div>
        <div className="ml-auto flex-shrink-0 font-mono text-[10px] tabular-nums text-muted">
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

function todayIsoLocal() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
