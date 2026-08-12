// Weekly Check-In (Module 14) — config, evidence, submissions, queue & history.

import { getDailyWorkRowsForPeriod } from "./dailyWorkReport";
import { EMPLOYEES, type Employee } from "./employees";
import { getPerformanceRowsForPeriod } from "./performanceReport";
import { PLANNER_ROWS } from "./planner";
import { DEFAULT_SETTINGS } from "./settings";
import { DEPARTMENTS, type Department } from "./setup";
import { getDirectReportIds } from "../utils/employeeHierarchy";
import { workingWeekBounds } from "../utils/workingWeek";

export type CompetencyKind = "technical" | "behavioural";
export type DepartmentConfigStatus = "set" | "partial" | "not_set";
export type WeeklyStatus = "On Track" | "Watch" | "Intervention Required";
export type WeeklyConfidence = "High" | "Medium" | "Low";
export type Recognition = "None" | "Appreciate" | "Appreciate Publicly";
export type ActionStatus = "Completed" | "Still Pending";

export interface DepartmentCompetency {
  id: string;
  departmentId: string;
  kind: CompetencyKind;
  label: string;
  /** Optional guidance text shown on config (and available for future UX). */
  remark: string;
  sequence: number;
}

export interface RankingLevel {
  value: 1 | 2 | 3 | 4 | 5;
  title: string;
  /** Design token key for chip styling */
  color: "success" | "accent" | "warning" | "danger-soft" | "danger";
}

export interface WeeklyCheckInConfig {
  competenciesByDepartment: Record<string, DepartmentCompetency[]>;
  rankingLevels: RankingLevel[];
  actionTypes: string[];
}

export interface WeeklyEvidenceSnapshot {
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
}

export interface WeeklyCheckInSubmission {
  id: string;
  employeeId: string;
  resourceOwnerId: string;
  weekStart: string;
  evidence: WeeklyEvidenceSnapshot;
  technicalRatings: Record<string, number>;
  behaviouralRatings: Record<string, number>;
  weeklyStatus: WeeklyStatus;
  confidence: WeeklyConfidence;
  roRemarks: string;
  actionType: string;
  actionNotes?: string;
  previousActionStatus?: ActionStatus;
  recognition: Recognition;
  submittedAt: string;
  submittedByEmployeeId: string;
  actionOutcome?: ActionStatus;
}

export interface WeeklyCheckInDraft {
  employeeId: string;
  resourceOwnerId: string;
  weekStart: string;
  technicalRatings: Record<string, number>;
  behaviouralRatings: Record<string, number>;
  weeklyStatus: WeeklyStatus;
  confidence: WeeklyConfidence;
  roRemarks: string;
  actionType: string;
  actionNotes: string;
  previousActionStatus?: ActionStatus;
  recognition: Recognition;
}

export interface ReviewWeekOption {
  weekStart: string;
  label: string;
  isCurrent: boolean;
}

export interface QueueRow {
  employeeId: string;
  employeeName: string;
  department: string;
  role: string;
  initials: string;
  status: "pending" | "completed";
  submissionId?: string;
  lastWeekStatus?: WeeklyStatus;
  confirmationDiscipline?: number | null;
  openActionType?: string;
  openActionNotes?: string;
  prevRecognition?: Recognition;
  prevActionCompleted?: boolean;
  submittedAt?: string;
  weeklyStatus?: WeeklyStatus;
  recognition?: Recognition;
  noPriorReview?: boolean;
  noOperationalData?: boolean;
  joinedMidWeek?: boolean;
}

export interface EmployeeHistoryWeek {
  weekStart: string;
  weekLabel: string;
  submissionId?: string;
  weeklyStatus?: WeeklyStatus;
  confidence?: WeeklyConfidence;
  technicalRatings: Record<string, number>;
  behaviouralRatings: Record<string, number>;
  actionType?: string;
  actionOutcome?: ActionStatus;
}

export interface EmployeeHistory {
  employeeId: string;
  employeeName: string;
  department: string;
  competencyLabels: { id: string; kind: CompetencyKind; label: string }[];
  weeks: EmployeeHistoryWeek[];
  actions: {
    weekStart: string;
    weekLabel: string;
    actionType: string;
    actionNotes?: string;
    outcome?: ActionStatus;
  }[];
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/** First blocking issue for sequential submit validation (toast + focus one field at a time). */
export interface SubmissionIssue {
  message: string;
  /** DOM id of the control to focus, when applicable */
  focusId?: string;
}

export function competencyFocusId(competencyId: string): string {
  return `wci-focus-comp-${competencyId}`;
}

export const WCI_FOCUS_RO_REMARKS = "wci-focus-ro-remarks";
export const WCI_FOCUS_ACTION_NOTES = "wci-focus-action-notes";

const CONFIG_STORAGE_KEY = "oneview_wci_config_v1";
const SUBMISSIONS_STORAGE_KEY = "oneview_wci_submissions_v1";
const SUBMISSIONS_VERSION_KEY = "oneview_wci_submissions_version";
const SUBMISSIONS_VERSION = 5;

export const CURRENT_WEEK_START = "2026-01-06";
/** Max length for RO Remarks (textarea + validation). Field is required but may be shorter. */
export const MAX_RO_REMARKS_LENGTH = 100;
/** Min length for Action Notes when Action Type is not None. */
export const MIN_REMARKS_LENGTH = 100;

export const DEFAULT_RANKING_LEVELS: RankingLevel[] = [
  { value: 5, title: "Exceptional", color: "success" },
  { value: 4, title: "Strong", color: "accent" },
  { value: 3, title: "Solid", color: "warning" },
  { value: 2, title: "Developing", color: "danger-soft" },
  { value: 1, title: "Needs Focus", color: "danger" },
];

export const DEFAULT_ACTION_TYPES = [
  "None",
  "Coaching",
  "Training",
  "Process Change",
  "Escalation",
];

function compId(deptId: string, kind: CompetencyKind, seq: number): string {
  return `comp-${deptId}-${kind[0]}-${seq}`;
}

function buildSeedCompetencies(): Record<string, DepartmentCompetency[]> {
  const templates: Record<string, { technical: string[]; behavioural: string[] }> = {
    "dept-1": {
      technical: ["Code Quality", "System Design", "API Integration", "Defect Detection"],
      behavioural: ["Ownership", "Collaboration", "Communication", "Initiative"],
    },
    "dept-2": {
      technical: ["Test Automation", "Defect Detection", "API Testing"],
      behavioural: ["Attention to Detail", "Ownership", "Collaboration"],
    },
    "dept-3": {
      technical: ["Visual Design", "UX Research", "Prototyping"],
      behavioural: ["Stakeholder Communication", "Creativity", "Collaboration"],
    },
    "dept-4": {
      technical: ["Infrastructure Reliability", "CI/CD Practices", "Security Hygiene"],
      behavioural: ["Incident Response", "Documentation", "Collaboration"],
    },
    "dept-5": {
      technical: [
        "Ticket Triage",
        "Root-Cause Diagnosis",
        "Knowledge Base Quality",
        "SLA Adherence",
        "Product / Domain Knowledge",
      ],
      behavioural: ["Empathy", "Clear Communication", "Escalation Judgment", "Patience", "Ownership"],
    },
  };

  const result: Record<string, DepartmentCompetency[]> = {};
  for (const [deptId, lists] of Object.entries(templates)) {
    const items: DepartmentCompetency[] = [];
    lists.technical.forEach((label, i) => {
      items.push({
        id: compId(deptId, "technical", i + 1),
        departmentId: deptId,
        kind: "technical",
        label,
        remark: "",
        sequence: i + 1,
      });
    });
    lists.behavioural.forEach((label, i) => {
      items.push({
        id: compId(deptId, "behavioural", i + 1),
        departmentId: deptId,
        kind: "behavioural",
        label,
        remark: "",
        sequence: i + 1,
      });
    });
    result[deptId] = items;
  }
  return result;
}

const SEED_CONFIG: WeeklyCheckInConfig = {
  competenciesByDepartment: buildSeedCompetencies(),
  rankingLevels: DEFAULT_RANKING_LEVELS,
  actionTypes: DEFAULT_ACTION_TYPES,
};

function readConfig(): WeeklyCheckInConfig {
  try {
    if (typeof localStorage !== "undefined") {
      const raw = localStorage.getItem(CONFIG_STORAGE_KEY);
      if (raw) {
        const parsed = { ...SEED_CONFIG, ...JSON.parse(raw) } as WeeklyCheckInConfig;
        const byDept = parsed.competenciesByDepartment ?? {};
        for (const deptId of Object.keys(byDept)) {
          byDept[deptId] = byDept[deptId].map((c) => ({
            ...c,
            remark: typeof (c as { remark?: unknown }).remark === "string" ? c.remark : "",
          }));
        }
        return { ...parsed, competenciesByDepartment: byDept };
      }
    }
  } catch {
    /* use seed */
  }
  return structuredClone(SEED_CONFIG);
}

function writeConfig(config: WeeklyCheckInConfig): void {
  if (typeof localStorage !== "undefined") {
    localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(config));
  }
}

