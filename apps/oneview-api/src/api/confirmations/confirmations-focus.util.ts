/** Focus elapsed for manager deviation feed (mirrors client confirmationProductivity). */

type FocusLap = { startedAt: string; endedAt: string; durationMs: number };

export type FocusAllocationState = {
  laps: FocusLap[];
  sessionAccumMs: number;
  segmentStartedAt: string | null;
};

function lapDurationMs(lap: FocusLap): number {
  const stored = Number(lap.durationMs);
  const start = new Date(lap.startedAt).getTime();
  const end = new Date(lap.endedAt).getTime();
  const fromRange =
    !Number.isNaN(start) && !Number.isNaN(end) && end >= start ? end - start : NaN;
  if (Number.isFinite(fromRange) && fromRange > 0) return fromRange;
  if (Number.isFinite(stored) && stored > 0) return stored;
  if (Number.isFinite(fromRange) && fromRange === 0) return 0;
  return 0;
}

function workDateEndMs(workDateIso: string): number {
  const day = workDateIso.slice(0, 10);
  return new Date(`${day}T23:59:59.999+05:30`).getTime();
}

function workDateStartMs(workDateIso: string): number {
  const day = workDateIso.slice(0, 10);
  return new Date(`${day}T00:00:00.000+05:30`).getTime();
}

export function focusElapsedMsForWorkDate(
  state: FocusAllocationState | undefined,
  workDateIso: string,
  opts?: { dayEndIso?: string | null; now?: number }
): number {
  if (!state) return 0;
  const now = opts?.now ?? Date.now();
  const lapsMs = state.laps.reduce((s, l) => s + lapDurationMs(l), 0);
  let open = Math.max(0, state.sessionAccumMs || 0);

  if (state.segmentStartedAt) {
    const segStart = new Date(state.segmentStartedAt).getTime();
    if (!Number.isNaN(segStart)) {
      const dayStart = workDateStartMs(workDateIso);
      const dayEndStamp = opts?.dayEndIso ? new Date(opts.dayEndIso).getTime() : NaN;
      const dayCap = !Number.isNaN(dayEndStamp) ? dayEndStamp : workDateEndMs(workDateIso);
      const asOf = Math.min(now, dayCap);
      const from = Math.max(segStart, dayStart);
      open += Math.max(0, asOf - from);
    }
  }

  return lapsMs + open;
}

export function focusHoursFromMs(ms: number): number {
  return Math.round((Math.max(0, ms) / 3_600_000) * 10) / 10;
}
