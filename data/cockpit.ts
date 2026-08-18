// My Workspace — mock data for Phase 1.
// Phase 2 will aggregate from allocations, confirmations, execution metrics, and RBAC.

import type { ApiAllocation, ApiConfirmation } from "../api/domain";
import {
  buildAttentionProjectsFromLive,
  buildAvailableResourcesFromLive,
  buildPlanningConflictsFromLive,
  buildResourceShortagesFromLive,
  planningWindowLabel,
} from "../api/cockpitDaily";
import { buildDepartmentHealthFromLive } from "../api/departmentHealth";
import {
  addDaysISO,
  buildExecutionRowsFromProjects,
  buildPerformanceRowsFromEmployees,
  mondayISO,
} from "../api/liveViews";
import type { ProjectHealth, ExecutionStatus, ExecutionRow } from "./executionReport";
import { computeExecutionSummary, getExecutionRowsForPeriod } from "./executionReport";
import type { DateFormatPattern, UtilBands } from "./settings";
import { formatAppDateTime } from "../utils/formatAppDate";
import type { PerformanceRow } from "./performanceReport";
import { computePerformanceSummary, getPerformanceRowsForPeriod } from "./performanceReport";
import type { Employee } from "./employees";
import type { Project, ProjectType } from "./projects";
import { DEPT_CAPACITY } from "./executive";
import { workingWeekEnd } from "../utils/workingWeek";
import { currentWeekBounds, formatWeekSpan } from "../utils/reportPeriods";
import { classifyUtilBand } from "../utils/settingsImpact";

export type CockpitRoleId = "executive" | "delivery_head";

export type LoginRole = "executive" | "manager" | "admin";

export function mapLoginToCockpitRole(loginRole: LoginRole): CockpitRoleId | null {
  if (loginRole === "executive") return "executive";
  if (loginRole === "manager") return "delivery_head";
  return null;
}

export interface CockpitRoleProfile {
  id: CockpitRoleId;
  displayName: string;
  scopeLabel: string;
  departments: string[] | null;
}

export const COCKPIT_ROLE_PROFILES: Record<CockpitRoleId, CockpitRoleProfile> = {
  executive: {
    id: "executive",
    displayName: "Executive",
    scopeLabel: "Organization-wide",
    departments: null,
  },
  delivery_head: {
    id: "delivery_head",
    displayName: "Delivery Head",
    scopeLabel: "Engineering & QA",
    departments: ["Engineering", "QA"],
  },
};

export interface AttentionProject {
  projectId: string;
  projectName: string;
  health: ProjectHealth;
  reason: string;
}

export interface ResourceShortage {
  id: string;
  project: string;
  role: string;
  count: number;
  byDate: string;
  department: string;
}

export interface AvailableResource {
  id: string;
  employeeId: string;
  name: string;
  department: string;
  availableFrom: string;
  freeHours: number;
}

export interface PlanningConflictRow {
  id: string;
  employeeId: string;
  employeeName: string;
  department: string;
  projects: string[];
  conflictType: string;
  severity: "high" | "medium";
  detail: string;
}

export type MetricStatus = "ready" | "pending";

export interface WeeklyMetric {
  value: number | null;
  prior: number | null;
  status: MetricStatus;
  suffix?: string;
}

export interface UtilizationTrendWeek {
  week: string;
  /** Human-readable week span, e.g. "Jan 6 – 12". */
  dateRange: string;
  util: number;
}

export interface DeptHealthRow {
  department: string;
  health: ProjectHealth;
  score: number;
  detail: string;
  peopleBooked: number;
  peopleFree: number;
  billablePct: number;
  nonBillablePct: number;
  bookedHours: number;
  capacityHours: number;
}

export type TeamLoadTone = "over" | "optimal" | "idle";

export interface TeamLoadRow {
  id: string;
  plannerRowId: string;
  employeeId: string;
  name: string;
  initials: string;
  role: string;
  department: string;
  pct: number;
  priorPct: number;
  tone: TeamLoadTone;
}

function employeeInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return `${parts[0][0] ?? ""}${parts[parts.length - 1][0] ?? ""}`.toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

/** Current-week allocation load vs Settings weekly capacity (uncapped, same hours as Performance). */
export function teamLoadPctFromHours(hours: number, weekCapacityHours: number): number {
  if (!(weekCapacityHours > 0) || !(hours >= 0)) return 0;
  return Math.round((hours / weekCapacityHours) * 100);
}