/** RO submits after the review week closes — Sunday ~6:30 PM IST. */
function submittedAtForWeek(weekStart: string): string {
  return `${addDays(weekStart, 6)}T13:00:00.000Z`;
}

function submissionSubmittedBeforeWeekEnd(sub: WeeklyCheckInSubmission): boolean {
  const weekEnd = addDays(sub.weekStart, 6);
  return sub.submittedAt.slice(0, 10) < weekEnd;
}

function normalizeSubmissionTimestamps(
  submissions: WeeklyCheckInSubmission[]
): WeeklyCheckInSubmission[] {
  let changed = false;
  const normalized = submissions.map((s) => {
    if (!submissionSubmittedBeforeWeekEnd(s)) return s;
    changed = true;
    return { ...s, submittedAt: submittedAtForWeek(s.weekStart) };
  });
  if (changed) writeSubmissions(normalized);
  return normalized;
}

function readSubmissions(): WeeklyCheckInSubmission[] {
  migrateSubmissionsIfNeeded();
  try {
    if (typeof localStorage !== "undefined") {
      const raw = localStorage.getItem(SUBMISSIONS_STORAGE_KEY);
      if (raw) return normalizeSubmissionTimestamps(JSON.parse(raw) as WeeklyCheckInSubmission[]);
    }
  } catch {
    /* fall through */
  }
  return structuredClone(SEED_SUBMISSIONS);
}

function writeSubmissions(submissions: WeeklyCheckInSubmission[]): void {
  if (typeof localStorage !== "undefined") {
    localStorage.setItem(SUBMISSIONS_STORAGE_KEY, JSON.stringify(submissions));
  }
}

export function getWeeklyCheckInConfig(): WeeklyCheckInConfig {
  return readConfig();
}

export function saveWeeklyCheckInConfig(config: WeeklyCheckInConfig): void {
  writeConfig(config);
}

export function getDepartmentByEmployee(employeeId: string): Department | undefined {
  const emp = EMPLOYEES.find((e) => e.id === employeeId);
  if (!emp) return undefined;
  return DEPARTMENTS.find((d) => d.name === emp.department);
}

export function getCompetenciesForDepartment(departmentId: string): DepartmentCompetency[] {
  const config = readConfig();
  return (config.competenciesByDepartment[departmentId] ?? []).slice().sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "technical" ? -1 : 1;
    return a.sequence - b.sequence;
  });
}

export function getDepartmentConfigStatus(departmentId: string): DepartmentConfigStatus {
  const comps = getCompetenciesForDepartment(departmentId);
  if (comps.length === 0) return "not_set";
  const tech = comps.filter((c) => c.kind === "technical");
  const beh = comps.filter((c) => c.kind === "behavioural");
  if (tech.length === 0 || beh.length === 0) return "partial";
  return "set";
}

export function copyCompetenciesFromDepartment(fromDeptId: string, toDeptId: string): void {
  const config = readConfig();
  const source = config.competenciesByDepartment[fromDeptId] ?? [];
  config.competenciesByDepartment[toDeptId] = source.map((c) => ({
    ...c,
    id: compId(toDeptId, c.kind, c.sequence),
    departmentId: toDeptId,
    sequence: c.sequence,
  }));
  writeConfig(config);
}

export function addCompetency(
  departmentId: string,
  kind: CompetencyKind,
  label: string,
  remark = ""
): { ok: boolean; error?: string } {
  const config = readConfig();
  const list = config.competenciesByDepartment[departmentId] ?? [];
  const kindList = list.filter((c) => c.kind === kind);
  if (kindList.length >= 5) return { ok: false, error: "Maximum 5 competencies per category." };
  const nextSeq = kindList.length + 1;
  list.push({
    id: compId(departmentId, kind, nextSeq),
    departmentId,
    kind,
    label: label.trim(),
    remark: remark.trim(),
    sequence: nextSeq,
  });
  config.competenciesByDepartment[departmentId] = list;
  writeConfig(config);
  return { ok: true };
}

