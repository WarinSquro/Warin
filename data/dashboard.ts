export type Severity = "high" | "medium" | "info";

export interface ActionItem {
  id: string;
  severity: Severity;
  icon: "overload" | "demand" | "idle" | "confirm" | "rolloff";
  title: string;
  detail: string;
  cta: string;
  to: string;
}

export const MGR_KPIS = {
  teamSize: 24,
  avgUtil: 81,
  utilDelta: 3,
  openDemand: 3,
  confirmedToday: 82,
};

export const ACTION_ITEMS: ActionItem[] = [
  {
    id: "a1",
    severity: "high",
    icon: "overload",
    title: "2 people overloaded",
    detail: "Ravi Sharma (110%) and Arjun Mehta (105%) are booked beyond capacity this week.",
    cta: "Rebalance",
    to: "/planner",
  },
  {
    id: "a2",
    severity: "high",
    icon: "demand",
    title: "3 open demand requests",
    detail: "Project Atlas needs 2 Developers by Jan 20 · Project Falcon needs 1 QA by Jan 27.",
    cta: "Find matches",
    to: "/planner",
  },
  {
    id: "a3",
    severity: "medium",
    icon: "idle",
    title: "4 people under-utilized",
    detail: "Below 70% this week — Sneha Rao, Tara Gupta and 2 others have free capacity.",
    cta: "Assign work",
    to: "/utilization",
  },
  {
    id: "a4",
    severity: "medium",
    icon: "confirm",
    title: "5 confirmations pending",
    detail: "82% of the team confirmed today's plan. Nudge the rest before end of day.",
    cta: "Remind",
    to: "/confirmations",
  },
  {
    id: "a5",
    severity: "info",
    icon: "rolloff",
    title: "2 people rolling off soon",
    detail: "Deepa Menon and Vikram Kaul free up from next week — plan ahead.",
    cta: "View availability",
    to: "/availability",
  },
];

export interface TeamLoad {
  id: string;
  name: string;
  initials: string;
  role: string;
  department: string;
  pct: number;
  tone: "over" | "optimal" | "idle";
}

export const TEAM_LOAD: TeamLoad[] = [
  { id: "t1", name: "Ravi Sharma", initials: "RS", role: "Sr Developer", department: "Engineering", pct: 110, tone: "over" },
  { id: "t2", name: "Arjun Mehta", initials: "AM", role: "Developer", department: "Engineering", pct: 105, tone: "over" },
  { id: "t3", name: "Priya Nair", initials: "PN", role: "QA Engineer", department: "QA", pct: 80, tone: "optimal" },
  { id: "t4", name: "Vikram Kaul", initials: "VK", role: "Sr Backend Dev", department: "Engineering", pct: 75, tone: "optimal" },
  { id: "t5", name: "Deepa Menon", initials: "DM", role: "Backend Dev", department: "Engineering", pct: 60, tone: "idle" },
  { id: "t6", name: "Sneha Rao", initials: "SR", role: "Support Exec", department: "Support", pct: 40, tone: "idle" },
];
