import { describe, expect, it } from "vitest";
import { remainingAfterElapsed, TOAST_DURATION_MS } from "../../utils/toastTiming";

describe("toastTiming", () => {
  it("defaults to 5 seconds", () => {
    expect(TOAST_DURATION_MS).toBe(5000);
  });

  it("pauses by subtracting elapsed time and never goes negative", () => {
    expect(remainingAfterElapsed(5000, 1200)).toBe(3800);
    expect(remainingAfterElapsed(400, 400)).toBe(0);
    expect(remainingAfterElapsed(200, 900)).toBe(0);
  });
});