export function updateCompetency(
  competencyId: string,
  label: string,
  remark: string
): { ok: boolean; error?: string } {
  const trimmed = label.trim();
  if (!trimmed) return { ok: false, error: "Competency name is required." };
  const config = readConfig();
  for (const deptId of Object.keys(config.competenciesByDepartment)) {
    const list = config.competenciesByDepartment[deptId];
    const idx = list.findIndex((c) => c.id === competencyId);
    if (idx < 0) continue;
    list[idx] = {
      ...list[idx],
      label: trimmed,
      remark: remark.trim(),
    };
    writeConfig(config);
    return { ok: true };
  }
  return { ok: false, error: "Competency not found." };
}

export function removeCompetency(competencyId: string): void {
  const config = readConfig();
  for (const deptId of Object.keys(config.competenciesByDepartment)) {
    const list = config.competenciesByDepartment[deptId].filter((c) => c.id !== competencyId);
    const reseq = (kind: CompetencyKind) =>
      list
        .filter((c) => c.kind === kind)
        .sort((a, b) => a.sequence - b.sequence)
        .map((c, i) => ({ ...c, sequence: i + 1 }));
    config.competenciesByDepartment[deptId] = [...reseq("technical"), ...reseq("behavioural")];
  }
  writeConfig(config);
}

export function moveCompetency(competencyId: string, direction: "up" | "down"): void {
  const config = readConfig();
  for (const deptId of Object.keys(config.competenciesByDepartment)) {
    const list = config.competenciesByDepartment[deptId];
    const comp = list.find((c) => c.id === competencyId);
    if (!comp) continue;
    const sameKind = list.filter((c) => c.kind === comp.kind).sort((a, b) => a.sequence - b.sequence);
    const idx = sameKind.findIndex((c) => c.id === competencyId);
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= sameKind.length) return;
    const a = sameKind[idx];
    const b = sameKind[swapIdx];
    const aSeq = a.sequence;
    a.sequence = b.sequence;
    b.sequence = aSeq;
    writeConfig(config);
    return;
  }
}

export function updateRankingTitle(value: 1 | 2 | 3 | 4 | 5, title: string): void {
  const config = readConfig();
  const level = config.rankingLevels.find((l) => l.value === value);
  if (level) level.title = title.trim().slice(0, 30);
  writeConfig(config);
}

export function parseIsoDate(iso: string): Date {
  return new Date(iso + "T12:00:00");
}

export function formatWeekLabel(weekStart: string, workingDays?: string[]): string {
  const { start: startIso, end: endIso } = workingWeekBounds(weekStart, workingDays);
  const start = parseIsoDate(startIso);
  const end = parseIsoDate(endIso);
  const fmt = (d: Date) =>
    d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const year = end.getFullYear();
  return `${fmt(start)} – ${fmt(end)}, ${year}`;
}

