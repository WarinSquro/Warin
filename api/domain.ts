import { apiFetch } from "./client";
import type { Employee } from "../data/employees";
import type { Project, ProjectType, MilestoneKind } from "../data/projects";
import type { Activity, ActivityMilestone, Department, Skill, SetupStatus } from "../data/setup";
import type { SettingsState } from "../data/settings";
import { DEFAULT_SETTINGS } from "../data/settings";
import { type SettingsAuditEntry } from "../utils/settingsAudit";

function isoDate(v: string | Date | null | undefined): string {
  if (!v) return "";
  const s = typeof v === "string" ? v : v.toISOString();
  return s.slice(0, 10);
}

type ApiEmployee = {
  id: string;
  hrmsId: string;
  name: string;
  email: string;
  departmentName: string | null;
  resourceOwnerId: string | null;
  resourceOwnerName: string | null;
  status: SetupStatus;
  skills: string[];
  utilization?: number | null;
  isSuperAdmin?: boolean;
  transactionCount?: number;
};

type ApiDepartment = {
  id: string;
  code: string;
  name: string;
  headName: string | null;
  status: SetupStatus;
  _count?: { employees?: number };
};

type ApiSkill = {
  id: string;
  code: string;
  name: string;
  category: string;
  categoryId?: string;
  status: SetupStatus;
  _count?: { employees?: number };
};

type ApiSkillCategory = {
  id: string;
  code: string;
  name: string;
  status: SetupStatus;
};

type ApiActivityMilestone = {
  id: string;
  code: string;
  name: string;
  projectType: ProjectType;
  kind: MilestoneKind;
};

type ApiActivity = {
  id: string;
  code: string;
  name: string;
  billable: boolean;
  status: SetupStatus;
  milestone?: ApiActivityMilestone | null;
  activityMilestoneId?: string;
  _count?: { allocations?: number };
};

type ApiProject = {
  id: string;
  projectCode: string;
  name: string;
  customer: string;
  customerId?: string;
  poNumber: string | null;
  type: ProjectType;
  approvedByName: string | null;
  approvedByDate: string | null;
  approvedBySnap: string | null;
  kickoffDate: string | null;
  startDate: string | null;
  endDate: string | null;
  demand: string | null;
  health?: "green" | "amber" | "red" | null;
  healthRemarks?: string | null;
  status: SetupStatus;
  createdAt?: string | null;
  modifiedAt?: string | null;
  createdByName?: string | null;
  modifiedByName?: string | null;
  milestones: { id: string; name: string; date: string; kind?: MilestoneKind | null }[];
  demandLines: { id: string; skills: string[]; count: number }[];
  allocationCount?: number;
  _count?: { allocations?: number };
};

type ApiSettingsResponse = {
  settings: {
    idleBelow: number;
    optimalTo: number;
    excellent: number;
    good: number;
    needsAttention: number;
    capacityBasis: "billable" | "total";
    overallocationLimit: number;
    workingHoursPerDay: number;
    workingDays: string[];
    demandPriority: string[];
    dateFormat?: string;
  } | null;
  companyOffDays: { id: string; date: string; label: string }[];
};

export function mapApiEmployee(e: ApiEmployee): Employee {
  return {
    id: e.hrmsId,
    name: e.name,
    email: e.email,
    department: e.departmentName ?? "—",
    skills: e.skills ?? [],
    resourceOwnerId: e.resourceOwnerName
      ? undefined
      : undefined,
    status: e.status,
    utilization: e.utilization ?? undefined,
    transactionCount: e.transactionCount ?? 0,
  };
}

/** Prefer HRMS id of owner when API returns nested owner with hrmsId */
export function mapApiEmployeeWithOwner(
  e: ApiEmployee & { resourceOwnerHrmsId?: string | null }
): Employee {
  const base = mapApiEmployee(e);
  return {
    ...base,
    resourceOwnerId: e.resourceOwnerHrmsId ?? undefined,
  };
}

export function mapApiDepartment(d: ApiDepartment, memberCount = 0): Department {
  return {
    id: d.code,
    dbId: d.id,
    name: d.name,
    head: d.headName ?? "—",
    memberCount: d._count?.employees ?? memberCount,
    status: d.status,
  };
}

export function mapApiSkill(s: ApiSkill, peopleCount = 0): Skill {
  return {
    id: s.code,
    name: s.name,
    category: s.category,
    categoryId: s.categoryId != null ? String(s.categoryId) : undefined,
    peopleCount: s._count?.employees ?? peopleCount,
    status: s.status,
  };
}

