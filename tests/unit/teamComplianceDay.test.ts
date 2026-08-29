import { describe, expect, it } from "vitest";
import {
  confirmationHasDeviantWork,
  teamComplianceDayStatus,
  teamComplianceTodayIndex,
  teamComplianceWeekHasPending,
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

describe("teamComplianceTodayIndex", () => {
  const week = ["2026-08-24", "2026-08-25", "2026-08-26", "2026-08-27", "2026-08-28"];

  it("returns exact weekday index when today is in the strip", () => {
    expect(teamComplianceTodayIndex(week, "2026-08-27")).toBe(3);
  });

  it("on weekend uses the latest working day on or before today (not -1 → fake pending)", () => {
    expect(teamComplianceTodayIndex(week, "2026-08-29")).toBe(4); // Sat → Fri
    expect(teamComplianceTodayIndex(week, "2026-08-30")).toBe(4); // Sun → Fri
  });

  it("returns -1 when the whole strip is still in the future", () => {
    expect(teamComplianceTodayIndex(week, "2026-08-20")).toBe(-1);
  });
});

describe("teamComplianceWeekHasPending", () => {
  it("is true when any day in the week strip is pending", () => {
    expect(
      teamComplianceWeekHasPending(["leave", "pending", "leave", "leave", "leave"])
    ).toBe(true);
    expect(
      teamComplianceWeekHasPending(["leave", "confirmed", "leave", "leave", "leave"])
    ).toBe(false);
    expect(teamComplianceWeekHasPending([])).toBe(false);
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