export function addDays(iso: string, days: number): string {
  const d = parseIsoDate(iso);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function getMondayOfWeek(iso: string): string {
  const d = parseIsoDate(iso);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

export function addWeeks(weekStart: string, weeks: number): string {
  return addDays(weekStart, weeks * 7);
}

export function isDateInWeek(date: string, weekStart: string): boolean {
  const end = addDays(weekStart, 6);
  return date >= weekStart && date <= end;
}

export function getDefaultReviewWeekStart(): string {
  return addWeeks(getCurrentWeekStart(), -1);
}

/** Previous five weeks only (T-5 … T-1). Current week is excluded from review. */
export function getReviewWeekStarts(): string[] {
  const current = getCurrentWeekStart();
  return [-5, -4, -3, -2, -1].map((n) => addWeeks(current, n));
}

/** Prefer URL week when it is in the review window; otherwise previous week. */
export function resolveReviewWeekStart(weekParam: string | null | undefined): string {
  const allowed = new Set(getReviewWeekStarts());
  if (weekParam && allowed.has(weekParam)) return weekParam;
  return getDefaultReviewWeekStart();
}

export function getReviewWeeks(workingDays?: string[]): ReviewWeekOption[] {
  const current = getCurrentWeekStart();
  return getReviewWeekStarts().map((weekStart) => ({
    weekStart,
    label: formatWeekLabel(weekStart, workingDays),
    isCurrent: weekStart === current,
  }));
}

/** Rolling Monday of the current week (local calendar). */
export function getCurrentWeekStart(): string {
  return getMondayOfWeek(
    (() => {
      const d = new Date();
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      return `${y}-${m}-${day}`;
    })()
  );
}

function weekCapacityHrs(): number {
  const days = DEFAULT_SETTINGS.workingDays.length;
  return Math.round(DEFAULT_SETTINGS.workingHoursPerDay * days);
}

export function buildWeeklyEvidence(
  employeeId: string,
  weekStart: string
): WeeklyEvidenceSnapshot {
  const perf = getPerformanceRowsForPeriod("week").find((r) => r.employeeId === employeeId);
  const dailyRows = getDailyWorkRowsForPeriod("week").filter(
    (r) => r.employeeId === employeeId && isDateInWeek(r.workDate, weekStart)
  );

  const planningDeviationCount = dailyRows.filter(
    (r) => r.confirmation === "D" || r.confirmation === "DD"
  ).length;
  const confirmationDelayCount = dailyRows.filter(
    (r) => r.confirmation === "CD" || r.confirmation === "DD"
  ).length;

  const projects = [...new Set(dailyRows.map((r) => r.projectName).filter(Boolean))] as string[];

  let billableHrs = 0;
  let nonBillableHrs = 0;
  for (const r of dailyRows) {
    const hrs = r.actualHours ?? r.plannedHours ?? 0;
    if (r.activityType === "Internal") nonBillableHrs += hrs;
    else billableHrs += hrs;
  }
  const totalHrs = billableHrs + nonBillableHrs;
  let billablePct = perf?.billablePct ?? (totalHrs > 0 ? Math.round((billableHrs / totalHrs) * 100) : 0);
  let nonBillablePct = perf?.nonBillablePct ?? (totalHrs > 0 ? 100 - billablePct : 0);

  if (perf?.leaveException) {
    billablePct = 0;
    nonBillablePct = 0;
  }

  const capacity = weekCapacityHrs();
  const utilizationHrs = perf?.utilizationHrs ?? Math.round(totalHrs);

  const noOperationalData =
    dailyRows.length === 0 &&
    !perf?.planningAccuracy &&
    !perf?.confirmationDiscipline &&
    utilizationHrs === 0;

  return {
    planningAccuracy: perf?.leaveException ? null : (perf?.planningAccuracy ?? null),
    planningDeviationCount,
    confirmationDiscipline: perf?.leaveException ? null : (perf?.confirmationDiscipline ?? null),
    confirmationDelayCount,
    utilizationHrs,
    utilizationCapacityHrs: capacity,
    billablePct,
    nonBillablePct,
    projects: projects.length > 0 ? projects : perf ? ["Project Falcon", "Project Atlas"].slice(0, perf.billablePct > 0 ? 2 : 1) : [],
    capturedAt: new Date().toISOString(),
    noOperationalData,
  };
}

export function getDirectReportsForReviewer(
  reviewerId: string,
  includeInactive = false
): Employee[] {
  const ids = getDirectReportIds(reviewerId);
  return EMPLOYEES.filter(
    (e) => ids.includes(e.id) && (includeInactive || e.status === "active")
  );
}

export function getSubmission(
  employeeId: string,
  weekStart: string
): WeeklyCheckInSubmission | undefined {
  return readSubmissions().find(
    (s) => s.employeeId === employeeId && s.weekStart === weekStart
  );
}

export function getAllSubmissions(): WeeklyCheckInSubmission[] {
  return readSubmissions();
}

export function getPreviousWeekSubmission(
  employeeId: string,
  weekStart: string
): WeeklyCheckInSubmission | undefined {
  const prevWeek = addWeeks(weekStart, -1);
  return getSubmission(employeeId, prevWeek);
}

const EMPLOYEE_ROLE_BY_NAME = Object.fromEntries(
  PLANNER_ROWS.map((row) => [row.name, row.role])
) as Record<string, string>;

const EMPLOYEE_ROLE_FALLBACK: Record<string, string> = {
  "EMP-1088": "DevOps Lead",
  "EMP-0991": "UX Designer",
  "EMP-1102": "Developer",
  "EMP-1067": "Support Exec",
};

export function getEmployeeInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function getEmployeeRole(employeeId: string, name: string): string {
  return EMPLOYEE_ROLE_FALLBACK[employeeId] ?? EMPLOYEE_ROLE_BY_NAME[name] ?? "Team Member";
}

export function disciplinePctClass(value: number | null | undefined, noData?: boolean): string {
  if (noData || value == null) return "text-muted-foreground";
  if (value >= 90) return "font-semibold text-success-fg";
  if (value >= 75) return "font-semibold text-warning";
  return "font-semibold text-danger";
}

export function formatQueueOpenAction(row: QueueRow): {
  text: string;
  tone: "warning" | "success" | "muted";
} {
  if (row.openActionType) {
    const label =
      row.openActionType === "Coaching"
        ? "Schedule Coaching"
        : row.openActionType === "Training"
          ? "Schedule Training"
          : row.openActionType;
    const note = row.openActionNotes
      ? ` · ${row.openActionNotes.replace(/\s+/g, " ").trim()}`
      : "";
    return { text: `${label}${note}`, tone: "warning" };
  }

  if (row.prevRecognition && row.prevRecognition !== "None") {
    if (row.prevActionCompleted) {
      return {
        text: `${row.prevRecognition} · completed last week`,
        tone: "success",
      };
    }
    const base = row.prevRecognition.replace(" Publicly", "");
    return { text: `Continue ${base}`, tone: "muted" };
  }

  return { text: "—", tone: "muted" };
}

export function formatReviewStatus(row: QueueRow): { label: string; tone: "pending" | "completed" } {
  if (row.status === "pending") {
    return { label: "Pending", tone: "pending" };
  }
  const day = row.submittedAt
    ? new Date(row.submittedAt).toLocaleDateString("en-US", { weekday: "short" })
    : "";
  return { label: day ? `Completed · ${day}` : "Completed", tone: "completed" };
}

export type QueueSortKey =
  | "resource"
  | "lastWeek"
  | "confirmationDiscipline"
  | "openAction"
  | "reviewStatus"
  | "status";

function lastWeekSortValue(row: QueueRow): number {
  if (!row.lastWeekStatus) return 0;
  const order: Record<WeeklyStatus, number> = {
    "On Track": 1,
    Watch: 2,
    "Intervention Required": 3,
  };
  return order[row.lastWeekStatus];
}

export function sortQueueRows(
  rows: QueueRow[],
  sortKey: QueueSortKey,
  sortDir: "asc" | "desc"
): QueueRow[] {
  const mul = sortDir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    let cmp = 0;
    switch (sortKey) {
      case "resource":
        cmp = a.employeeName.localeCompare(b.employeeName);
        break;
      case "lastWeek":
        cmp = lastWeekSortValue(a) - lastWeekSortValue(b);
        break;
      case "confirmationDiscipline": {
        const av = a.confirmationDiscipline ?? -1;
        const bv = b.confirmationDiscipline ?? -1;
        cmp = av - bv;
        break;
      }
      case "openAction":
        cmp = formatQueueOpenAction(a).text.localeCompare(formatQueueOpenAction(b).text);
        break;
      case "reviewStatus": {
        const av = a.status === "pending" ? 0 : 1;
        const bv = b.status === "pending" ? 0 : 1;
        cmp = av !== bv ? av - bv : (a.submittedAt ?? "").localeCompare(b.submittedAt ?? "");
        break;
      }
      case "status": {
        const av = a.status === "pending" ? 0 : 1;
        const bv = b.status === "pending" ? 0 : 1;
        cmp = av - bv;
        break;
      }
    }
    if (cmp !== 0) return mul * cmp;
    return a.employeeName.localeCompare(b.employeeName);
  });
}

export function getQueueRows(reviewerId: string, weekStart: string): QueueRow[] {
  const reports = getDirectReportsForReviewer(reviewerId);
  const submissions = readSubmissions();

  const rows: QueueRow[] = reports.map((emp) => {
    const sub = submissions.find(
      (s) => s.employeeId === emp.id && s.weekStart === weekStart
    );
    const prev = getPreviousWeekSubmission(emp.id, weekStart);
    const perf = getPerformanceRowsForPeriod("week").find((r) => r.employeeId === emp.id);
    const evidence = buildWeeklyEvidence(emp.id, weekStart);

    const openAction =
      prev && prev.actionType !== "None" && prev.actionOutcome !== "Completed"
        ? { type: prev.actionType, notes: prev.actionNotes }
        : undefined;

    return {
      employeeId: emp.id,
      employeeName: emp.name,
      department: emp.department,
      role: getEmployeeRole(emp.id, emp.name),
      initials: getEmployeeInitials(emp.name),
      status: sub ? "completed" : "pending",
      submissionId: sub?.id,
      lastWeekStatus: prev?.weeklyStatus,
      confirmationDiscipline: perf?.confirmationDiscipline ?? evidence.confirmationDiscipline,
      openActionType: openAction?.type,
      openActionNotes: openAction?.notes,
      prevRecognition: prev?.recognition,
      prevActionCompleted: prev?.actionOutcome === "Completed",
      submittedAt: sub?.submittedAt,
      weeklyStatus: sub?.weeklyStatus,
      recognition: sub?.recognition,
      noPriorReview: !prev,
      noOperationalData: evidence.noOperationalData,
      joinedMidWeek: emp.id === "EMP-1102",
    };
  });

  // Mid-week joiner demo: Dev Malhotra if present
  const dev = EMPLOYEES.find((e) => e.email === "dev.malhotra@acme.io");
  if (dev && dev.resourceOwnerId === reviewerId && !rows.some((r) => r.employeeId === dev.id)) {
    rows.push({
      employeeId: dev.id,
      employeeName: dev.name,
      department: dev.department,
      role: getEmployeeRole(dev.id, dev.name),
      initials: getEmployeeInitials(dev.name),
      status: "pending",
      noPriorReview: true,
      noOperationalData: true,
      confirmationDiscipline: null,
      joinedMidWeek: true,
    });
  }

  return rows.sort((a, b) => {
    if (a.status !== b.status) return a.status === "pending" ? -1 : 1;
    return a.employeeName.localeCompare(b.employeeName);
  });
}

