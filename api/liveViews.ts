/**
 * Live / empty view builders from Postgres-backed employees, projects,
 * allocations, and work confirmations.
 */
import type { Employee } from "../data/employees";
import type { AvailRow, RollingOffPerson } from "../data/availability";
import type { UtilRow } from "../data/utilization";
import type { DeploymentRow, DeploymentStatus } from "../data/deploymentReport";
import { workingWeekBounds } from "../utils/workingWeek";
import { isConfirmationDelayed } from "../utils/confirmationDelay";
import { APP_DISPLAY_TIMEZONE } from "../utils/formatAppDate";
import { roundHoursToTenth } from "../utils/formatHours";
import { isWorkingWeekday, normalizedWorkingDays, workingDayStatus } from "../utils/workingCalendar";
import { classifyUtilBand } from "../utils/settingsImpact";
import { DEFAULT_SETTINGS, type UtilBands } from "../data/settings";
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
import type { MilestoneKind, Project } from "../data/projects";
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

function isoDay(value: string): string {
  return value.slice(0, 10);
}

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
  const hpd = Number(hoursPerDay);
  if (!Number.isFinite(hpd) || hpd <= 0) return 0;
  let days = 0;
  for (let d = rangeFrom; d <= rangeTo; d = addDaysISO(d, 1)) {
    if (d < startDate || d > endDate) continue;
    if (off.has(d)) continue;
    if (!isWorkingWeekday(d, workingDays)) continue;
    days += 1;
  }
  return hpd * days;
}

const ALLOC_KEY_SEP = "\u0000";

function allocationRowKey(employeeHrmsId: string, projectCode: string): string {
  return `${employeeHrmsId}${ALLOC_KEY_SEP}${projectCode}`;
}

