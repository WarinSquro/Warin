import { describe, expect, it } from "vitest";
import {
  emptyDayProductivity,
  finalizeOpenFocusTimersOnAppLogout,
  focusElapsedMs,
  focusElapsedMsForWorkDate,
  isFocusStartBlocked,
  isUnplannedEntryBlocked,
  loadProductivityStore,
  pauseAllRunningFocusTimers,
  stopAllOpenFocusTimers,
  unplannedEntryBlockedReason,
  workDateEndMs,
  workdayDurationMs,
  isConfirmAllAsPlannedBlockedByProductiveWindow,
  CONFIRM_AS_PLANNED_PRODUCTIVE_WINDOW_MESSAGE,
} from "../../utils/confirmationProductivity";

describe("confirm all as planned vs productive window", () => {
  it("blocks when productive window is less than planned hours", () => {
    expect(isConfirmAllAsPlannedBlockedByProductiveWindow(7.5 * 3600000, 8.5)).toBe(true);
    expect(isConfirmAllAsPlannedBlockedByProductiveWindow(0, 8)).toBe(true);
  });

  it("allows when productive window is greater than or equal to planned hours", () => {
    expect(isConfirmAllAsPlannedBlockedByProductiveWindow(8.5 * 3600000, 8.5)).toBe(false);
    expect(isConfirmAllAsPlannedBlockedByProductiveWindow(9 * 3600000, 8.5)).toBe(false);
  });

  it("exposes the product message for Case 1", () => {
    expect(CONFIRM_AS_PLANNED_PRODUCTIVE_WINDOW_MESSAGE).toMatch(/productive window is less than/i);
    expect(CONFIRM_AS_PLANNED_PRODUCTIVE_WINDOW_MESSAGE).toMatch(/deviation/i);
  });
});

describe("focusElapsedMsForWorkDate", () => {
  it("does not let an abandoned open timer grow across later calendar days", () => {
    const segmentStartedAt = "2026-08-17T13:45:00.000Z";
    const viewNow = new Date("2026-08-20T09:41:00.000Z").getTime();
    const live = focusElapsedMs(
      { laps: [], sessionAccumMs: 0, segmentStartedAt },
      viewNow
    );
    expect(live).toBeGreaterThan(60 * 3600000);

    const reported = focusElapsedMsForWorkDate(
      { laps: [], sessionAccumMs: 0, segmentStartedAt },
      "2026-08-17",
      { now: viewNow }
    );
    expect(reported).toBeLessThan(5 * 3600000);
    expect(reported).toBeGreaterThan(4 * 3600000);
    expect(reported).toBe(workDateEndMs("2026-08-17") - new Date(segmentStartedAt).getTime());
  });

  it("caps an open segment at Day End when stamped", () => {
    const segmentStartedAt = "2026-08-17T04:00:00.000Z";
    const dayEnd = "2026-08-17T12:00:00.000Z";
    const ms = focusElapsedMsForWorkDate(
      { laps: [], sessionAccumMs: 0, segmentStartedAt },
      "2026-08-17",
      { dayEndIso: dayEnd, now: new Date("2026-08-20T12:00:00.000Z").getTime() }
    );
    expect(ms).toBe(8 * 3600000);
  });

  it("sums completed laps from started/ended timestamps", () => {
    const ms = focusElapsedMsForWorkDate(
      {
        laps: [
          {
            id: "1",
            startedAt: "2026-08-17T04:00:00.000Z",
            endedAt: "2026-08-17T06:30:00.000Z",
            durationMs: 999999999,
          },
        ],
        sessionAccumMs: 0,
        segmentStartedAt: null,
      },
      "2026-08-17"
    );
    expect(ms).toBe(2.5 * 3600000);
  });

  it("uses durationMs when startedAt≈endedAt (legacy Pause→Stop / Log Out rows)", () => {
    const ms = focusElapsedMsForWorkDate(
      {
        laps: [
          {
            id: "1",
            startedAt: "2026-08-17T12:00:00.000Z",
            endedAt: "2026-08-17T12:00:00.000Z",
            durationMs: 45_000,
          },
        ],
        sessionAccumMs: 0,
        segmentStartedAt: null,
      },
      "2026-08-17"
    );
    expect(ms).toBe(45_000);
  });
});

