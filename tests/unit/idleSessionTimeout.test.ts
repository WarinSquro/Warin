import { describe, expect, it } from "vitest";
import { IDLE_SESSION_TIMEOUT_MS } from "../../hooks/useIdleSessionTimeout";

describe("idle session timeout", () => {
  it("uses a 30-minute inactivity window", () => {
    expect(IDLE_SESSION_TIMEOUT_MS).toBe(30 * 60 * 1000);
  });
});
