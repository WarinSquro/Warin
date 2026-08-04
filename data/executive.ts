// Executive Dashboard — org-wide, read-only strategic view.

export const EXEC_KPIS = {
  headcount: 96,
  avgUtil: 79,
  utilDelta: 3,
  billablePct: 71,
  openDemand: 12,
  benchCount: 8,
};

// 12-week org-wide utilization trend (%)
export const UTIL_TREND = [
  { week: "W1", util: 72, target: 80 },
  { week: "W2", util: 74, target: 80 },
  { week: "W3", util: 71, target: 80 },
  { week: "W4", util: 76, target: 80 },
  { week: "W5", util: 78, target: 80 },
  { week: "W6", util: 75, target: 80 },
  { week: "W7", util: 80, target: 80 },
  { week: "W8", util: 82, target: 80 },
  { week: "W9", util: 79, target: 80 },
  { week: "W10", util: 77, target: 80 },
  { week: "W11", util: 81, target: 80 },
  { week: "W12", util: 79, target: 80 },
];

// Capacity by department — booked vs free (people)
export const DEPT_CAPACITY = [
  { dept: "Engineering", booked: 34, free: 6 },
  { dept: "QA", booked: 12, free: 3 },
  { dept: "Design", booked: 8, free: 4 },
  { dept: "DevOps", booked: 6, free: 1 },
  { dept: "Support", booked: 9, free: 3 },
];

export type RiskLevel = "high" | "medium" | "low";

export interface RiskSignal {
  id: string;
  level: RiskLevel;
  title: string;
  detail: string;
}

export const RISK_SIGNALS: RiskSignal[] = [
  { id: "r1", level: "high", title: "Engineering over capacity", detail: "6-week trend above 82% — sustained overload risk. Consider 2 hires or rebalancing." },
  { id: "r2", level: "high", title: "12 open demand requests unfilled", detail: "4 critical roles open >2 weeks across Atlas & Falcon. Delivery timelines at risk." },
  { id: "r3", level: "medium", title: "Design bench at 33%", detail: "4 of 12 designers under 70% utilized — reallocate or pipeline new work." },
  { id: "r4", level: "low", title: "Support well-balanced", detail: "Utilization steady at 75% with healthy buffer." },
];

export interface HiringSignal {
  id: string;
  skills: string[];
  dept: string;
  gap: string;
  urgency: RiskLevel;
}

export const HIRING_SIGNALS: HiringSignal[] = [
  { id: "h1", skills: ["React", "Node.js", "AWS"], dept: "Engineering", gap: "2 needed", urgency: "high" },
  { id: "h2", skills: ["Selenium / Playwright", "API testing"], dept: "QA", gap: "1 needed", urgency: "high" },
  { id: "h3", skills: ["Kubernetes / Terraform", "AWS"], dept: "DevOps", gap: "1 needed", urgency: "medium" },
];