export function buildTeamLoadRowsFromPerformance(
  people: Employee[],
  current: PerformanceRow[],
  prior: PerformanceRow[],
  weekCapacityHours: number,
  bands: UtilBands = { idleBelow: 70, optimalTo: 100 }
): TeamLoadRow[] {
  const currentById = new Map(current.map((r) => [r.employeeId, r]));
  const priorById = new Map(prior.map((r) => [r.employeeId, r]));
  return people.map((e) => {
    const pct = teamLoadPctFromHours(currentById.get(e.id)?.utilizationHrs ?? 0, weekCapacityHours);
    const priorPct = teamLoadPctFromHours(priorById.get(e.id)?.utilizationHrs ?? 0, weekCapacityHours);
    return {
      id: `tl-${e.id}`,
      plannerRowId: e.id,
      employeeId: e.id,
      name: e.name,
      initials: employeeInitials(e.name),
      role: e.skills[0] ?? "—",
      department: e.department,
      pct,
      priorPct,
      tone: classifyUtilBand(pct, bands),
    };
  });
}

export interface CockpitBottomMetricItem {
  label: string;
  value: number;
  suffix?: string;
  /** Last 4 weekly values (oldest → newest), e.g. confirmation discipline %. */
  trend?: number[];
  projectType?: ProjectType;
  executionStatus?: ExecutionStatus;
}

export interface CockpitSnapshot {
  profile: CockpitRoleProfile;
  refreshedAt: string;
  planningWindowLabel: string;
  weekContextLabel: string;
  attentionProjects: AttentionProject[];
  resourceShortages: ResourceShortage[];
  availableResources: AvailableResource[];
  planningConflicts: PlanningConflictRow[];
  planningAccuracy: WeeklyMetric;
  confirmationDiscipline: WeeklyMetric;
  worstPlanningProjects: CockpitBottomMetricItem[];
  worstConfirmationEmployees: CockpitBottomMetricItem[];
  utilizationTrend: UtilizationTrendWeek[];
  utilizationAvg: WeeklyMetric;
  departmentHealth: DeptHealthRow[];
  teamLoad: TeamLoadRow[];
}

const DEMO_REFRESH = "Jan 6, 2026, 9:00 AM";
const PLANNING_WINDOW = "Next 2 weeks (Jan 6 – Jan 19)";
/** Aligns with PER/RPR/deployment report week period mocks. */
export const COCKPIT_WEEK_RANGE = "Jan 6 – 12";

export function cockpitWeekContextLabel(): string {
  return `Week of ${COCKPIT_WEEK_RANGE} · vs prior week`;
}

/** Live week label aligned with report period helpers (`reportPeriods` / `reportRange("week")`). */
export function liveCockpitWeekContextLabel(from = new Date(), workingDays?: string[]): string {
  const { start, end } = currentWeekBounds(from, workingDays);
  return `Week of ${formatWeekSpan(start, end)} · vs prior week`;
}

