import { describe, expect, it } from "vitest";
import {
  focusElapsedMsForWorkDate,
  focusHoursFromMs,
} from "../../apps/oneview-api/src/api/confirmations/confirmations-focus.util";

describe("confirmations-focus.util", () => {
  it("sums laps and session accum for focus hours", () => {
    const ms = focusElapsedMsForWorkDate(
      {
        laps: [{ startedAt: "2026-08-31T10:00:00.000Z", endedAt: "2026-08-31T13:30:00.000Z", durationMs: 0 }],
        sessionAccumMs: 0,
        segmentStartedAt: null,
      },
      "2026-08-31"
    );
    expect(focusHoursFromMs(ms)).toBe(3.5);
  });

  it("returns 0 ms when state is missing", () => {
    expect(focusElapsedMsForWorkDate(undefined, "2026-08-31")).toBe(0);
    expect(focusHoursFromMs(0)).toBe(0);
  });
});
