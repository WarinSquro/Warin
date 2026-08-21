import { describe, expect, it } from "vitest";
import type { Employee } from "../../data/employees";
import {
  assessmentCycleForMonth,
  defaultAssessmentCycle,
  defaultKpiCalendarYear,
  isKpiDirectReport,
  KPI_CALENDAR_YEARS,
  scopeKpiResourceEmployees,
} from "../../utils/kpiFilters";

const employees: Employee[] = [
  {
    id: "EMP-0001",
    name: "Administrator",
    email: "admin@acme.io",
    department: "Engineering",
    skills: [],
    status: "active",
    isSuperAdmin: true,
  },
  {
    id: "RO-1",
    name: "Owner",
    email: "ro@acme.io",
    department: "Engineering",
    skills: [],
    status: "active",
  },
  {
    id: "D-1",
    name: "Direct",
    email: "d@acme.io",
    department: "Engineering",
    skills: [],
    status: "active",
    resourceOwnerId: "RO-1",
  },
  {
    id: "I-1",
    name: "Indirect",
    email: "i@acme.io",
    department: "Engineering",
    skills: [],
    status: "active",
    resourceOwnerId: "D-1",
  },
];

describe("kpiFilters calendar / cycle", () => {
  it("exposes only 2026 and 2027", () => {
    expect([...KPI_CALENDAR_YEARS]).toEqual([2026, 2027]);
  });

  it("defaults year into the allowed range", () => {
    expect(defaultKpiCalendarYear(new Date("2026-08-21T12:00:00"))).toBe(2026);
    expect(defaultKpiCalendarYear(new Date("2025-01-01T12:00:00"))).toBe(2026);
    expect(defaultKpiCalendarYear(new Date("2028-01-01T12:00:00"))).toBe(2027);
  });

  it("picks assessment cycle from the current month", () => {
    expect(assessmentCycleForMonth(1)).toBe("Q1");
    expect(assessmentCycleForMonth(6)).toBe("Q2");
    expect(assessmentCycleForMonth(8)).toBe("Q3");
    expect(assessmentCycleForMonth(9)).toBe("Q3");
    expect(assessmentCycleForMonth(10)).toBe("Q4");
    expect(defaultAssessmentCycle(new Date("2026-08-21T12:00:00"))).toBe("Q3");
  });
});

describe("kpiFilters RO scope", () => {
  it("includes self + direct + indirect and excludes Administrator", () => {
    const owner = employees.find((e) => e.id === "RO-1")!;
    expect(scopeKpiResourceEmployees(employees, owner, false).map((e) => e.id).sort()).toEqual([
      "D-1",
      "I-1",
      "RO-1",
    ]);
  });

  it("super-admin sees all active resources except Administrator", () => {
    expect(scopeKpiResourceEmployees(employees, null, true).map((e) => e.id).sort()).toEqual([
      "D-1",
      "I-1",
      "RO-1",
    ]);
  });

  it("marks only immediate reports as editable", () => {
    expect(isKpiDirectReport("RO-1", "D-1", employees)).toBe(true);
    expect(isKpiDirectReport("RO-1", "I-1", employees)).toBe(false);
    expect(isKpiDirectReport("RO-1", "RO-1", employees)).toBe(false);
  });
});