function isoWeekLabel(mondayIso: string): string {
  const d = new Date(`${mondayIso}T12:00:00`);
  const tmp = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = tmp.getUTCDay() || 7;
  tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((tmp.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `W${weekNo}`;
}

/** Projects that have at least one weekday allocation from employees in `departments` within the range. */
function projectIdsForDepartments(
  allocations: ApiAllocation[],
  employees: { id: string; department: string }[],
  departments: string[] | null,
  rangeFrom: string,
  rangeTo: string
): Set<string> | null {
  if (!departments) return null;
  const deptById = new Map(employees.map((e) => [e.id, e.department]));
  const ids = new Set<string>();
  for (const a of allocations) {
    const dept = deptById.get(a.employeeHrmsId);
    if (!dept || !departments.includes(dept)) continue;
    const start = a.startDate.slice(0, 10);
    const end = a.endDate.slice(0, 10);
    if (end < rangeFrom || start > rangeTo) continue;
    ids.add(a.projectCode);
  }
  return ids;
}

function filterExecutionByDeptScope(
  rows: ExecutionRow[],
  projectIds: Set<string> | null
): ExecutionRow[] {
  if (!projectIds) return rows;
  return rows.filter((r) => projectIds.has(r.projectId));
}

function toWeeklyMetric(
  value: number | null,
  prior: number | null | undefined
): WeeklyMetric {
  if (value == null) {
    return { value: null, prior: null, status: "pending", suffix: "%" };
  }
  return { value, prior: prior ?? null, status: "ready", suffix: "%" };
}

const ATTENTION_ALL: AttentionProject[] = [
  { projectId: "PRJ-017", projectName: "Project Nova", health: "red", reason: "Critical health · low discipline" },
  { projectId: "PRJ-016", projectName: "Project Orion", health: "amber", reason: "On hold · declining accuracy" },
  { projectId: "PRJ-020", projectName: "Project Lumen", health: "amber", reason: "Unstaffed · delivery risk" },
];

const SHORTAGES_ALL: ResourceShortage[] = [
  { id: "s1", project: "Project Falcon", role: "Backend Dev", count: 2, byDate: "Jan 20", department: "Engineering" },
  { id: "s2", project: "Project Atlas", role: "QA Engineer", count: 1, byDate: "Jan 27", department: "QA" },
  { id: "s3", project: "Project Orion", role: "Frontend Dev", count: 1, byDate: "Feb 10", department: "Engineering" },
];

const AVAILABLE_ALL: AvailableResource[] = [
  { id: "av1", employeeId: "EMP-1062", name: "Deepa Menon", department: "Engineering", availableFrom: "Jan 17", freeHours: 16 },
  { id: "av2", employeeId: "EMP-1058", name: "Vikram Kaul", department: "Engineering", availableFrom: "Jan 20", freeHours: 12 },
  { id: "av3", employeeId: "EMP-1067", name: "Sneha Rao", department: "Support", availableFrom: "Now", freeHours: 24 },
  { id: "av4", employeeId: "EMP-1071", name: "Tara Gupta", department: "QA", availableFrom: "Jan 13", freeHours: 18 },
];

const CONFLICTS_ALL: PlanningConflictRow[] = [
  {
    id: "c1",
    employeeId: "EMP-1042",
    employeeName: "Ravi Sharma",
    department: "Engineering",
    projects: ["Project Falcon", "Project Atlas"],
    conflictType: "Overallocation",
    severity: "high",
    detail: "Booked 44h/wk against 40h capacity for the week of Jan 6.",
  },
  {
    id: "c2",
    employeeId: "EMP-1043",
    employeeName: "Arjun Mehta",
    department: "Engineering",
    projects: ["Project Falcon", "Project Orion"],
    conflictType: "Double booking",
    severity: "high",
    detail: "Overlapping approved allocations on Jan 8–10.",
  },
  {
    id: "c3",
    employeeId: "EMP-1051",
    employeeName: "Priya Nair",
    department: "QA",
    projects: ["Project Atlas", "Internal R&D"],
    conflictType: "Capacity warning",
    severity: "medium",
    detail: "Allocation exceeds 95% of billable capacity.",
  },
];

const UTIL_TREND_8W: UtilizationTrendWeek[] = [
  { week: "W45", dateRange: "Nov 18 – 24", util: 74 },
  { week: "W46", dateRange: "Nov 25 – Dec 1", util: 76 },
  { week: "W47", dateRange: "Dec 2 – 8", util: 75 },
  { week: "W48", dateRange: "Dec 9 – 15", util: 78 },
  { week: "W49", dateRange: "Dec 16 – 22", util: 77 },
  { week: "W50", dateRange: "Dec 23 – 29", util: 79 },
  { week: "W51", dateRange: "Dec 30 – Jan 5", util: 77 },
  { week: "W52", dateRange: "Jan 6 – 12", util: 80 },
];

function deptPeople(dept: string): { peopleBooked: number; peopleFree: number } {
  const cap = DEPT_CAPACITY.find((d) => d.dept === dept);
  return { peopleBooked: cap?.booked ?? 0, peopleFree: cap?.free ?? 0 };
}

const DEPT_HEALTH_ALL: DeptHealthRow[] = [
  {
    department: "Engineering",
    health: "amber",
    score: 72,
    detail: "Overload + open demand",
    ...deptPeople("Engineering"),
    billablePct: 84,
    nonBillablePct: 16,
    bookedHours: 1120,
    capacityHours: 1360,
  },
  {
    department: "QA",
    health: "green",
    score: 88,
    detail: "Stable discipline",
    ...deptPeople("QA"),
    billablePct: 88,
    nonBillablePct: 12,
    bookedHours: 384,
    capacityHours: 480,
  },
  {
    department: "Design",
    health: "green",
    score: 91,
    detail: "Healthy buffer",
    ...deptPeople("Design"),
    billablePct: 76,
    nonBillablePct: 24,
    bookedHours: 256,
    capacityHours: 480,
  },
  {
    department: "DevOps",
    health: "green",
    score: 85,
    detail: "On target",
    ...deptPeople("DevOps"),
    billablePct: 82,
    nonBillablePct: 18,
    bookedHours: 216,
    capacityHours: 280,
  },
  {
    department: "Support",
    health: "amber",
    score: 68,
    detail: "Under-utilized bench",
    ...deptPeople("Support"),
    billablePct: 58,
    nonBillablePct: 42,
    bookedHours: 288,
    capacityHours: 480,
  },
];

const TEAM_LOAD_ALL: TeamLoadRow[] = [
  { id: "tl1", plannerRowId: "p1", employeeId: "EMP-1042", name: "Ravi Sharma", initials: "RS", role: "Sr Developer", department: "Engineering", pct: 110, priorPct: 105, tone: "over" },
  { id: "tl2", plannerRowId: "p3", employeeId: "EMP-1043", name: "Arjun Mehta", initials: "AM", role: "Developer", department: "Engineering", pct: 105, priorPct: 100, tone: "over" },
  { id: "tl3", plannerRowId: "p4", employeeId: "EMP-1051", name: "Priya Nair", initials: "PN", role: "QA Engineer", department: "QA", pct: 96, priorPct: 90, tone: "over" },
  { id: "tl4", plannerRowId: "p5", employeeId: "EMP-1058", name: "Vikram Kaul", initials: "VK", role: "Sr Backend Dev", department: "Engineering", pct: 62, priorPct: 70, tone: "idle" },
  { id: "tl5", plannerRowId: "p6", employeeId: "EMP-1062", name: "Deepa Menon", initials: "DM", role: "Backend Dev", department: "Engineering", pct: 78, priorPct: 76, tone: "optimal" },
  { id: "tl6", plannerRowId: "p2", employeeId: "EMP-1067", name: "Sneha Rao", initials: "SR", role: "Support Exec", department: "Support", pct: 40, priorPct: 45, tone: "idle" },
];

function filterByDepartments<T extends { department: string }>(
  rows: T[],
  departments: string[] | null
): T[] {
  if (!departments) return rows;
  return rows.filter((r) => departments.includes(r.department));
}

function filterAttention(projects: AttentionProject[], departments: string[] | null): AttentionProject[] {
  if (!departments) return projects;
  return projects.filter((p) => p.projectName !== "Project Lumen");
}

export function getWorstPlanningAccuracyProjects(
  departments: string[] | null,
  limit = 3,
  rows?: ExecutionRow[],
  projectIdScope?: Set<string> | null
): CockpitBottomMetricItem[] {
  const source = rows ?? getExecutionRowsForPeriod("week");
  return source
    .filter(
      (r) =>
        !r.unstaffedException &&
        r.planningAccuracy != null &&
        (projectIdScope == null
          ? departments == null || departments.includes(r.department)
          : projectIdScope.has(r.projectId))
    )
    .sort((a, b) => (a.planningAccuracy ?? 0) - (b.planningAccuracy ?? 0))
    .slice(0, limit)
    .map((r) => ({
      label: r.projectName,
      value: r.planningAccuracy!,
      suffix: "%",
      projectType: r.projectType,
      executionStatus: r.executionStatus,
    }));
}

function buildConfirmationDisciplineTrend(current: number, prior?: number): number[] {
  const priorWeek = prior ?? current;
  const step = current - priorWeek;
  return [
    Math.round(Math.min(100, Math.max(0, priorWeek - step))),
    Math.round(Math.min(100, Math.max(0, priorWeek - step / 2))),
    Math.round(Math.min(100, Math.max(0, priorWeek))),
    current,
  ];
}

export function getWorstConfirmationDisciplineEmployees(
  departments: string[] | null,
  limit = 3,
  rows?: PerformanceRow[],
  priorByEmployeeId?: Map<string, PerformanceRow>
): CockpitBottomMetricItem[] {
  const source = rows ?? getPerformanceRowsForPeriod("week");
  return source
    .filter(
      (r) =>
        !r.leaveException &&
        r.confirmationDiscipline != null &&
        (departments == null || departments.includes(r.department)) &&
        // Never surface the system Administrator account in this card.
        r.employeeId !== "EMP-0001" &&
        r.employeeName.trim().toLowerCase() !== "administrator" &&
        // Only include people who have an assigned Resource Owner (no Administrator substitute).
        Boolean(r.resourceOwnerId?.trim()) &&
        r.resourceOwnerName.trim() !== "" &&
        r.resourceOwnerName.trim() !== "—" &&
        r.resourceOwnerName.trim().toLowerCase() !== "administrator"
    )
    .sort((a, b) => (a.confirmationDiscipline ?? 0) - (b.confirmationDiscipline ?? 0))
    .slice(0, limit)
    .map((r) => {
      const priorDisc =
        r.prior?.confirmationDiscipline ??
        priorByEmployeeId?.get(r.employeeId)?.confirmationDiscipline;
      return {
        label: r.employeeName,
        value: r.confirmationDiscipline!,
        suffix: "%",
        trend: buildConfirmationDisciplineTrend(r.confirmationDiscipline!, priorDisc),
      };
    });
}

export function getCockpitData(roleId: CockpitRoleId, refreshedAt = DEMO_REFRESH): CockpitSnapshot {
  const profile = COCKPIT_ROLE_PROFILES[roleId];
  const depts = profile.departments;

  const teamLoad = filterByDepartments(TEAM_LOAD_ALL, depts);
  const avgPct =
    teamLoad.length > 0
      ? Math.round(teamLoad.reduce((s, r) => s + r.pct, 0) / teamLoad.length)
      : 80;
  const priorAvg =
    teamLoad.length > 0
      ? Math.round(teamLoad.reduce((s, r) => s + r.priorPct, 0) / teamLoad.length)
      : 77;

  return {
    profile,
    refreshedAt,
    planningWindowLabel: PLANNING_WINDOW,
    weekContextLabel: cockpitWeekContextLabel(),
    attentionProjects: filterAttention(ATTENTION_ALL, depts),
    resourceShortages: filterByDepartments(SHORTAGES_ALL, depts),
    availableResources: filterByDepartments(AVAILABLE_ALL, depts),
    planningConflicts: filterByDepartments(CONFLICTS_ALL, depts),
    planningAccuracy: { value: 84, prior: 82, status: "ready", suffix: "%" },
    confirmationDiscipline: { value: 79, prior: 82, status: "ready", suffix: "%" },
    worstPlanningProjects: getWorstPlanningAccuracyProjects(depts),
    worstConfirmationEmployees: getWorstConfirmationDisciplineEmployees(depts),
    utilizationTrend: UTIL_TREND_8W,
    utilizationAvg: { value: avgPct, prior: priorAvg, status: "ready", suffix: "%" },
    departmentHealth: depts
      ? DEPT_HEALTH_ALL.filter((d) => depts.includes(d.department))
      : DEPT_HEALTH_ALL,
    teamLoad,
  };
}

/**
 * Live snapshot from Postgres-backed masters + allocations/confirmations.
 * Weekly Operational Excellence reuses Performance / Execution live builders.
 * Daily · Operational Snapshot (ECP-005–012) uses `api/cockpitDaily` builders.
 */
/**
 * Recursive Resource Owner subtree: returns all employees (direct + indirect)
 * reporting to `ownerHrmsId`. Does NOT include the owner themselves.
 */
export function getResourceOwnerSubtree(
  ownerHrmsId: string,
  employees: Employee[]
): Employee[] {
  const result: Employee[] = [];
  const queue = [ownerHrmsId];
  const visited = new Set<string>();
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);
    for (const e of employees) {
      if (e.resourceOwnerId === current && !visited.has(e.id)) {
        result.push(e);
        queue.push(e.id);
      }
    }
  }
  return result;
}

