import { describe, expect, it } from "vitest";
import { teamComplianceDayStatus } from "../../utils/teamComplianceDay";

describe("teamComplianceDayStatus", () => {
  const today = "2026-08-20";

  it("marks future days as future", () => {
    expect(
      teamComplianceDayStatus({ workDate: "2026-08-21", today, hasPlan: true })
    ).toBe("future");
  });

  it("marks company off-days as leave (not pending)", () => {
    expect(
      teamComplianceDayStatus({
        workDate: "2026-08-19",
        today,
        isCompanyOff: true,
        hasPlan: true,
      })
    ).toBe("leave");
  });

  it("marks days with no plan and no confirmation as leave", () => {
    expect(
      teamComplianceDayStatus({
        workDate: "2026-08-18",
        today,
        hasPlan: false,
      })
    ).toBe("leave");
  });

  it("marks planned but unconfirmed days as pending", () => {
    expect(
      teamComplianceDayStatus({
        workDate: "2026-08-18",
        today,
        hasPlan: true,
      })
    ).toBe("pending");
  });

  it("uses confirmation + IST calendar-day delay (not clock cutoff)", () => {
    expect(
      teamComplianceDayStatus({
        workDate: "2026-08-19",
        today,
        hasPlan: true,
        confirmation: {
          hasDeviation: true,
          // 19:03 IST same day
          submittedAt: "2026-08-19T13:33:35.704Z",
        },
      })
    ).toBe("deviation");

    expect(
      teamComplianceDayStatus({
        workDate: "2026-08-19",
        today,
        hasPlan: true,
        confirmation: {
          hasDeviation: false,
          // next IST calendar day
          submittedAt: "2026-08-19T18:30:00.000Z",
        },
      })
    ).toBe("confirmed_delayed");
  });
});
