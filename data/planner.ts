// Shared mock data + types for the Planning area.
// Utilization is measured against billable capacity; hours are the allocation unit.

import { UTIL_DEPARTMENTS } from "./utilization";
import {
  unmetDemandHeadcount,
  type DemandStaffingAllocation,
  type DemandStaffingEmployee,
} from "./demandStaffing";
import { normalizedWorkingDays, workingDayStatus } from "../utils/workingCalendar";
import type { ProjectHealth } from "./executionReport";

export type Priority = "critical" | "high" | "medium";
export type ChipKind = "normal" | "over" | "free" | "internal";

/** Project health → Open Demand rank (Settings → Demand priority order). */
export function demandPriorityFromHealth(health?: ProjectHealth): Priority {
  if (health === "red") return "critical";
  if (health === "amber") return "high";
  return "medium";
}

export interface Chip {
  label: string;
  kind: ChipKind;
  /** Postgres allocation id when chip is backed by a live allocation */
  allocationId?: string;
  /** Saved overallocation reason (shown as red dot on planner chip when set) */
  overallocationReason?: string;
}

export interface AllocationSlice {
  id: string;
  employeeHrmsId: string;
  projectName: string;
  projectCode: string;
  milestoneId: string;
  milestoneName: string;
  activity: string;
  tasks: string[];
  startDate: string;
  endDate: string;
  hoursPerDay: number;
  reason?: string;
}

export interface PlannerRow {
  id: string;
  name: string;
  initials: string;
  dept: string;
  role: string; // derived from primary skill (no designation stored)
  /** Allocated hours for Week view (visible week window). */
  bookedHours: number;
  /** Allocated hours for Day view (visible working-day strip). */
  dayBookedHours: number;
  /** Capacity for Week view load bar (sum of holiday-aware week capacities). */
  capacity: number;
  /** Capacity for Day view load bar (sum of holiday-aware day capacities). */
  dayCapacity: number;
  weeks: Chip[][]; // 5 week columns
  days: Chip[][]; // working-day columns for the selected week
}

export interface Demand {
  id: string;
  project: string;
  role: string;
  hoursPerWeek: number;
  count: number;
  byDate: string;
  priority: Priority;
  /** Portfolio health of the project (FR-147). */
  health?: ProjectHealth;
}

export interface Milestone {
  id: string;
  name: string;
}

export interface Project {
  id: string;
  name: string;
  milestones: Milestone[];
}

export interface Candidate {
  id: string;
  name: string;
  initials: string;
  role: string;
  dept: string;
  fitScore: number;
  skills: { name: string; has: boolean }[];
  freeHours: number;
  availability: string;
  availabilityTone: "success" | "warning" | "muted";
  overloaded?: boolean;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() + n);
  return x;
}

function mondayOf(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = x.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  return addDays(x, diff);
}