export function mapApiActivityMilestone(m: ApiActivityMilestone): ActivityMilestone {
  return {
    id: m.code,
    name: m.name,
    projectType: m.projectType,
    kind: m.kind,
  };
}

export function mapApiActivity(a: ApiActivity): Activity {
  return {
    id: a.code,
    name: a.name,
    milestoneId: a.milestone?.code ?? "",
    billable: a.billable,
    status: a.status,
    projectCount: a._count?.allocations ?? 0,
  };
}

export function mapApiProject(p: ApiProject): Project {
  return {
    id: p.projectCode,
    name: p.name,
    customer: p.customer,
    poNumber: p.poNumber ?? "",
    type: p.type,
    approvedByName: p.approvedByName ?? undefined,
    approvedByDate: isoDate(p.approvedByDate) || undefined,
    approvedBySnap: p.approvedBySnap ?? undefined,
    kickoffDate: isoDate(p.kickoffDate),
    startDate: isoDate(p.startDate),
    endDate: isoDate(p.endDate),
    demand: p.demand ?? "",
    milestones: (p.milestones ?? []).map((m) => ({
      id: String(m.id),
      name: m.name,
      date: isoDate(m.date),
      kind: m.kind ?? undefined,
    })),
    demandLines: (p.demandLines ?? []).map((l) => ({
      id: String(l.id),
      skills: l.skills,
      count: l.count,
    })),
    health: p.health === "amber" || p.health === "red" || p.health === "green" ? p.health : "green",
    healthRemarks: p.healthRemarks ?? "",
    status: p.status,
    allocationCount: p.allocationCount ?? p._count?.allocations ?? 0,
    createdAt: p.createdAt ?? undefined,
    modifiedAt: p.modifiedAt ?? undefined,
    createdByName: p.createdByName ?? undefined,
    modifiedByName: p.modifiedByName ?? undefined,
  };
}

function normalizeDateFormat(
  raw: string | undefined
): SettingsState["dateFormat"] {
  const allowed = new Set(["dd/MM/yyyy", "MM/dd/yyyy", "yyyy-MM-dd", "dd-MMM-yyyy"]);
  if (raw && allowed.has(raw)) return raw as SettingsState["dateFormat"];
  return DEFAULT_SETTINGS.dateFormat;
}

export function mapApiSettings(res: ApiSettingsResponse): SettingsState {
  const s = res.settings;
  if (!s) return { ...DEFAULT_SETTINGS, companyOffDays: [] };
  let needsAttention = Math.max(1, Math.min(100, Math.trunc(Number(s.needsAttention ?? 80))));
  let good = Math.max(0, Math.min(100, Math.trunc(Number(s.good ?? 90))));
  let excellent = Math.max(0, Math.min(100, Math.trunc(Number(s.excellent ?? 95))));
  good = Math.max(needsAttention + 1, Math.min(99, good));
  excellent = Math.max(good + 1, Math.min(100, excellent));
  needsAttention = Math.max(1, Math.min(good - 1, needsAttention));
  return {
    bands: { idleBelow: s.idleBelow, optimalTo: s.optimalTo },
    metricBands: {
      excellent,
      good,
      needsAttention,
    },
    capacityBasis: s.capacityBasis,
    overallocationLimit: s.overallocationLimit,
    workingHoursPerDay: s.workingHoursPerDay,
    workingDays: s.workingDays,
    demandPriority: s.demandPriority,
    dateFormat: normalizeDateFormat(s.dateFormat),
    companyOffDays: (res.companyOffDays ?? []).map((d) => ({
      id: String(d.id),
      date: isoDate(d.date),
      label: d.label,
    })),
  };
}

function mapEmployeeRow(
  e: ApiEmployee & {
    resourceOwnerHrmsId?: string | null;
    resourceOwner?: { hrmsId: string; name: string } | null;
  }
): Employee {
  return {
    id: e.hrmsId,
    name: e.name,
    email: e.email,
    department: e.departmentName ?? "—",
    skills: e.skills ?? [],
    resourceOwnerId: e.resourceOwnerHrmsId ?? e.resourceOwner?.hrmsId ?? undefined,
    status: e.status,
    utilization: e.utilization ?? undefined,
    transactionCount: e.transactionCount ?? 0,
  };
}

export async function fetchEmployees(): Promise<Employee[]> {
  const all = await apiFetch<
    (ApiEmployee & {
      resourceOwnerHrmsId?: string | null;
      resourceOwner?: { hrmsId: string; name: string } | null;
    })[]
  >("/employees");
  return all.map(mapEmployeeRow);
}

export type EmployeeWriteBody = {
  hrmsId: string;
  name: string;
  email: string;
  department: string;
  skills?: string[];
  resourceOwnerHrmsId?: string | null;
  status?: "active" | "inactive";
};

