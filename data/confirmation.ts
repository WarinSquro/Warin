// Work Confirmation — daily, one-click against the plan. Employees confirm "as planned"
// or report deviations (auto-accepted + logged). Managers monitor compliance, no approvals.

import type { DateFormatPattern } from "./settings";
import { formatAppDateWithWeekday } from "../utils/formatAppDate";

export interface PlannedLine {
  id: string;
  project: string;
  milestone: string;
  activity: string;
  plannedHours: number;
  allocatedOn: string;
  tasks: string[];
}

// The signed-in user's plan for today.
export const MY_LINES: PlannedLine[] = [
  {
    id: "l1",
    project: "Project Atlas",
    milestone: "Sprint 12",
    activity: "Development",
    plannedHours: 5,
    allocatedOn: "2026-01-02",
    tasks: ["API integration", "Unit tests"],
  },
  {
    id: "l2",
    project: "Project Falcon",
    milestone: "Design Review",
    activity: "Review meeting",
    plannedHours: 2,
    allocatedOn: "2026-01-05",
    tasks: ["Stakeholder walkthrough"],
  },
  {
    id: "l3",
    project: "Internal",
    milestone: "General / Ongoing",
    activity: "Team sync",
    plannedHours: 1,
    allocatedOn: "2025-12-15",
    tasks: ["Standup", "Sprint planning"],
  },
];

export const CONFIRMATION_TODAY = "2026-01-06";

/** Prior missed-posting filings for the signed-in user (ISO dates). */
export const MISS_POSTING_HISTORY = ["2026-01-03", "2026-01-05"] as const;

export function missedPostingCountInMonth(asOfDate: string): number {
  const monthPrefix = asOfDate.slice(0, 7);
  return MISS_POSTING_HISTORY.filter((d) => d.startsWith(monthPrefix)).length;
}

export const MISS_POSTING_REASONS = [
  "Forgot to post",
  "Was on leave / half-day",
  "System access issue",
  "Travel / off-site",
];

// Historical plans keyed by ISO date (YYYY-MM-DD).
export const HISTORICAL_PLANS: Record<string, PlannedLine[]> = {
  "2026-01-05": [
    {
      id: "h1",
      project: "Project Atlas",
      milestone: "Sprint 12",
      activity: "Development",
      plannedHours: 6,
      allocatedOn: "2026-01-02",
      tasks: ["Feature build", "Code review fixes"],
    },
    {
      id: "h2",
      project: "Project Falcon",
      milestone: "Design Review",
      activity: "Code review",
      plannedHours: 2,
      allocatedOn: "2026-01-04",
      tasks: ["PR review"],
    },
  ],
  "2026-01-04": [
    {
      id: "h3",
      project: "Project Falcon",
      milestone: "Design Review",
      activity: "Development",
      plannedHours: 7,
      allocatedOn: "2026-01-02",
      tasks: ["UI components", "Integration testing", "Bug fixes"],
    },
    {
      id: "h4",
      project: "Internal",
      milestone: "General / Ongoing",
      activity: "Training",
      plannedHours: 1,
      allocatedOn: "2025-12-20",
      tasks: ["Security workshop"],
    },
  ],
  "2026-01-03": [
    {
      id: "h5",
      project: "Project Atlas",
      milestone: "Sprint 12",
      activity: "Testing",
      plannedHours: 4,
      allocatedOn: "2026-01-02",
      tasks: ["Regression suite", "Smoke tests"],
    },
    {
      id: "h6",
      project: "Project Atlas",
      milestone: "Sprint 12",
      activity: "Bug fixes",
      plannedHours: 3,
      allocatedOn: "2026-01-02",
      tasks: ["Defect #142", "Defect #158"],
    },
    {
      id: "h7",
      project: "Internal",
      milestone: "General / Ongoing",
      activity: "Team sync",
      plannedHours: 1,
      allocatedOn: "2025-12-15",
      tasks: ["Standup"],
    },
  ],
};

export function planForDate(_date: string): PlannedLine[] | null {
  // No allocation engine / confirmation store yet — always empty.
  return null;
}

export function formatPlanDate(iso: string, pattern: DateFormatPattern = "dd/MM/yyyy") {
  return formatAppDateWithWeekday(iso, pattern);
}

export const DEVIATION_REASONS = [
  "Blocked / waiting on input",
  "Reprioritized to another task",
  "Meeting overran",
  "On partial leave",
  "Task finished early",
];

// ---- Manager view ----
export type DayStatus =
  | "confirmed"
  | "confirmed_delayed"
  | "deviation"
  | "deviation_delayed"
  | "pending"
  | "leave"
  | "future";

export interface ComplianceRow {
  id: string;
  name: string;
  initials: string;
  role: string;
  week: DayStatus[]; // Settings working days, Mon→Sun order
  todayLabel: string;
}

export const MGR_CONF_KPIS = {
  confirmedPct: 82,
  confirmedCount: 18,
  pending: 5,
  deviations: 3,
  onLeave: 1,
  team: 24,
};

// Today = Tuesday (index 1)
export const COMPLIANCE_ROWS: ComplianceRow[] = [
  { id: "c1", name: "Ravi Sharma", initials: "RS", role: "Sr Developer", week: ["confirmed_delayed", "confirmed", "future", "future", "future"], todayLabel: "Confirmed 9:12 AM" },
  { id: "c2", name: "Arjun Mehta", initials: "AM", role: "Developer", week: ["confirmed", "deviation_delayed", "future", "future", "future"], todayLabel: "Deviation reported" },
  { id: "c3", name: "Priya Nair", initials: "PN", role: "QA Engineer", week: ["confirmed", "confirmed", "future", "future", "future"], todayLabel: "Confirmed 9:40 AM" },
  { id: "c4", name: "Vikram Kaul", initials: "VK", role: "Sr Backend Dev", week: ["deviation", "pending", "future", "future", "future"], todayLabel: "Not yet confirmed" },
  { id: "c5", name: "Deepa Menon", initials: "DM", role: "Backend Dev", week: ["confirmed", "pending", "future", "future", "future"], todayLabel: "Not yet confirmed" },
  { id: "c6", name: "Sneha Rao", initials: "SR", role: "Support Exec", week: ["leave", "leave", "future", "future", "future"], todayLabel: "On leave" },
  { id: "c7", name: "Tara Gupta", initials: "TG", role: "Automation Eng", week: ["confirmed_delayed", "deviation", "future", "future", "future"], todayLabel: "Deviation reported" },
];

export interface DeviationEntry {
  id: string;
  name: string;
  initials: string;
  line: string;
  planned: number;
  actual: number;
  reason: string;
  /** ISO YYYY-MM-DD — work date of the deviation */
  workDate: string;
  /** ISO YYYY-MM-DD — when the deviation was submitted / added */
  addedAt?: string;
}

export const DEVIATION_FEED: DeviationEntry[] = [
  { id: "d1", name: "Arjun Mehta", initials: "AM", line: "Project Atlas · Development", planned: 8, actual: 4, reason: "Blocked / waiting on input", workDate: "2026-01-06", addedAt: "2026-01-06" },
  { id: "d2", name: "Tara Gupta", initials: "TG", line: "Project Falcon · Automation", planned: 6, actual: 8, reason: "Reprioritized to another task", workDate: "2026-01-06", addedAt: "2026-01-06" },
  { id: "d3", name: "Kiran Bose", initials: "KB", line: "Support queue", planned: 8, actual: 5, reason: "On partial leave", workDate: "2026-01-06", addedAt: "2026-01-06" },
];
