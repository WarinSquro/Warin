import { describe, expect, it } from "vitest";
import { deploymentPeriodOptions, nextWeekBounds } from "../../utils/reportPeriods";
import { reportRange } from "../../api/liveViews";

describe("deploymentPeriodOptions", () => {
  it("includes Next week after This week with dynamic date span", () => {
    const anchor = new Date("2026-08-31T12:00:00");
    const opts = deploymentPeriodOptions(anchor);
    expect(opts.map((o) => o.id)).toEqual(["today", "week", "next_week", "month"]);
    expect(opts[1]?.label).toBe("This week (Aug 31 – Sep 6)");
    expect(opts[2]?.label).toBe("Next week (Sep 7 – Sep 13)");
  });
});

describe("nextWeekBounds", () => {
  it("returns Mon–Sun starting the Monday after the current week", () => {
    const anchor = new Date("2026-08-31T12:00:00");
    expect(nextWeekBounds(anchor)).toEqual({ start: "2026-09-07", end: "2026-09-13" });
  });
});

describe("reportRange next_week", () => {
  it("resolves next calendar week from today", () => {
    const realDate = Date;
    const mockToday = new Date("2026-08-31T12:00:00");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    globalThis.Date = class extends realDate {
      constructor(...args: unknown[]) {
        if (args.length === 0) {
          super(mockToday.getTime());
          return;
        }
        super(...(args as ConstructorParameters<typeof Date>));
      }
      static now() {
        return mockToday.getTime();
      }
    } as DateConstructor;

    try {
      const r = reportRange("next_week");
      expect(r.from).toBe("2026-09-07");
      expect(r.to).toBe("2026-09-13");
      expect(r.label).toBe("Next week (Sep 7 – Sep 13)");
    } finally {
      globalThis.Date = realDate;
    }
  });
});
