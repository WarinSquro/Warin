import { describe, expect, it } from "vitest";
import {
  focusElapsedMs,
  focusElapsedMsForWorkDate,
  workDateEndMs,
  workdayDurationMs,
} from "../../utils/confirmationProductivity";

describe("focusElapsedMsForWorkDate", () => {
  it("does not let an abandoned open timer grow across later calendar days", () => {
    // Vivek-style: Day Start ~19:15 IST on 17-Aug, timer left running; report viewed on 20-Aug.
    const segmentStartedAt = "2026-08-17T13:45:00.000Z"; // 19:15 IST
    const viewNow = new Date("2026-08-20T09:41:00.000Z").getTime(); // ~15:11 IST
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
    // Caps at end of 17-Aug IST (~4h 45m from 19:15), not ~68h.
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
            durationMs: 999999999, // corrupt stored value — ignore in favor of timestamps
          },
        ],
        sessionAccumMs: 0,
        segmentStartedAt: null,
      },
      "2026-08-17"
    );
    expect(ms).toBe(2.5 * 3600000);
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
