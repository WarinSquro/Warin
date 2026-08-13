import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { FileSpreadsheet, FileText, Search } from "lucide-react";
import { SortColHeader, useColumnSort } from "../components/SortColHeader";
import { FilterMultiSelect } from "../components/FilterMultiSelect";
import { MetricChip } from "../components/MetricChip";
import { MetricDelta } from "../components/MetricDelta";
import { BillableSplitBar } from "../components/BillableSplitBar";
import { ProjectHealthBadge } from "../components/ProjectHealthBadge";
import { ProjectTypeBadge } from "../components/ProjectTypeBadge";
import { ProjectExecutionDrawer } from "../components/ProjectExecutionDrawer";
import {
  DEFAULT_EXECUTION_CUSTOM_MONTH,
  EXECUTION_CUSTOM_MONTHS,
  EXECUTION_STATUS_OPTIONS,
  EXECUTION_STATUS_LABELS,
  HEALTH_LABELS,
  HEALTH_OPTIONS,
  computeExecutionSummary,
  executionDepartments,
  executionProjects,
  executionResourceOwners,
  filterExecutionRows,
  getCompareLabel,
  getExecutionPeriodLabel,
  sortExecutionRows,
} from "../data/executionReport";
import { performancePeriodOptions } from "../utils/reportPeriods";
import type {
  ExecutionCustomMonthId,
  ExecutionFilters,
  ExecutionPeriodId,
  ExecutionRow,
  ExecutionSortKey,
  ExecutionStatus,
  ProjectHealth,
} from "../data/executionReport";
import { useProjects } from "../context/ProjectsContext";
import { useEmployees } from "../context/EmployeesContext";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { useSettings } from "../context/SettingsContext";
import {
  buildExecutionHistoryFromLive,
  buildExecutionRosterFromLive,
  buildExecutionRowsFromProjects,
  reportRange,
  toLocalISO,
} from "../api/liveViews";
import { fetchAllocations, fetchConfirmations, type ApiAllocation, type ApiConfirmation } from "../api/domain";
import { useSharedDataSync } from "../hooks/useSharedDataSync";
import { runReportExport, summarizeFilter } from "../utils/reportExport";
import type { ReportExportInput } from "../utils/reportExport";
import { formatHoursLabel } from "../utils/formatHours";
import { projectTypeLabel } from "../data/setup";
import {
  scopeAllocationsForViewer,
  scopeConfirmationsForViewer,
  visibleEmployeeIdSet,
} from "../utils/reportVisibility";
import {
  loadReportFilters,
  reconcileMultiSelect,
  saveReportFilters,
} from "../utils/reportFilterPersistence";

const REPORT_GRID =
  "grid w-full grid-cols-[minmax(0,1.15fr)_minmax(0,0.95fr)_minmax(0,0.95fr)_minmax(5.5rem,0.72fr)_minmax(0,1.15fr)_minmax(3.5rem,0.55fr)_minmax(0,0.95fr)] items-center gap-x-4 px-4";

const HEALTH_FILTER_ITEMS = HEALTH_OPTIONS.map((h) => HEALTH_LABELS[h]);
const STATUS_FILTER_ITEMS = EXECUTION_STATUS_OPTIONS.map((s) => EXECUTION_STATUS_LABELS[s]);

type ExecutionPersistedFilters = {
  periodId: ExecutionPeriodId;
  customMonthId: ExecutionCustomMonthId;
  compareOn: boolean;
  search: string;
  projects: string[];
  departments: string[];
  resourceOwners: string[];
  healthFilters: string[];
  statusFilters: string[];
  sortKey: ExecutionSortKey;
  sortDir: "asc" | "desc";
};

