// Availability — forward supply view.
// Free capacity is the supply-side mirror of Utilization (demand/load view).

import { UTIL_DEPARTMENTS } from "./utilization";
import { formatHoursDecimalLabel, roundHoursToTenth } from "../utils/formatHours";

export { UTIL_DEPARTMENTS as AVAIL_DEPARTMENTS };

export interface RollingOffPerson {
  id: string;
  name: string;
  initials: string;
  currentProject: string;
  rollsOffDate: string; // e.g. "Jan 17"
  freeingHours: number; // working-day hours that free in the planning window
}

export interface AvailRow {
  id: string;
  name: string;
  initials: string;
  role: string;
  department: string;
  freeHours: number;   // hrs/wk currently free
  capacity: number;    // total hrs/wk capacity
  availableFrom: string; // "Now" or a date string
  skills: string[];
  bookedPct: number;   // 0–100
  resourceOwnerId?: string;
  resourceOwnerName?: string;
}

export const AVAIL_KPIS = {
  totalFreeHrs: 312,
  fullyAvailable: 4,
  rollingOffSoon: 5,
  avgFreeHrs: 22,
};

export type AvailAvgDeltaTone = "success" | "danger" | "muted";

/** Label + tone for Avg Free Hrs / Person vs the prior week. */
export function availAvgDeltaDisplay(
  avgDelta: number | null
): { text: string; tone: AvailAvgDeltaTone } | null {
  if (avgDelta == null) return null;
  if (avgDelta === 0) return { text: "— vs prior week", tone: "muted" };
  const abs = formatHoursDecimalLabel(Math.abs(avgDelta));
  if (avgDelta > 0) return { text: `▲ ${abs} vs prior week`, tone: "danger" };
  return { text: `▼ ${abs} vs prior week`, tone: "success" };
}

/** Mean free hours per person for the rows shown (one week per person). */
export function avgFreeHoursPerPerson(rows: AvailRow[]): number {
  if (rows.length === 0) return 0;
  const total = rows.reduce((sum, r) => sum + r.freeHours, 0);
  return roundHoursToTenth(total / rows.length);
}

/** Rows whose allocation ends within the rolling-off window. */
export function filterAvailRowsRollingOffSoon(
  rows: AvailRow[],
  rollingOffIds: ReadonlySet<string>
): AvailRow[] {
  return rows.filter((r) => rollingOffIds.has(r.id));
}

/**
 * All tab = Available now ∪ Rolling off soon (unique).
 * Excludes Partial / Fully booked people who are not rolling off.
 */
export function filterAvailRowsAllSegments(
  rows: AvailRow[],
  rollingOffIds: ReadonlySet<string>
): AvailRow[] {
  return rows.filter((r) => r.availableFrom === "Now" || rollingOffIds.has(r.id));
}

/** Highest-free people for a week KPI (positive free hours only). */
export function availTopFreePeople(rows: AvailRow[], limit = 3): AvailRow[] {
  return [...rows]
    .filter((r) => r.freeHours > 0)
    .sort((a, b) => {
      const byHours = b.freeHours - a.freeHours;
      if (byHours !== 0) return byHours;
      return a.name.localeCompare(b.name);
    })
    .slice(0, limit);
}

/** Hours suffix + free% of capacity. */
export function availFreeOfCapacityParts(
  freeHrs: number,
  capacityHrs: number
): { ofHours: string; pct: number } {
  const cap = roundHoursToTenth(capacityHrs);
  const free = roundHoursToTenth(freeHrs);
  const pct = cap > 0 ? Math.round((free / cap) * 100) : 0;
  return { ofHours: `of ${formatHoursDecimalLabel(cap)}`, pct };
}

/** Small KPI suffix: `of 250.0h (68%)`. */
export function availFreeOfCapacityLabel(freeHrs: number, capacityHrs: number): string {
  const { ofHours, pct } = availFreeOfCapacityParts(freeHrs, capacityHrs);
  return `${ofHours} (${pct}%)`;
}

