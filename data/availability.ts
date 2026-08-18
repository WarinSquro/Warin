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
  freeingHours: number; // hrs/wk freeing up
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
}

export const AVAIL_KPIS = {
  totalFreeHrs: 312,
  fullyAvailable: 4,
  rollingOffSoon: 5,
  avgFreeHrs: 22,
};

export type AvailAvgDeltaTone = "success" | "danger" | "muted";

/** Label + tone for Avg Free Hrs / Person vs the previous 2 weeks. */
export function availAvgDeltaDisplay(
  avgDelta: number | null
): { text: string; tone: AvailAvgDeltaTone } | null {
  if (avgDelta == null) return null;
  if (avgDelta === 0) return { text: "— vs last 2 weeks", tone: "muted" };
  const abs = formatHoursDecimalLabel(Math.abs(avgDelta));
  if (avgDelta > 0) return { text: `▲ ${abs} vs last 2 weeks`, tone: "success" };
  return { text: `▼ ${abs} vs last 2 weeks`, tone: "danger" };
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
  const avgFreeHrs = roundHoursToTenth(totalFreeHrs / rows.length);
  const priorAvg =
    priorRows && priorRows.length > 0
      ? roundHoursToTenth(priorRows.reduce((s, r) => s + r.freeHours, 0) / priorRows.length)
      : null;
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
