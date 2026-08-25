import { describe, expect, it } from "vitest";
import { buildAvailRowsFromEmployees } from "../../api/liveViews";
import type { Employee } from "../../data/employees";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const emp: Employee = {
  id: "EMP-1",
  name: "Aarav Shah",
  email: "a@acme.io",
  department: "Engineering",
  skills: ["React"],
  status: "active",
};

const aditi: Employee = {
  id: "256",
  name: "Aditi Jha",
  email: "aditi@example.com",
  department: "CSS",
  skills: [],
  status: "active",
};

const anamika: Employee = {
  id: "243",
  name: "Anamika Bhadauria",
  email: "anamika@example.com",
  department: "CSS",
  skills: [],
  status: "active",
};

describe("buildAvailRowsFromEmployees leave capacity", () => {
  it("reduces free hours and capacity by leave working days", () => {
    const without = buildAvailRowsFromEmployees(
      [emp],
      40,
      [],
      [],
      "2026-08-17",
      WEEKDAYS
    )[0]!;
    expect(without.capacity).toBe(40);
    expect(without.freeHours).toBe(40);

    const withLeave = buildAvailRowsFromEmployees(
      [emp],
      40,
      [],
      [],
      "2026-08-17",
      WEEKDAYS,
      undefined,
      { "EMP-1": ["2026-08-18"] },
      8
    )[0]!;
    expect(withLeave.capacity).toBe(32);
    expect(withLeave.freeHours).toBe(32);
  });

  it("uses Settings hours/day when subtracting leave from a 34h week", () => {
    const withLeave = buildAvailRowsFromEmployees(
      [emp],
      34,
      [],
      ["2026-08-28"],
      "2026-08-24",
      WEEKDAYS,
      undefined,
      { "EMP-1": ["2026-08-25"] },
      8.5
    )[0]!;
    expect(withLeave.capacity).toBe(25.5);
    expect(withLeave.freeHours).toBe(25.5);
    expect(withLeave.leaveHours).toBe(8.5);
  });

  it("keeps employee visible when leave covers the full working week (0h free)", () => {
    const leaveDates = ["2026-08-17", "2026-08-18", "2026-08-19", "2026-08-20", "2026-08-21"];
    const rows = buildAvailRowsFromEmployees(
      [emp],
      40,
      [],
      [],
      "2026-08-17",
      WEEKDAYS,
      undefined,
      { "EMP-1": leaveDates },
      8
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.freeHours).toBe(0);
    expect(rows[0]!.capacity).toBe(0);
    expect(rows[0]!.availableFrom).toBe("On leave");
    expect(rows[0]!.leaveHours).toBe(40);
  });

  it("keeps Aditi visible this week with Wed leave (matches Resource Planner 25.5h)", () => {
    // Production calendar: Fri holiday 28 Aug; Wed 26 leave; week capacity 34h → 25.5h free.
    const rows = buildAvailRowsFromEmployees(
      [aditi, anamika],
      34,
      [],
      ["2026-08-28"],
      "2026-08-24",
      WEEKDAYS,
      undefined,
      { "256": ["2026-08-26"] },
      8.5
    );
    expect(rows.map((r) => r.id).sort()).toEqual(["243", "256"]);
    const row = rows.find((r) => r.id === "256")!;
    expect(row.name).toBe("Aditi Jha");
    expect(row.capacity).toBe(25.5);
    expect(row.freeHours).toBe(25.5);
    expect(row.leaveHours).toBe(8.5);
    expect(row.availableFrom).toBe("Now");
    // Next week (no leave) still lists her at full capacity.
    const next = buildAvailRowsFromEmployees(
      [aditi, anamika],
      34,
      [],
      ["2026-09-04"],
      "2026-08-31",
      WEEKDAYS,
      undefined,
      { "256": ["2026-08-26"] },
      8.5
    );
    expect(next.find((r) => r.id === "256")?.freeHours).toBe(34);
  });
});