export function getQueueSummary(reviewerId: string, weekStart: string) {
  const rows = getQueueRows(reviewerId, weekStart);
  const pending = rows.filter((r) => r.status === "pending").length;
  const completed = rows.filter((r) => r.status === "completed").length;
  return {
    directCount: rows.length,
    pendingCount: pending,
    completedCount: completed,
    progressPct: rows.length === 0 ? 0 : Math.round((completed / rows.length) * 100),
  };
}

export function validateSubmission(
  draft: WeeklyCheckInDraft,
  existingSubmission?: WeeklyCheckInSubmission,
  /** Live department PK (or code) used as competenciesByDepartment key — prefer dbId from Masters. */
  departmentConfigId?: string
): ValidationResult {
  const first = findFirstSubmissionIssue(draft, existingSubmission, departmentConfigId);
  return first ? { valid: false, errors: [first.message] } : { valid: true, errors: [] };
}

/**
 * Returns the first missing mandatory field in defined order (competencies → remarks → action notes).
 * Used so Submit shows one toast and focuses one field at a time.
 */
export function findFirstSubmissionIssue(
  draft: WeeklyCheckInDraft,
  existingSubmission?: WeeklyCheckInSubmission,
  departmentConfigId?: string
): SubmissionIssue | null {
  if (existingSubmission) {
    return { message: "Review already submitted for this week." };
  }

  let deptKey = departmentConfigId?.trim() ?? "";
  if (!deptKey) {
    const dept = getDepartmentByEmployee(draft.employeeId);
    if (!dept) {
      return { message: "Employee department not found." };
    }
    deptKey = dept.dbId ?? dept.id;
  }

  const status = getDepartmentConfigStatus(deptKey);
  if (status === "not_set") {
    return {
      message:
        "No competency template exists for this department. Ask an administrator to configure competencies under Setup → Weekly Check-In Config.",
    };
  }

  const comps = getCompetenciesForDepartment(deptKey);
  const tech = comps.filter((c) => c.kind === "technical");
  const beh = comps.filter((c) => c.kind === "behavioural");
  const config = readConfig();
  const validValues = new Set(config.rankingLevels.map((l) => l.value));

  for (const c of tech) {
    const v = draft.technicalRatings[c.id];
    if (v == null || !validValues.has(v as 1 | 2 | 3 | 4 | 5)) {
      return {
        message: `Rate technical competency: ${c.label}`,
        focusId: competencyFocusId(c.id),
      };
    }
  }
  for (const c of beh) {
    const v = draft.behaviouralRatings[c.id];
    if (v == null || !validValues.has(v as 1 | 2 | 3 | 4 | 5)) {
      return {
        message: `Rate behavioural competency: ${c.label}`,
        focusId: competencyFocusId(c.id),
      };
    }
  }

  if (!draft.roRemarks.trim()) {
    return {
      message: "RO Remarks are required.",
      focusId: WCI_FOCUS_RO_REMARKS,
    };
  }
  if (draft.roRemarks.trim().length > MAX_RO_REMARKS_LENGTH) {
    return {
      message: `RO Remarks must be at most ${MAX_RO_REMARKS_LENGTH} characters.`,
      focusId: WCI_FOCUS_RO_REMARKS,
    };
  }

  if (draft.actionType !== "None" && draft.actionNotes.trim().length < MIN_REMARKS_LENGTH) {
    return {
      message: `Action Notes must be at least ${MIN_REMARKS_LENGTH} characters when Action Type is not None.`,
      focusId: WCI_FOCUS_ACTION_NOTES,
    };
  }

  return null;
}

export function submitWeeklyCheckIn(
  draft: WeeklyCheckInDraft,
  submittedByEmployeeId: string
): { ok: boolean; errors?: string[]; submission?: WeeklyCheckInSubmission } {
  const existing = getSubmission(draft.employeeId, draft.weekStart);
  const validation = validateSubmission(draft, existing);
  if (!validation.valid) return { ok: false, errors: validation.errors };

  const evidence = structuredClone(buildWeeklyEvidence(draft.employeeId, draft.weekStart));
  const submission: WeeklyCheckInSubmission = {
    id: `wci-${Date.now()}`,
    employeeId: draft.employeeId,
    resourceOwnerId: draft.resourceOwnerId,
    weekStart: draft.weekStart,
    evidence,
    technicalRatings: { ...draft.technicalRatings },
    behaviouralRatings: { ...draft.behaviouralRatings },
    weeklyStatus: draft.weeklyStatus,
    confidence: draft.confidence,
    roRemarks: draft.roRemarks.trim(),
    actionType: draft.actionType,
    actionNotes: draft.actionType !== "None" ? draft.actionNotes.trim() : undefined,
    previousActionStatus: draft.previousActionStatus,
    recognition: draft.recognition,
    submittedAt: new Date().toISOString(),
    submittedByEmployeeId,
    actionOutcome: draft.actionType !== "None" ? "Still Pending" : undefined,
  };

  const all = readSubmissions();
  all.push(submission);

  if (draft.previousActionStatus) {
    const prevWeek = addWeeks(draft.weekStart, -1);
    const prevIdx = all.findIndex(
      (s) => s.employeeId === draft.employeeId && s.weekStart === prevWeek
    );
    if (prevIdx >= 0) {
      all[prevIdx] = {
        ...all[prevIdx],
        actionOutcome: draft.previousActionStatus,
      };
    }
  }

  writeSubmissions(all);
  return { ok: true, submission };
}

export function getFrozenSnapshot(submissionId: string): WeeklyCheckInSubmission | undefined {
  return readSubmissions().find((s) => s.id === submissionId);
}