export function computeAvailKpis(
  rows: AvailRow[],
  rollingOffSoon = 0,
  priorRows?: AvailRow[]
) {
  if (rows.length === 0) {
    return {
      totalFreeHrs: 0,
      fullyAvailable: 0,
      rollingOffSoon,
      avgFreeHrs: 0,
      avgDelta: null as number | null,
    };
  }
  const totalFreeHrs = rows.reduce((sum, r) => sum + r.freeHours, 0);
  const avgFreeHrs = avgFreeHoursPerPerson(rows);
  const priorAvg =
    priorRows && priorRows.length > 0 ? avgFreeHoursPerPerson(priorRows) : null;
  return {
    totalFreeHrs: roundHoursToTenth(totalFreeHrs),
    fullyAvailable: rows.filter((r) => r.bookedPct === 0).length,
    rollingOffSoon,
    avgFreeHrs,
    avgDelta: priorAvg == null ? null : roundHoursToTenth(avgFreeHrs - priorAvg),
  };
}

export const ROLLING_OFF: RollingOffPerson[] = [
  {
    id: "ro1",
    name: "Deepa Menon",
    initials: "DM",
    currentProject: "Project Falcon",
    rollsOffDate: "Jan 17",
    freeingHours: 16,
  },
  {
    id: "ro2",
    name: "Vikram Kaul",
    initials: "VK",
    currentProject: "Project Falcon",
    rollsOffDate: "Jan 17",
    freeingHours: 10,
  },
  {
    id: "ro3",
    name: "Priya Nair",
    initials: "PN",
    currentProject: "Project Atlas",
    rollsOffDate: "Jan 20",
    freeingHours: 32,
  },
  {
    id: "ro4",
    name: "Arjun Mehta",
    initials: "AM",
    currentProject: "Project Atlas",
    rollsOffDate: "Jan 24",
    freeingHours: 40,
  },
  {
    id: "ro5",
    name: "Ravi Sharma",
    initials: "RS",
    currentProject: "Project Falcon",
    rollsOffDate: "Jan 31",
    freeingHours: 40,
  },
];

export const AVAIL_ROWS: AvailRow[] = [
  {
    id: "av1",
    name: "Tara Gupta",
    initials: "TG",
    role: "Automation Eng",
    department: "DevOps",
    freeHours: 32,
    capacity: 40,
    availableFrom: "Now",
    skills: ["Selenium", "Python", "CI/CD"],
    bookedPct: 22,
  },
  {
    id: "av2",
    name: "Sneha Rao",
    initials: "SR",
    role: "Support Executive",
    department: "Support",
    freeHours: 24,
    capacity: 40,
    availableFrom: "Now",
    skills: ["Jira", "Zendesk", "SLA Mgmt"],
    bookedPct: 40,
  },
  {
    id: "av3",
    name: "Kiran Bose",
    initials: "KB",
    role: "Frontend Dev",
    department: "Engineering",
    freeHours: 40,
    capacity: 40,
    availableFrom: "Now",
    skills: ["React", "TypeScript", "Figma"],
    bookedPct: 0,
  },
  {
    id: "av4",
    name: "Meera Pillai",
    initials: "MP",
    role: "Business Analyst",
    department: "Design",
    freeHours: 40,
    capacity: 40,
    availableFrom: "Now",
    skills: ["Requirements", "SQL", "Stakeholder Mgmt"],
    bookedPct: 0,
  },
  {
    id: "av5",
    name: "Deepa Menon",
    initials: "DM",
    role: "Backend Dev",
    department: "Engineering",
    freeHours: 16,
    capacity: 40,
    availableFrom: "Jan 17",
    skills: ["Node.js", "PostgreSQL", "REST APIs"],
    bookedPct: 60,
  },
  {
    id: "av6",
    name: "Vikram Kaul",
    initials: "VK",
    role: "Sr Backend Dev",
    department: "Engineering",
    freeHours: 10,
    capacity: 40,
    availableFrom: "Jan 17",
    skills: ["Java", "Spring Boot", "Kafka"],
    bookedPct: 75,
  },
  {
    id: "av7",
    name: "Priya Nair",
    initials: "PN",
    role: "QA Engineer",
    department: "QA",
    freeHours: 8,
    capacity: 40,
    availableFrom: "Jan 20",
    skills: ["Manual QA", "Selenium", "Test Plans"],
    bookedPct: 80,
  },
];

export const AVAIL_SKILLS = [...new Set(AVAIL_ROWS.flatMap((r) => r.skills))].sort((a, b) =>
  a.localeCompare(b)
);

export const MIN_FREE_HOUR_OPTIONS = [
  { value: 0, label: "Any" },
  { value: 8, label: "≥ 8h/wk" },
  { value: 16, label: "≥ 16h/wk" },
  { value: 24, label: "≥ 24h/wk" },
  { value: 32, label: "≥ 32h/wk" },
  { value: 40, label: "Fully free (40h)" },
] as const;
