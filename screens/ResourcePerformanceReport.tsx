import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { FileSpreadsheet, FileText, Search } from "lucide-react";
import { SortColHeader, useColumnSort } from "../components/SortColHeader";
import { FilterMultiSelect } from "../components/FilterMultiSelect";
import { MetricChip } from "../components/MetricChip";
import { MetricDelta } from "../components/MetricDelta";
import { BillableSplitBar } from "../components/BillableSplitBar";
import { PerformanceHistoryDrawer } from "../components/PerformanceHistoryDrawer";
import {
  EMPLOYMENT_STATUS_OPTIONS,
  PERFORMANCE_CUSTOM_MONTHS,
  DEFAULT_PERFORMANCE_CUSTOM_MONTH,
  computePerformanceSummary,
  filterPerformanceRows,
  getCompareLabel,
  getPerformancePeriodLabel,
  performanceDepartments,
  performanceResourceOwners,
  performanceSkills,
  sortPerformanceRows,
} from "../data/performanceReport";
import type {
  PerformanceCustomMonthId,
  PerformanceFilters,
  PerformancePeriodId,
  PerformanceRow,
  PerformanceSortKey,
} from "../data/performanceReport";
import { performancePeriodOptions } from "../utils/reportPeriods";
import { useEmployees } from "../context/EmployeesContext";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { useSettings } from "../context/SettingsContext";
import {
  buildPerformanceHistoryFromLive,
  buildPerformanceRowsFromEmployees,
  reportRange,
  toLocalISO,
} from "../api/liveViews";
import { fetchAllocations, fetchConfirmations, type ApiAllocation, type ApiConfirmation } from "../api/domain";
import { useSharedDataSync } from "../hooks/useSharedDataSync";
import { runReportExport, summarizeFilter } from "../utils/reportExport";
import type { ReportExportInput } from "../utils/reportExport";
import { formatHoursLabel } from "../utils/formatHours";
import { scopeEmployeesForViewer } from "../utils/reportVisibility";
import {
  loadReportFilters,
  reconcileMultiSelect,
  saveReportFilters,
} from "../utils/reportFilterPersistence";

type PerformancePersistedFilters = {
  periodId: PerformancePeriodId;
  customMonthId: PerformanceCustomMonthId;
  compareOn: boolean;
  search: string;
  departments: string[];
  resourceOwners: string[];
  skills: string[];
  employmentStatuses: string[];
  sortKey: PerformanceSortKey;
  sortDir: "asc" | "desc";
};

const REPORT_GRID =
  "grid w-full grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(5.5rem,0.72fr)_minmax(0,1.15fr)_minmax(4.5rem,0.7fr)] items-center gap-x-4 px-4";

