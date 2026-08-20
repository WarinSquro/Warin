import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FileSpreadsheet, Search } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { SortColHeader, useColumnSort } from "../components/SortColHeader";
import { FilterMultiSelect } from "../components/FilterMultiSelect";
import { ReportPagination } from "../components/ReportPagination";
import { ReportColumnPicker } from "../components/ReportColumnPicker";
import { WorkDateDaySelect } from "../components/WorkDateDaySelect";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { useSettings } from "../context/SettingsContext";
import { useAppDateFormat } from "../hooks/useAppDateFormat";
import { useSharedDataSync } from "../hooks/useSharedDataSync";
import { getVisibleEmployeeIds } from "../utils/employeeHierarchy";
import { scopeReportHierarchyEmployees } from "../utils/reportVisibility";
import { dailyWorkPeriodOptions } from "../utils/reportPeriods";
import { milestoneKindLabel } from "../data/projects";
import {
  CONFIRMATION_CODES,
  DAILY_WORK_COLUMNS,
  dailyWorkDepartments,
  dailyWorkProjects,
  defaultVisibleColumnIds,
  filterDailyWorkRows,
  formatProjectTypeDisplay,
  formatWorkDate,
  loadVisibleColumnIds,
  paginateRows,
  saveVisibleColumnIds,
  sortDailyWorkRows,
} from "../data/dailyWorkReport";
import type {
  ConfirmationCode,
  DailyWorkFilters,
  DailyWorkPeriodId,
  DailyWorkRow,
  DailyWorkSortKey,
  PlanKind,
} from "../data/dailyWorkReport";
import { buildDailyWorkRows, reportRange } from "../api/liveViews";
import { useEmployees } from "../context/EmployeesContext";
import { useProjects } from "../context/ProjectsContext";
import {
  fetchAllocations,
  fetchConfirmations,
  type ApiAllocation,
  type ApiConfirmation,
} from "../api/domain";
import { runReportExport, summarizeFilter } from "../utils/reportExport";
import type { ExportCell, ReportExportInput } from "../utils/reportExport";
import {
  reconcileMultiSelect,
} from "../utils/reportFilterPersistence";
import {
  multiSelectSignature,
  readReportPage,
  writeReportPage,
} from "../utils/reportPage";
import { workDateDayFilterLabel, workDayFromIso } from "../utils/workDateDayFilter";
import { useReportFilterSession } from "../hooks/useReportFilterSession";
import { formatHours } from "../utils/formatHours";

const DAILY_WORK_PAGE_KEY = "daily_work";

function cellValue(
  row: DailyWorkRow,
  colId: DailyWorkSortKey,
  datePattern: "dd/MM/yyyy" | "MM/dd/yyyy" | "yyyy-MM-dd" | "dd-MMM-yyyy" = "dd/MM/yyyy"
): string {
  if (row.planKind === "Unplanned") {
    switch (colId) {
      case "employeeName":
        return row.employeeName;
      case "department":
        return row.department;
      case "resourceOwner":
        return row.resourceOwnerName;
      case "workDate":
        return formatWorkDate(row.workDate, datePattern);
      case "tasks":
        return (row.tasks ?? []).join(", ");
      case "allocatedOn":
        return row.allocatedOn ? formatWorkDate(row.allocatedOn, datePattern) : "—";
      case "actualHrs":
        return row.actualHours != null ? String(row.actualHours) : "—";
      case "planUnplanned":
        return row.planKind;
      default:
        return "—";
    }
  }

  switch (colId) {
    case "employeeName":
      return row.employeeName;
    case "department":
      return row.department;
    case "resourceOwner":
      return row.resourceOwnerName;
    case "workDate":
      return formatWorkDate(row.workDate, datePattern);
    case "project":
      return row.projectName ?? "—";
    case "projectType":
      return formatProjectTypeDisplay(row.projectType);
    case "milestone":
      return row.milestoneName ?? "—";
    case "milestoneType":
      return row.milestoneType ? milestoneKindLabel(row.milestoneType) : "—";
    case "activity":
      return row.activityName ?? "—";
    case "activityType":
      return row.activityType ?? "—";
    case "tasks":
      return (row.tasks ?? []).join(", ");
    case "allocatedOn":
      return row.allocatedOn ? formatWorkDate(row.allocatedOn, datePattern) : "—";
    case "plannedHrs":
      return row.plannedHours != null ? formatHours(row.plannedHours) : "—";
    case "confirmation":
      return row.confirmation;
    case "confirmedOn":
      return row.confirmedOn ? formatWorkDate(row.confirmedOn, datePattern) : "—";
    case "delayReason":
      return row.delayReason ?? "—";
    case "deviationReason":
      return row.deviationReason ?? "—";
    case "actualHrs":
      return row.actualHours != null ? formatHours(row.actualHours) : "—";
    case "planUnplanned":
      return row.planKind;
    default:
      return "—";
  }
}

