import { useEffect, useMemo, useState } from "react";
import { FileSpreadsheet, FileText, Search } from "lucide-react";
import { SortColHeader, useColumnSort } from "../components/SortColHeader";
import { FilterMultiSelect } from "../components/FilterMultiSelect";
import { ReportPagination } from "../components/ReportPagination";
import { ReportColumnPicker } from "../components/ReportColumnPicker";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { getVisibleEmployeeIds } from "../utils/employeeHierarchy";
import { scopeEmployeesForViewer } from "../utils/reportVisibility";
import { milestoneKindLabel } from "../data/projects";
import {
  CONFIRMATION_CODES,
  CONFIRMATION_CODE_LABELS,
  DAILY_WORK_COLUMNS,
  DAILY_WORK_PERIODS,
  confirmationCodeLabel,
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
import { formatHours } from "../utils/formatHours";

function cellValue(row: DailyWorkRow, colId: DailyWorkSortKey): string {
  if (row.planKind === "Unplanned") {
    switch (colId) {
      case "employeeName":
        return row.employeeName;
      case "department":
        return row.department;
      case "resourceOwner":
        return row.resourceOwnerName;
      case "workDate":
        return formatWorkDate(row.workDate);
      case "tasks":
        return (row.tasks ?? []).join(", ");
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
      return formatWorkDate(row.workDate);
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
    case "plannedHrs":
      return row.plannedHours != null ? formatHours(row.plannedHours) : "—";
    case "confirmation":
      return row.confirmation;
    case "confirmedOn":
      return row.confirmedOn ? formatWorkDate(row.confirmedOn) : "—";
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
function exportCellValue(row: DailyWorkRow, colId: DailyWorkSortKey): ExportCell {
  if (colId === "plannedHrs") {
    if (row.planKind === "Unplanned") return null;
    return row.plannedHours ?? null;
  }
  if (colId === "actualHrs") return row.actualHours ?? null;
  const text = cellValue(row, colId);
  return text === "—" ? null : text;
}

export function DailyWorkReport() {
  const { currentEmployee, isSuperAdmin } = useAuth();
  const { employees } = useEmployees();
  const { projects: liveProjects } = useProjects();
  const [periodId, setPeriodId] = useState<DailyWorkPeriodId>("week");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const toast = useToast();
  const [visibleColumns, setVisibleColumns] = useState<Set<DailyWorkSortKey>>(() =>
    loadVisibleColumnIds()
  );
  const [allocations, setAllocations] = useState<ApiAllocation[]>([]);
  const [apiConfirmations, setApiConfirmations] = useState<ApiConfirmation[]>([]);

  const range = useMemo(() => {
    if (periodId === "today") return reportRange("today");
    if (periodId === "week") return reportRange("week");
    if (periodId === "month") return reportRange("month");
    if (periodId === "last_month") return reportRange("last_month");
    return reportRange("last_3_months");
  }, [periodId]);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      fetchAllocations({ from: range.from, to: range.to }),
      fetchConfirmations({ from: range.from, to: range.to }),
    ])
      .then(([a, c]) => {
        if (cancelled) return;
        setAllocations(a);
        setApiConfirmations(c);
      })
      .catch(() => {
        if (!cancelled) {
          setAllocations([]);
          setApiConfirmations([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [range.from, range.to]);

  const periodRows = useMemo(
    () =>
      buildDailyWorkRows(
        scopeEmployeesForViewer(employees, currentEmployee, isSuperAdmin),
        liveProjects,
        allocations,
        apiConfirmations,
        range.from,
        range.to
      ),
    [
      employees,
      currentEmployee,
      isSuperAdmin,
      liveProjects,
      allocations,
      apiConfirmations,
      range.from,
      range.to,
    ]
  );

  const visibleEmployeeIds = useMemo(() => {
    if (isSuperAdmin) {
      return new Set(periodRows.map((r) => r.employeeId));
    }
    if (!currentEmployee) return new Set<string>();
    return getVisibleEmployeeIds(currentEmployee.id, employees);
  }, [currentEmployee, isSuperAdmin, periodRows, employees]);

  const scopedRows = useMemo(
    () => periodRows.filter((r) => visibleEmployeeIds.has(r.employeeId)),
    [periodRows, visibleEmployeeIds]
  );

  const allDepts = useMemo(() => dailyWorkDepartments(scopedRows), [scopedRows]);
  const allProjects = useMemo(() => dailyWorkProjects(scopedRows), [scopedRows]);

  const [departments, setDepartments] = useState<string[]>(() => [...allDepts]);
  const [projects, setProjects] = useState<string[]>(() => [...allProjects]);
  const [confirmations, setConfirmations] = useState<ConfirmationCode[]>(() => [
    ...CONFIRMATION_CODES,
  ]);
  const [planKinds, setPlanKinds] = useState<PlanKind[]>(() => ["Plan", "Unplanned"]);

  useEffect(() => {
    setDepartments([...allDepts]);
    setProjects([...allProjects]);
    setConfirmations([...CONFIRMATION_CODES]);
    setPlanKinds(["Plan", "Unplanned"]);
    setPage(1);
  }, [periodId, allDepts, allProjects]);

  const { sortKey, sortDir, handleSort } = useColumnSort<DailyWorkSortKey>("workDate", "desc");

  const filters: DailyWorkFilters = {
    search,
    departments,
    projects,
    confirmations,
    planKinds,
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

  useEffect(() => {
    setPage(1);
  }, [search, departments, projects, confirmations, planKinds, pageSize]);

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
      rows: sorted.map((row) => cols.map((c) => exportCellValue(row, c.id))),
      filterLines,
      orientation: cols.length > 8 ? "landscape" : "portrait",
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
            <div className="flex min-w-[200px] flex-1 items-center gap-2 rounded-md border border-border px-2.5 py-1.5">
              <Search className="h-3.5 w-3.5 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search employee, project, tasks…"
                className="w-full bg-transparent text-[12px] text-foreground outline-none placeholder:text-muted-foreground"
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
            <div className="min-w-max">
              <div
                className="sticky top-0 z-10 grid items-center gap-x-3 border-b border-border-soft bg-surface-alt px-4 py-2 text-[11px] font-semibold text-muted"
                style={{ gridTemplateColumns: gridTemplate }}
              >
                {visibleColDefs.map((col) => (
                  <SortColHeader
                    key={col.id}
                    label={col.label}
                    col={col.id}
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSort={handleSort}
                  />
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
                    className="grid items-center gap-x-3 border-b border-border-soft px-4 py-2.5 text-[12px] last:border-b-0 hover:bg-surface-alt/60"
                    style={{ gridTemplateColumns: gridTemplate }}
                  >
                    {visibleColDefs.map((col) => {
                      const value = cellValue(row, col.id);
                      const isConfirmation = col.id === "confirmation";
                      const isNumeric = col.id === "plannedHrs" || col.id === "actualHrs";
                      return (
                        <div
                          key={col.id}
                          className={`min-w-0 truncate ${
                            isNumeric ? "tabular-nums" : ""
                          } ${col.id === "employeeName" ? "font-medium text-foreground" : "text-foreground"}`}
                          title={
                            isConfirmation
                              ? confirmationCodeLabel(row.confirmation)
                              : col.id === "tasks"
                                ? value
                                : undefined
                          }
                        >
                          {isConfirmation ? (
                            <span className="font-semibold">{value}</span>
                          ) : (
                            value
                          )}
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

        <div className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <FileText className="h-3.5 w-3.5" />
          Confirmation codes:{" "}
          {CONFIRMATION_CODES.map((c) => `${c} = ${CONFIRMATION_CODE_LABELS[c]}`).join(" · ")}
        </div>
      </div>
    </div>
  );
}
