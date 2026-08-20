import { describe, expect, it } from "vitest";
import {
  confirmationHasDeviantWork,
  teamComplianceDayStatus,
} from "../../utils/teamComplianceDay";

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

  it("same-day deviation/unplanned is Devi. (D), not DD — ignores 10:00 cutoff", () => {
    expect(
      teamComplianceDayStatus({
        workDate: "2026-08-19",
        today,
        hasPlan: true,
        confirmation: {
          // 19:03 IST same day
          submittedAt: "2026-08-19T13:33:35.704Z",
          lines: [{ kind: "unplanned" }],
        },
      })
    ).toBe("deviation");

    expect(
      teamComplianceDayStatus({
        workDate: "2026-08-19",
        today,
        hasPlan: true,
        confirmation: {
          submittedAt: "2026-08-19T13:33:35.704Z",
          lines: [{ kind: "deviation" }],
        },
      })
    ).toBe("deviation");
  });

  it("next IST calendar day with deviation is DD", () => {
    expect(
      teamComplianceDayStatus({
        workDate: "2026-08-19",
        today,
        hasPlan: true,
        confirmation: {
          submittedAt: "2026-08-19T18:30:00.000Z",
          lines: [{ kind: "deviation" }],
        },
      })
    ).toBe("deviation_delayed");
  });

  it("as-planned same day is Conf., not CD", () => {
    expect(
      teamComplianceDayStatus({
        workDate: "2026-08-19",
        today,
        hasPlan: true,
        confirmation: {
          submittedAt: "2026-08-19T13:00:00.000Z",
          lines: [{ kind: "planned" }],
        },
      })
    ).toBe("confirmed");
  });
});

describe("confirmationHasDeviantWork", () => {
  it("treats deviation and unplanned lines as deviant (like Deviation feed)", () => {
    expect(
      confirmationHasDeviantWork({ lines: [{ kind: "planned" }, { kind: "unplanned" }] })
    ).toBe(true);
    expect(confirmationHasDeviantWork({ lines: [{ kind: "deviation" }] })).toBe(true);
    expect(confirmationHasDeviantWork({ lines: [{ kind: "planned" }] })).toBe(false);
    expect(confirmationHasDeviantWork({ hasDeviation: true })).toBe(true);
  });
});