export function getEmployeeHistory(
  employeeId: string,
  weekCount = 8,
  workingDays?: string[]
): EmployeeHistory {
  const emp = EMPLOYEES.find((e) => e.id === employeeId)!;
  const dept = getDepartmentByEmployee(employeeId);
  const comps = dept ? getCompetenciesForDepartment(dept.id) : [];
  const competencyLabels = comps.map((c) => ({
    id: c.id,
    kind: c.kind,
    label: c.label,
  }));

  const current = getCurrentWeekStart();
  const lastCompleted = addWeeks(current, -1);
  const weekStarts = Array.from({ length: weekCount }, (_, i) =>
    addWeeks(lastCompleted, i - weekCount + 1)
  );

  const submissions = readSubmissions().filter((s) => s.employeeId === employeeId);

  const weeks: EmployeeHistoryWeek[] = weekStarts.map((weekStart) => {
    const sub = submissions.find((s) => s.weekStart === weekStart);
    return {
      weekStart,
      weekLabel: formatWeekLabel(weekStart, workingDays).split(",")[0] ?? weekStart,
      submissionId: sub?.id,
      weeklyStatus: sub?.weeklyStatus,
      confidence: sub?.confidence,
      technicalRatings: sub?.technicalRatings ?? {},
      behaviouralRatings: sub?.behaviouralRatings ?? {},
      actionType: sub?.actionType,
      actionOutcome: sub?.actionOutcome,
    };
  });

  const actions = submissions
    .filter((s) => s.actionType && s.actionType !== "None")
    .map((s) => ({
      weekStart: s.weekStart,
      weekLabel: formatWeekLabel(s.weekStart, workingDays).split(",")[0] ?? s.weekStart,
      actionType: s.actionType,
      actionNotes: s.actionNotes,
      outcome: s.actionOutcome,
    }))
    .sort((a, b) => a.weekStart.localeCompare(b.weekStart));

  return {
    employeeId,
    employeeName: emp?.name ?? "Unknown",
    department: emp?.department ?? "",
    competencyLabels,
    weeks,
    actions,
  };
}

export function rankingLevelForValue(value: number): RankingLevel | undefined {
  return readConfig().rankingLevels.find((l) => l.value === value);
}

/** Tailwind classes for ranking chips — matches MetricChip / status token palette. */
export function rankingChipClass(level: RankingLevel, selected = true): string {
  if (!selected) return "border-border bg-surface text-muted-foreground hover:bg-surface-alt";

  const tokenLevel =
    typeof level.color === "string" && level.color.startsWith("#")
      ? DEFAULT_RANKING_LEVELS.find((l) => l.value === level.value) ?? level
      : level;

  switch (tokenLevel.color) {
    case "success":
      return "border-success-border bg-success text-white";
    case "accent":
      return "border-accent-line bg-accent-soft text-accent-softfg";
    case "warning":
      return "border-warning-border bg-warning-soft text-warning";
    case "danger-soft":
      return "border-danger-border bg-danger-soft text-danger";
    case "danger":
      return "border-danger-border bg-danger text-white";
    default:
      return "border-border bg-surface-alt text-foreground";
  }
}

export function weeklyStatusArcClass(status: WeeklyStatus): string {
  switch (status) {
    case "On Track":
      return "bg-success border-success-border";
    case "Watch":
      return "bg-warning-soft border-warning-border";
    case "Intervention Required":
      return "bg-danger-soft border-danger-border";
  }
}

export function getSubmitterName(employeeId: string): string {
  return EMPLOYEES.find((e) => e.id === employeeId)?.name ?? "Unknown";
}

function makeSeedSubmission(
  partial: Omit<WeeklyCheckInSubmission, "id" | "evidence" | "submittedAt"> & {
    evidence?: Partial<WeeklyEvidenceSnapshot>;
  }
): WeeklyCheckInSubmission {
  const evidence = buildWeeklyEvidence(partial.employeeId, partial.weekStart);
  return {
    ...partial,
    id: `wci-seed-${partial.employeeId}-${partial.weekStart}`,
    evidence: { ...evidence, ...partial.evidence },
    submittedAt: submittedAtForWeek(partial.weekStart),
  };
}

const RO_ON_TRACK =
  "Consistent delivery this week with solid planning accuracy and timely confirmations. Collaboration with the team was effective and blockers were communicated early throughout the sprint cycle.";
const RO_WATCH =
  "Performance dipped this week with planning deviations and delayed confirmations. Core skills remain strong but daily discipline habits need focused attention in the coming review period.";
const RO_INTERVENTION =
  "Multiple deviations and delayed confirmations this week impacted delivery commitments. Structured support is required to stabilize planning accuracy and restore confirmation discipline going forward.";

function engRatings(
  tech: [1 | 2 | 3 | 4 | 5, 1 | 2 | 3 | 4 | 5, 1 | 2 | 3 | 4 | 5, 1 | 2 | 3 | 4 | 5],
  beh: [1 | 2 | 3 | 4 | 5, 1 | 2 | 3 | 4 | 5, 1 | 2 | 3 | 4 | 5, 1 | 2 | 3 | 4 | 5]
) {
  return {
    technicalRatings: {
      [compId("dept-1", "technical", 1)]: tech[0],
      [compId("dept-1", "technical", 2)]: tech[1],
      [compId("dept-1", "technical", 3)]: tech[2],
      [compId("dept-1", "technical", 4)]: tech[3],
    },
    behaviouralRatings: {
      [compId("dept-1", "behavioural", 1)]: beh[0],
      [compId("dept-1", "behavioural", 2)]: beh[1],
      [compId("dept-1", "behavioural", 3)]: beh[2],
      [compId("dept-1", "behavioural", 4)]: beh[3],
    },
  };
}

function qaRatings(
  tech: [1 | 2 | 3 | 4 | 5, 1 | 2 | 3 | 4 | 5, 1 | 2 | 3 | 4 | 5],
  beh: [1 | 2 | 3 | 4 | 5, 1 | 2 | 3 | 4 | 5, 1 | 2 | 3 | 4 | 5]
) {
  return {
    technicalRatings: {
      [compId("dept-2", "technical", 1)]: tech[0],
      [compId("dept-2", "technical", 2)]: tech[1],
      [compId("dept-2", "technical", 3)]: tech[2],
    },
    behaviouralRatings: {
      [compId("dept-2", "behavioural", 1)]: beh[0],
      [compId("dept-2", "behavioural", 2)]: beh[1],
      [compId("dept-2", "behavioural", 3)]: beh[2],
    },
  };
}

function historyWeek(offset: number): string {
  return addWeeks(CURRENT_WEEK_START, offset);
}

