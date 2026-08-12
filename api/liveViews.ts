/**
 * Live / empty view builders from Postgres-backed employees, projects,
 * allocations, and work confirmations.
 */
import type { Employee } from "../data/employees";
import type { Project } from "../data/projects";
import type { AvailRow, RollingOffPerson } from "../data/availability";
import type { Band, UtilRow } from "../data/utilization";
import type { DeploymentRow, DeploymentStatus } from "../data/deploymentReport";
import { workingWeekBounds } from "../utils/workingWeek";
import type {
  PerformanceHistory,
  PerformanceHistoryMonth,
  PerformanceRow,
} from "../data/performanceReport";
import type {
  ExecutionHistory,
  ExecutionHistoryMonth,
  ExecutionRosterEntry,
  ExecutionRow,
  ProjectHealth,
} from "../data/executionReport";
import type { ConfirmationCode, DailyWorkRow } from "../data/dailyWorkReport";
import type { Candidate } from "../data/planner";
import type { ApiAllocation, ApiConfirmation, ApiWeeklySubmission } from "./domain";
import {
  getEmployeeInitials,
  type ActionStatus,
  type Recognition,
  type WeeklyCheckInSubmission,
  type WeeklyConfidence,
  type WeeklyStatus,
  type EmployeeHistory,
  type QueueRow,
} from "../data/weeklyCheckIn";

function initials(name: string) {
  return getEmployeeInitials(name);
}

export function mondayISO(from = new Date()): string {
  const x = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const day = x.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + diff);
  return toLocalISO(x);
}