export type CreateEmployeeResult = Employee & {
  welcomeEmailSent?: boolean;
  welcomeEmailSkipped?: boolean;
  welcomeEmailMessage?: string;
  mustChangePin?: boolean;
};

export async function createEmployee(body: EmployeeWriteBody): Promise<CreateEmployeeResult> {
  const row = await apiFetch<
    ApiEmployee & {
      resourceOwnerHrmsId?: string | null;
      welcomeEmailSent?: boolean;
      welcomeEmailSkipped?: boolean;
      welcomeEmailMessage?: string;
      mustChangePin?: boolean;
    }
  >("/employees", {
    method: "POST",
    body: JSON.stringify(body),
  });
  return {
    ...mapEmployeeRow(row),
    welcomeEmailSent: row.welcomeEmailSent,
    welcomeEmailSkipped: row.welcomeEmailSkipped,
    welcomeEmailMessage: row.welcomeEmailMessage,
    mustChangePin: row.mustChangePin,
  };
}

export async function updateEmployee(
  hrmsId: string,
  body: Partial<EmployeeWriteBody>
): Promise<Employee> {
  const row = await apiFetch<
    ApiEmployee & { resourceOwnerHrmsId?: string | null }
  >(`/employees/${encodeURIComponent(hrmsId)}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
  return mapEmployeeRow(row);
}

export async function fetchDepartments(includeInactive = true): Promise<Department[]> {
  const q = includeInactive ? "?includeInactive=true" : "";
  const rows = await apiFetch<ApiDepartment[]>(`/masters/departments${q}`);
  return rows.map((d) => mapApiDepartment(d));
}

export async function createDepartment(body: {
  name: string;
  code?: string;
  headName?: string;
}): Promise<Department> {
  const row = await apiFetch<ApiDepartment>("/masters/departments", {
    method: "POST",
    body: JSON.stringify(body),
  });
  return mapApiDepartment(row);
}

export async function updateDepartment(
  code: string,
  body: { name?: string; headName?: string; status?: SetupStatus }
): Promise<Department> {
  const row = await apiFetch<ApiDepartment>(`/masters/departments/${encodeURIComponent(code)}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
  return mapApiDepartment(row);
}

export async function fetchSkillCategories(includeInactive = false): Promise<ApiSkillCategory[]> {
  const q = includeInactive ? "?includeInactive=true" : "";
  return apiFetch<ApiSkillCategory[]>(`/masters/skill-categories${q}`);
}

export async function createSkillCategory(name: string): Promise<ApiSkillCategory> {
  return apiFetch<ApiSkillCategory>("/masters/skill-categories", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

export async function fetchSkills(includeInactive = true): Promise<Skill[]> {
  const q = includeInactive ? "?includeInactive=true" : "";
  const rows = await apiFetch<ApiSkill[]>(`/masters/skills${q}`);
  return rows.map((s) => mapApiSkill(s));
}

export async function createSkill(body: {
  name: string;
  categoryId: string;
  code?: string;
}): Promise<Skill> {
  const row = await apiFetch<ApiSkill>("/masters/skills", {
    method: "POST",
    body: JSON.stringify(body),
  });
  return mapApiSkill(row);
}

export async function updateSkill(
  code: string,
  body: { name?: string; categoryId?: string; status?: SetupStatus }
): Promise<Skill> {
  const row = await apiFetch<ApiSkill>(`/masters/skills/${encodeURIComponent(code)}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
  return mapApiSkill(row);
}

export async function fetchActivities(includeInactive = true): Promise<Activity[]> {
  const q = includeInactive ? "?includeInactive=true" : "";
  const rows = await apiFetch<ApiActivity[]>(`/masters/activities${q}`);
  return rows.map((a) => mapApiActivity(a));
}

export async function createActivity(body: {
  name: string;
  billable?: boolean;
  milestoneCode: string;
  code?: string;
}): Promise<Activity> {
  const row = await apiFetch<ApiActivity>("/masters/activities", {
    method: "POST",
    body: JSON.stringify(body),
  });
  return mapApiActivity(row);
}

export async function updateActivity(
  code: string,
  body: {
    name?: string;
    billable?: boolean;
    milestoneCode?: string;
    status?: SetupStatus;
  }
): Promise<Activity> {
  const row = await apiFetch<ApiActivity>(`/masters/activities/${encodeURIComponent(code)}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
  return mapApiActivity(row);
}

export async function fetchActivityMilestones(): Promise<ActivityMilestone[]> {
  const rows = await apiFetch<ApiActivityMilestone[]>("/masters/activity-milestones");
  return rows.map((m) => mapApiActivityMilestone(m));
}

export async function createActivityMilestone(body: {
  name: string;
  projectType: ProjectType;
  kind: MilestoneKind;
  code?: string;
}): Promise<ActivityMilestone> {
  const row = await apiFetch<ApiActivityMilestone>("/masters/activity-milestones", {
    method: "POST",
    body: JSON.stringify(body),
  });
  return mapApiActivityMilestone(row);
}

type ApiCustomer = {
  id: string;
  code: string;
  name: string;
  status: SetupStatus;
  isActive?: boolean;
};

export async function fetchCustomers(includeInactive = false): Promise<string[]> {
  const q = includeInactive ? "?includeInactive=true" : "";
  const rows = await apiFetch<ApiCustomer[]>(`/masters/customers${q}`);
  return rows.map((c) => c.name);
}

export async function createCustomer(name: string): Promise<string> {
  const row = await apiFetch<ApiCustomer>("/masters/customers", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
  return row.name;
}

export async function fetchProjects(): Promise<Project[]> {
  const rows = await apiFetch<ApiProject[]>("/projects");
  return rows.map((p) => mapApiProject(p));
}

export type ProjectWriteBody = {
  projectCode: string;
  name: string;
  customer: string;
  poNumber?: string;
  type: ProjectType;
  approvedByName?: string;
  approvedByDate?: string;
  approvedBySnap?: string | null;
  kickoffDate: string;
  startDate: string;
  endDate: string;
  demand?: string;
  health?: "green" | "amber" | "red";
  healthRemarks?: string;
  status?: "active" | "inactive";
  milestones?: { name: string; date: string; kind?: MilestoneKind }[];
  demandLines?: { skills: string[]; count: number }[];
};

export async function createProject(body: ProjectWriteBody): Promise<Project> {
  const row = await apiFetch<ApiProject>("/projects", {
    method: "POST",
    body: JSON.stringify(body),
  });
  return mapApiProject(row);
}

export async function updateProject(
  projectCode: string,
  body: Partial<ProjectWriteBody>
): Promise<Project> {
  const row = await apiFetch<ApiProject>(`/projects/${encodeURIComponent(projectCode)}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
  return mapApiProject(row);
}

export async function fetchSettings(): Promise<SettingsState> {
  const res = await apiFetch<ApiSettingsResponse>("/settings");
  return mapApiSettings(res);
}

export async function fetchAccessRights(hrmsId: string): Promise<string[]> {
  const res = await apiFetch<{ permissionKeys: string[] }>(`/access-rights/${encodeURIComponent(hrmsId)}`);
  return res.permissionKeys ?? [];
}

/** Bulk permission keys for all employees (HRMS id → keys). Prefer over N× fetchAccessRights for list counts. */
export async function fetchAllAccessRights(): Promise<Record<string, string[]>> {
  const res = await apiFetch<{ rights: Record<string, string[]> }>("/access-rights");
  return res.rights ?? {};
}

export async function putAccessRights(hrmsId: string, permissionKeys: string[]) {
  return apiFetch<{ ok: boolean; permissionKeys: string[] }>(
    `/access-rights/${encodeURIComponent(hrmsId)}`,
    {
      method: "PUT",
      body: JSON.stringify({ permissionKeys }),
    }
  );
}

export async function putSettings(body: {
  idleBelow: number;
  optimalTo: number;
  excellent: number;
  good: number;
  needsAttention: number;
  capacityBasis: "billable" | "total";
  overallocationLimit: number;
  workingHoursPerDay: number;
  workingDays: string[];
  dateFormat: string;
  demandPriority: string[];
  companyOffDays: { date: string; label: string }[];
}) {
  return apiFetch<ApiSettingsResponse>("/settings", {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export async function fetchSettingsAudit(limit = 100): Promise<SettingsAuditEntry[]> {
  const res = await apiFetch<{
    entries: { id: string; who: string; what: string; createdAt: string }[];
  }>(`/settings/audit?limit=${encodeURIComponent(String(limit))}`);
  return (res.entries ?? []).map((e) => ({
    id: e.id,
    who: e.who,
    what: e.what,
    when: e.createdAt,
  }));
}

export type SettingsSchedule = {
  id: string;
  effectiveDate: string;
  effectiveLabel: string;
  status: string;
  changeSummary: string;
};

export async function fetchSettingsSchedules(): Promise<SettingsSchedule[]> {
  const res = await apiFetch<{ schedules: SettingsSchedule[] }>("/settings/schedule");
  return res.schedules ?? [];
}

export async function createSettingsSchedule(
  body: {
    idleBelow: number;
    optimalTo: number;
    excellent: number;
    good: number;
    needsAttention: number;
    capacityBasis: "billable" | "total";
    overallocationLimit: number;
    workingHoursPerDay: number;
    workingDays: string[];
    dateFormat: string;
    demandPriority: string[];
    companyOffDays: { date: string; label: string }[];
    effectiveDate: string;
  }
) {
  return apiFetch<{ schedule: SettingsSchedule }>("/settings/schedule", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function cancelSettingsSchedule(id: string) {
  return apiFetch<{ schedule: SettingsSchedule }>(`/settings/schedule/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

export type SmtpSecurityType = "none" | "ssl" | "tls" | "starttls";

export type SmtpSettings = {
  host: string;
  port: number;
  securityType: SmtpSecurityType;
  senderName: string;
  senderEmail: string;
  username: string;
  password: string;
  passwordSet: boolean;
  authRequired: boolean;
  isConfigured: boolean;
  connectionVerified?: boolean;
  lastConnectionTestAt?: string | null;
};

export type SmtpSettingsPayload = {
  host: string;
  port: number;
  securityType: SmtpSecurityType;
  senderName: string;
  senderEmail: string;
  username: string;
  password?: string;
  authRequired: boolean;
};

export function fetchSmtpSettings() {
  return apiFetch<SmtpSettings>("/settings/smtp");
}

export function putSmtpSettings(body: SmtpSettingsPayload) {
  return apiFetch<SmtpSettings>("/settings/smtp", {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export function testSmtpConnection(body: SmtpSettingsPayload) {
  return apiFetch<{ ok: boolean; message: string }>("/settings/smtp/test-connection", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function sendSmtpTestEmail(body: SmtpSettingsPayload & { to: string }) {
  return apiFetch<{ ok: boolean; message: string }>("/settings/smtp/test-email", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export type ApiAllocation = {
  id: string;
  employeeHrmsId: string;
  employeeName: string;
  projectCode: string;
  projectName: string;
  milestoneId: string;
  milestoneName: string;
  activity: string;
  tasks: string[];
  startDate: string;
  endDate: string;
  hoursPerDay: number;
  reason: string;
};

export type AllocationInput = {
  employeeHrmsId: string;
  projectCode: string;
  milestoneId: string;
  activity: string;
  tasks?: string[];
  startDate: string;
  endDate: string;
  hoursPerDay: number;
  reason?: string;
};

export async function fetchAllocations(params?: {
  employeeHrmsId?: string;
  from?: string;
  to?: string;
}): Promise<ApiAllocation[]> {
  const q = new URLSearchParams();
  if (params?.employeeHrmsId) q.set("employeeHrmsId", params.employeeHrmsId);
  if (params?.from) q.set("from", params.from);
  if (params?.to) q.set("to", params.to);
  const qs = q.toString();
  return apiFetch<ApiAllocation[]>(`/allocations${qs ? `?${qs}` : ""}`);
}

export async function createAllocation(body: AllocationInput): Promise<ApiAllocation> {
  return apiFetch<ApiAllocation>("/allocations", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function updateAllocation(
  id: string,
  body: AllocationInput
): Promise<ApiAllocation> {
  return apiFetch<ApiAllocation>(`/allocations/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export async function deleteAllocation(id: string): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>(`/allocations/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

export type ApiConfirmationLine = {
  id: string;
  allocationId: string | null;
  projectLabel: string;
  milestoneLabel: string;
  activity: string;
  plannedHours: number;
  actualHours: number;
  kind: "planned" | "deviation" | "unplanned";
  reason: string;
  tasks: string[];
};

export type ApiConfirmation = {
  id: string;
  employeeHrmsId: string;
  employeeName: string;
  workDate: string;
  submittedAt: string;
  submittedAtLabel: string;
  isMissedPosting: boolean;
  missReason: string | null;
  hasDeviation: boolean;
  lines: ApiConfirmationLine[];
};

export type ConfirmationSubmitBody = {
  workDate: string;
  isMissedPosting?: boolean;
  missReason?: string | null;
  lines: {
    allocationId?: string | null;
    projectLabel: string;
    milestoneLabel?: string;
    activity: string;
    plannedHours: number;
    actualHours: number;
    kind: "planned" | "deviation" | "unplanned";
    reason?: string;
    tasks?: string[];
  }[];
};

export type TeamComplianceResponse = {
  weekStart: string;
  asOf: string;
  kpis: {
    confirmedPct: number;
    confirmedCount: number;
    pending: number;
    deviations: number;
    onLeave: number;
    team: number;
  };
  rows: {
    id: string;
    name: string;
    initials: string;
    role: string;
    week: (
      | "confirmed"
      | "confirmed_delayed"
      | "deviation"
      | "deviation_delayed"
      | "pending"
      | "leave"
      | "future"
    )[];
    todayLabel: string;
    todayStatus: string;
  }[];
  deviations: {
    id: string;
    name: string;
    initials: string;
    line: string;
    planned: number;
    actual: number;
    reason: string;
    workDate: string;
    addedAt?: string;
  }[];
};

export async function fetchConfirmations(params?: {
  from?: string;
  to?: string;
}): Promise<ApiConfirmation[]> {
  const q = new URLSearchParams();
  if (params?.from) q.set("from", params.from);
  if (params?.to) q.set("to", params.to);
  const qs = q.toString();
  return apiFetch<ApiConfirmation[]>(`/confirmations${qs ? `?${qs}` : ""}`);
}

export async function fetchMyConfirmation(date?: string): Promise<ApiConfirmation | null> {
  const q = date ? `?date=${encodeURIComponent(date)}` : "";
  return apiFetch<ApiConfirmation | null>(`/confirmations/me${q}`);
}

export async function fetchMissPostingCount(month?: string): Promise<number> {
  const q = month ? `?month=${encodeURIComponent(month)}` : "";
  const res = await apiFetch<{ count: number }>(`/confirmations/me/miss-count${q}`);
  return res.count ?? 0;
}

export async function submitConfirmation(body: ConfirmationSubmitBody): Promise<ApiConfirmation> {
  return apiFetch<ApiConfirmation>("/confirmations", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export type ApiProductivityDay = {
  workday: {
    dayStart?: string;
    lunchOut?: string;
    lunchIn?: string;
    dayEnd?: string;
  };
  focusByAllocation: Record<
    string,
    {
      laps: { id: string; startedAt: string; endedAt: string; durationMs: number }[];
      sessionAccumMs: number;
      segmentStartedAt: string | null;
    }
  >;
  workHours?: number;
  activeTimerId?: string | null;
};

export async function fetchConfirmationProductivity(params?: {
  date?: string;
  from?: string;
  to?: string;
}): Promise<{ days: Record<string, ApiProductivityDay> }> {
  const q = new URLSearchParams();
  if (params?.date) q.set("date", params.date);
  if (params?.from) q.set("from", params.from);
  if (params?.to) q.set("to", params.to);
  const qs = q.toString();
  return apiFetch(`/confirmations/me/productivity${qs ? `?${qs}` : ""}`);
}

export async function upsertConfirmationProductivity(body: {
  workDate: string;
  workday?: {
    dayStart?: string | null;
    lunchOut?: string | null;
    lunchIn?: string | null;
    dayEnd?: string | null;
  };
  focusByAllocation?: ApiProductivityDay["focusByAllocation"];
  activeTimerId?: string | null;
  workHours?: number | null;
}): Promise<{ workDate: string; day: ApiProductivityDay }> {
  return apiFetch("/confirmations/me/productivity", {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export async function fetchTeamCompliance(params?: {
  weekStart?: string;
  asOf?: string;
}): Promise<TeamComplianceResponse> {
  const q = new URLSearchParams();
  if (params?.weekStart) q.set("weekStart", params.weekStart);
  if (params?.asOf) q.set("asOf", params.asOf);
  const qs = q.toString();
  return apiFetch<TeamComplianceResponse>(`/confirmations/team${qs ? `?${qs}` : ""}`);
}

export async function remindConfirmation(body: {
  employeeHrmsId: string;
  workDate?: string;
}): Promise<{
  message: string;
  employeeHrmsId: string;
  workDate: string;
  deliveredVia?: "email";
  to?: string;
}> {
  return apiFetch("/confirmations/remind", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export type ApiWeeklyCheckInConfig = {
  rankingLevels: { value: number; title: string; color: string }[];
  actionTypes: string[];
  competenciesByDepartment: Record<
    string,
    {
      id: string;
      departmentId: string;
      kind: "technical" | "behavioural";
      label: string;
      remark?: string;
      sequence: number;
    }[]
  >;
};

export type ApiWeeklySubmission = {
  id: string;
  employeeId: string;
  employeeName?: string;
  resourceOwnerId: string;
  weekStart: string;
  evidence: WeeklyEvidenceSnapshotLike;
  technicalRatings: Record<string, number>;
  behaviouralRatings: Record<string, number>;
  weeklyStatus: string;
  confidence: string;
  roRemarks: string;
  actionType: string;
  actionNotes?: string;
  previousActionStatus?: string;
  recognition: string;
  submittedAt: string;
  submittedByEmployeeId: string;
  actionOutcome?: string;
};

type WeeklyEvidenceSnapshotLike = {
  planningAccuracy: number | null;
  planningDeviationCount: number;
  confirmationDiscipline: number | null;
  confirmationDelayCount: number;
  utilizationHrs: number;
  utilizationCapacityHrs: number;
  billablePct: number;
  nonBillablePct: number;
  projects: string[];
  capturedAt: string;
  noOperationalData?: boolean;
};

export type WeeklySubmitBody = {
  employeeHrmsId: string;
  weekStart: string;
  evidence: WeeklyEvidenceSnapshotLike;
  technicalRatings: Record<string, number>;
  behaviouralRatings: Record<string, number>;
  weeklyStatus: string;
  confidence: string;
  roRemarks: string;
  actionType: string;
  actionNotes?: string;
  previousActionStatus?: string;
  recognition: string;
};

export type ApiWeeklyQueueRow = {
  employeeId: string;
  employeeName: string;
  department: string;
  role: string;
  initials: string;
  status: "pending" | "completed";
  submissionId?: string;
  lastWeekStatus?: string;
  confirmationDiscipline?: number | null;
  openActionType?: string;
  openActionNotes?: string;
  prevRecognition?: string;
  prevActionCompleted?: boolean;
  submittedAt?: string;
  weeklyStatus?: string;
  recognition?: string;
  noPriorReview?: boolean;
  noOperationalData?: boolean;
};

export async function fetchWeeklyCheckInConfig(): Promise<ApiWeeklyCheckInConfig> {
  return apiFetch<ApiWeeklyCheckInConfig>("/weekly-check-in/config");
}

export async function putWeeklyCheckInConfig(body: {
  rankingLevels: ApiWeeklyCheckInConfig["rankingLevels"];
  actionTypes: string[];
  competencies: {
    code: string;
    departmentId: string;
    kind: "technical" | "behavioural";
    label: string;
    remark?: string;
    sequence: number;
  }[];
}): Promise<ApiWeeklyCheckInConfig> {
  return apiFetch<ApiWeeklyCheckInConfig>("/weekly-check-in/config", {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export async function fetchWeeklySubmission(
  employeeHrmsId: string,
  weekStart: string
): Promise<ApiWeeklySubmission | null> {
  return apiFetch<ApiWeeklySubmission | null>(
    `/weekly-check-in/submissions/${encodeURIComponent(employeeHrmsId)}/${encodeURIComponent(weekStart)}`
  );
}

export async function fetchWeeklySubmissions(params?: {
  weekStart?: string;
  employeeHrmsId?: string;
  resourceOwnerHrmsId?: string;
}): Promise<ApiWeeklySubmission[]> {
  const q = new URLSearchParams();
  if (params?.weekStart) q.set("weekStart", params.weekStart);
  if (params?.employeeHrmsId) q.set("employeeHrmsId", params.employeeHrmsId);
  if (params?.resourceOwnerHrmsId) q.set("resourceOwnerHrmsId", params.resourceOwnerHrmsId);
  const qs = q.toString();
  return apiFetch<ApiWeeklySubmission[]>(`/weekly-check-in/submissions${qs ? `?${qs}` : ""}`);
}

export async function submitWeeklyCheckInApi(body: WeeklySubmitBody): Promise<ApiWeeklySubmission> {
  return apiFetch<ApiWeeklySubmission>("/weekly-check-in/submissions", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function fetchWeeklyQueue(weekStart: string): Promise<{
  weekStart: string;
  rows: ApiWeeklyQueueRow[];
}> {
  return apiFetch(`/weekly-check-in/queue?weekStart=${encodeURIComponent(weekStart)}`);
}

// ─── KPI Framework ───────────────────────────────────────────────────────────

export type AssessmentCycle = "Q1" | "Q2" | "Q3" | "Q4";
export type KpiRowStatus = "draft" | "pending_result" | "completed";
export type KpiTargetDirection = "higher_is_better" | "lower_is_better";
export type KpiMasterKind = "categories" | "methods" | "units";

export type ApiKpiMaster = {
  id: string;
  code: string;
  name: string;
  status: SetupStatus;
  isActive: boolean;
};

export type ApiKpiItem = {
  id: string;
  employeeId: string;
  employeeHrmsId: string | null;
  employeeName: string | null;
  departmentId: string | null;
  calendarYear: number;
  assessmentCycle: AssessmentCycle;
  categoryId: string;
  categoryName: string | null;
  kpiName: string;
  measurementMethodId: string;
  measurementMethodName: string | null;
  unitId: string;
  unitName: string | null;
  target: number;
  targetDirection: KpiTargetDirection;
  periodStartMonth: number;
  periodEndMonth: number;
  periodLabel: string;
  weightage: number;
  status: KpiRowStatus;
  kpiResult: number | null;
  kpiScore: number | null;
  remarks: string | null;
  hasAttachment: boolean;
  attachmentName: string | null;
  resultUpdatedAt: string | null;
  cycleExpired: boolean;
  cycleMonths: number[];
};

export type ApiKpiResultsSummary = {
  total: number;
  pending: number;
  completed: number;
  finalAchievement: number | null;
};

export async function fetchKpiMasters(
  kind: KpiMasterKind,
  includeInactive = true
): Promise<ApiKpiMaster[]> {
  return apiFetch(
    `/kpi/masters/${kind}?includeInactive=${includeInactive ? "true" : "false"}`
  );
}

export async function createKpiMaster(kind: KpiMasterKind, name: string): Promise<ApiKpiMaster> {
  return apiFetch(`/kpi/masters/${kind}`, {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

export async function updateKpiMaster(
  kind: KpiMasterKind,
  id: string,
  body: { name?: string; status?: SetupStatus }
): Promise<ApiKpiMaster> {
  return apiFetch(`/kpi/masters/${kind}/${id}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export async function fetchKpiFramework(params: {
  calendarYear: number;
  assessmentCycle: AssessmentCycle;
  employeeHrmsId?: string;
  departmentId?: string;
}): Promise<ApiKpiItem[]> {
  const q = new URLSearchParams();
  q.set("calendarYear", String(params.calendarYear));
  q.set("assessmentCycle", params.assessmentCycle);
  if (params.employeeHrmsId) q.set("employeeHrmsId", params.employeeHrmsId);
  if (params.departmentId) q.set("departmentId", params.departmentId);
  return apiFetch(`/kpi/framework?${q}`);
}

export async function createKpiFrameworkItem(body: {
  employeeHrmsId: string;
  calendarYear: number;
  assessmentCycle: AssessmentCycle;
  categoryId: string;
  kpiName: string;
  measurementMethodId: string;
  unitId: string;
  target: number;
  targetDirection: KpiTargetDirection;
  periodStartMonth: number;
  periodEndMonth: number;
  weightage: number;
}): Promise<ApiKpiItem> {
  return apiFetch("/kpi/framework", { method: "POST", body: JSON.stringify(body) });
}

export async function updateKpiFrameworkItem(
  id: string,
  body: Partial<{
    categoryId: string;
    kpiName: string;
    measurementMethodId: string;
    unitId: string;
    target: number;
    targetDirection: KpiTargetDirection;
    periodStartMonth: number;
    periodEndMonth: number;
    weightage: number;
  }>
): Promise<ApiKpiItem> {
  return apiFetch(`/kpi/framework/${id}`, { method: "PUT", body: JSON.stringify(body) });
}

export async function deleteKpiFrameworkItem(id: string): Promise<{ ok: boolean }> {
  return apiFetch(`/kpi/framework/${id}`, { method: "DELETE" });
}

export async function copyKpiFramework(body: {
  targetEmployeeHrmsId: string;
  sourceEmployeeHrmsId: string;
  calendarYear: number;
  assessmentCycle: AssessmentCycle;
}): Promise<ApiKpiItem[]> {
  return apiFetch("/kpi/framework/copy", { method: "POST", body: JSON.stringify(body) });
}

export async function fetchKpiResults(params: {
  calendarYear: number;
  assessmentCycle: AssessmentCycle;
  employeeHrmsId?: string;
  departmentId?: string;
  status?: KpiRowStatus | "all";
}): Promise<{ items: ApiKpiItem[]; summary: ApiKpiResultsSummary }> {
  const q = new URLSearchParams();
  q.set("calendarYear", String(params.calendarYear));
  q.set("assessmentCycle", params.assessmentCycle);
  if (params.employeeHrmsId) q.set("employeeHrmsId", params.employeeHrmsId);
  if (params.departmentId) q.set("departmentId", params.departmentId);
  if (params.status && params.status !== "all") q.set("status", params.status);
  return apiFetch(`/kpi/results?${q}`);
}

export async function saveKpiResult(
  id: string,
  body: {
    kpiResult: number;
    kpiScore: number;
    remarks?: string;
    attachment?: { fileName: string; mimeType: string; base64: string } | null;
  }
): Promise<ApiKpiItem> {
  return apiFetch(`/kpi/results/${id}`, { method: "PUT", body: JSON.stringify(body) });
}