/** Multi-week history seeds for status arc, competency matrix, and action track demos. */
function buildHistorySeedSubmissions(): WeeklyCheckInSubmission[] {
  const seeds: WeeklyCheckInSubmission[] = [];

  const vikramArc: {
    offset: number;
    status: WeeklyStatus;
    confidence: WeeklyConfidence;
    ratings: ReturnType<typeof engRatings>;
    remarks: string;
    actionType: string;
    actionNotes?: string;
    actionOutcome?: ActionStatus;
    recognition?: Recognition;
    evidence?: Partial<WeeklyEvidenceSnapshot>;
  }[] = [
    { offset: -7, status: "On Track", confidence: "High", ratings: engRatings([4, 4, 4, 3], [4, 4, 4, 3]), remarks: RO_ON_TRACK, actionType: "None", recognition: "None", evidence: { planningAccuracy: 94, confirmationDiscipline: 96 } },
    { offset: -6, status: "On Track", confidence: "High", ratings: engRatings([4, 3, 4, 4], [4, 3, 4, 4]), remarks: RO_ON_TRACK, actionType: "None", recognition: "None", evidence: { planningAccuracy: 92, confirmationDiscipline: 94 } },
    { offset: -5, status: "On Track", confidence: "High", ratings: engRatings([4, 4, 4, 4], [4, 4, 3, 4]), remarks: RO_ON_TRACK, actionType: "None", recognition: "Appreciate", evidence: { planningAccuracy: 91, confirmationDiscipline: 93 } },
    { offset: -4, status: "Watch", confidence: "Medium", ratings: engRatings([3, 3, 3, 3], [3, 3, 3, 3]), remarks: RO_WATCH, actionType: "Coaching", actionNotes: "Schedule coaching on estimation and daily confirmation habits. Pair review session with tech lead before next sprint planning.", actionOutcome: "Still Pending", recognition: "None", evidence: { planningAccuracy: 86, confirmationDiscipline: 84 } },
    { offset: -3, status: "Watch", confidence: "Medium", ratings: engRatings([3, 3, 2, 3], [3, 2, 3, 3]), remarks: RO_WATCH, actionType: "Coaching", actionNotes: "Follow-up coaching session on confirmation discipline. Review daily planning checklist adoption and blockers log.", actionOutcome: "Still Pending", recognition: "None", evidence: { planningAccuracy: 82, confirmationDiscipline: 79 } },
    { offset: -2, status: "Watch", confidence: "Low", ratings: engRatings([3, 2, 2, 2], [3, 2, 2, 3]), remarks: RO_WATCH, actionType: "Coaching", actionNotes: "Second-week coaching follow-up completed. Vikram acknowledged gaps and committed to daily stand-up confirmations.", actionOutcome: "Completed", recognition: "None", evidence: { planningAccuracy: 80, confirmationDiscipline: 76 } },
    { offset: -1, status: "On Track", confidence: "High", ratings: engRatings([4, 3, 4, 3], [4, 4, 3, 4]), remarks: RO_ON_TRACK, actionType: "None", recognition: "Appreciate", evidence: { planningAccuracy: 88, confirmationDiscipline: 91 } },
    { offset: 0, status: "Intervention Required", confidence: "Low", ratings: engRatings([3, 3, 3, 2], [3, 3, 2, 3]), remarks: RO_INTERVENTION, actionType: "Training", actionNotes: "Enroll Vikram in the planning and confirmation discipline workshop next week. Pair with Arjun for two days on estimation practices.", actionOutcome: "Still Pending", recognition: "None", evidence: { planningAccuracy: 72, confirmationDiscipline: 68 } },
  ];

  for (const row of vikramArc) {
    seeds.push(
      makeSeedSubmission({
        employeeId: "EMP-1058",
        resourceOwnerId: "EMP-1042",
        weekStart: historyWeek(row.offset),
        ...row.ratings,
        weeklyStatus: row.status,
        confidence: row.confidence,
        roRemarks: row.remarks,
        actionType: row.actionType,
        actionNotes: row.actionNotes,
        actionOutcome: row.actionOutcome,
        recognition: row.recognition ?? "None",
        submittedByEmployeeId: "EMP-1042",
        evidence: row.evidence,
      })
    );
  }

  const arjunArc = [
    { offset: -7, status: "On Track" as const, confidence: "High" as const, ratings: engRatings([5, 4, 5, 4], [5, 4, 4, 5]), remarks: RO_ON_TRACK, actionType: "None", recognition: "None" as const, evidence: { planningAccuracy: 97, confirmationDiscipline: 98 } },
    { offset: -6, status: "On Track" as const, confidence: "High" as const, ratings: engRatings([5, 5, 4, 4], [5, 4, 5, 4]), remarks: RO_ON_TRACK, actionType: "None", recognition: "Appreciate" as const, evidence: { planningAccuracy: 96, confirmationDiscipline: 97 } },
    { offset: -5, status: "On Track" as const, confidence: "High" as const, ratings: engRatings([5, 4, 5, 5], [4, 5, 4, 5]), remarks: RO_ON_TRACK, actionType: "None", recognition: "None" as const, evidence: { planningAccuracy: 95, confirmationDiscipline: 96 } },
    { offset: -4, status: "Watch" as const, confidence: "Medium" as const, ratings: engRatings([4, 3, 4, 3], [4, 3, 3, 4]), remarks: RO_WATCH, actionType: "Coaching", actionNotes: "Brief coaching on sprint estimation after one over-commit week. Reinforce capacity planning before accepting new tasks.", actionOutcome: "Completed" as const, recognition: "None" as const, evidence: { planningAccuracy: 84, confirmationDiscipline: 88 } },
    { offset: -3, status: "On Track" as const, confidence: "High" as const, ratings: engRatings([5, 4, 5, 4], [5, 4, 4, 5]), remarks: RO_ON_TRACK, actionType: "None", recognition: "None" as const, evidence: { planningAccuracy: 93, confirmationDiscipline: 95 } },
    { offset: -2, status: "On Track" as const, confidence: "High" as const, ratings: engRatings([5, 5, 4, 4], [5, 5, 4, 4]), remarks: RO_ON_TRACK, actionType: "None", recognition: "Appreciate Publicly" as const, evidence: { planningAccuracy: 94, confirmationDiscipline: 96 } },
    { offset: -1, status: "On Track" as const, confidence: "High" as const, ratings: engRatings([5, 4, 5, 4], [5, 4, 4, 5]), remarks: RO_ON_TRACK, actionType: "None", recognition: "None" as const, evidence: { planningAccuracy: 95, confirmationDiscipline: 96 } },
    { offset: 0, status: "On Track" as const, confidence: "High" as const, ratings: engRatings([5, 4, 5, 4], [5, 4, 4, 5]), remarks: RO_ON_TRACK, actionType: "None", recognition: "Appreciate Publicly" as const, evidence: { planningAccuracy: 96, confirmationDiscipline: 97 } },
  ];

  for (const row of arjunArc) {
    seeds.push(
      makeSeedSubmission({
        employeeId: "EMP-1043",
        resourceOwnerId: "EMP-1042",
        weekStart: historyWeek(row.offset),
        ...row.ratings,
        weeklyStatus: row.status,
        confidence: row.confidence,
        roRemarks: row.remarks,
        actionType: row.actionType,
        actionNotes: row.actionNotes,
        actionOutcome: row.actionOutcome,
        recognition: row.recognition,
        submittedByEmployeeId: "EMP-1042",
        evidence: row.evidence,
      })
    );
  }

  const priyaArc = [
    { offset: -7, status: "On Track" as const, confidence: "High" as const, ratings: qaRatings([4, 4, 4], [4, 4, 4]), remarks: RO_ON_TRACK, actionType: "None", recognition: "None" as const },
    { offset: -6, status: "On Track" as const, confidence: "High" as const, ratings: qaRatings([4, 3, 4], [4, 3, 4]), remarks: RO_ON_TRACK, actionType: "None", recognition: "Appreciate" as const },
    { offset: -5, status: "On Track" as const, confidence: "Medium" as const, ratings: qaRatings([3, 4, 4], [3, 4, 3]), remarks: RO_ON_TRACK, actionType: "None", recognition: "None" as const },
    { offset: -4, status: "Watch" as const, confidence: "Medium" as const, ratings: qaRatings([3, 3, 3], [3, 3, 3]), remarks: RO_WATCH, actionType: "Coaching", actionNotes: "Coaching on confirmation discipline and test documentation standards. Review automation backlog prioritization.", actionOutcome: "Still Pending" as const, recognition: "None" as const },
    { offset: -3, status: "Watch" as const, confidence: "Medium" as const, ratings: qaRatings([3, 3, 4], [3, 3, 4]), remarks: RO_WATCH, actionType: "Coaching", actionNotes: "Follow-up on daily confirmation habits and smoke test execution timing.", actionOutcome: "Still Pending" as const, recognition: "None" as const },
    { offset: -2, status: "On Track" as const, confidence: "Medium" as const, ratings: qaRatings([4, 3, 4], [4, 3, 4]), remarks: RO_ON_TRACK, actionType: "None", recognition: "None" as const },
    { offset: -1, status: "Watch" as const, confidence: "Medium" as const, ratings: qaRatings([3, 3, 4], [3, 3, 4]), remarks: RO_WATCH, actionType: "Coaching", actionNotes: "Schedule a 30-minute coaching session on confirmation discipline and daily planning habits.", actionOutcome: "Still Pending" as const, recognition: "None" as const },
  ];

  for (const row of priyaArc) {
    seeds.push(
      makeSeedSubmission({
        employeeId: "EMP-1051",
        resourceOwnerId: "EMP-0991",
        weekStart: historyWeek(row.offset),
        ...row.ratings,
        weeklyStatus: row.status,
        confidence: row.confidence,
        roRemarks: row.remarks,
        actionType: row.actionType,
        actionNotes: row.actionNotes,
        actionOutcome: row.actionOutcome,
        recognition: row.recognition,
        submittedByEmployeeId: "EMP-0991",
      })
    );
  }

  const taraWeeks = [
    { offset: -3, status: "On Track" as const, ratings: qaRatings([3, 3, 3], [3, 3, 3]) },
    { offset: -2, status: "On Track" as const, ratings: qaRatings([3, 4, 3], [3, 4, 3]) },
    { offset: -1, status: "Watch" as const, ratings: qaRatings([3, 3, 2], [3, 3, 3]) },
    { offset: 0, status: "On Track" as const, ratings: qaRatings([3, 4, 3], [4, 3, 4]) },
  ];

  for (const row of taraWeeks) {
    seeds.push(
      makeSeedSubmission({
        employeeId: "EMP-1071",
        resourceOwnerId: "EMP-1051",
        weekStart: historyWeek(row.offset),
        ...row.ratings,
        weeklyStatus: row.status,
        confidence: row.status === "Watch" ? "Medium" : "High",
        roRemarks: row.status === "Watch" ? RO_WATCH : RO_ON_TRACK,
        actionType: "None",
        recognition: "None",
        submittedByEmployeeId: "EMP-1051",
      })
    );
  }

  return seeds;
}

