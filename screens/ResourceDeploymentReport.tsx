import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { FileSpreadsheet, FileText, Search } from "lucide-react";
import { SortColHeader, useColumnSort } from "../components/SortColHeader";
import { FilterMultiSelect } from "../components/FilterMultiSelect";
import { MetricChip } from "../components/MetricChip";
import {
  DEPLOYMENT_STATUSES,
  REPORT_PERIODS,
  computeDeploymentTotals,
  deploymentDepartments,
  deploymentProjects,
  deploymentResourceOwners,
  deploymentSkills,
  filterDeploymentRows,
  groupDeploymentRows,
  sortDeploymentRows,
} from "../data/deploymentReport";
import type {
  DeploymentFilters,
  DeploymentGroupBy,
  DeploymentRow,
  DeploymentSortKey,
  DeploymentStatus,
  ReportPeriodId,
} from "../data/deploymentReport";
import { useEmployees } from "../context/EmployeesContext";
import { useAuth } from "../context/AuthContext";
import { useSettings } from "../context/SettingsContext";
import {
  buildDeploymentRowsFromEmployees,
  reportRange,
} from "../api/liveViews";
import { fetchAllocations, fetchConfirmations, type ApiAllocation, type ApiConfirmation } from "../api/domain";
import { runReportExport, summarizeFilter } from "../utils/reportExport";
import type { ReportExportInput } from "../utils/reportExport";
import { formatHoursLabel } from "../utils/formatHours";
import { scopeEmployeesForViewer } from "../utils/reportVisibility";

const GROUP_OPTIONS: { value: DeploymentGroupBy; label: string }[] = [
  { value: "none", label: "None" },
  { value: "department", label: "Department" },
  { value: "project", label: "Project" },
  { value: "resourceOwner", label: "Resource Owner" },
];

/** Shared column layout — fills table width proportionally. */
const REPORT_GRID =
  "grid w-full grid-cols-[minmax(0,1.35fr)_minmax(0,1.25fr)_minmax(4.5rem,0.7fr)_minmax(0,0.95fr)_minmax(0,1.25fr)_minmax(0,1.55fr)] items-center gap-x-4 px-4";