export function ResourcePerformanceReport() {
  const navigate = useNavigate();
  const { currentEmployee, isSuperAdmin } = useAuth();
  const { employees } = useEmployees();
  const scopedEmployees = useMemo(
    () => scopeEmployeesForViewer(employees, currentEmployee, isSuperAdmin),
    [employees, currentEmployee, isSuperAdmin]
  );
  const { settings } = useSettings();
  const weekCapacity = Math.round(settings.workingHoursPerDay * settings.workingDays.length) || 40;
  const [searchParams] = useSearchParams();
  const departmentPreset = searchParams.get("department");
  const storedFilters = useMemo(
    () => loadReportFilters<PerformancePersistedFilters>("performance"),
    []
  );
  const [periodId, setPeriodId] = useState<PerformancePeriodId>(
    () => storedFilters?.periodId ?? "month"
  );
  const [customMonthId, setCustomMonthId] = useState<PerformanceCustomMonthId>(
    () => storedFilters?.customMonthId ?? DEFAULT_PERFORMANCE_CUSTOM_MONTH
  );
  const [compareOn, setCompareOn] = useState(() => storedFilters?.compareOn ?? false);
  const [search, setSearch] = useState(() => storedFilters?.search ?? "");
  const toast = useToast();
  const [drawerRow, setDrawerRow] = useState<PerformanceRow | null>(null);
  const [allocations, setAllocations] = useState<ApiAllocation[]>([]);
  const [confirmations, setConfirmations] = useState<ApiConfirmation[]>([]);

  const PERFORMANCE_PERIODS = useMemo(
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

  const periodRows = useMemo(
    () =>
      buildPerformanceRowsFromEmployees(
        scopedEmployees,
        weekCapacity,
        allocations,
        confirmations,
        range.from,
        range.to
      ),
    [scopedEmployees, weekCapacity, allocations, confirmations, range.from, range.to]
  );
  const priorRows = undefined;

  const allDepts = useMemo(() => performanceDepartments(periodRows), [periodRows]);
  const allOwners = useMemo(() => performanceResourceOwners(periodRows), [periodRows]);
  const allSkills = useMemo(() => performanceSkills(periodRows), [periodRows]);
  const ownerNames = useMemo(() => allOwners.map((o) => o.name), [allOwners]);

  const [departments, setDepartments] = useState<string[]>(() => {
    if (storedFilters?.departments?.length) return storedFilters.departments;
    if (departmentPreset) return [departmentPreset];
    return [];
  });
  const [resourceOwners, setResourceOwners] = useState<string[]>(
    () => storedFilters?.resourceOwners ?? []
  );
  const [skills, setSkills] = useState<string[]>(() => storedFilters?.skills ?? []);
  const [employmentStatuses, setEmploymentStatuses] = useState<string[]>(
    () => storedFilters?.employmentStatuses ?? [...EMPLOYMENT_STATUS_OPTIONS]
  );

  useEffect(() => {
    setDepartments((prev) => reconcileMultiSelect(prev, allDepts));
    setResourceOwners((prev) => reconcileMultiSelect(prev, ownerNames));
    setSkills((prev) => reconcileMultiSelect(prev, allSkills));
    setEmploymentStatuses((prev) =>
      reconcileMultiSelect(prev, [...EMPLOYMENT_STATUS_OPTIONS])
    );
  }, [allDepts, ownerNames, allSkills]);

  const { sortKey, sortDir, handleSort } = useColumnSort<PerformanceSortKey>(
    storedFilters?.sortKey ?? "employee",
    storedFilters?.sortDir ?? "asc"
  );

  useEffect(() => {
    saveReportFilters("performance", {
      periodId,
      customMonthId,
      compareOn,
      search,
      departments,
      resourceOwners,
      skills,
      employmentStatuses,
      sortKey,
      sortDir,
    } satisfies PerformancePersistedFilters);
  }, [
    periodId,
    customMonthId,
    compareOn,
    search,
    departments,
    resourceOwners,
    skills,
    employmentStatuses,
    sortKey,
    sortDir,
  ]);

  const filters: PerformanceFilters = {
    search,
    departments,
    resourceOwners,
    skills,
    employmentStatuses: employmentStatuses as PerformanceFilters["employmentStatuses"],
  };

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

  const skillCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const s of allSkills) counts[s] = periodRows.filter((r) => r.primarySkill === s).length;
    return counts;
  }, [allSkills, periodRows]);

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const s of EMPLOYMENT_STATUS_OPTIONS) {
      counts[s] = periodRows.filter((r) => r.employmentStatus === s).length;
    }
    return counts;
  }, [periodRows]);

  const filtered = useMemo(
    () => filterPerformanceRows(periodRows, filters),
    [periodRows, filters]
  );

  const sorted = useMemo(
    () => sortPerformanceRows(filtered, sortKey, sortDir),
    [filtered, sortKey, sortDir]
  );

  const filteredPrior = useMemo(() => {
    if (!priorRows) return undefined;
    return filterPerformanceRows(priorRows, filters);
  }, [priorRows, filters]);

  const summary = useMemo(
    () => computePerformanceSummary(filtered, filteredPrior),
    [filtered, filteredPrior]
  );

  const periodLabel = getPerformancePeriodLabel(periodId, customMonthId);

  const drawerHistory = useMemo(() => {
    if (!drawerRow) return null;
    const anchor = new Date(`${range.to}T12:00:00`);
    return buildPerformanceHistoryFromLive(
      drawerRow.employeeId,
      scopedEmployees,
      weekCapacity,
      allocations,
      confirmations,
      6,
      anchor
    );
  }, [
    drawerRow,
    scopedEmployees,
    weekCapacity,
    allocations,
    confirmations,
    range.to,
  ]);

  const showExportToast = (msg: string) => {
    toast.info(msg);
  };

  const buildExportInput = (): ReportExportInput => {
    const filterLines = [
      `Period: ${periodLabel}`,
      summarizeFilter("Departments", departments, allDepts),
      summarizeFilter("Resource owners", resourceOwners, ownerNames, {
        allLabel: "All resource owners",
      }),
      summarizeFilter("Skills", skills, allSkills),
      summarizeFilter("Employment", employmentStatuses, EMPLOYMENT_STATUS_OPTIONS, {
        allLabel: "All employment statuses",
      }),
      compareOn ? `Compare: ${getCompareLabel(periodId)}` : null,
      `Summary: ${summary.employeeCount} employees · Avg planning ${summary.avgPlanningAccuracy != null ? `${summary.avgPlanningAccuracy}%` : "—"} · Avg confirmation ${summary.avgConfirmationDiscipline != null ? `${summary.avgConfirmationDiscipline}%` : "—"} · Util ${formatHoursLabel(summary.totalUtilizationHrs)} · Avg billable ${summary.avgBillablePct != null ? `${summary.avgBillablePct}%` : "—"} · Avail cap ${summary.totalAvailableCapacityHrs != null ? formatHoursLabel(summary.totalAvailableCapacityHrs) : "—"}`,
    ].filter((x): x is string => !!x);

    return {
      title: "Resource Performance Report",
      fileStem: "Resource_Performance_Report",
      sheetName: "Resource Performance",
      columns: [
        { header: "Employee" },
        { header: "Department" },
        { header: "Resource Owner" },
        { header: "Primary Skill" },
        { header: "Employment Status" },
        { header: "Planning Accuracy (%)", align: "right" },
        { header: "Confirmation Discipline (%)", align: "right" },
        { header: "Utilization (hrs)", align: "right" },
        { header: "Billable (%)", align: "right" },
        { header: "Non-Billable (%)", align: "right" },
        { header: "Available Capacity (hrs)", align: "right" },
      ],
      rows: sorted.map((r) => [
        r.employeeName,
        r.department,
        r.resourceOwnerName,
        r.primarySkill,
        r.employmentStatus,
        r.leaveException ? null : (r.planningAccuracy ?? null),
        r.leaveException ? null : (r.confirmationDiscipline ?? null),
        r.utilizationHrs,
        r.billablePct,
        r.nonBillablePct,
        r.leaveException ? null : (r.availableCapacityHrs ?? null),
      ]),
      filterLines,
      totalsRow: [
        `Total (${summary.employeeCount} employees)`,
        "",
        "",
        "",
        "",
        summary.avgPlanningAccuracy,
        summary.avgConfirmationDiscipline,
        summary.totalUtilizationHrs,
        summary.avgBillablePct,
        "",
        summary.totalAvailableCapacityHrs,
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
            Resource Performance Report
          </div>
          <div className="text-[12px] text-muted-foreground">
            Operational metrics · {periodLabel}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={periodId}
            onChange={(e) => setPeriodId(e.target.value as PerformancePeriodId)}
            className="rounded-md border border-border bg-surface px-2.5 py-1.5 text-[12px] text-foreground outline-none focus:border-primary"
          >
            {PERFORMANCE_PERIODS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
          {periodId === "custom" && (
            <select
              value={customMonthId}
              onChange={(e) => setCustomMonthId(e.target.value as PerformanceCustomMonthId)}
              className="rounded-md border border-border bg-surface px-2.5 py-1.5 text-[12px] text-foreground outline-none focus:border-primary"
              aria-label="Select month"
            >
              {PERFORMANCE_CUSTOM_MONTHS.map((m) => (
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
        <span className="text-muted-foreground">·</span>
        <SummaryKpi
          label="Total Available Capacity"
          value={
            summary.totalAvailableCapacityHrs != null
              ? formatHoursLabel(summary.totalAvailableCapacityHrs)
              : "—"
          }
          delta={
            compareOn && summary.prior ? (
              <MetricDelta
                current={summary.totalAvailableCapacityHrs}
                prior={summary.prior.totalAvailableCapacityHrs}
                suffix="h"
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
            placeholder="Search employee…"
            className="w-full rounded-md border border-border bg-surface py-1.5 pl-8 pr-2.5 text-[12px] text-foreground outline-none placeholder:text-muted-foreground focus:border-primary"
          />
        </div>
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
          items={allSkills}
          selected={skills}
          onChange={setSkills}
          counts={skillCounts}
          allLabel="All skills"
          pluralLabel="skills"
        />
        <FilterMultiSelect
          items={[...EMPLOYMENT_STATUS_OPTIONS]}
          selected={employmentStatuses}
          onChange={setEmploymentStatuses}
          counts={statusCounts}
          allLabel="All employment"
          pluralLabel="statuses"
        />
      </div>

      <div className="flex flex-shrink-0 items-center gap-4 border-b border-border-soft bg-surface-alt px-5 py-2 text-[12px]">
        <span>
          <b className="text-foreground">{summary.employeeCount}</b>{" "}
          <span className="text-muted-foreground">employees</span>
        </span>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-5 pb-4 pt-3">
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border border-border">
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            <div
              className={`${REPORT_GRID} sticky top-0 z-10 border-b border-border-soft bg-surface-alt py-2 text-[11px] font-semibold text-muted`}
            >
              <SortColHeader
                label="EMPLOYEE"
                col="employee"
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
                label="AVAIL CAP (HRS)"
                col="availableCapacityHrs"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={handleSort}
                className="justify-end"
              />
            </div>
            {sorted.length === 0 ? (
              <div className="px-4 py-10 text-center text-[12px] text-muted-foreground">
                No rows match the current filters.
              </div>
            ) : (
              sorted.map((row) => (
                <PerformanceReportRow
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
          Metrics based on approved allocations, confirmations, and activity records for the selected
          period.
        </p>
      </div>

      <PerformanceHistoryDrawer
        open={!!drawerRow}
        onClose={() => setDrawerRow(null)}
        row={drawerRow}
        history={drawerHistory}
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

function PerformanceReportRow({
  row,
  compareOn,
  navigate,
  onOpenDrawer,
}: {
  row: PerformanceRow;
  compareOn: boolean;
  navigate: ReturnType<typeof useNavigate>;
  onOpenDrawer: () => void;
}) {
  const inactive = row.employmentStatus === "inactive";
  const prior = row.prior;

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
        inactive ? "bg-surface-alt/60 opacity-70" : ""
      }`}
    >
      <div className="min-w-0">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            navigate(`/employees?highlight=${row.employeeId}`);
          }}
          className="truncate text-left text-[13px] font-medium text-foreground hover:text-primary"
        >
          {row.employeeName}
        </button>
        <div className="truncate text-[10px] text-muted-foreground">{row.department}</div>
      </div>
      <div className="flex min-w-0 flex-wrap items-center">
        <MetricChip value={row.leaveException ? undefined : row.planningAccuracy} />
        <MetricDelta
          current={row.leaveException ? undefined : row.planningAccuracy}
          prior={prior?.planningAccuracy}
          suffix="%"
          show={compareOn}
        />
      </div>
      <div className="flex min-w-0 flex-wrap items-center">
        <MetricChip value={row.leaveException ? undefined : row.confirmationDiscipline} />
        <MetricDelta
          current={row.leaveException ? undefined : row.confirmationDiscipline}
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
          leaveException={row.leaveException}
        />
      </div>
      <div className="text-right text-[12px] font-medium tabular-nums text-foreground">
        {row.leaveException || row.availableCapacityHrs == null ? (
          "—"
        ) : (
          <>
            {formatHoursLabel(row.availableCapacityHrs)}
            <MetricDelta
              current={row.availableCapacityHrs}
              prior={prior?.availableCapacityHrs}
              suffix="h"
              show={compareOn}
            />
          </>
        )}
      </div>
    </div>
  );
}