describe("workdayDurationMs", () => {
  it("computes office and productive window for a normal day", () => {
    const { officeMs, lunchMs, productiveMs } = workdayDurationMs({
      dayStart: "2026-08-17T03:30:00.000Z",
      lunchOut: "2026-08-17T07:30:00.000Z",
      lunchIn: "2026-08-17T08:00:00.000Z",
      dayEnd: "2026-08-17T12:30:00.000Z",
    });
    expect(officeMs).toBe(9 * 3600000);
    expect(lunchMs).toBe(0.5 * 3600000);
    expect(productiveMs).toBe(8.5 * 3600000);
  });

  it("returns zero office without day end", () => {
    const { officeMs, productiveMs } = workdayDurationMs({
      dayStart: "2026-08-17T13:45:00.000Z",
    });
    expect(officeMs).toBe(0);
    expect(productiveMs).toBe(0);
  });
});

describe("confirmation unplanned entry gate", () => {
  it("blocks unplanned entry before Day Start only", () => {
    expect(isUnplannedEntryBlocked({})).toBe(true);
    expect(unplannedEntryBlockedReason({})).toMatch(/Day Start/i);
    expect(isUnplannedEntryBlocked({ dayStart: "2026-08-20T03:00:00.000Z" })).toBe(false);
    expect(
      isUnplannedEntryBlocked({
        dayStart: "2026-08-20T03:00:00.000Z",
        dayEnd: "2026-08-20T12:00:00.000Z",
      })
    ).toBe(false);
  });
});

describe("confirmation focus workday gates", () => {
  it("blocks Start before Day Start, during lunch, and after Day End", () => {
    expect(isFocusStartBlocked({})).toBe(true);
    expect(isFocusStartBlocked({ dayStart: "2026-08-20T03:00:00.000Z" })).toBe(false);
    expect(
      isFocusStartBlocked({
        dayStart: "2026-08-20T03:00:00.000Z",
        lunchOut: "2026-08-20T07:00:00.000Z",
      })
    ).toBe(true);
    expect(
      isFocusStartBlocked({
        dayStart: "2026-08-20T03:00:00.000Z",
        lunchOut: "2026-08-20T07:00:00.000Z",
        lunchIn: "2026-08-20T07:30:00.000Z",
      })
    ).toBe(false);
    expect(
      isFocusStartBlocked({
        dayStart: "2026-08-20T03:00:00.000Z",
        dayEnd: "2026-08-20T12:00:00.000Z",
      })
    ).toBe(true);
  });

  it("Lunch Start pauses all running timers without creating laps", () => {
    const now = new Date("2026-08-20T07:00:00.000Z").getTime();
    const day = pauseAllRunningFocusTimers(
      {
        ...emptyDayProductivity(),
        activeTimerId: "a1",
        focusByAllocation: {
          a1: {
            laps: [],
            sessionAccumMs: 1000,
            segmentStartedAt: new Date(now - 5000).toISOString(),
          },
        },
      },
      now
    );
    expect(day.activeTimerId).toBeNull();
    expect(day.focusByAllocation.a1?.segmentStartedAt).toBeNull();
    expect(day.focusByAllocation.a1?.sessionAccumMs).toBe(6000);
    expect(day.focusByAllocation.a1?.laps).toHaveLength(0);
  });

  it("Day End / Log Out stops all open timers into laps and updates totals", () => {
    const now = new Date("2026-08-20T12:00:00.000Z").getTime();
    const day = stopAllOpenFocusTimers(
      {
        ...emptyDayProductivity(),
        activeTimerId: "a1",
        focusByAllocation: {
          a1: {
            laps: [],
            sessionAccumMs: 2000,
            segmentStartedAt: new Date(now - 3000).toISOString(),
          },
          a2: {
            laps: [
              {
                id: "old",
                startedAt: "2026-08-20T04:00:00.000Z",
                endedAt: "2026-08-20T05:00:00.000Z",
                durationMs: 3600000,
              },
            ],
            sessionAccumMs: 4000,
            segmentStartedAt: null,
          },
        },
      },
      now
    );
    expect(day.activeTimerId).toBeNull();
    expect(day.focusByAllocation.a1?.segmentStartedAt).toBeNull();
    expect(day.focusByAllocation.a1?.sessionAccumMs).toBe(0);
    expect(day.focusByAllocation.a1?.laps).toHaveLength(1);
    expect(day.focusByAllocation.a1?.laps[0]?.durationMs).toBe(5000);
    expect(day.focusByAllocation.a2?.laps).toHaveLength(2);
    expect(day.focusByAllocation.a2?.laps[1]?.durationMs).toBe(4000);
    expect(day.focusByAllocation.a2?.sessionAccumMs).toBe(0);
    // Totals must include every finalized lap (chips + Total stay in sync).
    expect(focusElapsedMs(day.focusByAllocation.a1)).toBe(5000);
    expect(focusElapsedMs(day.focusByAllocation.a2)).toBe(3600000 + 4000);
  });

  it("Log Out after Pause records lap duration in Total (not zero from collapsed timestamps)", () => {
    const now = new Date("2026-08-20T12:00:00.000Z").getTime();
    const day = stopAllOpenFocusTimers(
      {
        ...emptyDayProductivity(),
        activeTimerId: null,
        focusByAllocation: {
          a1: {
            laps: [],
            sessionAccumMs: 12_000,
            segmentStartedAt: null,
          },
        },
      },
      now
    );
    const lap = day.focusByAllocation.a1?.laps[0];
    expect(lap?.durationMs).toBe(12_000);
    expect(new Date(lap!.endedAt).getTime() - new Date(lap!.startedAt).getTime()).toBe(12_000);
    expect(focusElapsedMs(day.focusByAllocation.a1)).toBe(12_000);
  });
});