function parseAllocationRowKey(key: string): { employeeHrmsId: string; projectCode: string } {
  const i = key.indexOf(ALLOC_KEY_SEP);
  if (i === -1) return { employeeHrmsId: key, projectCode: "" };
  return { employeeHrmsId: key.slice(0, i), projectCode: key.slice(i + 1) };
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

/** Delayed only when confirmed on a later calendar day than the work date (IST). */
function isDelayed(submittedAt: string, workDate: string): boolean {
  return isConfirmationDelayed(submittedAt, workDate);
}

function confirmationCode(c: ApiConfirmation, lineKind: string): ConfirmationCode {
  const delayed = isDelayed(c.submittedAt, c.workDate);
  if (lineKind === "deviation" || lineKind === "unplanned" || c.hasDeviation) {
    return delayed ? "DD" : "D";
  }
  return delayed ? "CD" : "C";
}

function weekdayCount(
  from: string,
  to: string,
  workingDays?: string[],
  companyOffDays?: string[]
): number {
  return workingDayCount(from, to, companyOffDays, workingDays);
}

function appTodayIso(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_DISPLAY_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/**
 * Confirmation discipline % = confirmed working days / elapsed working days.
 * In-progress period: elapsed through as-of (today). Completed period: full range.
 */
function confirmationDisciplinePct(
  confirmations: { workDate: string }[],
  rangeFrom: string,
  rangeTo: string,
  workingDays?: string[],
  companyOffDays?: string[],
  asOf = appTodayIso()
): number | undefined {
  const from = rangeFrom.slice(0, 10);
  const to = rangeTo.slice(0, 10);
  const today = asOf.slice(0, 10);
  if (today < from) return undefined;
  const through = today < to ? today : to;
  const denom = weekdayCount(from, through, workingDays, companyOffDays);
  if (denom <= 0) return undefined;
  const confirmedDays = new Set(
    confirmations
      .map((c) => c.workDate.slice(0, 10))
      .filter((d) => d >= from && d <= through)
  ).size;
  return Math.round((confirmedDays / denom) * 100);
}

export function buildAvailRowsFromEmployees(
  employees: Employee[],
  weekCapacity = 40,
  allocations: ApiAllocation[] = [],
  companyOffDays?: string[],
  weekStart = mondayISO(),
  workingDays?: string[]
): AvailRow[] {
  const booked = bookedHoursByEmployee(allocations, weekStart, companyOffDays, workingDays);
  return employees
    .filter((e) => e.status === "active")
    .map((e) => {
      const hours = booked.get(e.id)?.hours ?? 0;
      const freeHours = Math.max(0, roundHoursToTenth(weekCapacity - hours));
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

function allocationHoursOnDay(
  a: ApiAllocation,
  iso: string,
  calendar: DeploymentCalendarOpts
): number {
  const start = a.startDate.slice(0, 10);
  const end = a.endDate.slice(0, 10);
  if (iso < start || iso > end) return 0;
  if (!isWorkingDay(iso, calendar)) return 0;
  const h = Number(a.hoursPerDay);
  return Number.isFinite(h) && h > 0 ? h : 0;
}

function workingHoursInRange(
  from: string,
  to: string,
  hoursPerDay: number,
  calendar: DeploymentCalendarOpts
): number {
  if (from > to || hoursPerDay <= 0) return 0;
  let hours = 0;
  for (let d = from; d <= to; d = addDaysISO(d, 1)) {
    if (isWorkingDay(d, calendar)) hours += hoursPerDay;
  }
  return roundHoursToTenth(hours);
}

/**
 * FR-291 / FR-560 — people whose booking actually ends inside the planning window
 * (default: 14 calendar days). Date is the first working day they are free (allocation
 * end dates are inclusive). Hours are remaining working-day capacity in the window,
 * not calendar days and not the sum of each ending row’s weekly hours.
 */
export function buildRollingOffFromLive(
  employees: Employee[],
  allocations: ApiAllocation[],
  opts?: {
    windowFrom?: string;
    windowDays?: number;
    /** @deprecated Ignored — hours use working days in the window, not daysPerWeek × hoursPerDay. */
    workingDaysPerWeek?: number;
    workingDays?: string[];
    companyOffDays?: string[];
  }
): RollingOffPerson[] {
  const windowFrom = opts?.windowFrom ?? toLocalISO(new Date());
  const windowDays = opts?.windowDays ?? 14;
  const windowTo = addDaysISO(windowFrom, windowDays - 1);
  const calendar: DeploymentCalendarOpts = {
    workingDays: opts?.workingDays,
    companyOffDays: opts?.companyOffDays,
  };
  const empById = new Map(employees.filter((e) => e.status === "active").map((e) => [e.id, e]));
  const allocsByEmp = new Map<string, ApiAllocation[]>();
  for (const a of allocations) {
    if (!empById.has(a.employeeHrmsId)) continue;
    const list = allocsByEmp.get(a.employeeHrmsId) ?? [];
    list.push(a);
    allocsByEmp.set(a.employeeHrmsId, list);
  }

  const afterWindow = nextWorkingDayAfter(windowTo, calendar);
  const people: (RollingOffPerson & { _end: string })[] = [];

  for (const [empId, allocs] of allocsByEmp) {
    const emp = empById.get(empId);
    if (!emp) continue;

    let lastBooked: string | null = null;
    const projectHoursOnLast = new Map<string, number>();
    let lastDayLoad = 0;

    for (let d = windowFrom; d <= windowTo; d = addDaysISO(d, 1)) {
      if (!isWorkingDay(d, calendar)) continue;
      let dayHours = 0;
      const byProject = new Map<string, number>();
      for (const a of allocs) {
        const h = allocationHoursOnDay(a, d, calendar);
        if (h <= 0) continue;
        dayHours += h;
        byProject.set(a.projectName, (byProject.get(a.projectName) ?? 0) + h);
      }
      if (dayHours > 0) {
        lastBooked = d;
        lastDayLoad = dayHours;
        projectHoursOnLast.clear();
        for (const [name, h] of byProject) projectHoursOnLast.set(name, h);
      }
    }

    if (!lastBooked || lastDayLoad <= 0) continue;
    const stillBookedAfter = allocs.some((a) => allocationHoursOnDay(a, afterWindow, calendar) > 0);
    if (stillBookedAfter) continue;

    const freeOn = nextWorkingDayAfter(lastBooked, calendar);
    let freeingHours = workingHoursInRange(freeOn, windowTo, lastDayLoad, calendar);
    if (freeingHours <= 0) {
      freeingHours = workingHoursInRange(freeOn, addDaysISO(freeOn, 6), lastDayLoad, calendar);
    }
    if (freeingHours <= 0) continue;

    let primary = "—";
    let best = 0;
    for (const [name, h] of projectHoursOnLast) {
      if (h > best) {
        best = h;
        primary = name;
      }
    }

    people.push({
      id: emp.id,
      name: emp.name,
      initials: initials(emp.name),
      currentProject: primary,
      rollsOffDate: formatShortMonthDay(freeOn),
      freeingHours,
      _end: freeOn,
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

export type DeploymentCalendarOpts = {
  /** Working weekdays e.g. Mon…Fri — from AppSettings.workingDays */
  workingDays?: string[];
  /** Company off-day ISO dates (YYYY-MM-DD) */
  companyOffDays?: string[];
  /** As-of date for "Now" vs future label (defaults to today) */
  asOf?: string;
};

function isWorkingDay(iso: string, opts: DeploymentCalendarOpts): boolean {
  return workingDayStatus(iso, {
    workingDays: opts.workingDays,
    companyOffDays: opts.companyOffDays,
  }).ok;
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
  let n = 0;
  for (let d = rangeFrom; d <= rangeTo; d = addDaysISO(d, 1)) {
    if (off.has(d)) continue;
    if (isWorkingWeekday(d, workingDays)) n += 1;
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
  workingDays?: string[],
  bands: UtilBands = DEFAULT_SETTINGS.bands
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
        band: classifyUtilBand(pct, bands),
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
  const nameById = new Map(allEmployees.map((e) => [e.id.trim(), e.name]));
  const empById = new Map(employees.map((e) => [e.id.trim(), e]));
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
      isoDay(a.startDate),
      isoDay(a.endDate),
      rangeFrom,
      rangeTo,
      a.hoursPerDay,
      calendar.companyOffDays,
      calendar.workingDays
    );
    if (hours <= 0) continue;
    const empId = a.employeeHrmsId?.trim();
    const emp = empId ? empById.get(empId) : undefined;
    if (!emp || emp.status !== "active") continue;
    const key = allocationRowKey(emp.id, a.projectCode);
    hoursByKey.set(key, (hoursByKey.get(key) ?? 0) + hours);
    const end = isoDay(a.endDate);
    const prevEnd = endByKey.get(key);
    if (!prevEnd || end > prevEnd) endByKey.set(key, end);
    if (!sampleByKey.has(key)) sampleByKey.set(key, a);
  }

  for (const [key, hours] of hoursByKey) {
    const { employeeHrmsId: empId, projectCode } = parseAllocationRowKey(key);
    const emp = empById.get(empId);
    if (!emp) continue;
    const sample = sampleByKey.get(key);
    const mine = confByEmp.get(emp.id) ?? [];
    const discipline = confirmationDisciplinePct(
      mine,
      rangeFrom,
      rangeTo,
      calendar.workingDays,
      calendar.companyOffDays,
      calendar.asOf
    );

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
    if ([...hoursByKey.keys()].some((k) => k.startsWith(`${e.id}${ALLOC_KEY_SEP}`))) continue;
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
  rangeTo = addDaysISO(mondayISO(), 6),
  workingDays?: string[],
  companyOffDays?: string[],
  asOf?: string
): PerformanceRow[] {
  const nameById = new Map(employees.map((e) => [e.id, e.name]));
  const booked = bookedHoursInRange(allocations, rangeFrom, rangeTo, companyOffDays, workingDays);
  const weekdays = weekdayCount(rangeFrom, rangeTo, workingDays, companyOffDays);
  const daysPerWeek = normalizedWorkingDays(workingDays).length || 5;
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
    const discipline = confirmationDisciplinePct(
      mine,
      rangeFrom,
      rangeTo,
      workingDays,
      companyOffDays,
      asOf
    );

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

    const capacityDays = weekdays || daysPerWeek;
    const periodCapacity = (weekCapacity / daysPerWeek) * capacityDays;
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
  rangeTo = addDaysISO(mondayISO(), 6),
  workingDays?: string[],
  companyOffDays?: string[]
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
          a.hoursPerDay,
          companyOffDays,
          workingDays
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

      const weekdays = weekdayCount(rangeFrom, rangeTo, workingDays, companyOffDays);
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
  hoursPerDayCapacity = 8,
  workingDays?: string[],
  companyOffDays?: string[]
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
      a.hoursPerDay,
      companyOffDays,
      workingDays
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

  const weekdays = weekdayCount(rangeFrom, rangeTo, workingDays, companyOffDays);
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
  anchorDate = new Date(),
  workingDays?: string[],
  companyOffDays?: string[]
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
      to,
      workingDays,
      companyOffDays
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
  anchorDate = new Date(),
  workingDays?: string[],
  companyOffDays?: string[]
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
      to,
      workingDays,
      companyOffDays
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

function resolveMilestoneType(
  project: Project | undefined,
  milestoneId?: string | null,
  milestoneName?: string | null
): MilestoneKind | undefined {
  if (!project?.milestones?.length) return undefined;
  const id = milestoneId?.trim();
  if (id) {
    const byId = project.milestones.find((m) => String(m.id) === id);
    if (byId?.kind) return byId.kind;
  }
  const name = milestoneName?.trim();
  if (name) {
    const byName = project.milestones.find((m) => m.name === name);
    if (byName?.kind) return byName.kind;
  }
  return undefined;
}

/** Calendar date the allocation was saved, in the product display timezone. */
function allocationDoneDate(iso?: string | null): string | undefined {
  if (!iso) return undefined;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    const m = /^(\d{4}-\d{2}-\d{2})/.exec(iso.trim());
    return m?.[1];
  }
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_DISPLAY_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function allocationCreatedOn(
  alloc?: Pick<ApiAllocation, "createdAt" | "startDate"> | null
): string | undefined {
  return allocationDoneDate(alloc?.createdAt ?? alloc?.startDate);
}

function resolveLineAllocation(
  allocations: ApiAllocation[],
  employeeHrmsId: string,
  allocationId: string | null | undefined,
  projectLabel: string | undefined,
  workDate: string
): ApiAllocation | undefined {
  const id = allocationId != null ? String(allocationId).trim() : "";
  if (id) {
    const byId = allocations.find((a) => String(a.id) === id);
    if (byId) return byId;
  }
  const day = workDate.slice(0, 10);
  return allocations.find((a) => {
    if (a.employeeHrmsId !== employeeHrmsId) return false;
    if (projectLabel && a.projectName !== projectLabel) return false;
    const from = a.startDate.slice(0, 10);
    const to = a.endDate.slice(0, 10);
    return day >= from && day <= to;
  });
}

export function buildDailyWorkRows(
  employees: Employee[],
  projects: Project[],
  allocations: ApiAllocation[],
  confirmations: ApiConfirmation[],
  rangeFrom: string,
  rangeTo: string,
  workingDays?: string[],
  companyOffDays?: string[],
  /** Full employee list for Resource Owner name lookup (scoped rows alone miss owners). */
  nameLookupEmployees?: Employee[]
): DailyWorkRow[] {
  const empById = new Map(employees.map((e) => [e.id, e]));
  const nameSource = nameLookupEmployees?.length ? nameLookupEmployees : employees;
  const nameById = new Map(nameSource.map((e) => [e.id, e.name]));
  const projectByName = new Map(projects.map((p) => [p.name, p]));
  const projectByCode = new Map(projects.map((p) => [p.id, p]));
  const activeAllocIds = new Set(allocations.map((a) => String(a.id)));
  const rows: DailyWorkRow[] = [];
  const confirmedAllocDay = new Set<string>();

  for (const c of confirmations) {
    if (c.workDate < rangeFrom || c.workDate > rangeTo) continue;
    const emp = empById.get(c.employeeHrmsId);
    if (!emp) continue;
    for (const l of c.lines) {
      // Skip lines tied to soft-deleted allocations so removed plans do not reappear.
      if (l.allocationId != null && String(l.allocationId).trim() !== "") {
        const aid = String(l.allocationId).trim();
        if (!activeAllocIds.has(aid)) continue;
      }
      const code = confirmationCode(c, l.kind);
      const delayed = code === "CD" || code === "DD";
      const alloc = resolveLineAllocation(
        allocations,
        c.employeeHrmsId,
        l.allocationId,
        l.projectLabel,
        c.workDate
      );
      const project =
        (alloc ? projectByCode.get(alloc.projectCode) : undefined) ??
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
        milestoneType: resolveMilestoneType(
          project,
          alloc?.milestoneId,
          l.milestoneLabel
        ),
        activityName: l.activity,
        activityType: l.kind === "unplanned" ? "Internal" : "Billable",
        tasks: l.tasks,
        plannedHours: l.kind === "unplanned" ? undefined : l.plannedHours,
        confirmation: code,
        confirmedOn: c.submittedAt || c.workDate,
        delayReason: delayed
          ? c.isMissedPosting
            ? (c.missReason ?? "Late posting")
            : "Late posting"
          : undefined,
        deviationReason:
          l.kind === "deviation" || l.kind === "unplanned" ? l.reason : undefined,
        actualHours: l.actualHours,
        planKind: l.kind === "unplanned" ? "Unplanned" : "Plan",
        allocatedOn: allocationCreatedOn(alloc),
      });
    }
  }

  for (const a of allocations) {
    const emp = empById.get(a.employeeHrmsId);
    if (!emp) continue;
    const project = projectByCode.get(a.projectCode);
    for (let d = rangeFrom; d <= rangeTo; d = addDaysISO(d, 1)) {
      if (
        !workingDayStatus(d, { workingDays, companyOffDays }).ok
      )
        continue;
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
        milestoneType: resolveMilestoneType(
          project,
          a.milestoneId,
          a.milestoneName
        ),
        activityName: a.activity,
        activityType: "Billable",
        tasks: a.tasks,
        plannedHours: a.hoursPerDay,
        confirmation: "Pending",
        planKind: "Plan",
        allocatedOn: allocationCreatedOn(a),
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
      const freeHours = Math.max(0, roundHoursToTenth(weekCapacity - hours));
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
  const weekdays = workingDayCount(weekFrom, weekEnd, undefined, workingDays);
  for (const a of mineAlloc) {
    for (let d = weekFrom; d <= weekEnd; d = addDaysISO(d, 1)) {
      if (!isWorkingWeekday(d, workingDays)) continue;
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
    if (isConfirmationDelayed(c.submittedAt, c.workDate)) confirmationDelayCount += 1;
    for (const l of c.lines) {
      planned += l.plannedHours;
      actual += l.actualHours;
      if (l.kind === "deviation" || l.kind === "unplanned") planningDeviationCount += 1;
      if (l.projectLabel) projects.add(l.projectLabel);
    }
  }

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
