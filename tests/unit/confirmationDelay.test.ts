import { describe, expect, it } from "vitest";
import { isConfirmationDelayed, istCalendarDate } from "../../utils/confirmationDelay";

describe("confirmation delay (IST calendar day)", () => {
  it("same day after 10:00 IST is not delayed", () => {
    // 17:30 IST on 19 Aug
    expect(istCalendarDate("2026-08-19T12:00:00.000Z")).toBe("2026-08-19");
    expect(isConfirmationDelayed("2026-08-19T12:00:00.000Z", "2026-08-19")).toBe(false);
  });

  it("next IST calendar day is delayed", () => {
    // 00:00 IST on 20 Aug
    expect(istCalendarDate("2026-08-19T18:30:00.000Z")).toBe("2026-08-20");
    expect(isConfirmationDelayed("2026-08-19T18:30:00.000Z", "2026-08-19")).toBe(true);
  });
});
