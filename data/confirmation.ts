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

/** Work Confirmation → unplanned work category (stored on line `reason`). */
export const UNPLANNED_WORK_REASONS = [
  {
    value: "No Allocated Work",
    hint: "Resource had available capacity but no work was planned/allotted",
  },
  {
    value: "Client / External Request",
    hint: "Unplanned client call, live meeting, urgent clarification, demo, etc.",
  },
  {
    value: "Internal Meeting / Discussion",
    hint: "Unscheduled internal meeting, review, coordination or discussion",
  },
  {
    value: "Production / Critical Issue",
    hint: "Production bug, outage, urgent customer issue or critical support intervention",
  },
  {
    value: "Urgent Internal Work",
    hint: "Management/department request, urgent internal activity, documentation, data preparation, etc.",
  },
] as const;

export type UnplannedWorkReasonValue = (typeof UNPLANNED_WORK_REASONS)[number]["value"];

const UNPLANNED_REASON_VALUE_SET = new Set<string>(
  UNPLANNED_WORK_REASONS.map((r) => r.value)
);

/** Pre-dropdown saves and placeholders — not a valid category; user must re-select. */
const LEGACY_UNPLANNED_REASONS = new Set(
  ["logged", "unplanned work", "unplanned", ""].map((s) => s.toLowerCase())
);

export function isValidUnplannedReason(reason: string | null | undefined): boolean {
  const t = (reason ?? "").trim();
  return t !== "" && UNPLANNED_REASON_VALUE_SET.has(t);
}

/** Map stored line reason to a dropdown value, or "" when legacy/unknown. */
export function normalizeUnplannedReason(reason: string | null | undefined): string {
  const t = (reason ?? "").trim();
  if (!t) return "";
  if (UNPLANNED_REASON_VALUE_SET.has(t)) return t;
  if (LEGACY_UNPLANNED_REASONS.has(t.toLowerCase())) return "";
  return "";
}

export function unplannedReasonHint(value: string): string | undefined {
  return UNPLANNED_WORK_REASONS.find((r) => r.value === value)?.hint;
}

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

/** @deprecated Unused mock seeds — Team Compliance uses GET /confirmations/team (live DB). */
export const MGR_CONF_KPIS = {
  confirmedPct: 0,
  confirmedCount: 0,
  pending: 0,
  deviations: 0,
  onLeave: 0,
  team: 0,
};

/** @deprecated Unused mock seeds — Team Compliance uses GET /confirmations/team (live DB). */
export const COMPLIANCE_ROWS: ComplianceRow[] = [];

export interface DeviationEntry {
  id: string;
  /** HRMS id — used to filter the manager deviation feed by team member */
  employeeHrmsId?: string;
  name: string;
  initials: string;
  line: string;
  planned: number;
  actual: number;
  reason: string;
  /** Present when loaded from team compliance API. */
  kind?: "deviation" | "unplanned";
  /** Focus timer hours on the work date (deviation lines). */
  focusHours?: number;
  /** ISO YYYY-MM-DD — work date of the deviation */
  workDate: string;
  /** ISO datetime (or YYYY-MM-DD) — when the deviation was submitted / added */
  addedAt?: string;
}

/** @deprecated Unused mock seeds — deviation feed comes from GET /confirmations/team. */
export const DEVIATION_FEED: DeviationEntry[] = [];