/** Export cell — keep hours as numbers; dates as display strings matching the grid. */
function exportCellValue(
  row: DailyWorkRow,
  colId: DailyWorkSortKey,
  datePattern: "dd/MM/yyyy" | "MM/dd/yyyy" | "yyyy-MM-dd" | "dd-MMM-yyyy" = "dd/MM/yyyy"
): ExportCell {
  if (colId === "plannedHrs") {
    if (row.planKind === "Unplanned") return null;
    return row.plannedHours ?? null;
  }
  if (colId === "actualHrs") return row.actualHours ?? null;
  const text = cellValue(row, colId, datePattern);
  return text === "—" ? null : text;
}

export function DailyWorkReport() {
  const [searchParams] = useSearchParams();
  const drillEmployee = searchParams.get("employee")?.trim() || "";
  const drillDate = searchParams.get("date")?.slice(0, 10) || "";
  const { sessionKey, filtersReady, markFiltersReady } = useReportFilterSession("daily_work");
  const { currentEmployee, isSuperAdmin } = useAuth();
  const { dateFormat } = useAppDateFormat();
  const { settings } = useSettings();
  const { employees } = useEmployees();
  const { projects: liveProjects } = useProjects();
  const [periodId, setPeriodId] = useState<DailyWorkPeriodId>("week");
  const [search, setSearch] = useState(() => drillEmployee || "");
  const [page, setPageState] = useState(() => readReportPage(DAILY_WORK_PAGE_KEY));
  const setPage = useCallback((next: number) => {
    setPageState(next);
    writeReportPage(DAILY_WORK_PAGE_KEY, next);
  }, []);
  const [pageSize, setPageSize] = useState(25);
  const toast = useToast();
  const [visibleColumns, setVisibleColumns] = useState<Set<DailyWorkSortKey>>(() =>
    loadVisibleColumnIds()
  );
  const [allocations, setAllocations] = useState<ApiAllocation[]>([]);
  const [apiConfirmations, setApiConfirmations] = useState<ApiConfirmation[]>([]);

  const DAILY_WORK_PERIODS = useMemo(
    () => dailyWorkPeriodOptions(new Date(), settings.workingDays),
    [settings.workingDays]
  );

  const range = useMemo(() => {
    const weekOpts = { workingDays: settings.workingDays };
    let base =
      periodId === "today"
        ? reportRange("today")
        : periodId === "week"
          ? reportRange("week", weekOpts)
          : periodId === "month"
            ? reportRange("month")
            : periodId === "last_month"
              ? reportRange("last_month")
              : reportRange("last_3_months");
    if (drillDate) {
      if (drillDate < base.from) base = { ...base, from: drillDate };
      if (drillDate > base.to) base = { ...base, to: drillDate };
    }
    return base;
  }, [periodId, settings.workingDays, drillDate]);

  const load = useCallback(async () => {
    try {
      const [a, c] = await Promise.all([
        fetchAllocations({ from: range.from, to: range.to }),
        fetchConfirmations({ from: range.from, to: range.to }),
      ]);
      setAllocations(a);
      setApiConfirmations(c);
    } catch {
      setAllocations([]);
      setApiConfirmations([]);
    } finally {
      markFiltersReady();
    }
  }, [range.from, range.to, markFiltersReady]);

  useEffect(() => {
    void load();
  }, [load]);

  useSharedDataSync(true, load, { resources: ["allocations", "confirmations", "projects", "employees"] });

  const hierarchyEmployees = useMemo(
    () => scopeReportHierarchyEmployees(employees, currentEmployee, isSuperAdmin),
    [employees, currentEmployee, isSuperAdmin]
  );

  const periodRows = useMemo(
    () =>
      buildDailyWorkRows(
        hierarchyEmployees,
        liveProjects,
        allocations,
        apiConfirmations,
        range.from,
        range.to,
        settings.workingDays,
        settings.companyOffDays.map((d) => d.date),
        employees
      ),
    [
      hierarchyEmployees,
      employees,
      liveProjects,
      allocations,
      apiConfirmations,
      range.from,
      range.to,
      settings.workingDays,
      settings.companyOffDays,
    ]
  );

  const visibleEmployeeIds = useMemo(() => {
    if (isSuperAdmin) {
      return new Set(hierarchyEmployees.map((e) => e.id));
    }
    if (!currentEmployee) return new Set<string>();
    return getVisibleEmployeeIds(currentEmployee.id, employees);
  }, [currentEmployee, isSuperAdmin, hierarchyEmployees, employees]);

  const scopedRows = useMemo(() => {
    let rows = periodRows.filter((r) => visibleEmployeeIds.has(r.employeeId));
    if (drillDate) rows = rows.filter((r) => r.workDate === drillDate);
    return rows;
  }, [periodRows, visibleEmployeeIds, drillDate]);

  const allDepts = useMemo(() => dailyWorkDepartments(scopedRows), [scopedRows]);
  const allProjects = useMemo(() => {
    const known = liveProjects
      .filter((p) => p.status === "active")
      .map((p) => p.name);
    return dailyWorkProjects(scopedRows, known);
  }, [scopedRows, liveProjects]);

  const [departments, setDepartments] = useState<string[]>([]);
  const [projects, setProjects] = useState<string[]>([]);
  const [confirmations, setConfirmations] = useState<ConfirmationCode[]>([]);
  const [planKinds, setPlanKinds] = useState<PlanKind[]>([]);
  const [workDay, setWorkDay] = useState<number | null>(() => workDayFromIso(drillDate));

  useEffect(() => {
    setSearch(drillEmployee || "");
    setDepartments([]);
    setProjects([]);
    setConfirmations([]);
    setPlanKinds([]);
    setWorkDay(workDayFromIso(drillDate));
    prevDeptsRef.current = [];
    prevProjectsRef.current = [];
    prevConfirmRef.current = [];
    prevPlanRef.current = [];
  }, [sessionKey, drillEmployee, drillDate]);

  const prevDeptsRef = useRef<string[]>([]);
  const prevProjectsRef = useRef<string[]>([]);
  const prevConfirmRef = useRef<string[]>([]);
  const prevPlanRef = useRef<string[]>([]);

  useEffect(() => {
    if (!filtersReady) return;
    setDepartments((prev) => {
      const next = reconcileMultiSelect(prev, allDepts, prevDeptsRef.current);
      prevDeptsRef.current = [...allDepts];
      return next;
    });
    setProjects((prev) => {
      const next = reconcileMultiSelect(prev, allProjects, prevProjectsRef.current);
      prevProjectsRef.current = [...allProjects];
      return next;
    });
    setConfirmations((prev) => {
      const all = [...CONFIRMATION_CODES];
      const next = reconcileMultiSelect(prev, all, prevConfirmRef.current) as ConfirmationCode[];
      prevConfirmRef.current = all;
      return next;
    });
    setPlanKinds((prev) => {
      const all = ["Plan", "Unplanned"];
      const next = reconcileMultiSelect(prev, all, prevPlanRef.current) as PlanKind[];
      prevPlanRef.current = all;
      return next;
    });
  }, [filtersReady, allDepts, allProjects]);

  const { sortKey, sortDir, handleSort } = useColumnSort<DailyWorkSortKey>("workDate", "desc");

  const filters: DailyWorkFilters = {
    search,
    departments,
    projects,
    confirmations,
    planKinds,
    workDay,
  };

  const deptCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const d of allDepts) counts[d] = scopedRows.filter((r) => r.department === d).length;
    return counts;
  }, [allDepts, scopedRows]);

  const projectCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const p of allProjects) counts[p] = scopedRows.filter((r) => r.projectName === p).length;
    return counts;
  }, [allProjects, scopedRows]);

  const confirmationCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const c of CONFIRMATION_CODES) {
      counts[c] = scopedRows.filter((r) => r.confirmation === c).length;
    }
    return counts;
  }, [scopedRows]);

  const planKindCounts = useMemo(() => {
    const counts: Record<string, number> = { Plan: 0, Unplanned: 0 };
    for (const r of scopedRows) counts[r.planKind]++;
    return counts;
  }, [scopedRows]);

  const filtered = useMemo(
    () => filterDailyWorkRows(scopedRows, filters, visibleEmployeeIds),
    [scopedRows, filters, visibleEmployeeIds]
  );

  const sorted = useMemo(
    () => sortDailyWorkRows(filtered, sortKey, sortDir),
    [filtered, sortKey, sortDir]
  );

  const paged = useMemo(() => paginateRows(sorted, page, pageSize), [sorted, page, pageSize]);

  const filterPageKey = useMemo(
    () =>
      [
        search,
        multiSelectSignature(departments),
        multiSelectSignature(projects),
        multiSelectSignature(confirmations),
        multiSelectSignature(planKinds),
        workDay == null ? "" : String(workDay),
        pageSize,
        range.from,
        range.to,
        drillDate ?? "",
        drillEmployee ?? "",
      ].join("|"),
    [
      search,
      departments,
      projects,
      confirmations,
      planKinds,
      workDay,
      pageSize,
      range.from,
      range.to,
      drillDate,
      drillEmployee,
    ]
  );

  const prevFilterPageKey = useRef<string | null>(null);
  useEffect(() => {
    prevFilterPageKey.current = null;
  }, [sessionKey]);
  useEffect(() => {
    if (!filtersReady) return;
    if (prevFilterPageKey.current === null) {
      prevFilterPageKey.current = filterPageKey;
      return;
    }
    if (prevFilterPageKey.current === filterPageKey) return;
    prevFilterPageKey.current = filterPageKey;
    setPage(1);
  }, [filtersReady, filterPageKey, setPage]);

  const visibleColDefs = useMemo(
    () => DAILY_WORK_COLUMNS.filter((c) => visibleColumns.has(c.id)),
    [visibleColumns]
  );

  const gridTemplate = useMemo(
    () => visibleColDefs.map((c) => c.width).join(" "),
    [visibleColDefs]
  );

  const handleColumnChange = (next: Set<string>) => {
    const typed = new Set([...next] as DailyWorkSortKey[]);
    setVisibleColumns(typed);
    saveVisibleColumnIds(typed);
  };

  const handleColumnReset = () => {
    const defaults = defaultVisibleColumnIds();
    setVisibleColumns(defaults);
    saveVisibleColumnIds(defaults);
  };

  const showExportToast = (msg: string) => {
    toast.info(msg);
  };

  const periodLabel = DAILY_WORK_PERIODS.find((p) => p.id === periodId)?.label ?? periodId;

  const buildExportInput = (): ReportExportInput => {
    const cols = visibleColDefs;
    const filterLines = [
      `Period: ${periodLabel}`,
      summarizeFilter("Departments", departments, allDepts),
      summarizeFilter("Projects", projects, allProjects),
      summarizeFilter("Confirmations", confirmations, CONFIRMATION_CODES, {
        allLabel: "All statuses",
      }),
      summarizeFilter("Plan types", planKinds, ["Plan", "Unplanned"], {
        allLabel: "Plan + Unplanned",
      }),
      `Work Date: ${workDateDayFilterLabel(workDay)}`,
      `Rows: ${sorted.length}`,
    ];

    return {
      title: "Daily Work Detail Report",
      fileStem: "Daily_Work_Detail_Report",
      sheetName: "Daily Work Detail",
      columns: cols.map((c) => ({
        header: c.label,
        align: c.id === "plannedHrs" || c.id === "actualHrs" ? ("right" as const) : ("left" as const),
      })),
      rows: sorted.map((row) => cols.map((c) => exportCellValue(row, c.id, dateFormat))),
      filterLines,
      orientation: cols.length > 8 ? "landscape" : "portrait",
      dateFormat,
    };
  };

  const handleExport = (kind: "excel" | "pdf") => {
    showExportToast(runReportExport(kind, buildExportInput()).message);
  };

  if (!currentEmployee && !isSuperAdmin) {
    return (
      <div className="flex flex-1 items-center justify-center text-[13px] text-muted-foreground">
        Sign in to view daily work detail.
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <header className="flex h-14 flex-shrink-0 items-center justify-between border-b border-border bg-surface px-5">
        <div>
          <div className="text-[15px] font-semibold tracking-tight text-foreground">
            Daily Work Detail
          </div>
          <div className="text-[12px] text-muted-foreground">
            Line-level planned and confirmed work · hierarchy scoped
          </div>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={periodId}
            onChange={(e) => setPeriodId(e.target.value as DailyWorkPeriodId)}
            className="min-w-[12.5rem] rounded-md border border-border bg-surface px-2.5 py-1.5 text-[12px] text-foreground outline-none focus:border-primary"
          >
            {DAILY_WORK_PERIODS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
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

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background p-5">
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border bg-surface">
          <div className="flex flex-shrink-0 flex-wrap items-center gap-2 border-b border-border-soft px-4 py-2.5">
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
              items={allProjects}
              selected={projects}
              onChange={setProjects}
              counts={projectCounts}
              allLabel="All projects"
              pluralLabel="projects"
            />
            <FilterMultiSelect
              items={[...CONFIRMATION_CODES]}
              selected={confirmations}
              onChange={(v) => setConfirmations(v as ConfirmationCode[])}
              counts={confirmationCounts}
              allLabel="All statuses"
              pluralLabel="statuses"
            />
            <FilterMultiSelect
              items={["Plan", "Unplanned"]}
              selected={planKinds}
              onChange={(v) => setPlanKinds(v as PlanKind[])}
              counts={planKindCounts}
              allLabel="Plan + Unplanned"
              pluralLabel="types"
            />
            <WorkDateDaySelect value={workDay} onChange={setWorkDay} />
          </div>

          <div className="flex flex-shrink-0 items-center justify-between gap-2 border-b border-border-soft px-4 py-2">
            <span className="text-[12px] text-muted-foreground">
              {sorted.length} row{sorted.length !== 1 ? "s" : ""}
            </span>
            <ReportColumnPicker
              columns={DAILY_WORK_COLUMNS}
              visible={visibleColumns}
              onChange={handleColumnChange}
              onReset={handleColumnReset}
            />
          </div>

          <div className="min-h-0 flex-1 overflow-x-auto overflow-y-auto overscroll-contain">
            <div className="w-max min-w-max">
              <div
                className="sticky top-0 z-10 grid w-max items-center gap-x-4 border-b border-border-soft bg-surface-alt px-4 py-2 text-[11px] font-semibold text-muted"
                style={{ gridTemplateColumns: gridTemplate }}
              >
                {visibleColDefs.map((col) => (
                  <div key={col.id} className="min-w-0 w-full overflow-hidden">
                    <SortColHeader
                      label={
                        col.stackedHeader ? (
                          <span className="flex min-w-0 flex-col leading-tight">
                            <span>{col.stackedHeader[0]}</span>
                            <span>{col.stackedHeader[1]}</span>
                          </span>
                        ) : (
                          col.label
                        )
                      }
                      col={col.id}
                      sortKey={sortKey}
                      sortDir={sortDir}
                      onSort={handleSort}
                      className="max-w-full"
                    />
                  </div>
                ))}
              </div>

              {paged.length === 0 ? (
                <div className="px-4 py-10 text-center text-[12px] text-muted-foreground">
                  No rows match the current filters.
                </div>
              ) : (
                paged.map((row) => (
                  <div
                    key={row.id}
                    className="grid w-max items-start gap-x-4 border-b border-border-soft px-4 py-2.5 text-[12px] last:border-b-0 hover:bg-surface-alt/60"
                    style={{ gridTemplateColumns: gridTemplate }}
                  >
                    {visibleColDefs.map((col) => {
                      const value = cellValue(row, col.id, dateFormat);
                      const isNumeric = col.id === "plannedHrs" || col.id === "actualHrs";
                      return (
                        <div
                          key={col.id}
                          className={`min-w-0 w-full overflow-hidden whitespace-normal break-words [overflow-wrap:anywhere] ${
                            isNumeric ? "tabular-nums" : ""
                          } ${col.id === "employeeName" ? "font-medium text-foreground" : "text-foreground"}`}
                        >
                          {value}
                        </div>
                      );
                    })}
                  </div>
                ))
              )}
            </div>
          </div>

          <ReportPagination
            page={page}
            pageSize={pageSize}
            totalRows={sorted.length}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
          />
        </div>
      </div>
    </div>
  );
}
