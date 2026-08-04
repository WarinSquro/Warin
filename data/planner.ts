// Shared mock data + types for the Planning area.
// Utilization is measured against billable capacity; hours are the allocation unit.

import { UTIL_DEPARTMENTS } from "./utilization";
import {
  unmetDemandHeadcount,
  type DemandStaffingAllocation,
  type DemandStaffingEmployee,
} from "./demandStaffing";

export type Priority = "critical" | "high" | "medium";
export type ChipKind = "normal" | "over" | "free" | "internal";

export interface Chip {
  label: string;
  kind: ChipKind;
  /** Postgres allocation id when chip is backed by a live allocation */
  allocationId?: string;
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
  bookedHours: number;
  capacity: number;
  weeks: Chip[][]; // 5 week columns
  days: Chip[][]; // 5 day columns (current week)
}

export interface Demand {
  id: string;
  project: string;
  role: string;
  hoursPerWeek: number;
  count: number;
  byDate: string;
  priority: Priority;
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

/** Rolling 5-week / 5-day window anchored on "today" so new allocations appear on the grid. */
function buildPlannerWindow(anchor = new Date()) {
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

function weekdayOverlapDays(rangeStart: string, rangeEnd: string, cellStart: string, cellEnd: string): number {
  const start = Math.max(parseISO(rangeStart).getTime(), parseISO(cellStart).getTime());
  const end = Math.min(parseISO(rangeEnd).getTime(), parseISO(cellEnd).getTime());
  if (end < start) return 0;
  let count = 0;
  for (let t = start; t <= end; t += 86400000) {
    const dow = new Date(t).getDay();
    if (dow >= 1 && dow <= 5) count += 1;
  }
  return count;
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

export function parseChipLabel(label: string) {
  const match = label.match(/^(.+?) · (\d+(?:\.\d+)?)h$/);
  if (!match) return null;
  return { key: match[1].trim(), hours: Number(match[2]) };
}

export function resolveProjectName(key: string) {
  return PROJECT_ALIASES[key] ?? key;
}

export function projectShortName(fullName: string) {
  return PROJECT_SHORT_NAMES[fullName] ?? fullName.replace(/^Project /, "");
}

export function formatChipLabel(projectName: string, hours: number) {
  const h = Number.isInteger(hours) ? hours : parseFloat(hours.toFixed(1));
  return `${projectShortName(projectName)} · ${h}h`;
}

export function cellBookedHours(cell: Chip[]) {
  return cell.reduce((sum, chip) => {
    if (chip.kind === "free") return sum;
    return sum + (parseChipLabel(chip.label)?.hours ?? 0);
  }, 0);
}

export function capacityForView(capacity: number, view: "day" | "week") {
  return view === "week" ? capacity : capacity / 5;
}

export function normalizeCellKinds(cell: Chip[], capacity: number, view: "day" | "week"): Chip[] {
  const limit = capacityForView(capacity, view);
  const over = cellBookedHours(cell) > limit;
  return cell.map((chip) => {
    if (chip.kind === "free") return chip;
    return { ...chip, kind: over ? "over" : "normal" };
  });
}

export function isFutureAllocationCell(view: "day" | "week", cellIndex: number) {
  return view === "week" ? cellIndex > CURRENT_WEEK_INDEX : cellIndex > CURRENT_DAY_INDEX;
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
    bookedHours: 44, capacity: 40,
    weeks: [[N("Falcon · 32h")], [N("Falcon · 32h"), O("Support · 12h")], [N("Falcon · 40h")], [N("Falcon · 40h")], [FREE("Free")]],
    days: [[N("Falcon · 8h")], [N("Falcon · 8h")], [N("Falcon · 8h"), O("Support · 4h")], [N("Falcon · 8h"), O("Support · 4h")], [N("Falcon · 8h"), O("Support · 4h")]],
  },
  {
    id: "p2", name: "Sneha Rao", initials: "SR", dept: "Support", role: "Support Executive",
    bookedHours: 16, capacity: 40,
    weeks: [[N("Support · 16h")], [N("Support · 16h")], [FREE("Free · 24h")], [FREE("Free · 24h")], [FREE("Free")]],
    days: [[N("Support · 4h")], [N("Support · 4h")], [FREE("Free · 8h")], [N("Support · 4h")], [N("Support · 4h")]],
  },
  {
    id: "p3", name: "Arjun Mehta", initials: "AM", dept: "Engineering", role: "Developer",
    bookedHours: 40, capacity: 40,
    weeks: [[N("Atlas · 40h")], [N("Atlas · 40h")], [N("Atlas · 24h")], [FREE("Free")], [FREE("Free")]],
    days: [[N("Atlas · 8h")], [N("Atlas · 8h")], [N("Atlas · 8h")], [N("Atlas · 8h")], [N("Atlas · 8h")]],
  },
  {
    id: "p4", name: "Priya Nair", initials: "PN", dept: "QA", role: "QA Engineer",
    bookedHours: 32, capacity: 40,
    weeks: [[N("Atlas QA · 32h")], [N("Atlas QA · 32h")], [N("Atlas QA · 20h")], [FREE("Free")], [FREE("Free")]],
    days: [[N("Atlas QA · 8h")], [N("Atlas QA · 8h")], [N("Atlas QA · 8h")], [N("Atlas QA · 8h")], [FREE("Free · 8h")]],
  },
  {
    id: "p5", name: "Vikram Kaul", initials: "VK", dept: "Engineering", role: "Sr Backend Dev",
    bookedHours: 30, capacity: 40,
    weeks: [[N("Falcon · 30h")], [N("Falcon · 30h")], [FREE("Free · 10h")], [FREE("Free")], [FREE("Free")]],
    days: [[N("Falcon · 8h")], [N("Falcon · 8h")], [N("Falcon · 8h")], [N("Falcon · 6h")], [FREE("Free · 10h")]],
  },
  {
    id: "p6", name: "Deepa Menon", initials: "DM", dept: "Engineering", role: "Backend Dev",
    bookedHours: 24, capacity: 40,
    weeks: [[N("Falcon · 24h")], [N("Falcon · 24h")], [FREE("Free · 16h")], [FREE("Free")], [FREE("Free")]],
    days: [[N("Falcon · 8h")], [N("Falcon · 8h")], [N("Falcon · 8h")], [FREE("Free · 8h")], [FREE("Free · 8h")]],
  },
  {
    id: "p7", name: "Tara Gupta", initials: "TG", dept: "DevOps", role: "Automation Eng",
    bookedHours: 9, capacity: 40,
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
  capacity: number
): Chip[] {
  const chips: Chip[] = [];
  for (const a of allocs) {
    const days = weekdayOverlapDays(a.startDate, a.endDate, cellStart, cellEnd);
    if (days <= 0) continue;
    const hours = view === "week" ? a.hoursPerDay * days : a.hoursPerDay;
    chips.push({
      label: formatChipLabel(a.projectName, hours),
      kind: "normal",
      allocationId: a.id,
    });
  }
  const booked = cellBookedHours(chips);
  const limit = capacityForView(capacity, view);
  const free = Math.max(0, limit - booked);
  if (chips.length === 0) {
    return [{ label: `Free · ${Number.isInteger(free) ? free : parseFloat(free.toFixed(1))}h`, kind: "free" }];
  }
  if (free > 0.05) {
    chips.push({
      label: `Free · ${Number.isInteger(free) ? free : parseFloat(free.toFixed(1))}h`,
      kind: "free",
    });
  }
  return normalizeCellKinds(chips, capacity, view);
}

/** Build planner grid from live employees + persisted allocations. */
export function buildPlannerRowsFromEmployees(
  employees: { id: string; name: string; department: string; status: string; skills: string[] }[],
  capacity = 40,
  allocations: AllocationSlice[] = []
): PlannerRow[] {
  const byEmp = new Map<string, AllocationSlice[]>();
  for (const a of allocations) {
    const list = byEmp.get(a.employeeHrmsId) ?? [];
    list.push(a);
    byEmp.set(a.employeeHrmsId, list);
  }

  return employees
    .filter((e) => e.status === "active")
    .map((e) => {
      const allocs = byEmp.get(e.id) ?? [];
      const weeks = WEEK_START_ISO.map((start) => {
        const end = toISODate(addDays(parseISO(start), 4));
        return buildCellFromAllocations(allocs, "week", start, end, capacity);
      });
      const days = DAY_START_ISO.map((start) =>
        buildCellFromAllocations(allocs, "day", start, start, capacity)
      );
      const bookedHours = cellBookedHours(weeks[CURRENT_WEEK_INDEX] ?? []);
      return {
        id: e.id,
        name: e.name,
        initials: initialsFromName(e.name),
        dept: e.department,
        role: e.skills[0] ?? "—",
        bookedHours,
        capacity,
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
    demandLines?: { id: string; skills: string[]; count: number }[];
  }[],
  options?: {
    allocations?: DemandStaffingAllocation[];
    employees?: DemandStaffingEmployee[];
    windowFrom?: string;
    windowTo?: string;
  }
): Demand[] {
  const { allocations, employees, windowFrom, windowTo } = options ?? {};
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
          windowTo
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
        priority: "medium",
      });
    }
  }
  return out;
}
