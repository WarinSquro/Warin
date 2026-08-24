import { describe, expect, it } from "vitest";
import {
  SESSION_IDLE_TIMEOUT_MS,
  isRefreshSessionIdleExpired,
} from "../../apps/oneview-api/src/api/auth/session-idle";
import { IDLE_SESSION_TIMEOUT_MS } from "../../hooks/useIdleSessionTimeout";

describe("session idle (auth)", () => {
  it("matches client idle window by default (120 minutes)", () => {
    expect(SESSION_IDLE_TIMEOUT_MS).toBe(IDLE_SESSION_TIMEOUT_MS);
    expect(SESSION_IDLE_TIMEOUT_MS).toBe(120 * 60 * 1000);
  });

  it("is not expired within the idle window", () => {
    const now = new Date("2026-08-24T10:00:00.000Z");
    const lastSeen = new Date(now.getTime() - 119 * 60 * 1000);
    expect(isRefreshSessionIdleExpired(lastSeen, now)).toBe(false);
  });

  it("is expired at and beyond the idle window", () => {
    const now = new Date("2026-08-24T10:00:00.000Z");
    const atBoundary = new Date(now.getTime() - 120 * 60 * 1000);
    const after3Days = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
    expect(isRefreshSessionIdleExpired(atBoundary, now)).toBe(true);
    expect(isRefreshSessionIdleExpired(after3Days, now)).toBe(true);
  });
});