const SEED_SUBMISSIONS: WeeklyCheckInSubmission[] = buildHistorySeedSubmissions();

const HISTORY_DEMO_EMPLOYEE = "EMP-1058";
const HISTORY_WEEKS_EXPECTED = 8;

function storedHistoryIsIncomplete(stored: WeeklyCheckInSubmission[]): boolean {
  const count = stored.filter((s) => s.employeeId === HISTORY_DEMO_EMPLOYEE).length;
  return count < HISTORY_WEEKS_EXPECTED;
}

function migrateSubmissionsIfNeeded(): void {
  if (typeof localStorage === "undefined") return;

  let stored: WeeklyCheckInSubmission[] = [];
  try {
    const raw = localStorage.getItem(SUBMISSIONS_STORAGE_KEY);
    if (raw) stored = JSON.parse(raw) as WeeklyCheckInSubmission[];
  } catch {
    stored = [];
  }

  const version = parseInt(localStorage.getItem(SUBMISSIONS_VERSION_KEY) ?? "1", 10);
  const needsTimestampFix = stored.some(submissionSubmittedBeforeWeekEnd);
  const needsReseed =
    version < SUBMISSIONS_VERSION ||
    storedHistoryIsIncomplete(stored) ||
    needsTimestampFix;

  if (!needsReseed) return;

  writeSubmissions(structuredClone(SEED_SUBMISSIONS));
  localStorage.setItem(SUBMISSIONS_VERSION_KEY, String(SUBMISSIONS_VERSION));
}

/** Reset submissions to seed (for demo refresh). */
export function resetWeeklyCheckInSubmissions(): void {
  writeSubmissions(structuredClone(SEED_SUBMISSIONS));
  if (typeof localStorage !== "undefined") {
    localStorage.setItem(SUBMISSIONS_VERSION_KEY, String(SUBMISSIONS_VERSION));
  }
}

/** Initialize storage with seeds if empty. */
export function initWeeklyCheckInStorage(): void {
  if (typeof localStorage === "undefined") return;
  migrateSubmissionsIfNeeded();
  if (!localStorage.getItem(SUBMISSIONS_STORAGE_KEY)) {
    writeSubmissions(structuredClone(SEED_SUBMISSIONS));
    localStorage.setItem(SUBMISSIONS_VERSION_KEY, String(SUBMISSIONS_VERSION));
  }
  if (!localStorage.getItem(CONFIG_STORAGE_KEY)) {
    writeConfig(structuredClone(SEED_CONFIG));
  }
}

initWeeklyCheckInStorage();