export function ResourceDeploymentReport() {
  const navigate = useNavigate();
  const { currentEmployee, isSuperAdmin } = useAuth();
  const { employees } = useEmployees();
  const { settings } = useSettings();
  const scopedEmployees = useMemo(
    () => scopeEmployeesForViewer(employees, currentEmployee, isSuperAdmin),
    [employees, currentEmployee, isSuperAdmin]
  );
  const [searchParams] = useSearchParams();
  const statusPreset = searchParams.get("status");
  const [periodId, setPeriodId] = useState<ReportPeriodId>("today");
  const [search, setSearch] = useState("");
  const [groupBy, setGroupBy] = useState<DeploymentGroupBy>("none");
  const [exportToast, setExportToast] = useState<string | null>(null);
  const [allocations, setAllocations] = useState<ApiAllocation[]>([]);
  const [confirmations, setConfirmations] = useState<ApiConfirmation[]>([]);

  const range = useMemo(() => {
    if (periodId === "today") return reportRange("today");
    if (periodId === "week") return reportRange("week");
    return reportRange("month");
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
        setConfirmations(c);
      })
      .catch(() => {
        if (!cancelled) {
          setAllocations([]);
          setConfirmations([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [range.from, range.to]);

  const periodRows = useMemo(
    () =>
      buildDeploymentRowsFromEmployees(
        scopedEmployees,
        employees,
        allocations,
        confirmations,
        range.from,
        range.to,
        {
          workingDays: settings.workingDays,
          companyOffDays: settings.companyOffDays.map((d) => d.date),
        }
      ),
    [
      scopedEmployees,
      employees,
      allocations,
      confirmations,
      range.from,
      range.to,
      settings.workingDays,
      settings.companyOffDays,
    ]
  );

  const allDepts = useMemo(() => deploymentDepartments(periodRows), [periodRows]);
  const allProjects = useMemo(() => deploymentProjects(periodRows), [periodRows]);
  const allOwners = useMemo(() => deploymentResourceOwners(periodRows), [periodRows]);
  const allSkills = useMemo(() => deploymentSkills(periodRows), [periodRows]);

  const ownerNames = useMemo(() => allOwners.map((o) => o.name), [allOwners]);

  const [departments, setDepartments] = useState<string[]>(() => [...allDepts]);
  const [projects, setProjects] = useState<string[]>(() => [...allProjects]);
  const [resourceOwners, setResourceOwners] = useState<string[]>(() => [...ownerNames]);
  const [skills, setSkills] = useState<string[]>(() => [...allSkills]);
  const [statuses, setStatuses] = useState<string[]>(() =>
    statusPreset && DEPLOYMENT_STATUSES.includes(statusPreset as DeploymentStatus)
      ? [statusPreset]
      : [...DEPLOYMENT_STATUSES]
  );

  useEffect(() => {
    setDepartments([...allDepts]);
    setProjects([...allProjects]);
    setResourceOwners([...ownerNames]);
    setSkills([...allSkills]);
    setStatuses(
      statusPreset && DEPLOYMENT_STATUSES.includes(statusPreset as DeploymentStatus)
        ? [statusPreset]
        : [...DEPLOYMENT_STATUSES]
    );
  }, [periodId, allDepts, allProjects, ownerNames, allSkills, statusPreset]);

  const { sortKey, sortDir, handleSort } = useColumnSort<DeploymentSortKey>("employee", "asc");

  const filters: DeploymentFilters = {
    search,
    departments,
    projects,
    resourceOwners,
    skills,
    statuses: statuses as DeploymentFilters["statuses"],
  };

  const deptCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const d of allDepts) counts[d] = periodRows.filter((r) => r.department === d).length;
    return counts;
  }, [allDepts, periodRows]);

  const projectCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const p of allProjects) counts[p] = periodRows.filter((r) => r.projectName === p).length;
    return counts;
  }, [allProjects, periodRows]);

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
    for (const s of DEPLOYMENT_STATUSES) {
      counts[s] = periodRows.filter((r) => r.status === s).length;
    }
    return counts;
  }, [periodRows]);

  const filtered = useMemo(
    () => filterDeploymentRows(periodRows, filters),
    [periodRows, filters]
  );

  const sorted = useMemo(
    () => sortDeploymentRows(filtered, sortKey, sortDir),
    [filtered, sortKey, sortDir]
  );

  const groups = useMemo(
    () =>
      groupDeploymentRows(sorted, groupBy).map((g) => ({
        ...g,
        rows: sortDeploymentRows(g.rows, sortKey, sortDir),
      })),
    [sorted, groupBy, sortKey, sortDir]
  );

  const totals = useMemo(() => computeDeploymentTotals(sorted), [sorted]);

  const ownerItems = ownerNames;

  const showExportToast = (msg: string) => {
    setExportToast(msg);
    window.setTimeout(() => setExportToast(null), 2500);
  };

  const periodLabel = REPORT_PERIODS.find((p) => p.id === periodId)?.label ?? periodId;

  const buildExportInput = (): ReportExportInput => {
    const filterLines = [
      `Period: ${periodLabel}`,
      summarizeFilter("Departments", departments, allDepts),
      summarizeFilter("Projects", projects, allProjects),
      summarizeFilter("Resource owners", resourceOwners, ownerNames, {
        allLabel: "All resource owners",
      }),
      summarizeFilter("Skills", skills, allSkills),
      summarizeFilter("Statuses", statuses, DEPLOYMENT_STATUSES),
      groupBy !== "none"
        ? `Group by: ${GROUP_OPTIONS.find((o) => o.value === groupBy)?.label ?? groupBy}`
        : null,
    ].filter((x): x is string => !!x);

    const columns = [
      { header: "Employee" },
      { header: "Department" },
      { header: "Project" },
      { header: "Allocation (hrs)", align: "right" as const },
      { header: "Available From" },
      { header: "Planning Accuracy (%)", align: "right" as const },
      { header: "Confirmation Discipline (%)", align: "right" as const },
      { header: "Status" },
      { header: "Resource Owner" },
      { header: "Primary Skill" },
    ];

    const rows = sorted.map((r) => [
      r.employeeName,
      r.department,
      r.projectName,
      r.allocationHours,
      r.availableFrom,
      r.planningAccuracy ?? null,
      r.confirmationDiscipline ?? null,
      r.status,
      r.resourceOwnerName,
      r.primarySkill,
    ]);

    const totalsRow = [
      `Total (${totals.employeeCount} employees · ${totals.rowCount} rows)`,
      "",
      "",
      totals.totalHours,
      "",
      "",
      "",
      "",
      "",
      "",
    ];

    return {
      title: "Resource Deployment Report",
      fileStem: "Resource_Deployment_Report",
      sheetName: "Resource Deployment",
      columns,
      rows,
      filterLines,
      totalsRow,
      orientation: "landscape",
    };
  };

  const handleExport = (kind: "excel" | "pdf") => {
    const result = runReportExport(kind, buildExportInput());
    showExportToast(result.message);
  };

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-surface">
      <header className="flex h-14 flex-shrink-0 items-center justify-between border-b border-border bg-surface px-5">
        <div>
          <div className="text-[15px] font-semibold tracking-tight text-foreground">
            Resource Deployment Report
          </div>
          <div className="text-[12px] text-muted-foreground">
            Approved allocations · {REPORT_PERIODS.find((p) => p.id === periodId)?.label}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={periodId}
            onChange={(e) => setPeriodId(e.target.value as ReportPeriodId)}
            className="rounded-md border border-border bg-surface px-2.5 py-1.5 text-[12px] text-foreground outline-none focus:border-primary"
          >
            {REPORT_PERIODS.map((p) => (
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

      {exportToast && (
        <div className="flex-shrink-0 border-b border-accent-line bg-accent-soft px-5 py-2 text-[12px] text-accent-softfg">
          {exportToast}
        </div>
      )}

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
          items={allProjects}
          selected={projects}
          onChange={setProjects}
          counts={projectCounts}
          allLabel="All projects"
          pluralLabel="projects"
        />
        <FilterMultiSelect
          items={ownerItems}
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
          items={[...DEPLOYMENT_STATUSES]}
          selected={statuses}
          onChange={setStatuses}
          counts={statusCounts}
          allLabel="All statuses"
          pluralLabel="statuses"
        />
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] text-muted-foreground">Group by</span>
          <select
            value={groupBy}
            onChange={(e) => setGroupBy(e.target.value as DeploymentGroupBy)}
            className="rounded-md border border-border bg-surface px-2.5 py-1.5 text-[12px] text-foreground outline-none focus:border-primary"
          >
            {GROUP_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-shrink-0 items-center gap-4 border-b border-border-soft bg-surface-alt px-5 py-2 text-[12px]">
        <span>
          <b className="text-foreground">{totals.employeeCount}</b>{" "}
          <span className="text-muted-foreground">employees</span>
        </span>
        <span className="text-muted-foreground">·</span>
        <span>
          <b className="text-foreground">{totals.rowCount}</b>{" "}
          <span className="text-muted-foreground">rows</span>
        </span>
        <span className="text-muted-foreground">·</span>
        <span>
          <b className="text-foreground">{formatHoursLabel(totals.totalHours)}</b>{" "}
          <span className="text-muted-foreground">total allocated</span>
        </span>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-5 pb-4 pt-3">
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border border-border">
          <div className={`${REPORT_GRID} flex-shrink-0 border-b border-border-soft bg-surface-alt py-2 text-[11px] font-semibold text-muted`}>
            <SortColHeader
              label="EMPLOYEE"
              col="employee"
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={handleSort}
            />
            <SortColHeader
              label="PROJECT"
              col="project"
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={handleSort}
            />
            <SortColHeader
              label="ALLOCATION"
              col="allocation"
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={handleSort}
              className="justify-end"
            />
            <SortColHeader
              label="AVAILABLE FROM"
              col="availableFrom"
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
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            {sorted.length === 0 ? (
              <div className="px-4 py-10 text-center text-[12px] text-muted-foreground">
                No rows match the current filters.
              </div>
            ) : (
              groups.map((group) => (
                <div key={group.key}>
                  {groupBy !== "none" && (
                    <div className="flex items-center justify-between border-b border-border-soft bg-accent-soft/40 px-4 py-2">
                      <span className="text-[12px] font-semibold text-foreground">{group.label}</span>
                      <span className="text-[11px] text-muted-foreground">
                        {group.totals.employeeCount} employees · {formatHoursLabel(group.totals.totalHours)} allocated
                      </span>
                    </div>
                  )}
                  {group.rows.map((row) => (
                    <ReportRow key={row.id} row={row} navigate={navigate} />
                  ))}
                </div>
              ))
            )}
          </div>
        </div>

        <p className="mt-2.5 text-[11px] text-muted-foreground">
          Draft allocations excluded · shows approved allocations only
        </p>
      </div>
    </div>
  );
}

function ReportRow({
  row,
  navigate,
}: {
  row: DeploymentRow;
  navigate: ReturnType<typeof useNavigate>;
}) {
  const recessed = row.isException || row.projectName === "Unallocated";

  return (
    <div
      className={`${REPORT_GRID} border-b border-border-soft py-2.5 last:border-b-0 ${
        recessed ? "bg-surface-alt/60 opacity-70" : "hover:bg-surface-alt"
      }`}
    >
      <div className="min-w-0">
        <button
          type="button"
          onClick={() => navigate(`/employees?highlight=${row.employeeId}`)}
          className="truncate text-left text-[13px] font-medium text-foreground hover:text-primary"
        >
          {row.employeeName}
        </button>
        <div className="truncate text-[10px] text-muted-foreground">{row.department}</div>
      </div>
      <div className="min-w-0">
        {row.projectId ? (
          <button
            type="button"
            onClick={() => navigate(`/projects?highlight=${row.projectId}`)}
            className="truncate text-left text-[12px] text-foreground hover:text-primary"
          >
            {row.projectName}
          </button>
        ) : (
          <span className="text-[12px] italic text-muted-foreground">{row.projectName}</span>
        )}
      </div>
      <div className="text-right text-[12px] font-medium tabular-nums text-foreground">
        {formatHoursLabel(row.allocationHours)}
      </div>
      <div className="min-w-0 truncate text-[12px] text-foreground">{row.availableFrom}</div>
      <div className="min-w-0">
        <MetricChip value={row.planningAccuracy} />
      </div>
      <div className="min-w-0">
        <MetricChip value={row.confirmationDiscipline} />
      </div>
    </div>
  );
}