function shortLabel(d: Date): string {
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

function dayLabel(d: Date): string {
  return `${DAY_NAMES[d.getDay()]} ${d.getDate()}`;
}

const DOW_FROM_MONDAY = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

/** Offsets from Monday (0) for Settings working days, in calendar order. */
export function workingDayOffsetsFromMonday(workingDays?: string[]): number[] {
  const set = new Set(normalizedWorkingDays(workingDays));
  const offsets: number[] = [];
  DOW_FROM_MONDAY.forEach((label, i) => {
    if (set.has(label)) offsets.push(i);
  });
  return offsets.length ? offsets : [0, 1, 2, 3, 4];
}

/** Rolling 5-week / 5-day window anchored on "today" so new allocations appear on the grid. */
export function buildPlannerWindow(anchor = new Date()) {
  const currentMonday = mondayOf(anchor);
  const weekStarts = [0, 1, 2, 3, 4].map((i) => addDays(currentMonday, (i - 1) * 7));
  const dayStarts = [0, 1, 2, 3, 4].map((i) => addDays(currentMonday, i));
  const weekday = anchor.getDay();
  const currentDayIndex = weekday >= 1 && weekday <= 5 ? weekday - 1 : 0;
  return {
    weeks: weekStarts.map(shortLabel),
    days: dayStarts.map(dayLabel),
    weekStartIso: weekStarts.map(toISODate),
    dayStartIso: dayStarts.map(toISODate),
    currentWeekIndex: 1,
    currentDayIndex,
  };
}

/** Day-view nav: one previous week … current … next 3 weeks (matches Week columns). */
export const DAY_WEEK_OFFSET_MIN = -1;
export const DAY_WEEK_OFFSET_MAX = 3;

/**
 * Day-view columns for `currentMonday + weekOffset*7`, using Settings working days
 * (e.g. Mon–Sat → six columns through Saturday).
 * `currentDayIndex` is -1 when not the real current week (no “today” highlight).
 */
export function dayStripForWeekOffset(
  weekOffset: number,
  anchor = new Date(),
  workingDays?: string[]
) {
  const clamped = Math.max(DAY_WEEK_OFFSET_MIN, Math.min(DAY_WEEK_OFFSET_MAX, weekOffset));
  const currentMonday = mondayOf(anchor);
  const selectedMonday = addDays(currentMonday, clamped * 7);
  const offsets = workingDayOffsetsFromMonday(workingDays);
  const dayStarts = offsets.map((i) => addDays(selectedMonday, i));
  const todayIso = toISODate(anchor);
  const todayIndex = dayStarts.map(toISODate).indexOf(todayIso);
  return {
    weekOffset: clamped,
    days: dayStarts.map(dayLabel),
    dayStartIso: dayStarts.map(toISODate),
    currentDayIndex: clamped === 0 ? todayIndex : -1,
    /** Past week is view-only — no new/edit allocate from grid. */
    allocateAllowed: clamped >= 0,
  };
}

const PLANNER_WINDOW = buildPlannerWindow();

export const WEEKS = PLANNER_WINDOW.weeks;
export const DAYS = PLANNER_WINDOW.days;
export const CURRENT_WEEK_INDEX = PLANNER_WINDOW.currentWeekIndex;
export const CURRENT_DAY_INDEX = PLANNER_WINDOW.currentDayIndex;
export const OVERALLOCATION_LIMIT = 1.0; // ratio of capacity; from Settings in real system

export const WEEK_START_ISO = PLANNER_WINDOW.weekStartIso;
export const DAY_START_ISO = PLANNER_WINDOW.dayStartIso;

function parseISO(iso: string): Date {
  return new Date(`${iso.slice(0, 10)}T12:00:00`);
}

const PROJECT_ALIASES: Record<string, string> = {
  Falcon: "Project Falcon",
  Atlas: "Project Atlas",
  "Atlas QA": "Project Atlas",
  Auto: "Automation Suite",
  Support: "Project Atlas",
};

const PROJECT_SHORT_NAMES: Record<string, string> = {
  "Project Falcon": "Falcon",
  "Project Atlas": "Atlas",
  "Automation Suite": "Auto",
};

export function formatChipLabel(projectName: string, hours: number) {
  const h = Number.isInteger(hours) ? hours : parseFloat(hours.toFixed(1));
  return `${projectShortName(projectName)} · ${h}h`;
}

export function parseChipLabel(label: string) {
  // Accept middle dot or hyphen separators (UI / copy variants)
  const match = label.match(/^(.+?)\s*(?:·|-|–)\s*(\d+(?:\.\d+)?)h$/);
  if (!match) return null;
  return { key: match[1].trim(), hours: Number(match[2]) };
}

export function resolveProjectName(key: string) {
  return PROJECT_ALIASES[key] ?? key;
}

export function projectShortName(fullName: string) {
  const mapped = PROJECT_SHORT_NAMES[fullName];
  if (mapped) return mapped;
  // "Project Falcon" → "Falcon"; keep full name when strip leaves a tiny label ("Project Z" → "Z").
  const stripped = fullName.replace(/^Project\s+/i, "").trim();
  if (!stripped || stripped.length <= 2) return fullName;
  return stripped;
}

export function cellBookedHours(cell: Chip[]) {
  return cell.reduce((sum, chip) => {
    if (chip.kind === "free") return sum;
    return sum + (parseChipLabel(chip.label)?.hours ?? 0);
  }, 0);
}

/** Sum allocated working hours for an employee over [rangeStart, rangeEnd], excluding holidays. */
export function allocatedHoursInRange(
  allocs: AllocationSlice[],
  rangeStart: string,
  rangeEnd: string,
  opts: PlannerCalendarOpts = {}
): number {
  let total = 0;
  for (const a of allocs) {
    const days = workingOverlapDays(
      a.startDate.slice(0, 10),
      a.endDate.slice(0, 10),
      rangeStart.slice(0, 10),
      rangeEnd.slice(0, 10),
      opts
    );
    if (days > 0) total += a.hoursPerDay * days;
  }
  return Math.round(total * 10) / 10;
}

/**
 * Peak hours/day for an employee over [rangeStart, rangeEnd] on working days,
 * after adding `extraHoursPerDay` (e.g. draft allocation) and optionally excluding one allocation (edit).
 */
export function peakDailyAllocationHours(
  allocs: AllocationSlice[],
  employeeHrmsId: string,
  rangeStart: string,
  rangeEnd: string,
  opts: {
    calendar?: PlannerCalendarOpts;
    extraHoursPerDay?: number;
    excludeAllocationId?: string;
  } = {}
): number {
  const start = rangeStart.slice(0, 10);
  const end = rangeEnd.slice(0, 10);
  if (!employeeHrmsId || !start || !end || end < start) return 0;

  const calendar = opts.calendar ?? {};
  const extra = opts.extraHoursPerDay ?? 0;
  const mine = allocs.filter(
    (a) =>
      a.employeeHrmsId === employeeHrmsId &&
      a.id !== opts.excludeAllocationId
  );

  let peak = 0;
  let sawWorkingDay = false;
  const t0 = parseISO(start).getTime();
  const t1 = parseISO(end).getTime();
  for (let t = t0; t <= t1; t += 86400000) {
    const iso = toISODate(new Date(t));
    if (!isPlannerWorkingDay(iso, calendar)) continue;
    sawWorkingDay = true;
    let dayHrs = extra;
    for (const a of mine) {
      const aStart = a.startDate.slice(0, 10);
      const aEnd = a.endDate.slice(0, 10);
      if (iso >= aStart && iso <= aEnd) dayHrs += a.hoursPerDay;
    }
    if (dayHrs > peak) peak = dayHrs;
  }

  if (!sawWorkingDay) return Math.round(extra * 10) / 10;
  return Math.round(peak * 10) / 10;
}

export function capacityForView(capacity: number, view: "day" | "week", workingDays?: string[]) {
  if (view === "week") return capacity;
  const n = normalizedWorkingDays(workingDays).length || 5;
  return capacity / n;
}

export type PlannerCalendarOpts = {
  workingDays?: string[];
  /** ISO YYYY-MM-DD company off days / holidays */
  companyOffDays?: string[];
  workingHoursPerDay?: number;
};

export function plannerTodayISO(anchor = new Date()): string {
  return toISODate(anchor);
}

/** Whether `iso` is a working day given Settings calendar. */
export function isPlannerWorkingDay(iso: string, opts: PlannerCalendarOpts = {}): boolean {
  return workingDayStatus(iso, {
    workingDays: opts.workingDays,
    companyOffDays: opts.companyOffDays,
  }).ok;
}

/** Count working days in [rangeStart, rangeEnd] ∩ [cellStart, cellEnd]. */
export function workingOverlapDays(
  rangeStart: string,
  rangeEnd: string,
  cellStart: string,
  cellEnd: string,
  opts: PlannerCalendarOpts = {}
): number {
  const start = Math.max(parseISO(rangeStart).getTime(), parseISO(cellStart).getTime());
  const end = Math.min(parseISO(rangeEnd).getTime(), parseISO(cellEnd).getTime());
  if (end < start) return 0;
  let count = 0;
  for (let t = start; t <= end; t += 86400000) {
    if (isPlannerWorkingDay(toISODate(new Date(t)), opts)) count += 1;
  }
  return count;
}

/** Weekly capacity in hours for a Mon–Sun week starting `weekStartIso` (counts Settings working days only). */
export function weekCapacityHours(weekStartIso: string, opts: PlannerCalendarOpts = {}): number {
  const hpd = opts.workingHoursPerDay ?? 8;
  const end = toISODate(addDays(parseISO(weekStartIso), 6));
  const days = workingOverlapDays(weekStartIso, end, weekStartIso, end, opts);
  const raw = days * hpd;
  return Math.round(raw * 10) / 10;
}

/** Day capacity in hours (0 on holiday / non-working). */
export function dayCapacityHours(iso: string, opts: PlannerCalendarOpts = {}): number {
  if (!isPlannerWorkingDay(iso, opts)) return 0;
  return opts.workingHoursPerDay ?? 8;
}

/**
 * Effective date for allocation changes: never before today;
 * for day cells use that day; for week cells use Monday (or today if mid current week).
 */
export function allocationEffectiveDate(
  view: "day" | "week",
  cellIndex: number,
  today = plannerTodayISO(),
  dayStartIso: string[] = DAY_START_ISO,
  weekStartIso: string[] = WEEK_START_ISO
): string {
  if (view === "day") {
    const cell = dayStartIso[cellIndex] ?? today;
    return cell < today ? today : cell;
  }
  const monday = weekStartIso[cellIndex] ?? today;
  const sunday = toISODate(addDays(parseISO(monday), 6));
  if (today >= monday && today <= sunday) return today;
  if (today > sunday) return today;
  return monday;
}

export function addDaysToIso(iso: string, days: number): string {
  return toISODate(addDays(parseISO(iso.slice(0, 10)), days));
}

export function isFutureAllocationCell(view: "day" | "week", cellIndex: number) {
  return view === "week" ? cellIndex > CURRENT_WEEK_INDEX : cellIndex > CURRENT_DAY_INDEX;
}

export function normalizeCellKinds(cell: Chip[], capacity: number, view: "day" | "week"): Chip[] {
  const limit = capacityForView(capacity, view);
  const over = cellBookedHours(cell) > limit;
  return cell.map((chip) => {
    if (chip.kind === "free") return chip;
    return { ...chip, kind: over ? "over" : "normal" };
  });
}

function markOverload(cell: Chip[], limit: number): Chip[] {
  const over = cellBookedHours(cell) > limit + 0.05;
  return cell.map((chip) => {
    if (chip.kind === "free") return chip;
    return { ...chip, kind: over ? "over" : "normal" };
  });
}

export const DEPARTMENTS = UTIL_DEPARTMENTS;

export const ACTIVITIES = [
  "Feature Development",
  "Code Review",
  "Bug Fixing",
  "Testing / QA",
  "Support Queue",
  "Meetings (non-billable)",
];

export const PROJECTS: Project[] = [
  {
    id: "PRJ-014",
    name: "Project Falcon",
    milestones: [
      { id: "m1", name: "M1 · Discovery & design" },
      { id: "m2", name: "M2 · Core build" },
      { id: "m3", name: "M3 · UAT & go-live" },
    ],
  },
  {
    id: "PRJ-015",
    name: "Project Atlas",
    milestones: [
      { id: "a1", name: "M1 · Setup" },
      { id: "a2", name: "M2 · QA phase" },
    ],
  },
  {
    id: "PRJ-012",
    name: "Automation Suite",
    milestones: [{ id: "g1", name: "General / Ongoing" }],
  },
];

export const OPEN_DEMAND_RIBBON_MAX = 3;

export const OPEN_DEMAND: Demand[] = [
  { id: "d1", project: "Project Falcon", role: "Backend Dev", hoursPerWeek: 40, count: 2, byDate: "Jan 20", priority: "critical" },
  { id: "d2", project: "Project Atlas", role: "QA Engineer", hoursPerWeek: 20, count: 1, byDate: "Jan 27", priority: "high" },
  { id: "d3", project: "Automation Suite", role: "Automation", hoursPerWeek: 15, count: 1, byDate: "Feb 3", priority: "medium" },
  { id: "d4", project: "Project Orion", role: "Frontend Dev", hoursPerWeek: 32, count: 1, byDate: "Feb 10", priority: "high" },
  { id: "d5", project: "Project Falcon", role: "DevOps Eng", hoursPerWeek: 12, count: 1, byDate: "Jan 24", priority: "medium" },
  { id: "d6", project: "Project Nova", role: "UX Designer", hoursPerWeek: 24, count: 1, byDate: "Feb 17", priority: "medium" },
];

const N = (label: string): Chip => ({ label, kind: "normal" });
const O = (label: string): Chip => ({ label, kind: "over" });
const FREE = (label: string): Chip => ({ label, kind: "free" });

export const PLANNER_ROWS: PlannerRow[] = [
  {
    id: "p1", name: "Ravi Sharma", initials: "RS", dept: "Engineering", role: "Sr Developer",
    bookedHours: 44, dayBookedHours: 44, capacity: 40, dayCapacity: 40,
    weeks: [[N("Falcon · 32h")], [N("Falcon · 32h"), O("Support · 12h")], [N("Falcon · 40h")], [N("Falcon · 40h")], [FREE("Free")]],
    days: [[N("Falcon · 8h")], [N("Falcon · 8h")], [N("Falcon · 8h"), O("Support · 4h")], [N("Falcon · 8h"), O("Support · 4h")], [N("Falcon · 8h"), O("Support · 4h")]],
  },
  {
    id: "p2", name: "Sneha Rao", initials: "SR", dept: "Support", role: "Support Executive",
    bookedHours: 16, dayBookedHours: 16, capacity: 40, dayCapacity: 40,
    weeks: [[N("Support · 16h")], [N("Support · 16h")], [FREE("Free · 24h")], [FREE("Free · 24h")], [FREE("Free")]],
    days: [[N("Support · 4h")], [N("Support · 4h")], [FREE("Free · 8h")], [N("Support · 4h")], [N("Support · 4h")]],
  },
  {
    id: "p3", name: "Arjun Mehta", initials: "AM", dept: "Engineering", role: "Developer",
    bookedHours: 40, dayBookedHours: 40, capacity: 40, dayCapacity: 40,
    weeks: [[N("Atlas · 40h")], [N("Atlas · 40h")], [N("Atlas · 24h")], [FREE("Free")], [FREE("Free")]],
    days: [[N("Atlas · 8h")], [N("Atlas · 8h")], [N("Atlas · 8h")], [N("Atlas · 8h")], [N("Atlas · 8h")]],
  },
  {
    id: "p4", name: "Priya Nair", initials: "PN", dept: "QA", role: "QA Engineer",
    bookedHours: 32, dayBookedHours: 32, capacity: 40, dayCapacity: 40,
    weeks: [[N("Atlas QA · 32h")], [N("Atlas QA · 32h")], [N("Atlas QA · 20h")], [FREE("Free")], [FREE("Free")]],
    days: [[N("Atlas QA · 8h")], [N("Atlas QA · 8h")], [N("Atlas QA · 8h")], [N("Atlas QA · 8h")], [FREE("Free · 8h")]],
  },
  {
    id: "p5", name: "Vikram Kaul", initials: "VK", dept: "Engineering", role: "Sr Backend Dev",
    bookedHours: 30, dayBookedHours: 30, capacity: 40, dayCapacity: 40,
    weeks: [[N("Falcon · 30h")], [N("Falcon · 30h")], [FREE("Free · 10h")], [FREE("Free")], [FREE("Free")]],
    days: [[N("Falcon · 8h")], [N("Falcon · 8h")], [N("Falcon · 8h")], [N("Falcon · 6h")], [FREE("Free · 10h")]],
  },
  {
    id: "p6", name: "Deepa Menon", initials: "DM", dept: "Engineering", role: "Backend Dev",
    bookedHours: 24, dayBookedHours: 24, capacity: 40, dayCapacity: 40,
    weeks: [[N("Falcon · 24h")], [N("Falcon · 24h")], [FREE("Free · 16h")], [FREE("Free")], [FREE("Free")]],
    days: [[N("Falcon · 8h")], [N("Falcon · 8h")], [N("Falcon · 8h")], [FREE("Free · 8h")], [FREE("Free · 8h")]],
  },
  {
    id: "p7", name: "Tara Gupta", initials: "TG", dept: "DevOps", role: "Automation Eng",
    bookedHours: 9, dayBookedHours: 9, capacity: 40, dayCapacity: 40,
    weeks: [[N("Auto · 9h")], [FREE("Free · 31h")], [FREE("Free")], [FREE("Free")], [FREE("Free")]],
    days: [[N("Auto · 9h")], [FREE("Free · 8h")], [FREE("Free · 8h")], [FREE("Free · 8h")], [FREE("Free · 8h")]],
  },
];

export const CANDIDATES: Candidate[] = [
  {
    id: "c1", name: "Vikram Kaul", initials: "VK", role: "Sr Backend Dev", dept: "Engineering",
    fitScore: 94, freeHours: 40, availability: "available now", availabilityTone: "success",
    skills: [{ name: "Node.js", has: true }, { name: "PostgreSQL", has: true }, { name: "Payments", has: true }],
  },
  {
    id: "c2", name: "Deepa Menon", initials: "DM", role: "Backend Dev", dept: "Engineering",
    fitScore: 82, freeHours: 24, availability: "partial fit", availabilityTone: "warning",
    skills: [{ name: "Node.js", has: true }, { name: "PostgreSQL", has: true }, { name: "Payments", has: false }],
  },
  {
    id: "c3", name: "Aditya Koshy", initials: "AK", role: "Backend Dev", dept: "Engineering",
    fitScore: 67, freeHours: 8, availability: "frees Jan 27", availabilityTone: "warning",
    skills: [{ name: "Node.js", has: true }, { name: "PostgreSQL", has: false }],
  },
  {
    id: "c4", name: "Ravi Sharma", initials: "RS", role: "Sr Developer", dept: "Engineering",
    fitScore: 58, freeHours: 0, availability: "Already at 44/40h · overloaded", availabilityTone: "muted",
    skills: [{ name: "Node.js", has: true }], overloaded: true,
  },
];

function initialsFromName(name: string) {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return `${parts[0][0] ?? ""}${parts[parts.length - 1][0] ?? ""}`.toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

function buildCellFromAllocations(
  allocs: AllocationSlice[],
  view: "day" | "week",
  cellStart: string,
  cellEnd: string,
  cellCapacity: number,
  calendar: PlannerCalendarOpts = {}
): Chip[] {
  if (view === "day" && !isPlannerWorkingDay(cellStart, calendar)) {
    return [{ label: "Holiday", kind: "free" }];
  }

  const chips: Chip[] = [];
  for (const a of allocs) {
    const days = workingOverlapDays(a.startDate, a.endDate, cellStart, cellEnd, calendar);
    if (days <= 0) continue;
    const hours = view === "week" ? a.hoursPerDay * days : a.hoursPerDay;
    const reason = a.reason?.trim();
    chips.push({
      label: formatChipLabel(a.projectName, hours),
      kind: "normal",
      allocationId: a.id,
      ...(reason ? { overallocationReason: reason } : {}),
    });
  }
  const booked = cellBookedHours(chips);
  const limit = cellCapacity;
  const free = Math.max(0, limit - booked);
  if (chips.length === 0) {
    return [
      {
        label: `Free · ${Number.isInteger(free) ? free : parseFloat(free.toFixed(1))}h`,
        kind: "free",
      },
    ];
  }
  if (free > 0.05) {
    chips.push({
      label: `Free · ${Number.isInteger(free) ? free : parseFloat(free.toFixed(1))}h`,
      kind: "free",
    });
  }
  return markOverload(chips, cellCapacity);
}

/** Build planner grid from live employees + persisted allocations. */
export function buildPlannerRowsFromEmployees(
  employees: { id: string; name: string; department: string; status: string; skills: string[] }[],
  capacity = 40,
  allocations: AllocationSlice[] = [],
  calendar: PlannerCalendarOpts = {},
  opts?: { dayStartIso?: string[]; weekStartIso?: string[] }
): PlannerRow[] {
  const byEmp = new Map<string, AllocationSlice[]>();
  for (const a of allocations) {
    const list = byEmp.get(a.employeeHrmsId) ?? [];
    list.push(a);
    byEmp.set(a.employeeHrmsId, list);
  }

  const daysPerWeek = normalizedWorkingDays(calendar.workingDays).length || 5;
  const hpd = calendar.workingHoursPerDay ?? capacity / daysPerWeek;
  const cal: PlannerCalendarOpts = {
    workingDays: normalizedWorkingDays(calendar.workingDays),
    companyOffDays: calendar.companyOffDays ?? [],
    workingHoursPerDay: hpd,
  };

  const dayStarts = opts?.dayStartIso?.length ? opts.dayStartIso : DAY_START_ISO;
  const weekStarts = opts?.weekStartIso?.length ? opts.weekStartIso : WEEK_START_ISO;

  const dayRangeStart = dayStarts[0]!;
  const dayRangeEnd = dayStarts[dayStarts.length - 1]!;
  const weekRangeStart = weekStarts[0]!;
  const weekRangeEnd = toISODate(addDays(parseISO(weekStarts[weekStarts.length - 1]!), 6));
  const dayStripCapacity = Math.round(
    dayStarts.reduce((sum, iso) => sum + dayCapacityHours(iso, cal), 0) * 10
  ) / 10;
  const weekWindowCapacity = Math.round(
    weekStarts.reduce((sum, start) => sum + weekCapacityHours(start, cal), 0) * 10
  ) / 10;

  return employees
    .filter((e) => e.status === "active")
    .map((e) => {
      const allocs = byEmp.get(e.id) ?? [];
      const weeks = weekStarts.map((start) => {
        const end = toISODate(addDays(parseISO(start), 6));
        const weekCap = weekCapacityHours(start, cal);
        return buildCellFromAllocations(allocs, "week", start, end, weekCap, cal);
      });
      const days = dayStarts.map((start) => {
        const dayCap = dayCapacityHours(start, cal);
        return buildCellFromAllocations(allocs, "day", start, start, dayCap, cal);
      });
      // Total from live allocations over the visible header range (not chip parse / not only current column)
      const dayBookedHours = allocatedHoursInRange(allocs, dayRangeStart, dayRangeEnd, cal);
      const weekBookedHours = allocatedHoursInRange(allocs, weekRangeStart, weekRangeEnd, cal);
      return {
        id: e.id,
        name: e.name,
        initials: initialsFromName(e.name),
        dept: e.department,
        role: e.skills[0] ?? "—",
        bookedHours: weekBookedHours,
        dayBookedHours,
        capacity: weekWindowCapacity > 0 ? weekWindowCapacity : capacity,
        dayCapacity: dayStripCapacity > 0 ? dayStripCapacity : Math.round(hpd * dayStarts.length * 10) / 10,
        weeks,
        days,
      };
    });
}

/** Open demand from project demand lines (empty when no projects). */
export function buildOpenDemandFromProjects(
  projects: {
    id: string;
    name: string;
    status: string;
    health?: ProjectHealth;
    demandLines?: { id: string; skills: string[]; count: number }[];
  }[],
  options?: {
    allocations?: DemandStaffingAllocation[];
    employees?: DemandStaffingEmployee[];
    windowFrom?: string;
    windowTo?: string;
    workingDays?: string[];
  }
): Demand[] {
  const { allocations, employees, windowFrom, windowTo, workingDays } = options ?? {};
  const filterStaffed =
    allocations != null &&
    employees != null &&
    windowFrom != null &&
    windowTo != null;

  const out: Demand[] = [];
  for (const p of projects.filter((x) => x.status === "active")) {
    for (const line of p.demandLines ?? []) {
      let count = line.count;
      if (filterStaffed) {
        count = unmetDemandHeadcount(
          line.count,
          line.skills,
          allocations,
          employees,
          p.id,
          p.name,
          windowFrom,
          windowTo,
          workingDays
        );
        if (count <= 0) continue;
      }
      out.push({
        id: `${p.id}-${line.id}`,
        project: p.name,
        role: line.skills.join(", ") || "Resource",
        hoursPerWeek: 40,
        count,
        byDate: "—",
        health: p.health ?? "green",
        priority: demandPriorityFromHealth(p.health),
      });
    }
  }
  return out;
}
