// Utilization is measured against billable / project-eligible capacity only.
// Bands (Idle <70 · Optimal 70–100 · Overloaded >100) come from Settings; shown here as defaults.

export type Band = "over" | "optimal" | "idle";

export interface UtilRow {
  id: string;
  name: string;
  initials: string;
  role: string;
  department: string;
  pct: number;
  band: Band;
  trend: number[]; // 4 weekly ratios (0–1.2)
  primaryWork: string;
  primaryMuted?: boolean;
}

export interface UtilKpis {
  total: number;
  avg: number;
  avgDelta: number;
  over: number;
  optimal: number;
  idle: number;
}

/** Active departments — sorted alphabetically for filters. */
export const UTIL_DEPARTMENTS = ["Design", "DevOps", "Engineering", "QA", "Support"];

export function computeUtilKpis(rows: UtilRow[]): UtilKpis {
  const total = rows.length;
  if (total === 0) {
    return { total: 0, avg: 0, avgDelta: 0, over: 0, optimal: 0, idle: 0 };
  }
  return {
    total,
    avg: Math.round(rows.reduce((sum, r) => sum + r.pct, 0) / total),
    avgDelta: 4,
    over: rows.filter((r) => r.band === "over").length,
    optimal: rows.filter((r) => r.band === "optimal").length,
    idle: rows.filter((r) => r.band === "idle").length,
  };
}

import { buildMonthOptions, monthIdFromDate, type ReportMonthOption } from "../utils/reportPeriods";

export type UtilMonth = ReportMonthOption;

/** Calendar months available in the utilization view (one month at a time). */
export const UTIL_MONTHS: UtilMonth[] = buildMonthOptions();

export const DEFAULT_UTIL_MONTH = monthIdFromDate();

const TARGET_TOTAL = 86;

const DEPT_POOL: string[] = [
  ...Array(38).fill("Engineering"),
  ...Array(16).fill("QA"),
  ...Array(12).fill("Design"),
  ...Array(10).fill("DevOps"),
  ...Array(10).fill("Support"),
];

const SEED_ROWS: UtilRow[] = [
  { id: "u1", name: "Ravi Sharma", initials: "RS", role: "Sr Developer", department: "Engineering", pct: 110, band: "over", trend: [0.6, 0.75, 0.9, 1.0], primaryWork: "Project Falcon" },
  { id: "u2", name: "Arjun Mehta", initials: "AM", role: "Developer", department: "Engineering", pct: 105, band: "over", trend: [0.8, 0.85, 0.95, 1.0], primaryWork: "Project Atlas" },
  { id: "u3", name: "Priya Nair", initials: "PN", role: "QA Engineer", department: "QA", pct: 80, band: "optimal", trend: [0.7, 0.78, 0.82, 0.8], primaryWork: "Project Atlas" },
  { id: "u4", name: "Vikram Kaul", initials: "VK", role: "Sr Backend Dev", department: "Engineering", pct: 75, band: "optimal", trend: [0.6, 0.7, 0.72, 0.75], primaryWork: "Project Falcon" },
  { id: "u5", name: "Deepa Menon", initials: "DM", role: "Backend Dev", department: "Engineering", pct: 60, band: "idle", trend: [0.5, 0.55, 0.6, 0.6], primaryWork: "Project Falcon" },
  { id: "u6", name: "Sneha Rao", initials: "SR", role: "Support Executive", department: "Support", pct: 40, band: "idle", trend: [0.55, 0.45, 0.42, 0.4], primaryWork: "Support queue" },
  { id: "u7", name: "Tara Gupta", initials: "TG", role: "Automation Eng", department: "DevOps", pct: 22, band: "idle", trend: [0.4, 0.3, 0.25, 0.22], primaryWork: "Mostly free", primaryMuted: true },
];

const NAMES = [
  ["Anil", "Kumar"], ["Neha", "Singh"], ["Rahul", "Verma"], ["Kavita", "Desai"], ["Suresh", "Iyer"],
  ["Meera", "Joshi"], ["Karan", "Patel"], ["Divya", "Reddy"], ["Amit", "Chopra"], ["Pooja", "Malhotra"],
  ["Sanjay", "Bhat"], ["Lakshmi", "Pillai"], ["Rohit", "Saxena"], ["Ananya", "Das"], ["Manish", "Goyal"],
];
const ROLES = ["Developer", "Sr Developer", "QA Engineer", "Backend Dev", "Frontend Dev", "DevOps Eng", "BA", "Scrum Master"];
const PROJECTS = ["Project Falcon", "Project Atlas", "Project Nova", "Project Orion", "Support queue", "Internal tooling"];

function bandForPct(pct: number): Band {
  if (pct > 100) return "over";
  if (pct < 70) return "idle";
  return "optimal";
}

function initials(first: string, last: string) {
  return `${first[0]}${last[0]}`.toUpperCase();
}

function expandRows(seed: UtilRow[], total: number): UtilRow[] {
  const rows = [...seed];
  let i = 0;
  while (rows.length < total) {
    const [first, last] = NAMES[i % NAMES.length];
    const pct = [110, 105, 102, 95, 88, 82, 76, 68, 55, 35][i % 10];
    const band = bandForPct(pct);
    const name = `${first} ${last}${i >= NAMES.length ? ` ${Math.floor(i / NAMES.length) + 1}` : ""}`;
    rows.push({
      id: `u${rows.length + 1}`,
      name,
      initials: initials(first, last),
      role: ROLES[i % ROLES.length],
      department: DEPT_POOL[rows.length % DEPT_POOL.length],
      pct,
      band,
      trend: [pct / 120, pct / 115, pct / 110, pct / 100],
      primaryWork: band === "idle" && pct < 30 ? "Mostly free" : PROJECTS[i % PROJECTS.length],
      primaryMuted: band === "idle" && pct < 30,
    });
    i += 1;
  }
  return rows;
}

export const UTIL_ROWS: UtilRow[] = expandRows(SEED_ROWS, TARGET_TOTAL);

/** Baseline KPIs for the full org — use computeUtilKpis for filtered views. */
export const UTIL_KPIS = computeUtilKpis(UTIL_ROWS);