export function buildLiveCockpitSnapshot(
  roleId: CockpitRoleId,
  input: {
    refreshedAt: string;
    employees: Employee[];
    departmentNames: string[];
    weekCapacityHours?: number;
    hoursPerDay?: number;
    workingDays?: string[];
    companyOffDays?: string[];
    utilBands?: UtilBands;
    projects?: Project[];
    allocations?: ApiAllocation[];
    confirmations?: ApiConfirmation[];
    /** When false/undefined, weekly metrics stay pending until ops data is loaded. */
    opsLoaded?: boolean;
    /** Logged-in user's HRMS ID — used for RO-based scoping when role is delivery_head. */
    currentUserHrmsId?: string;
  }
): CockpitSnapshot {
  const profile = COCKPIT_ROLE_PROFILES[roleId];
  const capacity = input.weekCapacityHours ?? 40;
  const hoursPerDay = input.hoursPerDay ?? 8;
  const workingDays = input.workingDays;
  const companyOffDays = input.companyOffDays;
  const utilBands = input.utilBands ?? { idleBelow: 70, optimalTo: 100 };
  const active = input.employees.filter((e) => e.status === "active");

  // Scope: executive sees all; delivery_head sees recursive RO subtree (or dept fallback).
  let scoped: Employee[];
  let depts: string[] | null;
  if (roleId === "delivery_head" && input.currentUserHrmsId) {
    const subtree = getResourceOwnerSubtree(input.currentUserHrmsId, active);
    scoped = subtree.length > 0 ? subtree : active;
    depts = [...new Set(scoped.map((e) => e.department))];
  } else {
    depts = profile.departments;
    scoped = depts ? active.filter((e) => depts!.includes(e.department)) : active;
  }

  const deptNames = depts
    ? input.departmentNames.filter((d) => depts!.includes(d))
    : input.departmentNames;

  /** HRMS ids that own at least one active report — ROs are not Team Load rows. */
  const resourceOwnerIds = new Set(
    active.map((e) => e.resourceOwnerId).filter((id): id is string => Boolean(id?.trim()))
  );
  const teamLoadPeople = scoped.filter(
    (e) =>
      e.id !== "EMP-0001" &&
      e.name.trim().toLowerCase() !== "administrator" &&
      !resourceOwnerIds.has(e.id)
  );

  let teamLoad: TeamLoadRow[] = buildTeamLoadRowsFromPerformance(
    teamLoadPeople,
    [],
    [],
    capacity,
    utilBands
  );

  let departmentHealth: DeptHealthRow[] = deptNames.map((department) => {
    const people = scoped.filter((e) => e.department === department);
    const peopleFree = people.length;
    const capacityHours = peopleFree * capacity;
    return {
      department,
      health: "green" as const,
      score: 100,
      detail: peopleFree === 0 ? "No people in department" : "Loading…",
      peopleBooked: 0,
      peopleFree,
      billablePct: 0,
      nonBillablePct: 0,
      bookedHours: 0,
      capacityHours,
    };
  });

  const weekContextLabel = liveCockpitWeekContextLabel(new Date(), workingDays);
  const pendingMetric: WeeklyMetric = {
    value: null,
    prior: null,
    status: "pending",
    suffix: "%",
  };

  let planningAccuracy: WeeklyMetric = pendingMetric;
  let confirmationDiscipline: WeeklyMetric = pendingMetric;
  let utilizationAvg: WeeklyMetric = pendingMetric;
  let worstPlanningProjects: CockpitBottomMetricItem[] = [];
  let worstConfirmationEmployees: CockpitBottomMetricItem[] = [];
  let utilizationTrend: UtilizationTrendWeek[] = [];
  let attentionProjects: AttentionProject[] = [];
  let resourceShortages: ResourceShortage[] = [];
  let availableResources: AvailableResource[] = [];
  let planningConflicts: PlanningConflictRow[] = [];
  let windowLabel = "Next 2 weeks";

  if (input.opsLoaded) {
    const allocations = input.allocations ?? [];
    const confirmations = input.confirmations ?? [];
    const projects = input.projects ?? [];
    const currentMon = mondayISO();
    const currentFri = workingWeekEnd(currentMon, workingDays);
    const priorMon = addDaysISO(currentMon, -7);
    const priorFri = workingWeekEnd(priorMon, workingDays);
    const planFrom = currentMon;
    const planTo = addDaysISO(currentMon, 13);
    windowLabel = planningWindowLabel(planFrom, planTo);

    const perfCurrent = buildPerformanceRowsFromEmployees(
      scoped,
      capacity,
      allocations,
      confirmations,
      currentMon,
      currentFri,
      workingDays,
      companyOffDays
    );
    const perfPrior = buildPerformanceRowsFromEmployees(
      scoped,
      capacity,
      allocations,
      confirmations,
      priorMon,
      priorFri,
      workingDays,
      companyOffDays
    );
    const perfSummary = computePerformanceSummary(perfCurrent, perfPrior);
    confirmationDiscipline = toWeeklyMetric(
      perfSummary.avgConfirmationDiscipline,
      perfSummary.prior?.avgConfirmationDiscipline
    );
    utilizationAvg = toWeeklyMetric(
      perfSummary.avgBillablePct,
      perfSummary.prior?.avgBillablePct
    );

    // ECP-017 — live department operational health (ranked by score)
    departmentHealth = buildDepartmentHealthFromLive(
      deptNames,
      scoped,
      perfCurrent,
      capacity
    );

    const priorByEmployeeId = new Map(perfPrior.map((r) => [r.employeeId, r]));
    teamLoad = buildTeamLoadRowsFromPerformance(
      teamLoadPeople,
      perfCurrent,
      perfPrior,
      capacity,
      utilBands
    );
    worstConfirmationEmployees = getWorstConfirmationDisciplineEmployees(
      depts,
      3,
      perfCurrent,
      priorByEmployeeId
    );

    const execCurrentAll = buildExecutionRowsFromProjects(
      projects,
      allocations,
      confirmations,
      currentMon,
      currentFri,
      workingDays
    );
    const execPriorAll = buildExecutionRowsFromProjects(
      projects,
      allocations,
      confirmations,
      priorMon,
      priorFri,
      workingDays
    );
    const currentProjectScope = projectIdsForDepartments(
      allocations,
      scoped,
      depts,
      currentMon,
      currentFri
    );
    const priorProjectScope = projectIdsForDepartments(
      allocations,
      scoped,
      depts,
      priorMon,
      priorFri
    );
    const execCurrent = filterExecutionByDeptScope(execCurrentAll, currentProjectScope);
    const execPrior = filterExecutionByDeptScope(execPriorAll, priorProjectScope);
    const execSummary = computeExecutionSummary(execCurrent, execPrior);
    planningAccuracy = toWeeklyMetric(
      execSummary.avgPlanningAccuracy,
      execSummary.prior?.avgPlanningAccuracy
    );
    worstPlanningProjects = getWorstPlanningAccuracyProjects(
      depts,
      3,
      execCurrent,
      currentProjectScope
    );

    // Daily · Operational Snapshot (ECP-005–012)
    // Attention = portfolio amber/red (same as Execution `preset=attention`) — do not
    // require allocations-in-window / dept project scope (that hid unstaffed amber/red).
    attentionProjects = buildAttentionProjectsFromLive(execCurrentAll, null);
    resourceShortages = buildResourceShortagesFromLive(
      projects,
      allocations,
      scoped,
      depts,
      planFrom,
      planTo,
      workingDays
    );
    availableResources = buildAvailableResourcesFromLive(
      scoped,
      allocations,
      capacity,
      planFrom,
      planTo,
      hoursPerDay,
      workingDays
    );
    if (input.currentUserHrmsId && resourceOwnerIds.has(input.currentUserHrmsId)) {
      availableResources = availableResources.filter(
        (r) => r.employeeId !== input.currentUserHrmsId
      );
    }
    planningConflicts = buildPlanningConflictsFromLive(
      scoped,
      allocations,
      capacity,
      currentMon,
      currentFri,
      hoursPerDay,
      workingDays
    );

    // 8-week utilization bars (oldest → newest), same billable% path as Performance report.
    for (let i = 7; i >= 0; i--) {
      const mon = addDaysISO(currentMon, -7 * i);
      const fri = workingWeekEnd(mon, workingDays);
      const weekRows = buildPerformanceRowsFromEmployees(
        scoped,
        capacity,
        allocations,
        confirmations,
        mon,
        fri,
        workingDays
      );
      const weekSummary = computePerformanceSummary(weekRows);
      utilizationTrend.push({
        week: isoWeekLabel(mon),
        dateRange: formatWeekSpan(mon, fri),
        util: weekSummary.avgBillablePct ?? 0,
      });
    }
  }

  return {
    profile,
    refreshedAt: input.refreshedAt,
    planningWindowLabel: windowLabel,
    weekContextLabel,
    attentionProjects,
    resourceShortages,
    availableResources,
    planningConflicts,
    planningAccuracy,
    confirmationDiscipline,
    worstPlanningProjects,
    worstConfirmationEmployees,
    utilizationTrend,
    utilizationAvg,
    departmentHealth,
    teamLoad,
  };
}

export function getPlanningConflicts(roleId: CockpitRoleId): PlanningConflictRow[] {
  return getCockpitData(roleId).planningConflicts;
}

export function formatCockpitRefreshTime(
  date = new Date(),
  pattern: DateFormatPattern = "dd/MM/yyyy"
): string {
  return formatAppDateTime(date, pattern);
}
