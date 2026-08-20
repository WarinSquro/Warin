import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, ChevronRight, FileSpreadsheet, FileText, Search } from "lucide-react";
import { SortColHeader, useColumnSort } from "../components/SortColHeader";
import { FilterMultiSelect } from "../components/FilterMultiSelect";
import { ReportPagination } from "../components/ReportPagination";
import { ReportColumnPicker } from "../components/ReportColumnPicker";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { useSettings } from "../context/SettingsContext";
import { useAppDateFormat } from "../hooks/useAppDateFormat";
import { useSharedDataSync } from "../hooks/useSharedDataSync";
import { useEmployees } from "../context/EmployeesContext";
import {
  scopeEmployeesForViewer,
  withoutAdministratorEmployees,
} from "../utils/reportVisibility";
import { addDaysISO, toLocalISO } from "../api/liveViews";
import { buildWorkdaySummaryRows } from "../api/workdaySummary";
import {
  fetchAllocations,
  fetchConfirmations,
  fetchTeamConfirmationProductivity,
  type ApiAllocation,
  type ApiConfirmation,
  type ApiTeamProductivityDay,
} from "../api/domain";
import {
  CONFIRMATION_CODES,
  CONFIRMATION_CODE_LABELS,
  WORKDAY_SUMMARY_COLUMNS,
  filterWorkdaySummaryRows,
  formatDurationMs,
  formatHoursAsHhMm,
  formatPct,
  formatTimeHhMm,
  formatWorkdayDate,
  groupWorkdaySummaryRows,
  loadVisibleWorkdayColumnIds,
  paginateRows,
  saveVisibleWorkdayColumnIds,
  sortWorkdaySummaryRows,
  workdaySummaryDepartments,
  workdaySummaryOwners,
  workdaySummaryRangeEnding,
  workdaySummaryResources,
  type WorkdaySummaryGroupBy,
  type WorkdaySummaryRow,
  type WorkdaySummarySortKey,
} from "../data/workdaySummaryReport";
import { confirmationCodeLabel } from "../data/dailyWorkReport";
import { runReportExport, summarizeFilter } from "../utils/reportExport";
import type { ExportCell, ReportExportInput } from "../utils/reportExport";
import {
  clearStoredReportFilters,
  reconcileMultiSelect,
} from "../utils/reportFilterPersistence";

const GROUP_OPTIONS: { value: WorkdaySummaryGroupBy; label: string }[] = [
  { value: "none", label: "None" },
  { value: "department", label: "Department" },
  { value: "ro", label: "RO" },
];

function displayCell(
  row: WorkdaySummaryRow,
  col: WorkdaySummarySortKey,
  datePattern: Parameters<typeof formatWorkdayDate>[1]
): string {
  switch (col) {
    case "workDate":
      return formatWorkdayDate(row.workDate, datePattern);
    case "employeeName":
      return row.employeeName;
    case "dayStart":
      return formatTimeHhMm(row.dayStart) ?? "—";
    case "lunchStart":
      return formatTimeHhMm(row.lunchStart) ?? "—";
    case "lunchEnd":
      return formatTimeHhMm(row.lunchEnd) ?? "—";
    case "dayEnd":
      return formatTimeHhMm(row.dayEnd) ?? "—";
    case "officeTime":
      return formatDurationMs(row.officeMs) ?? "—";
    case "productiveWindow":
      return formatDurationMs(row.productiveMs) ?? "—";
    case "allottedHrs":
      return formatHoursAsHhMm(row.allottedHours) ?? "—";
    case "focusHrs":
      return formatHoursAsHhMm(row.focusHours) ?? "—";
    case "actualHrs":
      return formatHoursAsHhMm(row.actualHours) ?? "—";
    case "focusPct":
      return formatPct(row.focusPct) ?? "—";
    case "unplannedPct":
      return formatPct(row.unplannedPct) ?? "—";
    case "compliance":
      return row.compliance ?? "—";
    default:
      return "—";
  }
}