export function ProjectExecutionReport() {
  const navigate = useNavigate();
  const { projects: liveProjects } = useProjects();
  const { employees } = useEmployees();
  const { currentEmployee, isSuperAdmin } = useAuth();
  const { settings } = useSettings();
  const hoursPerDay = settings.workingHoursPerDay || 8;
  const visibleIds = useMemo(
    () => visibleEmployeeIdSet(employees, currentEmployee, isSuperAdmin),
    [employees, currentEmployee, isSuperAdmin]
  );
  const [searchParams] = useSearchParams();
  const attentionPreset = searchParams.get("preset") === "attention";
  const storedFilters = useMemo(
    () => loadReportFilters<ExecutionPersistedFilters>("execution"),
    []
  );
  const [periodId, setPeriodId] = useState<ExecutionPeriodId>(
    () => storedFilters?.periodId ?? "month"
  );
  const [customMonthId, setCustomMonthId] = useState<ExecutionCustomMonthId>(
    () => storedFilters?.customMonthId ?? DEFAULT_EXECUTION_CUSTOM_MONTH
  );
  const [compareOn, setCompareOn] = useState(() => storedFilters?.compareOn ?? false);
  const [search, setSearch] = useState(() => storedFilters?.search ?? "");
  const toast = useToast();
  const [drawerRow, setDrawerRow] = useState<ExecutionRow | null>(null);
  const [allocations, setAllocations] = useState<ApiAllocation[]>([]);
  const [confirmations, setConfirmations] = useState<ApiConfirmation[]>([]);

  const EXECUTION_PERIODS = useMemo(
    () => performancePeriodOptions(new Date(), settings.workingDays),
    [settings.workingDays]
  );

  const range = useMemo(() => {
    if (periodId === "week") return reportRange("week", { workingDays: settings.workingDays });
    if (periodId === "custom") {
      const [y, m] = customMonthId.split("-").map(Number);
      const from = `${customMonthId}-01`;
      const end = new Date(y!, m!, 0);
      const to = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, "0")}-${String(end.getDate()).padStart(2, "0")}`;
      return { from, to, label: customMonthId };
    }
    return reportRange("month");
  }, [periodId, customMonthId, settings.workingDays]);

  /** Wider window so the drawer 6-month trend can aggregate live months. */
  const fetchRange = useMemo(() => {
    const anchor = new Date(`${range.to}T12:00:00`);
    const from = toLocalISO(new Date(anchor.getFullYear(), anchor.getMonth() - 5, 1));
    const monthEnd = toLocalISO(new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0));
    const to = range.to > monthEnd ? range.to : monthEnd;
    return { from, to };
  }, [range.to]);

  const load = useCallback(async () => {
    try {
      const [a, c] = await Promise.all([
        fetchAllocations({ from: fetchRange.from, to: fetchRange.to }),
        fetchConfirmations({ from: fetchRange.from, to: fetchRange.to }),
      ]);
      setAllocations(a);
      setConfirmations(c);
    } catch {
      setAllocations([]);
      setConfirmations([]);
    }
  }, [fetchRange.from, fetchRange.to]);

  useEffect(() => {
    void load();
  }, [load]);

  useSharedDataSync(true, load, { resources: ["allocations", "confirmations", "projects", "employees"] });

  const scopedAllocations = useMemo(
    () => scopeAllocationsForViewer(allocations, visibleIds),
    [allocations, visibleIds]
  );
  const scopedConfirmations = useMemo(
    () => scopeConfirmationsForViewer(confirmations, visibleIds),
    [confirmations, visibleIds]
  );

  const periodRows = useMemo(() => {
    const rows = buildExecutionRowsFromProjects(
      liveProjects,
      scopedAllocations,
      scopedConfirmations,
      range.from,
      range.to
    );
    if (visibleIds == null) return rows;
    // Non-superadmin: only projects with at least one visible allocated person in range
    const touched = new Set(scopedAllocations.map((a) => a.projectCode));
    return rows.filter((r) => touched.has(r.projectId));
  }, [
    liveProjects,
    scopedAllocations,
    scopedConfirmations,
    range.from,
    range.to,
    visibleIds,
  ]);
  const priorRows = undefined;

  const allProjects = useMemo(() => executionProjects(periodRows), [periodRows]);
  const allDepts = useMemo(() => executionDepartments(periodRows), [periodRows]);
  const allOwners = useMemo(() => executionResourceOwners(periodRows), [periodRows]);
  const ownerNames = useMemo(() => allOwners.map((o) => o.name), [allOwners]);

  const [projects, setProjects] = useState<string[]>(() => storedFilters?.projects ?? []);
  const [departments, setDepartments] = useState<string[]>(() => storedFilters?.departments ?? []);
  const [resourceOwners, setResourceOwners] = useState<string[]>(
    () => storedFilters?.resourceOwners ?? []
  );
  const [healthFilters, setHealthFilters] = useState<string[]>(() => {
    if (storedFilters?.healthFilters?.length) return storedFilters.healthFilters;
    if (attentionPreset) return [HEALTH_LABELS.amber, HEALTH_LABELS.red];
    return [...HEALTH_FILTER_ITEMS];
  });
  const [statusFilters, setStatusFilters] = useState<string[]>(
    () => storedFilters?.statusFilters ?? [...STATUS_FILTER_ITEMS]
  );

  useEffect(() => {
    setProjects((prev) => reconcileMultiSelect(prev, allProjects));
    setDepartments((prev) => reconcileMultiSelect(prev, allDepts));
    setResourceOwners((prev) => reconcileMultiSelect(prev, ownerNames));
    setHealthFilters((prev) => reconcileMultiSelect(prev, HEALTH_FILTER_ITEMS));
    setStatusFilters((prev) => reconcileMultiSelect(prev, STATUS_FILTER_ITEMS));
  }, [allProjects, allDepts, ownerNames]);

  const { sortKey, sortDir, handleSort } = useColumnSort<ExecutionSortKey>(
    storedFilters?.sortKey ?? (attentionPreset ? "health" : "project"),
    storedFilters?.sortDir ?? (attentionPreset ? "desc" : "asc")
  );

  useEffect(() => {
    saveReportFilters("execution", {
      periodId,
      customMonthId,
      compareOn,
      search,
      projects,
      departments,
      resourceOwners,
      healthFilters,
      statusFilters,
      sortKey,
      sortDir,
    } satisfies ExecutionPersistedFilters);
  }, [
    periodId,
    customMonthId,
    compareOn,
    search,
    projects,
    departments,
    resourceOwners,
    healthFilters,
    statusFilters,
    sortKey,
    sortDir,
  ]);

  const healthStatuses = useMemo(
    () =>
      healthFilters
        .map((label) => HEALTH_OPTIONS.find((h) => HEALTH_LABELS[h] === label))
        .filter((h): h is ProjectHealth => h != null),
    [healthFilters]
  );

  const executionStatuses = useMemo(
    () =>
      statusFilters
        .map((label) => EXECUTION_STATUS_OPTIONS.find((s) => EXECUTION_STATUS_LABELS[s] === label))
        .filter((s): s is ExecutionStatus => s != null),
    [statusFilters]
  );

  const filters: ExecutionFilters = {
    search,
    projects,
    departments,
    resourceOwners,
    healthStatuses,
    executionStatuses,
  };

  const projectCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const p of allProjects) counts[p] = periodRows.filter((r) => r.projectName === p).length;
    return counts;
  }, [allProjects, periodRows]);

  const deptCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const d of allDepts) counts[d] = periodRows.filter((r) => r.department === d).length;
    return counts;
  }, [allDepts, periodRows]);

  const ownerCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const o of allOwners) {
      counts[o.name] = periodRows.filter((r) => r.resourceOwnerName === o.name).length;
    }
    return counts;
  }, [allOwners, periodRows]);

  const healthCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const label of HEALTH_FILTER_ITEMS) {
      const health = HEALTH_OPTIONS.find((h) => HEALTH_LABELS[h] === label);
      if (health) counts[label] = periodRows.filter((r) => r.health === health).length;
    }
    return counts;
  }, [periodRows]);

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const label of STATUS_FILTER_ITEMS) {
      const status = EXECUTION_STATUS_OPTIONS.find((s) => EXECUTION_STATUS_LABELS[s] === label);
      if (status) counts[label] = periodRows.filter((r) => r.executionStatus === status).length;
    }
    return counts;
  }, [periodRows]);

  const filtered = useMemo(
    () => filterExecutionRows(periodRows, filters),
    [periodRows, filters]
  );

  const sorted = useMemo(
    () => sortExecutionRows(filtered, sortKey, sortDir),
    [filtered, sortKey, sortDir]
  );

  const filteredPrior = useMemo(() => {
    if (!priorRows) return undefined;
    return filterExecutionRows(priorRows, filters);
  }, [priorRows, filters]);

  const summary = useMemo(
    () => computeExecutionSummary(filtered, filteredPrior),
    [filtered, filteredPrior]
  );

  const periodLabel = getExecutionPeriodLabel(periodId, customMonthId);

  const drawerHistory = useMemo(() => {
    if (!drawerRow) return null;
    const anchor = new Date(`${range.to}T12:00:00`);
    return buildExecutionHistoryFromLive(
      drawerRow.projectId,
      liveProjects,
      scopedAllocations,
      scopedConfirmations,
      6,
      anchor
    );
  }, [drawerRow, liveProjects, scopedAllocations, scopedConfirmations, range.to]);

  const drawerRoster = useMemo(
    () =>
      drawerRow
        ? buildExecutionRosterFromLive(
            drawerRow.projectId,
            drawerRow.projectName,
            visibleIds == null
              ? employees
              : employees.filter((e) => visibleIds.has(e.id)),
            scopedAllocations,
            scopedConfirmations,
            range.from,
            range.to,
            hoursPerDay
          )
        : [],
    [
      drawerRow,
      employees,
      visibleIds,
      scopedAllocations,
      scopedConfirmations,
      range.from,
      range.to,
      hoursPerDay,
    ]
  );

  const showExportToast = (msg: string) => {
    toast.info(msg);
  };

  const buildExportInput = (): ReportExportInput => {
    const filterLines = [
      `Period: ${periodLabel}`,
      summarizeFilter("Projects", projects, allProjects),
      summarizeFilter("Departments", departments, allDepts),
      summarizeFilter("Resource owners", resourceOwners, ownerNames, {
        allLabel: "All resource owners",
      }),
      summarizeFilter("Health", healthFilters, HEALTH_FILTER_ITEMS, { allLabel: "All health" }),
      summarizeFilter("Statuses", statusFilters, STATUS_FILTER_ITEMS, { allLabel: "All statuses" }),
      compareOn ? `Compare: ${getCompareLabel(periodId)}` : null,
      `Summary: ${summary.projectCount} projects · Avg planning ${summary.avgPlanningAccuracy != null ? `${summary.avgPlanningAccuracy}%` : "—"} · Avg confirmation ${summary.avgConfirmationDiscipline != null ? `${summary.avgConfirmationDiscipline}%` : "—"} · Util ${formatHoursLabel(summary.totalUtilizationHrs)} · Avg billable ${summary.avgBillablePct != null ? `${summary.avgBillablePct}%` : "—"}`,
    ].filter((x): x is string => !!x);

    return {
      title: "Project Execution Report",
      fileStem: "Project_Execution_Report",
      sheetName: "Project Execution",
      columns: [
        { header: "Project" },
        { header: "Type" },
        { header: "Status" },
        { header: "Department" },
        { header: "Resource Owner" },
        { header: "Planning Accuracy (%)", align: "right" },
        { header: "Confirmation Discipline (%)", align: "right" },
        { header: "Utilization (hrs)", align: "right" },
        { header: "Billable (%)", align: "right" },
        { header: "Non-Billable (%)", align: "right" },
        { header: "Resources", align: "right" },
        { header: "Health" },
      ],
      rows: sorted.map((r) => [
        r.projectName,
        projectTypeLabel(r.projectType),
        EXECUTION_STATUS_LABELS[r.executionStatus],
        r.department,
        r.resourceOwnerName,
        r.unstaffedException ? null : (r.planningAccuracy ?? null),
        r.unstaffedException ? null : (r.confirmationDiscipline ?? null),
        r.utilizationHrs,
        r.billablePct,
        r.nonBillablePct,
        r.resourceCount,
        HEALTH_LABELS[r.health],
      ]),
      filterLines,
      totalsRow: [
        `Total (${summary.projectCount} projects)`,
        "",
        "",
        "",
        "",
        summary.avgPlanningAccuracy,
        summary.avgConfirmationDiscipline,
        summary.totalUtilizationHrs,
        summary.avgBillablePct,
        "",
        "",
        "",
      ],
      orientation: "landscape",
      dateFormat: settings.dateFormat,
    };
  };

  const handleExport = (kind: "excel" | "pdf") => {
    showExportToast(runReportExport(kind, buildExportInput()).message);
  };

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-surface">
      <header className="flex h-14 flex-shrink-0 items-center justify-between border-b border-border bg-surface px-5">
        <div>
          <div className="text-[15px] font-semibold tracking-tight text-foreground">
            Project Execution Report
          </div>
          <div className="text-[12px] text-muted-foreground">
            Project-level execution · {periodLabel}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={periodId}
            onChange={(e) => setPeriodId(e.target.value as ExecutionPeriodId)}
            className="rounded-md border border-border bg-surface px-2.5 py-1.5 text-[12px] text-foreground outline-none focus:border-primary"
          >
            {EXECUTION_PERIODS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
          {periodId === "custom" && (
            <select
              value={customMonthId}
              onChange={(e) => setCustomMonthId(e.target.value as ExecutionCustomMonthId)}
              className="rounded-md border border-border bg-surface px-2.5 py-1.5 text-[12px] text-foreground outline-none focus:border-primary"
              aria-label="Select month"
            >
              {EXECUTION_CUSTOM_MONTHS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          )}
          <label className="flex cursor-pointer items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-[12px] text-foreground">
            <input
              type="checkbox"
              checked={compareOn}
              onChange={(e) => setCompareOn(e.target.checked)}
              className="rounded border-border"
            />
            {getCompareLabel(periodId)}
          </label>
          <button
            type="button"
            onClick={() => handleExport("excel")}
            className="flex cursor-pointer items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-[12px] text-foreground hover:bg-surface-alt"
          >
            <FileSpreadsheet className="h-3.5 w-3.5" /> Excel
          </button>
          <button
            type="button"
            onClick={() => handleExport("pdf")}
            className="flex cursor-pointer items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-[12px] text-foreground hover:bg-surface-alt"
          >
            <FileText className="h-3.5 w-3.5" /> PDF
          </button>
        </div>
      </header>

      <div className="flex flex-shrink-0 flex-wrap items-center gap-3 border-b border-border-soft bg-surface-alt px-5 py-2.5 text-[12px]">
        <SummaryKpi
          label="Avg Planning Accuracy"
          value={summary.avgPlanningAccuracy != null ? `${summary.avgPlanningAccuracy}%` : "—"}
          delta={
            compareOn && summary.prior ? (
              <MetricDelta
                current={summary.avgPlanningAccuracy}
                prior={summary.prior.avgPlanningAccuracy}
                suffix="%"
                show={compareOn}
              />
            ) : null
          }
        />
        <span className="text-muted-foreground">·</span>
        <SummaryKpi
          label="Avg Confirmation Discipline"
          value={summary.avgConfirmationDiscipline != null ? `${summary.avgConfirmationDiscipline}%` : "—"}
          delta={
            compareOn && summary.prior ? (
              <MetricDelta
                current={summary.avgConfirmationDiscipline}
                prior={summary.prior.avgConfirmationDiscipline}
                suffix="%"
                show={compareOn}
              />
            ) : null
          }
        />
        <span className="text-muted-foreground">·</span>
        <SummaryKpi
          label="Total Utilization"
          value={formatHoursLabel(summary.totalUtilizationHrs)}
          delta={
            compareOn && summary.prior ? (
              <MetricDelta
                current={summary.totalUtilizationHrs}
                prior={summary.prior.totalUtilizationHrs}
                suffix="h"
                show={compareOn}
              />
            ) : null
          }
        />
        <span className="text-muted-foreground">·</span>
        <SummaryKpi
          label="Avg Billable"
          value={summary.avgBillablePct != null ? `${summary.avgBillablePct}%` : "—"}
          delta={
            compareOn && summary.prior ? (
              <MetricDelta
                current={summary.avgBillablePct}
                prior={summary.prior.avgBillablePct}
                suffix="%"
                show={compareOn}
              />
            ) : null
          }
        />
      </div>

      <div className="flex flex-shrink-0 flex-wrap items-center gap-2 border-b border-border-soft bg-surface px-5 py-2.5">
        <div className="relative min-w-[180px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search project…"
            className="w-full rounded-md border border-border bg-surface py-1.5 pl-8 pr-2.5 text-[12px] text-foreground outline-none placeholder:text-muted-foreground focus:border-primary"
          />
        </div>
        <FilterMultiSelect
          items={allProjects}
          selected={projects}
          onChange={setProjects}
          counts={projectCounts}
          allLabel="All projects"
          pluralLabel="projects"
        />
        <FilterMultiSelect
          items={allDepts}
          selected={departments}
          onChange={setDepartments}
          counts={deptCounts}
          allLabel="All departments"
          pluralLabel="departments"
        />
        <FilterMultiSelect
          items={ownerNames}
          selected={resourceOwners}
          onChange={setResourceOwners}
          counts={ownerCounts}
          allLabel="All resource owners"
          pluralLabel="owners"
        />
        <FilterMultiSelect
          items={HEALTH_FILTER_ITEMS}
          selected={healthFilters}
          onChange={setHealthFilters}
          counts={healthCounts}
          allLabel="All health"
          pluralLabel="health"
        />
        <FilterMultiSelect
          items={STATUS_FILTER_ITEMS}
          selected={statusFilters}
          onChange={setStatusFilters}
          counts={statusCounts}
          allLabel="All statuses"
          pluralLabel="statuses"
        />
      </div>

      <div className="flex flex-shrink-0 items-center gap-4 border-b border-border-soft bg-surface-alt px-5 py-2 text-[12px]">
        <span>
          <b className="text-foreground">{summary.projectCount}</b>{" "}
          <span className="text-muted-foreground">projects</span>
        </span>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-5 pb-4 pt-3">
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border border-border">
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            <div
              className={`${REPORT_GRID} sticky top-0 z-10 border-b border-border-soft bg-surface-alt py-2 text-[11px] font-semibold text-muted`}
            >
              <SortColHeader
                label="PROJECT"
                col="project"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={handleSort}
              />
              <SortColHeader
                label="PLANNING ACCURACY"
                col="planningAccuracy"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={handleSort}
              />
              <SortColHeader
                label="CONFIRMATION DISCIPLINE"
                col="confirmationDiscipline"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={handleSort}
              />
              <SortColHeader
                label="UTIL (HRS)"
                col="utilizationHrs"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={handleSort}
                className="justify-end pr-4"
              />
              <SortColHeader
                label="BILLABLE SPLIT"
                col="billablePct"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={handleSort}
                className="pl-2"
              />
              <SortColHeader
                label="RESOURCES"
                col="resourceCount"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={handleSort}
                className="justify-end pr-4"
              />
              <SortColHeader
                label="HEALTH"
                col="health"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={handleSort}
                className="pl-2"
              />
            </div>
            {sorted.length === 0 ? (
              <div className="px-4 py-10 text-center text-[12px] text-muted-foreground">
                No rows match the current filters.
              </div>
            ) : (
              sorted.map((row) => (
                <ExecutionReportRow
                  key={row.id}
                  row={row}
                  compareOn={compareOn}
                  navigate={navigate}
                  onOpenDrawer={() => setDrawerRow(row)}
                />
              ))
            )}
          </div>
        </div>

        <p className="mt-2.5 text-[11px] text-muted-foreground">
          Metrics based on approved allocations and confirmations for the selected period. Health is
          derived from Project Portfolio.
        </p>
      </div>

      <ProjectExecutionDrawer
        open={!!drawerRow}
        onClose={() => setDrawerRow(null)}
        row={drawerRow}
        history={drawerHistory}
        roster={drawerRoster}
        periodLabel={periodLabel}
      />
    </div>
  );
}

function SummaryKpi({
  label,
  value,
  delta,
}: {
  label: string;
  value: string;
  delta?: React.ReactNode;
}) {
  return (
    <span className="inline-flex items-baseline gap-0.5">
      <span className="text-muted-foreground">{label}</span>{" "}
      <b className="text-foreground">{value}</b>
      {delta}
    </span>
  );
}

function ExecutionReportRow({
  row,
  compareOn,
  navigate,
  onOpenDrawer,
}: {
  row: ExecutionRow;
  compareOn: boolean;
  navigate: ReturnType<typeof useNavigate>;
  onOpenDrawer: () => void;
}) {
  const prior = row.prior;
  const metricsNa = row.unstaffedException;
  const onHold = row.executionStatus === "on_hold";
  const completed = row.executionStatus === "completed";

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpenDrawer}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpenDrawer();
        }
      }}
      className={`${REPORT_GRID} cursor-pointer border-b border-border-soft py-2.5 last:border-b-0 hover:bg-surface-alt ${
        completed ? "bg-surface-alt/60 opacity-75" : onHold ? "bg-warning-soft/20" : ""
      }`}
    >
      <div className="min-w-0">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            navigate(`/projects?highlight=${row.projectId}`);
          }}
          className="truncate text-left text-[13px] font-medium text-foreground hover:text-primary"
        >
          {row.projectName}
        </button>
        <div className="mt-0.5 flex min-w-0 items-center gap-1.5">
          <ProjectTypeBadge type={row.projectType} />
          <span className="text-[10px] text-muted-foreground">·</span>
          <span className="truncate text-[10px] text-muted-foreground">
            {EXECUTION_STATUS_LABELS[row.executionStatus]}
          </span>
        </div>
      </div>
      <div className="flex min-w-0 flex-wrap items-center">
        <MetricChip value={metricsNa ? undefined : row.planningAccuracy} />
        <MetricDelta
          current={metricsNa ? undefined : row.planningAccuracy}
          prior={prior?.planningAccuracy}
          suffix="%"
          show={compareOn}
        />
      </div>
      <div className="flex min-w-0 flex-wrap items-center">
        <MetricChip value={metricsNa ? undefined : row.confirmationDiscipline} />
        <MetricDelta
          current={metricsNa ? undefined : row.confirmationDiscipline}
          prior={prior?.confirmationDiscipline}
          suffix="%"
          show={compareOn}
        />
      </div>
      <div className="pr-4 text-right text-[12px] font-medium tabular-nums text-foreground">
        {formatHoursLabel(row.utilizationHrs)}
        <MetricDelta
          current={row.utilizationHrs}
          prior={prior?.utilizationHrs}
          suffix="h"
          show={compareOn}
        />
      </div>
      <div className="min-w-0 pl-2" onClick={(e) => e.stopPropagation()}>
        <BillableSplitBar
          billablePct={row.billablePct}
          nonBillablePct={row.nonBillablePct}
          leaveException={row.unstaffedException}
        />
      </div>
      <div className="pr-4 text-right text-[12px] font-medium tabular-nums text-foreground">
        {row.resourceCount}
        <MetricDelta
          current={row.resourceCount}
          prior={prior?.resourceCount}
          suffix=""
          show={compareOn}
        />
      </div>
      <div className="pl-2">
        <ProjectHealthBadge health={row.health} />
      </div>
    </div>
  );
}
