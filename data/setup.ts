// Setup masters: Departments, Skills, Activities.
// All support disable-never-delete via status field.
// Activities link to a milestone; milestone project type controls allocation visibility.

import type { ProjectType, MilestoneKind } from "./projects";
import { milestoneKindLabel } from "./projects";
export { milestoneKindLabel };

export type SetupStatus = "active" | "inactive";

export type DecisionPointAllocationRequirement = "optional" | "required";

export interface Department {
  id: string;
  /** Database BIGINT primary key (string). Prefer for FK keys / WCI config maps. */
  dbId?: string;
  name: string;
  head: string;
  memberCount: number;
  status: SetupStatus;
}

export interface Skill {
  id: string;
  name: string;
  category: string;
  /** Database BIGINT FK to skill_categories.id */
  categoryId?: string;
  peopleCount: number;
  status: SetupStatus;
}

export interface ActivityMilestone {
  id: string;
  name: string;
  projectType: ProjectType;
  kind: MilestoneKind;
}

export interface Activity {
  id: string;
  name: string;
  milestoneId: string;
  billable: boolean;   // false = internal; excluded from utilization denominator
  status: SetupStatus;
  /** Non-deleted allocations on non-deleted projects (setup Disable guard). */
  projectCount?: number;
}

export interface DecisionPointType {
  id: string;
  dbId?: string;
  name: string;
  description: string;
  allocationRequirement: DecisionPointAllocationRequirement;
  status: SetupStatus;
}

export function projectTypeLabel(type: ProjectType) {
  if (type === "paid") return "Paid";
  if (type === "poc") return "POC";
  if (type === "support") return "Support";
  return "Product";
}

export function milestonesForProjectType(
  projectType: ProjectType,
  milestones = ACTIVITY_MILESTONES
) {
  return milestones.filter((m) => m.projectType === projectType);
}

export function activitiesForProjectType(
  projectType: ProjectType | undefined,
  activities = ACTIVITIES,
  milestones = ACTIVITY_MILESTONES
) {
  const active = activities.filter((a) => a.status === "active");
  if (!projectType) return active;
  const allowed = new Set(
    milestones.filter((m) => m.projectType === projectType).map((m) => m.id)
  );
  return active.filter((a) => allowed.has(a.milestoneId));
}

export function catalogMilestoneForProjectMilestone(
  milestoneName: string,
  projectType: ProjectType,
  milestones = ACTIVITY_MILESTONES
) {
  return milestones.find((m) => m.name === milestoneName && m.projectType === projectType);
}

export function activitiesForProjectMilestone(
  milestoneName: string | undefined,
  projectType: ProjectType | undefined,
  activities = ACTIVITIES,
  milestones = ACTIVITY_MILESTONES
) {
  if (!milestoneName || !projectType) return [];
  const catalog = catalogMilestoneForProjectMilestone(milestoneName, projectType, milestones);
  if (!catalog) return [];
  return activities.filter((a) => a.status === "active" && a.milestoneId === catalog.id);
}

export const DEPARTMENTS: Department[] = [
  { id: "dept-1", name: "Engineering", head: "Ravi Sharma", memberCount: 5, status: "active" },
  { id: "dept-2", name: "QA", head: "Priya Nair", memberCount: 2, status: "active" },
  { id: "dept-3", name: "Design", head: "Meera Pillai", memberCount: 2, status: "active" },
  { id: "dept-4", name: "DevOps", head: "Kiran Bose", memberCount: 1, status: "active" },
  { id: "dept-5", name: "Support", head: "Sneha Rao", memberCount: 1, status: "active" },
  { id: "dept-6", name: "Delivery", head: "Vikram Kaul", memberCount: 0, status: "inactive" },
];

export const SKILLS: Skill[] = [
  { id: "sk-1", name: "React", category: "Frontend", peopleCount: 3, status: "active" },
  { id: "sk-2", name: "TypeScript", category: "Frontend", peopleCount: 4, status: "active" },
  { id: "sk-3", name: "Node.js", category: "Backend", peopleCount: 3, status: "active" },
  { id: "sk-4", name: "Java / Spring", category: "Backend", peopleCount: 2, status: "active" },
  { id: "sk-5", name: "Python / Django", category: "Backend", peopleCount: 2, status: "active" },
  { id: "sk-6", name: "Selenium / Playwright", category: "QA", peopleCount: 2, status: "active" },
  { id: "sk-7", name: "Figma / UX Research", category: "Design", peopleCount: 2, status: "active" },
  { id: "sk-8", name: "Kubernetes / Terraform", category: "DevOps", peopleCount: 1, status: "active" },
  { id: "sk-9", name: "PostgreSQL", category: "Backend", peopleCount: 3, status: "active" },
  { id: "sk-10", name: "AWS", category: "DevOps", peopleCount: 2, status: "active" },
  { id: "sk-11", name: "Go / gRPC", category: "Backend", peopleCount: 1, status: "inactive" },
];

export const ACTIVITY_MILESTONES: ActivityMilestone[] = [
  { id: "am-1", name: "M1 · Discovery & Design", projectType: "paid", kind: "commercial_signoff" },
  { id: "am-2", name: "M2 · Core Build", projectType: "paid", kind: "commercial_only" },
  { id: "am-3", name: "M1 · POC Validation", projectType: "poc", kind: "checkpoint_only" },
  { id: "am-4", name: "M1 · Internal Alpha", projectType: "product", kind: "checkpoint_only" },
  { id: "am-5", name: "General / Ongoing", projectType: "product", kind: "checkpoint_only" },
];

export const ACTIVITIES: Activity[] = [
  { id: "act-1", name: "Feature Development", milestoneId: "am-2", billable: true, status: "active" },
  { id: "act-2", name: "Bug Fixing", milestoneId: "am-2", billable: true, status: "active" },
  { id: "act-3", name: "Code Review", milestoneId: "am-2", billable: true, status: "active" },
  { id: "act-4", name: "Testing / QA", milestoneId: "am-1", billable: true, status: "active" },
  { id: "act-5", name: "Design & Prototyping", milestoneId: "am-1", billable: true, status: "active" },
  { id: "act-6", name: "Support Queue", milestoneId: "am-2", billable: true, status: "active" },
  { id: "act-7", name: "Team Sync / Standup", milestoneId: "am-5", billable: false, status: "active" },
  { id: "act-8", name: "Internal Meeting", milestoneId: "am-5", billable: false, status: "active" },
  { id: "act-9", name: "Training / L&D", milestoneId: "am-4", billable: false, status: "active" },
  { id: "act-10", name: "Documentation", milestoneId: "am-3", billable: false, status: "active" },
  { id: "act-11", name: "Sprint Planning", milestoneId: "am-5", billable: false, status: "inactive" },
];