export function toLocalISO(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function addDaysISO(iso: string, days: number): string {
  const date = new Date(`${iso}T12:00:00`);
  date.setDate(date.getDate() + days);
  return toLocalISO(date);
}

export function reportRange(
  period: "today" | "week" | "month" | "last_month" | "last_3_months",
  opts?: { workingDays?: string[] }
): { from: string; to: string; label: string } {
  const today = toLocalISO();
  const mon = mondayISO();
  const fmtDay = (iso: string) =>
    new Date(`${iso}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  if (period === "today") {
    return { from: today, to: today, label: `Today (${fmtDay(today)})` };
  }
  if (period === "week") {
    const { start, end } = workingWeekBounds(mon, opts?.workingDays);
    const a = new Date(`${start}T12:00:00`);
    const b = new Date(`${end}T12:00:00`);
    const span =
      a.getMonth() === b.getMonth()
        ? `${fmtDay(start)} – ${b.getDate()}`
        : `${fmtDay(start)} – ${fmtDay(end)}`;
    return { from: start, to: end, label: `This week (${span})` };
  }
  if (period === "month") {
    const d = new Date();
    const from = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
    const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    const to = toLocalISO(end);
    return {
      from,
      to,
      label: d.toLocaleDateString("en-US", { month: "long", year: "numeric" }),
    };
  }
  if (period === "last_month") {
    const d = new Date();
    const prev = new Date(d.getFullYear(), d.getMonth() - 1, 1);
    const end = new Date(d.getFullYear(), d.getMonth(), 0);
    return {
      from: toLocalISO(prev),
      to: toLocalISO(end),
      label: prev.toLocaleDateString("en-US", { month: "long", year: "numeric" }),
    };
  }
  const d = new Date();
  const start = new Date(d.getFullYear(), d.getMonth() - 2, 1);
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  const threeSpan = `${start.toLocaleDateString("en-US", { month: "short" })} – ${d.toLocaleDateString("en-US", { month: "short" })}`;
  return {
    from: toLocalISO(start),
    to: toLocalISO(end),
    label: `Last 3 Months (${threeSpan})`,
  };
}

const DOW_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const DEFAULT_WORKING_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];

function weekdayHoursInRange(
  startDate: string,
  endDate: string,
  rangeFrom: string,
  rangeTo: string,
  hoursPerDay: number,
  companyOffDays?: string[],
  workingDays?: string[]
): number {
  const off = new Set((companyOffDays ?? []).map((d) => d.slice(0, 10)));
  const working = workingDays?.length ? workingDays : DEFAULT_WORKING_DAYS;
  let days = 0;
  for (let d = rangeFrom; d <= rangeTo; d = addDaysISO(d, 1)) {
    if (d < startDate || d > endDate) continue;
    if (off.has(d)) continue;
    const label = DOW_SHORT[new Date(`${d}T12:00:00`).getDay()]!;
    if (!working.includes(label)) continue;
    days += 1;
  }
  return hoursPerDay * days;
}

export function bookedHoursByEmployee(
  allocations: ApiAllocation[],
  weekStart = mondayISO(),
  companyOffDays?: string[],
  workingDays?: string[]
): Map<string, { hours: number; primaryProject: string | null }> {
  const weekEnd = addDaysISO(weekStart, 6);
  return bookedHoursInRange(allocations, weekStart, weekEnd, companyOffDays, workingDays);
}

export function bookedHoursInRange(
  allocations: ApiAllocation[],
  rangeFrom: string,
  rangeTo: string,
  companyOffDays?: string[],
  workingDays?: string[]
): Map<string, { hours: number; primaryProject: string | null }> {
  const map = new Map<string, { hours: number; primaryProject: string | null }>();
  const projectHours = new Map<string, Map<string, number>>();

  for (const a of allocations) {
    const hours = weekdayHoursInRange(
      a.startDate.slice(0, 10),
      a.endDate.slice(0, 10),
      rangeFrom,
      rangeTo,
      a.hoursPerDay,
      companyOffDays,
      workingDays
    );
    if (hours <= 0) continue;
    const prev = map.get(a.employeeHrmsId) ?? { hours: 0, primaryProject: null };
    prev.hours += hours;
    map.set(a.employeeHrmsId, prev);

    const ph = projectHours.get(a.employeeHrmsId) ?? new Map();
    ph.set(a.projectName, (ph.get(a.projectName) ?? 0) + hours);
    projectHours.set(a.employeeHrmsId, ph);
  }

  for (const [empId, entry] of map) {
    const ph = projectHours.get(empId);
    if (!ph || ph.size === 0) continue;
    let best: string | null = null;
    let bestH = -1;
    for (const [name, h] of ph) {
      if (h > bestH) {
        bestH = h;
        best = name;
      }
    }
    entry.primaryProject = best;
  }
  return map;
}

function utilBand(pct: number): Band {
  if (pct > 100) return "over";
  if (pct >= 70) return "optimal";
  return "idle";
}

function isDelayed(submittedAt: string, workDate: string): boolean {
  return new Date(submittedAt).getTime() > new Date(`${workDate}T10:00:00`).getTime();
}

function confirmationCode(c: ApiConfirmation, lineKind: string): ConfirmationCode {
  const delayed = isDelayed(c.submittedAt, c.workDate);
  if (lineKind === "deviation" || lineKind === "unplanned" || c.hasDeviation) {
    return delayed ? "DD" : "D";
  }
  return delayed ? "CD" : "C";
}

function weekdayCount(from: string, to: string): number {
  let n = 0;
  for (let d = from; d <= to; d = addDaysISO(d, 1)) {
    const dow = new Date(`${d}T12:00:00`).getDay();
    if (dow >= 1 && dow <= 5) n += 1;
  }
  return n;
}

export function buildAvailRowsFromEmployees(
  employees: Employee[],
  weekCapacity = 40,
  allocations: ApiAllocation[] = [],
  companyOffDays?: string[]
): AvailRow[] {
  const booked = bookedHoursByEmployee(allocations, mondayISO(), companyOffDays);
  return employees
    .filter((e) => e.status === "active")
    .map((e) => {
      const hours = booked.get(e.id)?.hours ?? 0;
      const freeHours = Math.max(0, weekCapacity - hours);
      return {
        id: e.id,
        name: e.name,
        initials: initials(e.name),
        role: e.skills[0] ?? "—",
        department: e.department,
        freeHours,
        capacity: weekCapacity,
        availableFrom:
          freeHours >= weekCapacity ? "Now" : hours >= weekCapacity ? "Fully booked" : "Partial",
        skills: e.skills,
        bookedPct: weekCapacity > 0 ? Math.round((hours / weekCapacity) * 100) : 0,
      };
    });
}

/**
 * FR-291 / FR-560 — employees whose confirmed allocation ends within the planning window
 * (default: next 14 days from today).
 */
export function buildRollingOffFromLive(
  employees: Employee[],
  allocations: ApiAllocation[],
  opts?: {
    windowFrom?: string;
    windowDays?: number;
    workingDaysPerWeek?: number;
  }
): RollingOffPerson[] {
  const windowFrom = opts?.windowFrom ?? toLocalISO(new Date());
  const windowDays = opts?.windowDays ?? 14;
  const windowTo = addDaysISO(windowFrom, windowDays - 1);
  const daysPerWeek = opts?.workingDaysPerWeek ?? 5;
  const empById = new Map(employees.filter((e) => e.status === "active").map((e) => [e.id, e]));

  type Ending = { endDate: string; projectName: string; weeklyHours: number };
  const byEmp = new Map<string, Ending[]>();

  for (const a of allocations) {
    if (!empById.has(a.employeeHrmsId)) continue;
    const end = a.endDate.slice(0, 10);
    if (end < windowFrom || end > windowTo) continue;
    const weeklyHours = Math.round(a.hoursPerDay * daysPerWeek * 10) / 10;
    if (weeklyHours <= 0) continue;
    const list = byEmp.get(a.employeeHrmsId) ?? [];
    list.push({ endDate: end, projectName: a.projectName, weeklyHours });
    byEmp.set(a.employeeHrmsId, list);
  }

  const people: (RollingOffPerson & { _end: string })[] = [];
  for (const [empId, endings] of byEmp) {
    const emp = empById.get(empId);
    if (!emp) continue;
    endings.sort((a, b) => a.endDate.localeCompare(b.endDate));
    const soonest = endings[0]!;
    const freeingHours =
      Math.round(endings.reduce((s, e) => s + e.weeklyHours, 0) * 10) / 10;
    const primary =
      endings.length === 1
        ? soonest.projectName
        : endings.slice().sort((a, b) => b.weeklyHours - a.weeklyHours)[0]!.projectName;

    people.push({
      id: emp.id,
      name: emp.name,
      initials: initials(emp.name),
      currentProject: primary,
      rollsOffDate: formatShortMonthDay(soonest.endDate),
      freeingHours,
      _end: soonest.endDate,
    });
  }

  return people
    .sort((a, b) => a._end.localeCompare(b._end) || a.name.localeCompare(b.name))
    .map(({ _end: _, ...rest }) => rest);
}

function formatShortMonthDay(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const DOW_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export type DeploymentCalendarOpts = {
  /** Working weekdays e.g. Mon…Fri — from AppSettings.workingDays */
  workingDays?: string[];
  /** Company off-day ISO dates (YYYY-MM-DD) */
  companyOffDays?: string[];
  /** As-of date for "Now" vs future label (defaults to today) */
  asOf?: string;
};

function isWorkingDay(iso: string, opts: DeploymentCalendarOpts): boolean {
  const working = opts.workingDays?.length
    ? opts.workingDays
    : ["Mon", "Tue", "Wed", "Thu", "Fri"];
  const dow = new Date(`${iso}T12:00:00`).getDay();
  const label = DOW_LABELS[dow]!;
  if (!working.includes(label)) return false;
  if (opts.companyOffDays?.includes(iso)) return false;
  return true;
}

/** First working day strictly after `iso` (RDR-013/014). */
export function nextWorkingDayAfter(iso: string, opts: DeploymentCalendarOpts = {}): string {
  let d = addDaysISO(iso.slice(0, 10), 1);
  for (let i = 0; i < 400; i++) {
    if (isWorkingDay(d, opts)) return d;
    d = addDaysISO(d, 1);
  }
  return d;
}

/**
 * RDR Available From: next available working date from planning of this project
 * (day after latest allocation end), or "Now" when that date is on/before asOf.
 */
export function formatDeploymentAvailableFrom(
  latestAllocationEnd: string | null,
  opts: DeploymentCalendarOpts = {}
): string {
  const asOf = opts.asOf ?? toLocalISO();
  if (!latestAllocationEnd) return "Now";
  const next = nextWorkingDayAfter(latestAllocationEnd, opts);
  if (next <= asOf) return "Now";
  return formatShortMonthDay(next);
}

/** @deprecated Use buildRollingOffFromLive — kept for any leftover imports. */
export function buildRollingOffEmpty(): RollingOffPerson[] {
  return [];
}

function workingDayCount(
  rangeFrom: string,
  rangeTo: string,
  companyOffDays?: string[],
  workingDays?: string[]
): number {
  const off = new Set((companyOffDays ?? []).map((d) => d.slice(0, 10)));
  const working = workingDays?.length ? workingDays : DEFAULT_WORKING_DAYS;
  let n = 0;
  for (let d = rangeFrom; d <= rangeTo; d = addDaysISO(d, 1)) {
    if (off.has(d)) continue;
    const label = DOW_SHORT[new Date(`${d}T12:00:00`).getDay()]!;
    if (working.includes(label)) n += 1;
  }
  return n;
}

function utilWeekStarts(rangeFrom: string, rangeTo: string): string[] {
  const weeks: string[] = [];
  let d = mondayISO(new Date(`${rangeFrom}T12:00:00`));
  while (d <= rangeTo && weeks.length < 4) {
    weeks.push(d);
    d = addDaysISO(d, 7);
  }
  return weeks;
}

export function buildUtilRowsFromEmployees(
  employees: Employee[],
  periodCapacity = 40,
  allocations: ApiAllocation[] = [],
  companyOffDays?: string[],
  rangeFrom = mondayISO(),
  rangeTo = addDaysISO(mondayISO(), 6),
  workingDays?: string[]
): UtilRow[] {
  const booked = bookedHoursInRange(allocations, rangeFrom, rangeTo, companyOffDays, workingDays);
  const weekStarts = utilWeekStarts(rangeFrom, rangeTo);
  const weekSlices = weekStarts.map((ws) => {
    const we = addDaysISO(ws, 6);
    const from = ws < rangeFrom ? rangeFrom : ws;
    const to = we > rangeTo ? rangeTo : we;
    const days = workingDayCount(from, to, companyOffDays, workingDays);
    const cap =
      periodCapacity > 0 && days > 0
        ? (periodCapacity * days) / Math.max(1, workingDayCount(rangeFrom, rangeTo, companyOffDays, workingDays))
        : days;
    return {
      booked: bookedHoursInRange(allocations, from, to, companyOffDays, workingDays),
      cap,
    };
  });

  return employees
    .filter((e) => e.status === "active")
    .map((e) => {
      const entry = booked.get(e.id);
      const hours = entry?.hours ?? 0;
      const pct = periodCapacity > 0 ? Math.round((hours / periodCapacity) * 100) : 0;
      const trend = weekSlices.map((w) => {
        const h = w.booked.get(e.id)?.hours ?? 0;
        return w.cap > 0 ? h / w.cap : 0;
      });
      while (trend.length < 4) trend.unshift(0);
      return {
        id: e.id,
        name: e.name,
        initials: initials(e.name),
        role: e.skills[0] ?? "—",
        department: e.department,
        pct,
        band: utilBand(pct),
        trend: trend.slice(-4),
        primaryWork: entry?.primaryProject ?? "Unallocated",
        primaryMuted: !entry?.primaryProject,
      };
    });
}

export function buildDeploymentRowsFromEmployees(
  employees: Employee[],
  allEmployees: Employee[] = employees,
  allocations: ApiAllocation[] = [],
  confirmations: ApiConfirmation[] = [],
  rangeFrom = mondayISO(),
  rangeTo = addDaysISO(mondayISO(), 6),
  calendar: DeploymentCalendarOpts = {}
): DeploymentRow[] {
  const nameById = new Map(allEmployees.map((e) => [e.id, e.name]));
  const empById = new Map(employees.map((e) => [e.id, e]));
  const confByEmp = new Map<string, ApiConfirmation[]>();
  for (const c of confirmations) {
    const list = confByEmp.get(c.employeeHrmsId) ?? [];
    list.push(c);
    confByEmp.set(c.employeeHrmsId, list);
  }

  const rows: DeploymentRow[] = [];
  const hoursByKey = new Map<string, number>();
  const endByKey = new Map<string, string>();
  const sampleByKey = new Map<string, ApiAllocation>();

  for (const a of allocations) {
    const hours = weekdayHoursInRange(
      a.startDate.slice(0, 10),
      a.endDate.slice(0, 10),
      rangeFrom,
      rangeTo,
      a.hoursPerDay
    );
    if (hours <= 0) continue;
    const emp = empById.get(a.employeeHrmsId);
    if (!emp || emp.status !== "active") continue;
    const key = `${a.employeeHrmsId}:${a.projectCode}`;
    hoursByKey.set(key, (hoursByKey.get(key) ?? 0) + hours);
    const end = a.endDate.slice(0, 10);
    const prevEnd = endByKey.get(key);
    if (!prevEnd || end > prevEnd) endByKey.set(key, end);
    if (!sampleByKey.has(key)) sampleByKey.set(key, a);
  }

  for (const [key, hours] of hoursByKey) {
    const [empId, projectCode] = key.split(":");
    const emp = empById.get(empId!);
    if (!emp) continue;
    const sample = sampleByKey.get(key);
    const mine = confByEmp.get(emp.id) ?? [];
    const weekdays = weekdayCount(rangeFrom, rangeTo);
    const confirmedDays = mine.filter(
      (c) => c.workDate >= rangeFrom && c.workDate <= rangeTo
    ).length;
    const discipline =
      weekdays > 0 ? Math.round((confirmedDays / weekdays) * 100) : undefined;

    let planned = 0;
    let actual = 0;
    for (const c of mine) {
      if (c.workDate < rangeFrom || c.workDate > rangeTo) continue;
      for (const l of c.lines) {
        if (sample && (l.projectLabel === sample.projectName || l.allocationId === sample.id)) {
          planned += l.plannedHours;
          actual += l.actualHours;
        }
      }
    }
    const accuracy =
      planned > 0 ? Math.round((Math.min(actual, planned) / planned) * 100) : undefined;
    const status: DeploymentStatus = hours > 0 ? "Allocated" : "Available";
    const availableFrom = formatDeploymentAvailableFrom(endByKey.get(key) ?? null, calendar);

    rows.push({
      id: `dep-${key}`,
      employeeId: emp.id,
      employeeName: emp.name,
      department: emp.department,
      resourceOwnerId: emp.resourceOwnerId ?? "",
      resourceOwnerName: emp.resourceOwnerId
        ? (nameById.get(emp.resourceOwnerId) ?? "—")
        : "—",
      primarySkill: emp.skills[0] ?? "—",
      projectId: projectCode,
      projectName: sample?.projectName ?? "—",
      allocationHours: Math.round(hours * 10) / 10,
      availableFrom,
      planningAccuracy: accuracy,
      confirmationDiscipline: discipline,
      status,
    });
  }

  for (const e of employees.filter((x) => x.status === "active")) {
    if ([...hoursByKey.keys()].some((k) => k.startsWith(`${e.id}:`))) continue;
    rows.push({
      id: `dep-${e.id}`,
      employeeId: e.id,
      employeeName: e.name,
      department: e.department,
      resourceOwnerId: e.resourceOwnerId ?? "",
      resourceOwnerName: e.resourceOwnerId
        ? (nameById.get(e.resourceOwnerId) ?? "—")
        : "—",
      primarySkill: e.skills[0] ?? "—",
      projectName: "Unallocated",
      allocationHours: 0,
      availableFrom: "Now",
      status: "Available",
    });
  }

  return rows.sort((a, b) => a.employeeName.localeCompare(b.employeeName));
}

export function buildPerformanceRowsFromEmployees(
  employees: Employee[],
  weekCapacity = 40,
  allocations: ApiAllocation[] = [],
  confirmations: ApiConfirmation[] = [],
  rangeFrom = mondayISO(),
  rangeTo = addDaysISO(mondayISO(), 6)
): PerformanceRow[] {
  const nameById = new Map(employees.map((e) => [e.id, e.name]));
  const booked = bookedHoursInRange(allocations, rangeFrom, rangeTo);
  const weekdays = weekdayCount(rangeFrom, rangeTo);
  const confByEmp = new Map<string, ApiConfirmation[]>();
  for (const c of confirmations) {
    const list = confByEmp.get(c.employeeHrmsId) ?? [];
    list.push(c);
    confByEmp.set(c.employeeHrmsId, list);
  }

  return employees.map((e) => {
    const hours = booked.get(e.id)?.hours ?? 0;
    const mine = confByEmp.get(e.id) ?? [];
    const inRange = mine.filter((c) => c.workDate >= rangeFrom && c.workDate <= rangeTo);
    const confirmedDays = inRange.length;
    const discipline =
      weekdays > 0 ? Math.round((confirmedDays / weekdays) * 100) : undefined;

    let planned = 0;
    let actual = 0;
    for (const c of inRange) {
      for (const l of c.lines) {
        planned += l.plannedHours;
        actual += l.actualHours;
      }
    }
    const accuracy =
      planned > 0 ? Math.round((Math.min(actual, planned) / planned) * 100) : undefined;

    const capacityDays = weekdays || 5;
    const periodCapacity = (weekCapacity / 5) * capacityDays;
    const utilPct = periodCapacity > 0 ? Math.round((hours / periodCapacity) * 100) : 0;

    return {
      id: `perf-${e.id}`,
      employeeId: e.id,
      employeeName: e.name,
      department: e.department,
      resourceOwnerId: e.resourceOwnerId ?? "",
      resourceOwnerName: e.resourceOwnerId
        ? (nameById.get(e.resourceOwnerId) ?? "—")
        : "—",
      primarySkill: e.skills[0] ?? "—",
      employmentStatus: e.status,
      planningAccuracy: accuracy,
      confirmationDiscipline: discipline,
      utilizationHrs: Math.round(hours * 10) / 10,
      billablePct: Math.min(100, utilPct),
      nonBillablePct: Math.max(0, 100 - Math.min(100, utilPct)),
      availableCapacityHrs: Math.max(0, Math.round((periodCapacity - hours) * 10) / 10),
    };
  });
}

export function buildExecutionRowsFromProjects(
  projects: Project[],
  allocations: ApiAllocation[] = [],
  confirmations: ApiConfirmation[] = [],
  rangeFrom = mondayISO(),
  rangeTo = addDaysISO(mondayISO(), 6)
): ExecutionRow[] {
  return projects
    .filter((p) => p.status === "active")
    .map((p) => {
      const allocs = allocations.filter((a) => a.projectCode === p.id);
      let hours = 0;
      const people = new Set<string>();
      for (const a of allocs) {
        const h = weekdayHoursInRange(
          a.startDate.slice(0, 10),
          a.endDate.slice(0, 10),
          rangeFrom,
          rangeTo,
          a.hoursPerDay
        );
        if (h > 0) {
          hours += h;
          people.add(a.employeeHrmsId);
        }
      }

      let planned = 0;
      let actual = 0;
      let confirmedLineDays = 0;
      for (const c of confirmations) {
        if (c.workDate < rangeFrom || c.workDate > rangeTo) continue;
        const projectLines = c.lines.filter(
          (l) => l.projectLabel === p.name || allocs.some((a) => a.id === l.allocationId)
        );
        if (projectLines.length === 0) continue;
        confirmedLineDays += 1;
        for (const l of projectLines) {
          planned += l.plannedHours;
          actual += l.actualHours;
        }
      }

      const weekdays = weekdayCount(rangeFrom, rangeTo);
      const discipline =
        weekdays > 0 && people.size > 0
          ? Math.round((confirmedLineDays / (weekdays * people.size)) * 100)
          : people.size === 0
            ? undefined
            : 0;
      const accuracy =
        planned > 0 ? Math.round((Math.min(actual, planned) / planned) * 100) : undefined;

      const unstaffed = people.size === 0;
      // PER-BR-006 / FR-147 — portfolio health only (not recalculated from metrics)
      const health: ProjectHealth = p.health ?? "green";

      return {
        id: `ex-${p.id}`,
        projectId: p.id,
        projectName: p.name,
        projectType: p.type,
        department: "—",
        resourceOwnerId: "",
        resourceOwnerName: "—",
        planningAccuracy: accuracy,
        confirmationDiscipline: discipline,
        utilizationHrs: Math.round(hours * 10) / 10,
        billablePct: unstaffed ? 0 : 100,
        nonBillablePct: 0,
        resourceCount: people.size,
        health,
        executionStatus: "active" as const,
        unstaffedException: unstaffed,
      };
    });
}

/**
 * Contributing resources for a project in a period — same people set as
 * `buildExecutionRowsFromProjects` resourceCount (allocations with hours in range).
 */
export function buildExecutionRosterFromLive(
  projectId: string,
  projectName: string,
  employees: Employee[],
  allocations: ApiAllocation[] = [],
  confirmations: ApiConfirmation[] = [],
  rangeFrom = mondayISO(),
  rangeTo = addDaysISO(mondayISO(), 6),
  hoursPerDayCapacity = 8
): ExecutionRosterEntry[] {
  const empById = new Map(employees.map((e) => [e.id, e]));
  const projectAllocs = allocations.filter((a) => a.projectCode === projectId);
  const byEmp = new Map<
    string,
    { hours: number; hoursPerDayWeighted: number; dayWeight: number }
  >();

  for (const a of projectAllocs) {
    const h = weekdayHoursInRange(
      a.startDate.slice(0, 10),
      a.endDate.slice(0, 10),
      rangeFrom,
      rangeTo,
      a.hoursPerDay
    );
    if (h <= 0) continue;
    const days = a.hoursPerDay > 0 ? h / a.hoursPerDay : 0;
    const prev = byEmp.get(a.employeeHrmsId) ?? {
      hours: 0,
      hoursPerDayWeighted: 0,
      dayWeight: 0,
    };
    prev.hours += h;
    prev.hoursPerDayWeighted += a.hoursPerDay * days;
    prev.dayWeight += days;
    byEmp.set(a.employeeHrmsId, prev);
  }

  const weekdays = weekdayCount(rangeFrom, rangeTo);
  const capacityHrs = weekdays * hoursPerDayCapacity;
  const allocIds = new Set(projectAllocs.map((a) => a.id));

  const entries: ExecutionRosterEntry[] = [];
  for (const [employeeId, agg] of byEmp) {
    const emp = empById.get(employeeId);
    let confirmedDays = 0;
    for (const c of confirmations) {
      if (c.employeeHrmsId !== employeeId) continue;
      if (c.workDate < rangeFrom || c.workDate > rangeTo) continue;
      const hasProjectLine = c.lines.some(
        (l) =>
          l.projectLabel === projectName ||
          (l.allocationId != null && allocIds.has(l.allocationId))
      );
      if (hasProjectLine) confirmedDays += 1;
    }
    const disciplinePct =
      weekdays > 0 ? Math.round((confirmedDays / weekdays) * 100) : undefined;
    const avgHpd =
      agg.dayWeight > 0 ? agg.hoursPerDayWeighted / agg.dayWeight : 0;
    const allocationPct =
      hoursPerDayCapacity > 0
        ? Math.min(100, Math.round((avgHpd / hoursPerDayCapacity) * 100))
        : capacityHrs > 0
          ? Math.min(100, Math.round((agg.hours / capacityHrs) * 100))
          : 0;

    entries.push({
      employeeId,
      name: emp?.name ?? employeeId,
      role: emp?.skills[0] ?? "—",
      department: emp?.department ?? "—",
      utilizationHrs: Math.round(agg.hours * 10) / 10,
      allocationPct,
      disciplinePct,
    });
  }

  return entries.sort(
    (a, b) =>
      b.utilizationHrs - a.utilizationHrs || a.name.localeCompare(b.name)
  );
}

/** Last N calendar months of execution metrics for one project (drawer trend). */
export function buildExecutionHistoryFromLive(
  projectId: string,
  projects: Project[],
  allocations: ApiAllocation[] = [],
  confirmations: ApiConfirmation[] = [],
  monthCount = 6,
  anchorDate = new Date()
): ExecutionHistory | null {
  if (!projects.some((p) => p.id === projectId)) return null;

  const months: ExecutionHistoryMonth[] = [];
  for (let i = monthCount - 1; i >= 0; i--) {
    const d = new Date(anchorDate.getFullYear(), anchorDate.getMonth() - i, 1);
    const from = toLocalISO(d);
    const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    const to = toLocalISO(end);
    const row = buildExecutionRowsFromProjects(
      projects,
      allocations,
      confirmations,
      from,
      to
    ).find((r) => r.projectId === projectId);

    months.push({
      label: d.toLocaleDateString("en-US", { month: "short" }),
      planningAccuracy: row?.unstaffedException ? undefined : row?.planningAccuracy,
      confirmationDiscipline: row?.unstaffedException
        ? undefined
        : row?.confirmationDiscipline,
      utilizationHrs: row?.utilizationHrs ?? 0,
      billablePct: row?.unstaffedException ? 0 : (row?.billablePct ?? 0),
    });
  }

  return { projectId, months };
}

/** Last N calendar months of performance metrics for one employee (RPR-021 drawer). */
export function buildPerformanceHistoryFromLive(
  employeeId: string,
  employees: Employee[],
  weekCapacity = 40,
  allocations: ApiAllocation[] = [],
  confirmations: ApiConfirmation[] = [],
  monthCount = 6,
  anchorDate = new Date()
): PerformanceHistory | null {
  if (!employees.some((e) => e.id === employeeId)) return null;

  const months: PerformanceHistoryMonth[] = [];
  let remainingCapacityHrs: number | undefined;

  for (let i = monthCount - 1; i >= 0; i--) {
    const d = new Date(anchorDate.getFullYear(), anchorDate.getMonth() - i, 1);
    const from = toLocalISO(d);
    const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    const to = toLocalISO(end);
    const row = buildPerformanceRowsFromEmployees(
      employees,
      weekCapacity,
      allocations,
      confirmations,
      from,
      to
    ).find((r) => r.employeeId === employeeId);

    months.push({
      label: d.toLocaleDateString("en-US", { month: "short" }),
      planningAccuracy: row?.planningAccuracy,
      confirmationDiscipline: row?.confirmationDiscipline,
      utilizationHrs: row?.utilizationHrs ?? 0,
      billablePct: row?.billablePct ?? 0,
    });
    if (i === 0 && row?.availableCapacityHrs != null) {
      remainingCapacityHrs = row.availableCapacityHrs;
    }
  }

  return { employeeId, months, remainingCapacityHrs };
}

export function buildDailyWorkRows(
  employees: Employee[],
  projects: Project[],
  allocations: ApiAllocation[],
  confirmations: ApiConfirmation[],
  rangeFrom: string,
  rangeTo: string
): DailyWorkRow[] {
  const empById = new Map(employees.map((e) => [e.id, e]));
  const nameById = new Map(employees.map((e) => [e.id, e.name]));
  const projectByName = new Map(projects.map((p) => [p.name, p]));
  const projectByCode = new Map(projects.map((p) => [p.id, p]));
  const rows: DailyWorkRow[] = [];
  const confirmedAllocDay = new Set<string>();

  for (const c of confirmations) {
    if (c.workDate < rangeFrom || c.workDate > rangeTo) continue;
    const emp = empById.get(c.employeeHrmsId);
    if (!emp) continue;
    for (const l of c.lines) {
      const code = confirmationCode(c, l.kind);
      const delayed = code === "CD" || code === "DD";
      const proj = l.allocationId
        ? allocations.find((a) => a.id === l.allocationId)
        : undefined;
      const project =
        (proj ? projectByCode.get(proj.projectCode) : undefined) ??
        projectByName.get(l.projectLabel);

      if (l.allocationId) {
        confirmedAllocDay.add(`${c.employeeHrmsId}:${l.allocationId}:${c.workDate}`);
      }

      rows.push({
        id: `dw-${l.id}`,
        employeeId: emp.id,
        employeeName: emp.name,
        department: emp.department,
        resourceOwnerId: emp.resourceOwnerId ?? "",
        resourceOwnerName: emp.resourceOwnerId
          ? (nameById.get(emp.resourceOwnerId) ?? "—")
          : "—",
        workDate: c.workDate,
        projectId: project?.id,
        projectName: l.projectLabel,
        projectType: project?.type,
        milestoneName: l.milestoneLabel || undefined,
        activityName: l.activity,
        activityType: l.kind === "unplanned" ? "Internal" : "Billable",
        tasks: l.tasks,
        plannedHours: l.kind === "unplanned" ? undefined : l.plannedHours,
        confirmation: code,
        confirmedOn: c.workDate,
        delayReason: delayed
          ? c.isMissedPosting
            ? (c.missReason ?? "Late posting")
            : "Late posting"
          : undefined,
        deviationReason:
          l.kind === "deviation" || l.kind === "unplanned" ? l.reason : undefined,
        actualHours: l.actualHours,
        planKind: l.kind === "unplanned" ? "Unplanned" : "Plan",
      });
    }
  }

  for (const a of allocations) {
    const emp = empById.get(a.employeeHrmsId);
    if (!emp || emp.status !== "active") continue;
    const project = projectByCode.get(a.projectCode);
    for (let d = rangeFrom; d <= rangeTo; d = addDaysISO(d, 1)) {
      const dow = new Date(`${d}T12:00:00`).getDay();
      if (dow < 1 || dow > 5) continue;
      if (d < a.startDate.slice(0, 10) || d > a.endDate.slice(0, 10)) continue;
      if (confirmedAllocDay.has(`${a.employeeHrmsId}:${a.id}:${d}`)) continue;
      const empConfirmed = confirmations.some(
        (c) => c.employeeHrmsId === a.employeeHrmsId && c.workDate === d
      );
      if (empConfirmed) continue;

      rows.push({
        id: `dw-pend-${a.id}-${d}`,
        employeeId: emp.id,
        employeeName: emp.name,
        department: emp.department,
        resourceOwnerId: emp.resourceOwnerId ?? "",
        resourceOwnerName: emp.resourceOwnerId
          ? (nameById.get(emp.resourceOwnerId) ?? "—")
          : "—",
        workDate: d,
        projectId: a.projectCode,
        projectName: a.projectName,
        projectType: project?.type,
        milestoneName: a.milestoneName,
        activityName: a.activity,
        activityType: "Billable",
        tasks: a.tasks,
        plannedHours: a.hoursPerDay,
        confirmation: "Pending",
        planKind: "Plan",
      });
    }
  }

  return rows.sort((a, b) => {
    const byDate = a.workDate.localeCompare(b.workDate);
    if (byDate !== 0) return byDate;
    return a.employeeName.localeCompare(b.employeeName);
  });
}

/** @deprecated use buildDailyWorkRows */
export function buildDailyWorkRowsEmpty(): DailyWorkRow[] {
  return [];
}

export function buildCandidatesFromEmployees(
  employees: Employee[],
  weekCapacity = 40,
  allocations: Pick<
    ApiAllocation,
    "employeeHrmsId" | "startDate" | "endDate" | "hoursPerDay" | "projectName"
  >[] = [],
  weekStart = mondayISO()
): Candidate[] {
  const booked = bookedHoursByEmployee(allocations as ApiAllocation[], weekStart);
  return employees
    .filter((e) => e.status === "active")
    .map((e) => {
      const hours = booked.get(e.id)?.hours ?? 0;
      const freeHours = Math.max(0, Math.round((weekCapacity - hours) * 10) / 10);
      const overloaded = hours > weekCapacity + 0.01;
      let availability = "available now";
      let availabilityTone: Candidate["availabilityTone"] = "success";
      if (overloaded || freeHours <= 0) {
        availability = overloaded
          ? `Already at ${Math.round(hours)}/${weekCapacity}h · overloaded`
          : "Fully booked";
        availabilityTone = "muted";
      } else if (freeHours < weekCapacity) {
        availability = "partial fit";
        availabilityTone = "warning";
      }
      return {
        id: e.id,
        name: e.name,
        initials: initials(e.name),
        role: e.skills[0] ?? "—",
        dept: e.department,
        fitScore: 50,
        skills: e.skills.map((name) => ({ name, has: true })),
        freeHours,
        availability,
        availabilityTone,
        overloaded: overloaded || undefined,
      };
    });
}

export function buildQueueRowsFromEmployees(
  employees: Employee[],
  reviewerId: string,
  _weekStart: string
): QueueRow[] {
  return employees
    .filter((e) => e.status === "active" && e.id !== reviewerId)
    .map((e) => ({
      employeeId: e.id,
      employeeName: e.name,
      department: e.department,
      role: e.skills[0] ?? "Team Member",
      initials: initials(e.name),
      status: "pending" as const,
      openActionType: undefined,
      openActionNotes: undefined,
      prevRecognition: undefined,
      prevActionCompleted: undefined,
      confirmationDiscipline: null,
      noOperationalData: true,
      noPriorReview: true,
    }));
}

export function buildEmptyEmployeeHistory(
  employeeId: string,
  employeeName: string,
  department = "—"
): EmployeeHistory {
  return {
    employeeId,
    employeeName,
    department,
    competencyLabels: [],
    weeks: [],
    actions: [],
  };
}

export function emptySubmissions(): WeeklyCheckInSubmission[] {
  return [];
}

/** Map an API weekly check-in submission (Prisma-backed) into the client's local shape. */
export function mapApiWeeklySubmission(s: ApiWeeklySubmission): WeeklyCheckInSubmission {
  return {
    id: s.id,
    employeeId: s.employeeId,
    resourceOwnerId: s.resourceOwnerId,
    weekStart: s.weekStart,
    evidence: s.evidence as WeeklyCheckInSubmission["evidence"],
    technicalRatings: s.technicalRatings,
    behaviouralRatings: s.behaviouralRatings,
    weeklyStatus: s.weeklyStatus as WeeklyStatus,
    confidence: s.confidence as WeeklyConfidence,
    roRemarks: s.roRemarks,
    actionType: s.actionType,
    actionNotes: s.actionNotes,
    previousActionStatus: s.previousActionStatus as ActionStatus | undefined,
    recognition: s.recognition as Recognition,
    submittedAt: s.submittedAt,
    submittedByEmployeeId: s.submittedByEmployeeId,
    actionOutcome: s.actionOutcome as ActionStatus | undefined,
  };
}

/** Build evidence snapshot from live allocations + confirmations for a week. */
export function buildLiveWeeklyEvidence(
  employeeHrmsId: string,
  weekStart: string,
  allocations: ApiAllocation[],
  confirmations: ApiConfirmation[],
  weekCapacity = 40,
  workingDays?: string[]
): {
  planningAccuracy: number | null;
  planningDeviationCount: number;
  confirmationDiscipline: number | null;
  confirmationDelayCount: number;
  utilizationHrs: number;
  utilizationCapacityHrs: number;
  billablePct: number;
  nonBillablePct: number;
  projects: string[];
  capturedAt: string;
  noOperationalData?: boolean;
} {
  const { start: weekFrom, end: weekEnd } = workingWeekBounds(weekStart, workingDays);
  const mineAlloc = allocations.filter((a) => a.employeeHrmsId === employeeHrmsId);
  const mineConf = confirmations.filter(
    (c) =>
      c.employeeHrmsId === employeeHrmsId &&
      c.workDate >= weekFrom &&
      c.workDate <= weekEnd
  );

  let hours = 0;
  const projects = new Set<string>();
  const workingSet = new Set(
    (workingDays?.length ? workingDays : ["Mon", "Tue", "Wed", "Thu", "Fri"]).map(String)
  );
  const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
  for (const a of mineAlloc) {
    for (let d = weekFrom; d <= weekEnd; d = addDaysISO(d, 1)) {
      const label = DOW[new Date(`${d}T12:00:00`).getDay()]!;
      if (!workingSet.has(label)) continue;
      if (d < a.startDate.slice(0, 10) || d > a.endDate.slice(0, 10)) continue;
      hours += a.hoursPerDay;
      projects.add(a.projectName);
    }
  }

  let planned = 0;
  let actual = 0;
  let planningDeviationCount = 0;
  let confirmationDelayCount = 0;
  for (const c of mineConf) {
    const delayed =
      new Date(c.submittedAt).getTime() > new Date(`${c.workDate}T10:00:00`).getTime();
    if (delayed) confirmationDelayCount += 1;
    for (const l of c.lines) {
      planned += l.plannedHours;
      actual += l.actualHours;
      if (l.kind === "deviation" || l.kind === "unplanned") planningDeviationCount += 1;
      if (l.projectLabel) projects.add(l.projectLabel);
    }
  }

  const weekdays = workingSet.size || 5;
  const confirmationDiscipline =
    weekdays > 0 ? Math.round((mineConf.length / weekdays) * 100) : null;
  const planningAccuracy =
    planned > 0 ? Math.round((Math.min(actual, planned) / planned) * 100) : null;
  const utilPct = weekCapacity > 0 ? Math.round((hours / weekCapacity) * 100) : 0;
  const noOperationalData = mineAlloc.length === 0 && mineConf.length === 0;

  return {
    planningAccuracy,
    planningDeviationCount,
    confirmationDiscipline,
    confirmationDelayCount,
    utilizationHrs: Math.round(hours * 10) / 10,
    utilizationCapacityHrs: weekCapacity,
    billablePct: Math.min(100, utilPct),
    nonBillablePct: Math.max(0, 100 - Math.min(100, utilPct)),
    projects: [...projects],
    capturedAt: new Date().toISOString(),
    noOperationalData,
  };
}
