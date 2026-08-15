import { describe, expect, it } from "vitest";
import {
  buildTeamLoadRowsFromPerformance,
  teamLoadPctFromHours,
} from "../../data/cockpit";
import type { Employee } from "../../data/employees";
import type { PerformanceRow } from "../../data/performanceReport";

const person: Employee = {
  id: "EMP-1042",
  name: "Ravi Sharma",
  email: "ravi@acme.io",
  department: "Engineering",
  skills: ["React"],
  status: "active",
};

function perf(employeeId: string, utilizationHrs: number): PerformanceRow {
  return {
    id: `perf-${employeeId}`,
    employeeId,
    employeeName: "Ravi Sharma",
    department: "Engineering",
    resourceOwnerId: "",
    resourceOwnerName: "—",
    primarySkill: "React",
    employmentStatus: "active",
    utilizationHrs,
    billablePct: 0,
    nonBillablePct: 0,
  };
}

describe("teamLoadPctFromHours", () => {
  it("is booked hours vs weekly capacity, uncapped", () => {
    expect(teamLoadPctFromHours(40, 40)).toBe(100);
    expect(teamLoadPctFromHours(44, 40)).toBe(110);
    expect(teamLoadPctFromHours(0, 40)).toBe(0);
  });
});

describe("buildTeamLoadRowsFromPerformance", () => {
  it("fills pct / priorPct / tone from live performance hours", () => {
    const rows = buildTeamLoadRowsFromPerformance(
      [person],
      [perf("EMP-1042", 40)],
      [perf("EMP-1042", 32)],
      40,
      { idleBelow: 70, optimalTo: 100 }
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.pct).toBe(100);
    expect(rows[0]!.priorPct).toBe(80);
    expect(rows[0]!.tone).toBe("optimal");
  });

  it("stays 0% when the employee has no booked hours", () => {
    const rows = buildTeamLoadRowsFromPerformance([person], [], [], 40);
    expect(rows[0]!.pct).toBe(0);
    expect(rows[0]!.tone).toBe("idle");
  });
});
