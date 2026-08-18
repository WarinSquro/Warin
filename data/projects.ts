// Project master data.
// Project type: "paid" (PO required), "poc" (approver details required), or "product".
// Milestones are the allocation link targets — a project with no milestones blocks allocation.
// Disable, never delete — deactivated projects preserve history.

export type ProjectStatus = "active" | "inactive";
export type ProjectType = "paid" | "poc" | "product";

export type MilestoneKind =
  | "commercial_only"
  | "signoff_only"
  | "commercial_signoff"
  | "checkpoint_only";

export const MILESTONE_KIND_OPTIONS: { value: MilestoneKind; label: string }[] = [
  { value: "signoff_only", label: "Sign-off" },
  { value: "checkpoint_only", label: "Checkpoint" },
  { value: "commercial_signoff", label: "Sign-off & Commercial" },
  { value: "commercial_only", label: "Commercial" },
];

export function milestoneKindLabel(kind: MilestoneKind | undefined) {
  return MILESTONE_KIND_OPTIONS.find((o) => o.value === kind)?.label ?? "—";
}

export interface Milestone {
  id: string;
  name: string;
  date: string;
  kind?: MilestoneKind;
}

export interface ResourceDemandLine {
  id: string;
  skills: string[];
  count: number;
}

export function formatResourceDemand(lines: ResourceDemandLine[]): string {
  if (lines.length === 0) return "";
  return lines.map((l) => `${l.count}× ${l.skills.join(", ")}`).join(" · ");
}

export interface Project {
  id: string;
  name: string;
  customer: string;
  poNumber: string;
  type: ProjectType;
  approvedByName?: string;
  approvedByDate?: string;
  approvedBySnap?: string;
  kickoffDate: string;
  startDate: string;
  endDate: string;
  milestones: Milestone[];
  demand: string;
  /** Structured demand rows — optional; `demand` is the display string derived on save. */
  demandLines?: ResourceDemandLine[];
  /** Portfolio health (FR-147) — Green / Amber / Red; not recalculated in reports. */
  health?: "green" | "amber" | "red";
  /** Required when health is amber or red (FR-147 / BR-025). */
  healthRemarks?: string;
  status: ProjectStatus;
  /** Non-deleted allocations linked to this project (blocks Disable when > 0). */
  allocationCount?: number;
  /** ISO timestamp from API */
  createdAt?: string;
  /** ISO timestamp from API */
  modifiedAt?: string;
  createdByName?: string;
  modifiedByName?: string;
}

export const CUSTOMERS = [
  "Northwind Inc.",
  "Contoso Ltd.",
  "Globex Corp.",
  "Initech",
  "Umbrella Co.",
  "In-house",
];

export const PROJECTS: Project[] = [
  {
    id: "PRJ-014",
    name: "Project Falcon",
    customer: "Northwind Inc.",
    poNumber: "PO-2024-0091",
    type: "paid",
    kickoffDate: "2024-11-15",
    startDate: "2024-12-01",
    endDate: "2025-03-31",
    milestones: [
      { id: "f-m1", name: "M1 · Discovery & Design", date: "2024-12-20" },
      { id: "f-m2", name: "M2 · Core Build", date: "2025-02-14" },
      { id: "f-m3", name: "M3 · UAT & Go-live", date: "2025-03-28" },
    ],
    demand: "2× Node.js, Java / Spring · 1× Selenium / Playwright",
    demandLines: [
      { id: "rd-f1", skills: ["Node.js", "Java / Spring"], count: 2 },
      { id: "rd-f2", skills: ["Selenium / Playwright"], count: 1 },
    ],
    status: "active",
  },
  {
    id: "PRJ-015",
    name: "Project Atlas",
    customer: "Contoso Ltd.",
    poNumber: "PO-2024-0104",
    type: "paid",
    kickoffDate: "2024-12-01",
    startDate: "2025-01-06",
    endDate: "2025-04-30",
    milestones: [
      { id: "a-m1", name: "M1 · Setup & Onboarding", date: "2025-01-31" },
      { id: "a-m2", name: "M2 · QA Phase", date: "2025-03-15" },
    ],
    demand: "1 Developer, 1 QA",
    status: "active",
  },
  {
    id: "PRJ-016",
    name: "Project Orion",
    customer: "Globex Corp.",
    poNumber: "PO-2025-0007",
    type: "paid",
    kickoffDate: "2025-01-20",
    startDate: "2025-02-01",
    endDate: "2025-06-30",
    milestones: [
      { id: "o-m1", name: "M1 · Requirements", date: "2025-02-28" },
      { id: "o-m2", name: "M2 · Development", date: "2025-04-30" },
      { id: "o-m3", name: "M3 · Delivery", date: "2025-06-20" },
    ],
    demand: "3 Developers, 1 DevOps",
    status: "active",
  },
  {
    id: "PRJ-017",
    name: "Project Nova",
    customer: "Globex Corp.",
    poNumber: "",
    type: "poc",
    approvedByName: "Sarah Chen",
    approvedByDate: "2025-01-08",
    approvedBySnap: "approval-snap.png",
    kickoffDate: "2025-01-10",
    startDate: "2025-01-15",
    endDate: "2025-05-31",
    milestones: [
      { id: "n-m1", name: "M1 · Internal Alpha", date: "2025-03-01" },
    ],
    demand: "1 Developer, 1 Designer",
    status: "active",
  },
  {
    id: "PRJ-018",
    name: "Automation Suite",
    customer: "In-house",
    poNumber: "",
    type: "product",
    kickoffDate: "2025-01-05",
    startDate: "2025-01-06",
    endDate: "2025-12-31",
    milestones: [],
    demand: "1 Automation Eng",
    status: "active",
  },
  {
    id: "PRJ-011",
    name: "Project Helios",
    customer: "Initech",
    poNumber: "PO-2023-0058",
    type: "paid",
    kickoffDate: "2023-06-01",
    startDate: "2023-07-01",
    endDate: "2024-01-31",
    milestones: [
      { id: "h-m1", name: "M1 · Completed", date: "2023-09-30" },
      { id: "h-m2", name: "M2 · Delivered", date: "2024-01-15" },
    ],
    demand: "",
    status: "inactive",
  },
  {
    id: "PRJ-012",
    name: "Project Vega",
    customer: "Umbrella Co.",
    poNumber: "PO-2023-0072",
    type: "paid",
    kickoffDate: "2023-09-01",
    startDate: "2023-10-01",
    endDate: "2024-06-30",
    milestones: [
      { id: "v-m1", name: "M1 · Phase 1", date: "2023-12-31" },
    ],
    demand: "",
    status: "inactive",
  },
];