export function WorkdaySummaryReport() {
  const navigate = useNavigate();
  const { currentEmployee, isSuperAdmin } = useAuth();
  const { dateFormat } = useAppDateFormat();
  const { settings } = useSettings();
  const { employees } = useEmployees();
  const toast = useToast();
  const today = toLocalISO();
  const [rangeEnd, setRangeEnd] = useState(today);
  const range = useMemo(() => workdaySummaryRangeEnding(rangeEnd), [rangeEnd]);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [includeEmpty, setIncludeEmpty] = useState(false);
  const [groupBy, setGroupBy] = useState<WorkdaySummaryGroupBy>("none");
  const [visibleColumns, setVisibleColumns] = useState<Set<WorkdaySummarySortKey>>(
    () => loadVisibleWorkdayColumnIds()
  );
  const { sortKey, sortDir, handleSort } = useColumnSort<WorkdaySummarySortKey>("workDate", "desc");

  const [allocations, setAllocations] = useState<ApiAllocation[]>([]);
  const [confirmations, setConfirmations] = useState<ApiConfirmation[]>([]);
  const [productivity, setProductivity] = useState<ApiTeamProductivityDay[]>([]);

  const scopedEmployees = useMemo(
    () =>
      withoutAdministratorEmployees(
        scopeEmployeesForViewer(employees, currentEmployee, isSuperAdmin)
      ),
    [employees, currentEmployee, isSuperAdmin]
  );

  const load = useCallback(async () => {
    try {
      const [a, c, p] = await Promise.all([
        fetchAllocations({ from: range.from, to: range.to }),
        fetchConfirmations({ from: range.from, to: range.to }),
        fetchTeamConfirmationProductivity({ from: range.from, to: range.to }),
      ]);
      setAllocations(a);
      setConfirmations(c);
      setProductivity(p);
    } catch {
      setAllocations([]);
      setConfirmations([]);
      setProductivity([]);
    }
  }, [range.from, range.to]);

  useEffect(() => {
    void load();
  }, [load]);

  useSharedDataSync(true, load, { resources: ["allocations", "confirmations"] });

  const periodRows = useMemo(
    () =>
      buildWorkdaySummaryRows(
        scopedEmployees,
        allocations,
        confirmations,
        productivity,
        range.from,
        range.to,
        settings.workingDays,
        today
      ),
    [
      scopedEmployees,
      allocations,
      confirmations,
      productivity,
      range.from,
      range.to,
      settings.workingDays,
      today,
    ]
  );

  const allDepts = useMemo(() => workdaySummaryDepartments(periodRows), [periodRows]);
  const allOwners = useMemo(() => workdaySummaryOwners(periodRows), [periodRows]);
  const allResources = useMemo(() => workdaySummaryResources(periodRows), [periodRows]);
  const resourceNames = useMemo(() => allResources.map((r) => r.name), [allResources]);

  const deptCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const d of allDepts) counts[d] = periodRows.filter((r) => r.department === d).length;
    return counts;
  }, [allDepts, periodRows]);

  const ownerCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const o of allOwners) counts[o] = periodRows.filter((r) => r.resourceOwnerName === o).length;
    return counts;
  }, [allOwners, periodRows]);

  const resourceCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const name of resourceNames) {
      counts[name] = periodRows.filter((r) => r.employeeName === name).length;
    }
    return counts;
  }, [resourceNames, periodRows]);

  const [departments, setDepartments] = useState<string[]>([]);
  const [resourceOwners, setResourceOwners] = useState<string[]>([]);
  const [resources, setResources] = useState<string[]>([]);

  useEffect(() => {
    clearStoredReportFilters("workday_summary");
  }, []);

  const prevDepts = useRef<string[]>([]);
  const prevOwners = useRef<string[]>([]);
  const prevResources = useRef<string[]>([]);

  useEffect(() => {
    setDepartments((prev) => {
      const next = reconcileMultiSelect(prev, allDepts, prevDepts.current);
      prevDepts.current = [...allDepts];
      return next;
    });
    setResourceOwners((prev) => {
      const next = reconcileMultiSelect(prev, allOwners, prevOwners.current);
      prevOwners.current = [...allOwners];
      return next;
    });
    setResources((prev) => {
      const next = reconcileMultiSelect(prev, resourceNames, prevResources.current);
      prevResources.current = [...resourceNames];
      return next;
    });
  }, [allDepts, allOwners, resourceNames]);

  const resourceIds = useMemo(
    () => allResources.filter((r) => resources.includes(r.name)).map((r) => r.id),
    [allResources, resources]
  );

  const filtered = useMemo(
    () =>
      filterWorkdaySummaryRows(periodRows, {
        search,
        departments,
        resourceOwners,
        resources: resourceIds,
        includeEmpty,
      }),
    [periodRows, search, departments, resourceOwners, resourceIds, includeEmpty]
  );

  const sorted = useMemo(
    () => sortWorkdaySummaryRows(filtered, sortKey, sortDir),
    [filtered, sortKey, sortDir]
  );

  const groups = useMemo(
    () =>
      groupWorkdaySummaryRows(sorted, groupBy).map((g) => ({
        ...g,
        rows: sortWorkdaySummaryRows(g.rows, sortKey, sortDir),
      })),
    [sorted, groupBy, sortKey, sortDir]
  );

  const pagedGroups = useMemo(() => {
    if (groupBy === "none") {
      return [{ key: "all", label: "", rows: paginateRows(sorted, page, pageSize) }];
    }
    return groups;
  }, [groupBy, groups, sorted, page, pageSize]);

  useEffect(() => {
    setPage(1);
  }, [
    search,
    departments,
    resourceOwners,
    resources,
    includeEmpty,
    groupBy,
    range.from,
    range.to,
    sortKey,
    sortDir,
  ]);

  const visibleColDefs = useMemo(
    () => WORKDAY_SUMMARY_COLUMNS.filter((c) => visibleColumns.has(c.id)),
    [visibleColumns]
  );

  const canGoNext = range.to < today;
  const periodLabel = `${formatWorkdayDate(range.from, dateFormat)} – ${formatWorkdayDate(range.to, dateFormat)}`;

  const openDailyWork = (row: WorkdaySummaryRow) => {
    navigate(
      `/reports/daily-work?employee=${encodeURIComponent(row.employeeName)}&date=${encodeURIComponent(row.workDate)}`
    );
  };

  const buildExportInput = (): ReportExportInput => {
    const cols = visibleColDefs;
    return {
      title: "Workday Summary Report",
      fileStem: "Workday_Summary_Report",
      sheetName: "Workday Summary",
      columns: cols.map((c) => ({ header: c.label })),
      rows: sorted.map((row) =>
        cols.map((c): ExportCell => {
          const v = displayCell(row, c.id, dateFormat);
          return v === "—" ? null : v;
        })
      ),
      filterLines: [
        `Period: ${periodLabel}`,
        summarizeFilter("Departments", departments, allDepts),
        summarizeFilter("Resource owners", resourceOwners, allOwners, {
          allLabel: "All resource owners",
        }),
        summarizeFilter("Resources", resources, resourceNames, { allLabel: "All resources" }),
        groupBy !== "none" ? `Group by: ${GROUP_OPTIONS.find((o) => o.value === groupBy)?.label}` : null,
      ].filter((x): x is string => !!x),
      orientation: "landscape",
      dateFormat,
    };
  };

  if (!currentEmployee && !isSuperAdmin) {
    return (
      <div className="flex flex-1 items-center justify-center text-[13px] text-muted-foreground">
        Sign in to view workday summary.
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <header className="flex h-14 flex-shrink-0 items-center justify-between border-b border-border bg-surface px-5">
        <div>
          <div className="text-[15px] font-semibold tracking-tight text-foreground">Workday Summary</div>
          <div className="text-[12px] text-muted-foreground">
            Day-wise attendance, plan, actuals and focus · hierarchy scoped
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-md border border-border">
            <button
              type="button"
              onClick={() => setRangeEnd(addDaysISO(range.from, -1))}
              className="flex h-8 w-8 cursor-pointer items-center justify-center text-muted-foreground hover:bg-surface-alt"
              aria-label="Previous 14 days"
              title="Previous 14 days"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <div className="min-w-[12.5rem] px-2 text-center text-[12px] text-foreground">{periodLabel}</div>
            <button
              type="button"
              onClick={() => {
                if (!canGoNext) return;
                const nextEnd = addDaysISO(range.to, 14);
                setRangeEnd(nextEnd > today ? today : nextEnd);
              }}
              disabled={!canGoNext}
              className="flex h-8 w-8 cursor-pointer items-center justify-center text-muted-foreground hover:bg-surface-alt disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Next 14 days"
              title="Next 14 days"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <button
            type="button"
            onClick={() => toast.info(runReportExport("excel", buildExportInput()).message)}
            className="flex cursor-pointer items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-[12px] text-foreground hover:bg-surface-alt"
          >
            <FileSpreadsheet className="h-3.5 w-3.5" /> Excel
          </button>
        </div>
      </header>

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
          emptyNeutral
        />
        <FilterMultiSelect
          items={allOwners}
          selected={resourceOwners}
          onChange={setResourceOwners}
          counts={ownerCounts}
          allLabel="All resource owners"
          pluralLabel="owners"
          emptyNeutral
        />
        <FilterMultiSelect
          items={resourceNames}
          selected={resources}
          onChange={setResources}
          counts={resourceCounts}
          allLabel="All resources"
          pluralLabel="resources"
          emptyNeutral
        />
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] text-muted-foreground">Group by</span>
          <select
            value={groupBy}
            onChange={(e) => setGroupBy(e.target.value as WorkdaySummaryGroupBy)}
            className="cursor-pointer rounded-md border border-border bg-surface px-2.5 py-1.5 text-[12px] text-foreground outline-none focus:border-primary"
          >
            {GROUP_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <label className="flex cursor-pointer items-center gap-1.5 text-[12px] text-foreground">
          <input
            type="checkbox"
            checked={includeEmpty}
            onChange={(e) => setIncludeEmpty(e.target.checked)}
            className="cursor-pointer"
          />
          Include empty days
        </label>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background p-5 pt-3">
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border bg-surface">
          <div className="flex flex-shrink-0 items-center justify-between gap-2 border-b border-border-soft px-4 py-2">
            <span className="text-[12px] text-muted-foreground">
              {sorted.length} row{sorted.length !== 1 ? "s" : ""}
            </span>
            <ReportColumnPicker
              columns={WORKDAY_SUMMARY_COLUMNS}
              visible={visibleColumns}
              onChange={(next) => {
                const locked = WORKDAY_SUMMARY_COLUMNS.filter((c) => c.locked).map((c) => c.id);
                const merged = new Set([...next, ...locked]) as Set<WorkdaySummarySortKey>;
                setVisibleColumns(merged);
                saveVisibleWorkdayColumnIds(merged);
              }}
              onReset={() => {
                const defaults = new Set(
                  WORKDAY_SUMMARY_COLUMNS.filter((c) => c.defaultVisible).map((c) => c.id)
                );
                setVisibleColumns(defaults);
                saveVisibleWorkdayColumnIds(defaults);
              }}
            />
          </div>

          <div className="min-h-0 flex-1 overflow-auto">
            <table className="min-w-max border-collapse text-[12px]">
              <thead>
                <tr className="border-b border-border-soft bg-surface-alt text-[11px] font-semibold text-muted">
                  {visibleColDefs.map((col, i) => (
                    <th
                      key={col.id}
                      className={`whitespace-nowrap px-3 py-2 text-left ${
                        i === 0
                          ? "sticky left-0 z-20 bg-surface-alt"
                          : i === 1
                            ? "sticky z-20 bg-surface-alt"
                            : ""
                      }`}
                      style={i === 1 ? { left: visibleColDefs[0]?.width } : undefined}
                    >
                      <SortColHeader
                        label={col.label}
                        col={col.id}
                        sortKey={sortKey}
                        sortDir={sortDir}
                        onSort={handleSort}
                      />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.length === 0 ? (
                  <tr>
                    <td
                      colSpan={visibleColDefs.length}
                      className="px-4 py-10 text-center text-[12px] text-muted-foreground"
                    >
                      No rows match the current filters.
                    </td>
                  </tr>
                ) : (
                  pagedGroups.flatMap((group) => {
                    const head =
                      groupBy !== "none" && group.label
                        ? [
                            <tr key={`g-${group.key}`}>
                              <td
                                colSpan={visibleColDefs.length}
                                className="border-b border-border-soft bg-accent-soft/40 px-4 py-2 text-[12px] font-semibold text-foreground"
                              >
                                {group.label}
                                <span className="ml-2 font-normal text-muted-foreground">
                                  {group.rows.length} row{group.rows.length !== 1 ? "s" : ""}
                                </span>
                              </td>
                            </tr>,
                          ]
                        : [];
                    const body = group.rows.map((row) => (
                      <tr key={row.id} className="border-b border-border-soft hover:bg-surface-alt/60">
                        {visibleColDefs.map((col, i) => {
                          const value = displayCell(row, col.id, dateFormat);
                          const drill = col.id === "workDate" || col.id === "employeeName";
                          return (
                            <td
                              key={col.id}
                              className={`whitespace-nowrap px-3 py-2.5 ${
                                i === 0
                                  ? "sticky left-0 z-10 bg-surface"
                                  : i === 1
                                    ? "sticky z-10 bg-surface"
                                    : ""
                              } ${col.id === "employeeName" ? "font-medium text-foreground" : "text-foreground"}`}
                              style={i === 1 ? { left: visibleColDefs[0]?.width } : undefined}
                              title={
                                col.id === "compliance" && row.compliance
                                  ? confirmationCodeLabel(row.compliance)
                                  : value
                              }
                            >
                              {drill ? (
                                <button
                                  type="button"
                                  onClick={() => openDailyWork(row)}
                                  className="cursor-pointer text-left text-primary hover:underline"
                                >
                                  {value}
                                </button>
                              ) : col.id === "compliance" && row.compliance ? (
                                <span className="font-semibold">{value}</span>
                              ) : (
                                value
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ));
                    return [...head, ...body];
                  })
                )}
              </tbody>
            </table>
          </div>

          {groupBy === "none" ? (
            <ReportPagination
              page={page}
              pageSize={pageSize}
              totalRows={sorted.length}
              onPageChange={setPage}
              onPageSizeChange={setPageSize}
            />
          ) : null}
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