describe("finalizeOpenFocusTimersOnAppLogout", () => {
  const KEY = "oneview_confirm_productivity_v1_EMP-TEST";
  const memory = new Map<string, string>();

  it("stops running timers into laps, updates totals, and does not stamp dayEnd", () => {
    memory.clear();
    const storage = {
      getItem: (k: string) => memory.get(k) ?? null,
      setItem: (k: string, v: string) => {
        memory.set(k, v);
      },
      removeItem: (k: string) => {
        memory.delete(k);
      },
    };
    // @ts-expect-error test stub
    globalThis.localStorage = storage;
    // @ts-expect-error test stub
    globalThis.window = globalThis;

    const now = new Date("2026-08-20T12:00:00.000Z").getTime();
    localStorage.setItem(
      KEY,
      JSON.stringify({
        days: {
          "2026-08-20": {
            workday: { dayStart: "2026-08-20T10:45:00.000Z" },
            activeTimerId: "a1",
            focusByAllocation: {
              a1: {
                laps: [
                  {
                    id: "old",
                    startedAt: "2026-08-20T04:00:00.000Z",
                    endedAt: "2026-08-20T04:33:01.000Z",
                    durationMs: 1_981_000,
                  },
                ],
                sessionAccumMs: 0,
                segmentStartedAt: new Date(now - 62_000).toISOString(),
              },
            },
          },
        },
      })
    );

    const changed = finalizeOpenFocusTimersOnAppLogout("EMP-TEST", now);
    expect(changed).toHaveLength(1);
    expect(changed[0]?.day.workday.dayEnd).toBeUndefined();
    expect(changed[0]?.day.activeTimerId).toBeNull();
    expect(changed[0]?.day.focusByAllocation.a1?.segmentStartedAt).toBeNull();
    expect(changed[0]?.day.focusByAllocation.a1?.laps).toHaveLength(2);
    expect(changed[0]?.day.focusByAllocation.a1?.laps[1]?.durationMs).toBe(62_000);
    expect(focusElapsedMs(changed[0]?.day.focusByAllocation.a1)).toBe(1_981_000 + 62_000);

    const stored = loadProductivityStore("EMP-TEST");
    expect(stored.days["2026-08-20"]?.focusByAllocation.a1?.laps).toHaveLength(2);
    localStorage.removeItem(KEY);
  });
});
