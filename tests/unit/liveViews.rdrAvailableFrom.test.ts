import { describe, expect, it } from "vitest";
import {
  formatDeploymentAvailableFrom,
  nextWorkingDayAfter,
} from "../../api/liveViews";

describe("RDR Available From (RDR-013/014)", () => {
  const calendar = {
    workingDays: ["Mon", "Tue", "Wed", "Thu", "Fri"],
    companyOffDays: ["2026-07-31"],
    asOf: "2026-07-27",
  };

  it("nextWorkingDayAfter skips weekends", () => {
    // Friday → Monday
    expect(nextWorkingDayAfter("2026-07-24", calendar)).toBe("2026-07-27");
  });

  it("nextWorkingDayAfter skips company off days", () => {
    // Thu 30 Jul → skip Fri 31 (off) → Mon 3 Aug
    expect(nextWorkingDayAfter("2026-07-30", calendar)).toBe("2026-08-03");
  });

  it("formatDeploymentAvailableFrom returns Now when free already", () => {
    expect(formatDeploymentAvailableFrom("2026-07-01", calendar)).toBe("Now");
    expect(formatDeploymentAvailableFrom(null, calendar)).toBe("Now");
  });

  it("formatDeploymentAvailableFrom returns short date when still booked", () => {
    expect(formatDeploymentAvailableFrom("2026-08-14", calendar)).toBe("Aug 17");
  });
});
