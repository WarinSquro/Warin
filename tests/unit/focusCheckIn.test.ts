import { describe, expect, it } from "vitest";
import {
  FOCUS_CHECK_IN_MINUTES_MAX,
  FOCUS_CHECK_IN_RESPONSE_SECONDS,
  focusCheckInIntervalMs,
  focusCheckInPromptAt,
  focusCheckInSecondsLeft,
  normalizeFocusCheckInMinutes,
} from "../../utils/focusCheckIn";

describe("focusCheckIn", () => {
  it("treats empty / 0 / invalid as disabled", () => {
    expect(normalizeFocusCheckInMinutes(undefined)).toBe(0);
    expect(normalizeFocusCheckInMinutes(null)).toBe(0);
    expect(normalizeFocusCheckInMinutes("")).toBe(0);
    expect(normalizeFocusCheckInMinutes(0)).toBe(0);
    expect(normalizeFocusCheckInMinutes(-5)).toBe(0);
    expect(normalizeFocusCheckInMinutes("abc")).toBe(0);
  });

  it("clamps positive minutes to 1…MAX", () => {
    expect(normalizeFocusCheckInMinutes(1)).toBe(1);
    expect(normalizeFocusCheckInMinutes(30.9)).toBe(30);
    expect(normalizeFocusCheckInMinutes(FOCUS_CHECK_IN_MINUTES_MAX + 10)).toBe(
      FOCUS_CHECK_IN_MINUTES_MAX
    );
  });

  it("computes interval ms and prompt deadline from anchor", () => {
    expect(focusCheckInIntervalMs(0)).toBe(0);
    expect(focusCheckInIntervalMs(5)).toBe(5 * 60_000);
    const anchor = Date.UTC(2026, 8, 15, 10, 0, 0);
    expect(focusCheckInPromptAt(anchor, 0)).toBeNull();
    expect(focusCheckInPromptAt(anchor, 10)).toBe(anchor + 10 * 60_000);
  });

  it("counts down seconds until auto-stop deadline", () => {
    expect(FOCUS_CHECK_IN_RESPONSE_SECONDS).toBe(30);
    const deadline = 1_000_000;
    expect(focusCheckInSecondsLeft(deadline, deadline - 30_500)).toBe(31);
    expect(focusCheckInSecondsLeft(deadline, deadline - 500)).toBe(1);
    expect(focusCheckInSecondsLeft(deadline, deadline)).toBe(0);
    expect(focusCheckInSecondsLeft(deadline, deadline + 1000)).toBe(0);
  });
});
