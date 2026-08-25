import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Plus, Search, Trash2, X } from "lucide-react";
import {
  createKpiFrameworkItem,
  createKpiMaster,
  deleteKpiFrameworkItem,
  fetchKpiFramework,
  fetchKpiMasters,
  updateKpiFrameworkItem,
  updateKpiMaster,
  type ApiKpiItem,
  type ApiKpiMaster,
  type AssessmentCycle,
  type KpiMasterKind,
  type KpiTargetDirection,
} from "../api/domain";
import { ConfirmDeleteDialog } from "../components/ConfirmDeleteDialog";
import { FilterMultiSelect } from "../components/FilterMultiSelect";
import { FilterSelect } from "../components/FilterSelect";
import { FilterSingleSelect } from "../components/FilterSingleSelect";
import { SortColHeader, useColumnSort } from "../components/SortColHeader";
import { TruncateText } from "../components/TruncateText";
import { useSharedDataSync, usePauseSharedDataSync, MASTER_TXN_SYNC_INTERVAL_MS } from "../hooks/useSharedDataSync";
import { useFocusFirstField } from "../hooks/useFocusFirstField";
import { useAuth } from "../context/AuthContext";
import { useEmployees } from "../context/EmployeesContext";
import { useMasters } from "../context/MastersContext";
import { useToast } from "../context/ToastContext";
import { getImmediateReports, type Employee } from "../data/employees";
import {
  clampKpiMasterName,
  KPI_MASTER_NAME_MAX,
  KPI_NAME_MAX,
  KPI_TARGET_MAX,
  KPI_TARGET_MAX_DIGITS,
  KPI_WEIGHT_MAX,
  KPI_WEIGHT_MAX_DIGITS,
} from "../utils/kpiMasterLimits";
import {
  defaultAssessmentCycle,
  defaultKpiCalendarYear,
  isKpiCycleExpired,
  isKpiDirectReport,
  KPI_CALENDAR_YEARS,
  type KpiCalendarYear,
  selectableKpiCycleOptions,
  scopeKpiResourceEmployees,
} from "../utils/kpiFilters";
import { matchesSearchQuery } from "../utils/textSearch";
import { reconcileMultiSelect } from "../utils/reportFilterPersistence";

type PageSeg = "list" | "masters";
type MasterTab = "categories" | "methods" | "units";
type FrameworkSortKey =
  | "resource"
  | "department"
  | "category"
  | "kpi"
  | "method"
  | "unit"
  | "target"
  | "direction"
  | "period"
  | "weight"
  | "status";
type MasterSortKey = "name" | "status";
type DrawerMode = "create" | "edit" | "view";

const FRAMEWORK_STATUS_ORDER: Record<string, number> = {
  draft: 0,
  pending_result: 1,
  completed: 2,
};

/** Pixel min-widths — table scrolls horizontally when card is narrower. */
const KPI_LIST_COLUMNS: {
  col: FrameworkSortKey;
  label: string;
  width: number;
  compact?: boolean;
}[] = [
  { col: "resource", label: "Resource", width: 108 },
  { col: "department", label: "Department", width: 96 },
  { col: "category", label: "Category", width: 120 },
  { col: "kpi", label: "KPI", width: 180 },
  { col: "method", label: "Method", width: 120 },
  { col: "unit", label: "Unit", width: 56, compact: true },
  { col: "target", label: "Target", width: 64, compact: true },
  { col: "direction", label: "Direction", width: 88, compact: true },
  { col: "period", label: "Period", width: 104 },
  { col: "weight", label: "Weight %", width: 72, compact: true },
  { col: "status", label: "Status", width: 112 },
];

const KPI_LIST_TABLE_MIN_WIDTH = KPI_LIST_COLUMNS.reduce((sum, c) => sum + c.width, 0);

function kpiListCellPad(compact?: boolean) {
  return compact ? "px-2" : "px-3";
}

const CYCLE_MONTHS: Record<AssessmentCycle, number[]> = {
  Q1: [1, 2, 3],
  Q2: [4, 5, 6],
  Q3: [7, 8, 9],
  Q4: [10, 11, 12],
};
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const CYCLE_LABEL: Record<AssessmentCycle, string> = {
  Q1: "Quarter 1",
  Q2: "Quarter 2",
  Q3: "Quarter 3",
  Q4: "Quarter 4",
};

/** All start–end month pairs within a cycle (start ≤ end). */
function periodRangeOptions(months: number[]) {
  const opts: { value: string; label: string; start: number; end: number }[] = [];
  for (let i = 0; i < months.length; i++) {
    for (let j = i; j < months.length; j++) {
      const start = months[i]!;
      const end = months[j]!;
      opts.push({
        start,
        end,
        value: `${start}-${end}`,
        label: `${MONTH_NAMES[start - 1]} - ${MONTH_NAMES[end - 1]}`,
      });
    }
  }
  return opts;
}

const fieldClass =
  "w-full rounded-md border border-border bg-surface px-3 py-2 text-[13px] text-foreground outline-none placeholder:text-muted-foreground focus:border-accent-line disabled:cursor-not-allowed disabled:bg-surface-alt disabled:text-muted";

const NEW_KPI_PLACEHOLDER = `New KPI (${KPI_NAME_MAX} Chars)`;

type FormState = {
  employeeHrmsId: string;
  calendarYear: KpiCalendarYear;
  assessmentCycle: AssessmentCycle;
  categoryId: string;
  kpiName: string;
  measurementMethodId: string;
  unitId: string;
  target: string;
  targetDirection: KpiTargetDirection;
  periodValue: string;
  weightage: string;
};

function emptyForm(
  year: KpiCalendarYear,
  cycle: AssessmentCycle,
  defaults?: Partial<FormState>
): FormState {
  const months = CYCLE_MONTHS[cycle];
  const periodOpts = periodRangeOptions(months);
  return {
    employeeHrmsId: "",
    calendarYear: year,
    assessmentCycle: cycle,
    categoryId: "",
    kpiName: "",
    measurementMethodId: "",
    unitId: "",
    target: "0",
    targetDirection: "higher_is_better",
    periodValue: periodOpts[0]?.value ?? "",
    weightage: "0",
    ...defaults,
  };
}

function formFromItem(item: ApiKpiItem): FormState {
  return {
    employeeHrmsId: item.employeeHrmsId ?? "",
    calendarYear: item.calendarYear as KpiCalendarYear,
    assessmentCycle: item.assessmentCycle,
    categoryId: item.categoryId,
    kpiName: item.kpiName,
    measurementMethodId: item.measurementMethodId,
    unitId: item.unitId,
    target: String(item.target),
    targetDirection: item.targetDirection,
    periodValue: `${item.periodStartMonth}-${item.periodEndMonth}`,
    weightage: String(item.weightage),
  };
}

function directionLabel(d: KpiTargetDirection) {
  return d === "higher_is_better" ? "High" : "Low";
}

function isKpiDrawerFormValid(
  form: FormState,
  mode: DrawerMode,
  copyFromId: string,
  copyKpiId: string,
  loadingCopy: boolean
): boolean {
  if (!form.categoryId || !form.measurementMethodId || !form.unitId) return false;
  if (!form.kpiName.trim()) return false;
  const [startStr, endStr] = form.periodValue.split("-");
  if (!Number.isFinite(Number(startStr)) || !Number.isFinite(Number(endStr))) return false;
  if (mode === "create") {
    if (!form.employeeHrmsId) return false;
    if (copyFromId && (!copyKpiId || loadingCopy)) return false;
  }
  return true;
}

export function KpiFramework() {
  const toast = useToast();
  const { currentEmployee, isSuperAdmin } = useAuth();
  const { employees } = useEmployees();
  const { departments } = useMasters();
  const [seg, setSeg] = useState<PageSeg>("list");
  const [masterTab, setMasterTab] = useState<MasterTab>("categories");
  const [year, setYear] = useState(() => defaultKpiCalendarYear());
  const [cycle, setCycle] = useState<AssessmentCycle>(() => defaultAssessmentCycle());
  const [search, setSearch] = useState("");
  const [selectedDepts, setSelectedDepts] = useState<string[]>([]);
  const [selectedResources, setSelectedResources] = useState<string[]>([]);
  const [items, setItems] = useState<ApiKpiItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [drawer, setDrawer] = useState<{
    mode: DrawerMode;
    item?: ApiKpiItem;
    seed?: {
      employeeHrmsId: string;
      calendarYear: KpiCalendarYear;
      assessmentCycle: AssessmentCycle;
    };
  } | null>(null);

  const { sortKey, sortDir, handleSort } = useColumnSort<FrameworkSortKey>("resource");
  const {
    sortKey: masterSortKey,
    sortDir: masterSortDir,
    handleSort: handleMasterSort,
  } = useColumnSort<MasterSortKey>("name");

  const [categories, setCategories] = useState<ApiKpiMaster[]>([]);
  const [methods, setMethods] = useState<ApiKpiMaster[]>([]);
  const [units, setUnits] = useState<ApiKpiMaster[]>([]);
  const [newMasterName, setNewMasterName] = useState("");

  const activeDepts = useMemo(
    () => departments.filter((d) => d.status === "active"),
    [departments]
  );
  const scopedResources = useMemo(
    () => scopeKpiResourceEmployees(employees, currentEmployee, isSuperAdmin),
    [employees, currentEmployee, isSuperAdmin]
  );
  const directResources = useMemo(() => {
    if (isSuperAdmin) return scopedResources;
    if (!currentEmployee?.id) return [];
    return getImmediateReports(currentEmployee.id, employees, { activeOnly: true }).filter((e) =>
      scopedResources.some((s) => s.id === e.id)
    );
  }, [isSuperAdmin, scopedResources, currentEmployee?.id, employees]);

  const canOpenAdd = directResources.length > 0;

  const yearOptions = useMemo(
    () => KPI_CALENDAR_YEARS.map((y) => ({ value: String(y), label: String(y) })),
    []
  );
  const cycleOptions = useMemo(() => selectableKpiCycleOptions(year), [year]);

  useEffect(() => {
    if (!isKpiCycleExpired(year, cycle)) return;
    const next = selectableKpiCycleOptions(year)[0]?.value;
    if (next && next !== cycle) setCycle(next);
  }, [year, cycle]);

  const allDeptNames = useMemo(() => activeDepts.map((d) => d.name).sort(), [activeDepts]);
  const resourceNames = useMemo(
    () => [...scopedResources].sort((a, b) => a.name.localeCompare(b.name)).map((e) => e.name),
    [scopedResources]
  );

  const prevDepts = useRef<string[]>([]);
  const prevResources = useRef<string[]>([]);

  useEffect(() => {
    setSelectedDepts((prev) => {
      const next = reconcileMultiSelect(prev, allDeptNames, prevDepts.current);
      prevDepts.current = [...allDeptNames];
      return next;
    });
    setSelectedResources((prev) => {
      const next = reconcileMultiSelect(prev, resourceNames, prevResources.current);
      prevResources.current = [...resourceNames];
      return next;
    });
  }, [allDeptNames, resourceNames]);

  const deptCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const name of allDeptNames) {
      counts[name] = items.filter((i) => {
        const emp = scopedResources.find((e) => e.id === i.employeeHrmsId);
        return (emp?.department ?? "") === name;
      }).length;
    }
    return counts;
  }, [allDeptNames, items, scopedResources]);

  const resourceCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const name of resourceNames) {
      const emp = scopedResources.find((e) => e.name === name);
      counts[name] = emp ? items.filter((i) => i.employeeHrmsId === emp.id).length : 0;
    }
    return counts;
  }, [resourceNames, scopedResources, items]);

  const filteredItems = useMemo(() => {
    const deptSet =
      selectedDepts.length === 0 || selectedDepts.length === allDeptNames.length
        ? null
        : new Set(selectedDepts);
    const resourceIds =
      selectedResources.length === 0 || selectedResources.length === resourceNames.length
        ? null
        : new Set(
            scopedResources.filter((e) => selectedResources.includes(e.name)).map((e) => e.id)
          );

    return items.filter((row) => {
      const emp = scopedResources.find((e) => e.id === row.employeeHrmsId);
      const deptName = emp?.department ?? "";
      if (deptSet && !deptSet.has(deptName)) return false;
      if (resourceIds && (!row.employeeHrmsId || !resourceIds.has(row.employeeHrmsId))) return false;
      if (
        search.trim() &&
        !matchesSearchQuery(
          search,
          row.employeeName,
          emp?.name,
          deptName,
          row.categoryName,
          row.kpiName,
          row.measurementMethodName,
          row.unitName,
          row.periodLabel,
          row.status
        )
      ) {
        return false;
      }
      return true;
    });
  }, [
    items,
    selectedDepts,
    selectedResources,
    allDeptNames.length,
    resourceNames.length,
    scopedResources,
    search,
  ]);

  const singleResourceFilterId = useMemo(() => {
    if (selectedResources.length !== 1) return null;
    const name = selectedResources[0]!;
    return scopedResources.find((e) => e.name === name)?.id ?? null;
  }, [selectedResources, scopedResources]);

  const weightHint = useMemo(() => {
    if (!singleResourceFilterId) return null;
    const rows = items.filter((i) => i.employeeHrmsId === singleResourceFilterId);
    const total = rows.reduce((s, i) => s + Number(i.weightage || 0), 0);
    return { total, ok: Math.abs(total - 100) < 0.01 };
  }, [singleResourceFilterId, items]);

  const sortedItems = useMemo(() => {
    const mul = sortDir === "asc" ? 1 : -1;
    return [...filteredItems].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "resource":
          cmp = (a.employeeName ?? "").localeCompare(b.employeeName ?? "");
          break;
        case "department": {
          const da =
            scopedResources.find((e) => e.id === a.employeeHrmsId)?.department ?? "";
          const db =
            scopedResources.find((e) => e.id === b.employeeHrmsId)?.department ?? "";
          cmp = da.localeCompare(db);
          break;
        }
        case "category":
          cmp = (a.categoryName ?? "").localeCompare(b.categoryName ?? "");
          break;
        case "kpi":
          cmp = a.kpiName.localeCompare(b.kpiName);
          break;
        case "method":
          cmp = (a.measurementMethodName ?? "").localeCompare(b.measurementMethodName ?? "");
          break;
        case "unit":
          cmp = (a.unitName ?? "").localeCompare(b.unitName ?? "");
          break;
        case "target":
          cmp = a.target - b.target;
          break;
        case "direction":
          cmp = a.targetDirection.localeCompare(b.targetDirection);
          break;
        case "period":
          cmp =
            a.periodStartMonth - b.periodStartMonth ||
            a.periodEndMonth - b.periodEndMonth ||
            a.periodLabel.localeCompare(b.periodLabel);
          break;
        case "weight":
          cmp = a.weightage - b.weightage;
          break;
        case "status":
          cmp = (FRAMEWORK_STATUS_ORDER[a.status] ?? 9) - (FRAMEWORK_STATUS_ORDER[b.status] ?? 9);
          break;
      }
      if (cmp !== 0) return mul * cmp;
      return a.id.localeCompare(b.id);
    });
  }, [filteredItems, sortKey, sortDir, scopedResources]);

  const loadMasters = useCallback(async () => {
    const [c, m, u] = await Promise.all([
      fetchKpiMasters("categories", true),
      fetchKpiMasters("methods", true),
      fetchKpiMasters("units", true),
    ]);
    setCategories(c);
    setMethods(m);
    setUnits(u);
  }, []);

  const loadFramework = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const rows = await fetchKpiFramework({
        calendarYear: year,
        assessmentCycle: cycle,
      });
      setItems(rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load KPI framework");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [year, cycle]);

  useEffect(() => {
    void loadMasters().catch((e) =>
      setError(e instanceof Error ? e.message : "Failed to load KPI masters")
    );
  }, [loadMasters]);

  useEffect(() => {
    if (seg === "list") void loadFramework();
  }, [seg, loadFramework]);

  const syncKpi = useCallback(async () => {
    await loadMasters();
    if (seg !== "list") return;
    try {
      const rows = await fetchKpiFramework({
        calendarYear: year,
        assessmentCycle: cycle,
      });
      setItems(rows);
    } catch {
      /* keep current rows; avoid spinner flash on background sync */
    }
  }, [loadMasters, seg, year, cycle]);

  useSharedDataSync(true, syncKpi, {
    resources: ["kpi"],
    intervalMs: MASTER_TXN_SYNC_INTERVAL_MS,
  });
  usePauseSharedDataSync(Boolean(newMasterName.trim()) || drawer != null);

  const masterList =
    masterTab === "categories" ? categories : masterTab === "methods" ? methods : units;
  const masterKind: KpiMasterKind =
    masterTab === "categories" ? "categories" : masterTab === "methods" ? "methods" : "units";

  const sortedMasters = useMemo(() => {
    const mul = masterSortDir === "asc" ? 1 : -1;
    return [...masterList].sort((a, b) => {
      let cmp = 0;
      if (masterSortKey === "name") cmp = a.name.localeCompare(b.name);
      else cmp = a.status.localeCompare(b.status);
      if (cmp !== 0) return mul * cmp;
      return a.name.localeCompare(b.name);
    });
  }, [masterList, masterSortKey, masterSortDir]);

  const addMaster = async () => {
    const name = clampKpiMasterName(masterKind, newMasterName).trim();
    if (!name) return;
    try {
      await createKpiMaster(masterKind, name);
      setNewMasterName("");
      await loadMasters();
      toast.created();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to add");
    }
  };

  const toggleMaster = async (row: ApiKpiMaster) => {
    try {
      await updateKpiMaster(masterKind, row.id, {
        status: row.status === "active" ? "inactive" : "active",
      });
      await loadMasters();
      toast.updated();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update");
    }
  };

  const openCreate = () => {
    if (!canOpenAdd) {
      toast.warning("Add KPI is available for direct reportees only.");
      return;
    }
    const cat = categories.find((c) => c.isActive) ?? categories[0];
    const meth = methods.find((m) => m.isActive) ?? methods[0];
    const unit = units.find((u) => u.isActive) ?? units[0];
    if (!cat || !meth || !unit) {
      toast.warning("Add KPI masters first (Category, Method, Unit).");
      return;
    }
    setDrawer({ mode: "create" });
  };

  const openRow = (row: ApiKpiItem) => {
    const canMutate =
      (isSuperAdmin || isKpiDirectReport(currentEmployee?.id, row.employeeHrmsId, employees)) &&
      row.status === "draft" &&
      !row.cycleExpired;
    setDrawer({ mode: canMutate ? "edit" : "view", item: row });
  };

  const confirmDelete = async () => {
    if (!pendingDeleteId) return;
    setDeleting(true);
    try {
      await deleteKpiFrameworkItem(pendingDeleteId);
      setPendingDeleteId(null);
      setDrawer(null);
      await loadFramework();
      toast.deleted();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete");
    } finally {
      setDeleting(false);
    }
  };

  const deptNameFor = (row: ApiKpiItem) =>
    scopedResources.find((e) => e.id === row.employeeHrmsId)?.department ?? "—";

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <header className="flex h-14 flex-shrink-0 items-center justify-between border-b border-border bg-surface px-5">
        <div>
          <div className="text-[15px] font-semibold tracking-tight text-foreground">KPI Framework</div>
          <div className="text-[12px] text-muted-foreground">Setup · define KPIs by assessment cycle</div>
        </div>
        <div className="flex overflow-hidden rounded-md border border-border text-[12px]">
          {(
            [
              ["list", "List"],
              ["masters", "Masters"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setSeg(id)}
              className={`cursor-pointer px-3.5 py-1.5 ${
                seg === id ? "bg-brand font-medium text-white" : "text-muted hover:bg-surface-alt"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background p-5">
        {error && <div className="mb-3 flex-shrink-0 text-[12px] text-danger">{error}</div>}

        {seg === "masters" ? (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border bg-surface">
            <div className="flex flex-shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border-soft px-4 py-2.5">
              <div className="flex overflow-hidden rounded-md border border-border text-[12px]">
                {(
                  [
                    ["categories", "KPI Category"],
                    ["methods", "Measurement Method"],
                    ["units", "Unit of Measurement"],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => {
                      setMasterTab(id);
                      setNewMasterName("");
                    }}
                    className={`cursor-pointer px-3 py-1.5 ${
                      masterTab === id ? "bg-brand font-medium text-white" : "text-muted hover:bg-surface-alt"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
                <input
                  value={newMasterName}
                  maxLength={KPI_MASTER_NAME_MAX[masterTab]}
                  onChange={(e) => setNewMasterName(clampKpiMasterName(masterTab, e.target.value))}
                  placeholder={
                    masterTab === "categories"
                      ? `New kpi category (${KPI_MASTER_NAME_MAX.categories} chars)…`
                      : masterTab === "methods"
                        ? `New measurement method (${KPI_MASTER_NAME_MAX.methods} chars)…`
                        : `New unit of measurement (${KPI_MASTER_NAME_MAX.units} chars)…`
                  }
                  className={`rounded-md border border-border bg-surface px-3 py-1.5 text-[12px] outline-none ${
                    masterTab === "methods" ? "w-full min-w-[12rem] max-w-xl" : "w-56"
                  }`}
                />
                <button
                  type="button"
                  disabled={!newMasterName.trim()}
                  onClick={() => void addMaster()}
                  className={`flex items-center gap-1 rounded-md bg-brand px-3 py-1.5 text-[12px] font-medium text-white ${
                    !newMasterName.trim()
                      ? "cursor-not-allowed opacity-50"
                      : "cursor-pointer hover:opacity-95"
                  }`}
                >
                  <Plus className="h-3.5 w-3.5" /> Add
                </button>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
              {sortedMasters.length === 0 ? (
                <div className="px-4 py-10 text-center text-[12px] text-muted-foreground">No items yet.</div>
              ) : (
                <>
                  <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border-soft bg-surface-alt px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    <SortColHeader
                      label="Name"
                      col="name"
                      sortKey={masterSortKey}
                      sortDir={masterSortDir}
                      onSort={handleMasterSort}
                    />
                    <SortColHeader
                      label="Status"
                      col="status"
                      sortKey={masterSortKey}
                      sortDir={masterSortDir}
                      onSort={handleMasterSort}
                      className="justify-end"
                    />
                  </div>
                  {sortedMasters.map((row) => (
                    <div
                      key={row.id}
                      className="flex items-center justify-between border-b border-border-soft px-4 py-3 last:border-b-0"
                    >
                      <div className="text-[13px] text-foreground">{row.name}</div>
                      <div className="flex items-center gap-3">
                        <span
                          className={`text-[12px] font-medium ${
                            row.status === "active" ? "text-success" : "text-muted-foreground"
                          }`}
                        >
                          {row.status === "active" ? "Active" : "Inactive"}
                        </span>
                        {row.status === "active" && row.inUse ? (
                          <span
                            className="cursor-not-allowed text-[12px] text-muted-foreground/50"
                            title="Used in KPI framework — cannot disable"
                          >
                            Disable
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => void toggleMaster(row)}
                            className="cursor-pointer text-[12px] text-muted-foreground hover:text-foreground hover:underline"
                          >
                            {row.status === "active" ? "Disable" : "Enable"}
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border bg-surface">
            <div className="flex flex-shrink-0 flex-wrap items-center gap-2 border-b border-border-soft px-4 py-2.5">
              <div className="relative min-w-[160px] flex-1 basis-[160px]">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search…"
                  className="h-8 w-full rounded-md border border-border bg-surface py-1.5 pl-8 pr-2.5 text-[12px] text-foreground outline-none placeholder:text-muted-foreground"
                />
              </div>
              <FilterSingleSelect
                aria-label="Calendar Year"
                value={String(year)}
                onChange={(v) => setYear(Number(v) as KpiCalendarYear)}
                options={yearOptions}
                className="min-w-[100px]"
              />
              <FilterSingleSelect
                aria-label="Quarter"
                value={cycle}
                onChange={(v) => setCycle(v as AssessmentCycle)}
                options={cycleOptions}
                className="min-w-[120px]"
              />
              <FilterMultiSelect
                items={allDeptNames}
                selected={selectedDepts}
                onChange={setSelectedDepts}
                counts={deptCounts}
                allLabel="All departments"
                pluralLabel="departments"
                emptyNeutral
              />
              <FilterMultiSelect
                items={resourceNames}
                selected={selectedResources}
                onChange={setSelectedResources}
                counts={resourceCounts}
                allLabel="All resources"
                pluralLabel="resources"
                emptyNeutral
              />
              {weightHint ? (
                <span
                  className={`text-[12px] font-medium ${
                    weightHint.ok ? "text-success" : "text-warning"
                  }`}
                >
                  Weightage {weightHint.total.toFixed(0)}% / 100%
                </span>
              ) : null}
              <button
                type="button"
                disabled={!canOpenAdd}
                onClick={openCreate}
                className="ml-auto flex cursor-pointer items-center gap-1 rounded-md bg-brand px-3 py-1.5 text-[12px] font-medium text-white disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Plus className="h-3.5 w-3.5" /> Add KPI
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-auto overscroll-contain">
              {loading ? (
                <div className="px-4 py-12 text-center text-[12px] text-muted-foreground">Loading…</div>
              ) : sortedItems.length === 0 ? (
                <div className="px-4 py-12 text-center text-[12px] text-muted-foreground">
                  No KPIs for this year and quarter.
                </div>
              ) : (
                  <table
                    className="w-full table-fixed border-separate border-spacing-0 text-left text-[12px]"
                    style={{ minWidth: KPI_LIST_TABLE_MIN_WIDTH }}
                  >
                    <colgroup>
                      {KPI_LIST_COLUMNS.map(({ col, width }) => (
                        <col key={col} style={{ width }} />
                      ))}
                    </colgroup>
                    <thead className="bg-surface-alt text-[11px] uppercase tracking-wide text-muted-foreground">
                      <tr>
                        {KPI_LIST_COLUMNS.map(({ col, label, compact }) => (
                          <th
                            key={col}
                            className={`sticky top-0 z-10 overflow-hidden border-b border-border-soft bg-surface-alt ${kpiListCellPad(compact)} py-2.5 font-medium`}
                          >
                            <SortColHeader
                              label={label}
                              col={col}
                              sortKey={sortKey}
                              sortDir={sortDir}
                              onSort={handleSort}
                              fillCell
                            />
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {sortedItems.map((row) => (
                        <tr
                          key={row.id}
                          onClick={() => openRow(row)}
                          className="cursor-pointer border-b border-border-soft last:border-b-0 hover:bg-surface-alt/60"
                        >
                          <td className={`min-w-0 border-b border-border-soft ${kpiListCellPad()} py-2.5 align-top`}>
                            <TruncateText as="div" text={row.employeeName ?? "—"} />
                          </td>
                          <td className={`min-w-0 border-b border-border-soft ${kpiListCellPad()} py-2.5 align-top`}>
                            <TruncateText as="div" text={deptNameFor(row)} />
                          </td>
                          <td className={`min-w-0 border-b border-border-soft ${kpiListCellPad()} py-2.5 align-top`}>
                            <span className="block break-words leading-snug text-foreground">
                              {row.categoryName ?? "—"}
                            </span>
                          </td>
                          <td className={`min-w-0 border-b border-border-soft ${kpiListCellPad()} py-2.5 align-top`}>
                            <span className="block break-words leading-snug text-foreground">
                              {row.kpiName}
                            </span>
                          </td>
                          <td className={`min-w-0 border-b border-border-soft ${kpiListCellPad()} py-2.5 align-top`}>
                            <span className="block break-words leading-snug text-foreground">
                              {row.measurementMethodName ?? "—"}
                            </span>
                          </td>
                          <td className={`min-w-0 border-b border-border-soft ${kpiListCellPad(true)} py-2.5 align-top`}>
                            <TruncateText as="div" text={row.unitName ?? "—"} />
                          </td>
                          <td className={`whitespace-nowrap border-b border-border-soft ${kpiListCellPad(true)} py-2.5 align-top`}>
                            {row.target}
                          </td>
                          <td className={`whitespace-nowrap border-b border-border-soft ${kpiListCellPad(true)} py-2.5 align-top`}>
                            {directionLabel(row.targetDirection)}
                          </td>
                          <td className={`whitespace-nowrap border-b border-border-soft ${kpiListCellPad()} py-2.5 align-top`}>
                            {row.periodLabel}
                          </td>
                          <td className={`whitespace-nowrap border-b border-border-soft ${kpiListCellPad(true)} py-2.5 align-top`}>
                            {row.weightage}%
                          </td>
                          <td className={`min-w-0 border-b border-border-soft ${kpiListCellPad()} py-2.5 align-top`}>
                            <StatusChip status={row.status} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
              )}
            </div>
          </div>
        )}
      </div>

      {drawer && (
        <FrameworkDrawer
          mode={drawer.mode}
          item={drawer.item}
          seed={drawer.seed}
          listYear={year}
          listCycle={cycle}
          items={items}
          categories={categories}
          methods={methods}
          units={units}
          directResources={directResources}
          employees={employees}
          isSuperAdmin={isSuperAdmin}
          currentEmployeeId={currentEmployee?.id}
          onClose={() => setDrawer(null)}
          onSaved={async (opts) => {
            await loadFramework();
            if (!opts?.keepOpen) setDrawer(null);
          }}
          onRequestDelete={(id) => setPendingDeleteId(id)}
          onError={(msg) => toast.error(msg)}
          onCreated={() => toast.created()}
          onUpdated={() => toast.updated()}
        />
      )}

      <ConfirmDeleteDialog
        open={pendingDeleteId != null}
        confirming={deleting}
        onCancel={() => !deleting && setPendingDeleteId(null)}
        onConfirm={() => void confirmDelete()}
      />
    </div>
  );
}

function FrameworkDrawer({
  mode,
  item,
  seed,
  listYear,
  listCycle,
  items,
  categories,
  methods,
  units,
  directResources,
  employees,
  isSuperAdmin,
  currentEmployeeId,
  onClose,
  onSaved,
  onRequestDelete,
  onError,
  onCreated,
  onUpdated,
}: {
  mode: DrawerMode;
  item?: ApiKpiItem;
  seed?: {
    employeeHrmsId: string;
    calendarYear: KpiCalendarYear;
    assessmentCycle: AssessmentCycle;
  };
  listYear: KpiCalendarYear;
  listCycle: AssessmentCycle;
  items: ApiKpiItem[];
  categories: ApiKpiMaster[];
  methods: ApiKpiMaster[];
  units: ApiKpiMaster[];
  directResources: { id: string; name: string }[];
  employees: Employee[];
  isSuperAdmin: boolean;
  currentEmployeeId?: string;
  onClose: () => void;
  onSaved: (opts?: { keepOpen?: boolean }) => void | Promise<void>;
  onRequestDelete: (id: string) => void;
  onError: (msg: string) => void;
  onCreated: () => void;
  onUpdated: () => void;
}) {
  const focusRef = useFocusFirstField<HTMLDivElement>(mode !== "view");
  const readOnly = mode === "view";

  const activeCat = categories.filter((c) => c.isActive);
  const activeMeth = methods.filter((m) => m.isActive);
  const activeUnit = units.filter((u) => u.isActive);

  const [form, setForm] = useState<FormState>(() => {
    if (item && mode !== "create") return formFromItem(item);
    const year = seed?.calendarYear ?? listYear;
    const cycle = seed?.assessmentCycle ?? listCycle;
    return emptyForm(year, cycle, {
      employeeHrmsId: seed?.employeeHrmsId ?? directResources[0]?.id ?? "",
      categoryId: activeCat[0]?.id ?? "",
      measurementMethodId: activeMeth[0]?.id ?? "",
      unitId: activeUnit[0]?.id ?? "",
    });
  });

  const [copyFromId, setCopyFromId] = useState("");
  const [copyKpiId, setCopyKpiId] = useState("");
  const [copySourceItems, setCopySourceItems] = useState<ApiKpiItem[]>([]);
  const [loadingCopy, setLoadingCopy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [postSavePrompt, setPostSavePrompt] = useState(false);

  const resetFormForAnother = useCallback(
    (ctx: {
      employeeHrmsId: string;
      calendarYear: KpiCalendarYear;
      assessmentCycle: AssessmentCycle;
    }) => {
      const periodOpts = periodRangeOptions(CYCLE_MONTHS[ctx.assessmentCycle]);
      setForm(
        emptyForm(ctx.calendarYear, ctx.assessmentCycle, {
          employeeHrmsId: ctx.employeeHrmsId,
          categoryId: activeCat[0]?.id ?? "",
          measurementMethodId: activeMeth[0]?.id ?? "",
          unitId: activeUnit[0]?.id ?? "",
          kpiName: "",
          target: "0",
          weightage: "0",
          periodValue: periodOpts[0]?.value ?? "",
        })
      );
      // Keep Copy-from resource so user can pick another KPI from the same source.
      setCopyKpiId("");
    },
    [activeCat, activeMeth, activeUnit]
  );

  const months = CYCLE_MONTHS[form.assessmentCycle];
  const periodOpts = useMemo(() => periodRangeOptions(months), [months]);
  const drawerCycleOptions = useMemo(
    () => selectableKpiCycleOptions(form.calendarYear),
    [form.calendarYear]
  );

  useEffect(() => {
    if (mode !== "create") return;
    if (!isKpiCycleExpired(form.calendarYear, form.assessmentCycle)) return;
    const next = selectableKpiCycleOptions(form.calendarYear)[0]?.value;
    if (next) setForm((f) => ({ ...f, assessmentCycle: next }));
  }, [mode, form.calendarYear, form.assessmentCycle]);

  useEffect(() => {
    if (mode !== "create") return;
    const opts = periodRangeOptions(CYCLE_MONTHS[form.assessmentCycle]);
    if (!opts.some((o) => o.value === form.periodValue)) {
      setForm((f) => ({ ...f, periodValue: opts[0]?.value ?? "" }));
    }
  }, [mode, form.assessmentCycle, form.periodValue]);

  const copyFromOptions = useMemo(
    () =>
      directResources
        .filter((e) => e.id !== form.employeeHrmsId)
        .map((e) => ({ value: e.id, label: e.name })),
    [directResources, form.employeeHrmsId]
  );

  useEffect(() => {
    if (mode !== "create" || !copyFromId) {
      setCopySourceItems([]);
      setCopyKpiId("");
      return;
    }
    let cancelled = false;
    setLoadingCopy(true);
    void fetchKpiFramework({
      calendarYear: form.calendarYear,
      assessmentCycle: form.assessmentCycle,
      employeeHrmsId: copyFromId,
    })
      .then((rows) => {
        if (cancelled) return;
        setCopySourceItems(rows);
        setCopyKpiId("");
      })
      .catch((e) => {
        if (!cancelled) onError(e instanceof Error ? e.message : "Failed to load source KPIs");
      })
      .finally(() => {
        if (!cancelled) setLoadingCopy(false);
      });
    return () => {
      cancelled = true;
    };
    // onError is stable enough for toast; omit to avoid refetch loops
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, copyFromId, form.calendarYear, form.assessmentCycle]);

  const applyCopyKpi = (kpiId: string) => {
    setCopyKpiId(kpiId);
    const src = copySourceItems.find((r) => r.id === kpiId);
    if (!src) return;
    setForm((f) => ({
      ...f,
      categoryId: src.categoryId,
      kpiName: src.kpiName,
      measurementMethodId: src.measurementMethodId,
      unitId: src.unitId,
      target: String(src.target),
      targetDirection: src.targetDirection,
      periodValue: `${src.periodStartMonth}-${src.periodEndMonth}`,
      weightage: String(src.weightage),
    }));
  };

  const othersWeight = useMemo(() => {
    return items
      .filter(
        (i) =>
          i.employeeHrmsId === form.employeeHrmsId &&
          i.calendarYear === form.calendarYear &&
          i.assessmentCycle === form.assessmentCycle &&
          i.id !== item?.id
      )
      .reduce((s, i) => s + Number(i.weightage || 0), 0);
  }, [items, form.employeeHrmsId, form.calendarYear, form.assessmentCycle, item?.id]);

  const thisWeight = Number(form.weightage) || 0;
  const totalWeight = othersWeight + thisWeight;
  const weightOk = Math.abs(totalWeight - 100) < 0.01;

  const resourceName =
    item?.employeeName ??
    directResources.find((e) => e.id === form.employeeHrmsId)?.name ??
    employees.find((e) => e.id === form.employeeHrmsId)?.name ??
    "—";

  const title =
    mode === "create" ? "Add KPI" : mode === "edit" ? "Edit KPI" : "View KPI";

  const canDelete =
    mode === "edit" &&
    item &&
    item.status === "draft" &&
    !item.cycleExpired &&
    (isSuperAdmin || isKpiDirectReport(currentEmployeeId, item.employeeHrmsId, employees));

  const canSave =
    !readOnly &&
    !postSavePrompt &&
    isKpiDrawerFormValid(form, mode, copyFromId, copyKpiId, loadingCopy);

  const save = async () => {
    if (readOnly || saving || !canSave) return;
    const kpiName = form.kpiName.trim().slice(0, KPI_NAME_MAX);
    if (!form.employeeHrmsId) {
      onError("Select a resource");
      return;
    }
    if (!kpiName) {
      onError("KPI name is required");
      return;
    }
    if (!form.categoryId || !form.measurementMethodId || !form.unitId) {
      onError("Category, Method, and Unit are required");
      return;
    }
    if (copyFromId && !copyKpiId) {
      onError("Select a KPI to copy");
      return;
    }
    const [startStr, endStr] = form.periodValue.split("-");
    const periodStartMonth = Number(startStr);
    const periodEndMonth = Number(endStr);
    if (!Number.isFinite(periodStartMonth) || !Number.isFinite(periodEndMonth)) {
      onError("Select a period");
      return;
    }
    const targetDigits = form.target.replace(/\D/g, "").slice(0, KPI_TARGET_MAX_DIGITS);
    const target = targetDigits === "" ? 0 : Math.min(KPI_TARGET_MAX, Number(targetDigits));
    const weightDigits = form.weightage.replace(/\D/g, "").slice(0, KPI_WEIGHT_MAX_DIGITS);
    const weightage =
      weightDigits === "" ? 0 : Math.min(KPI_WEIGHT_MAX, Math.max(0, Number(weightDigits)));

    setSaving(true);
    try {
      if (mode === "create") {
        await createKpiFrameworkItem({
          employeeHrmsId: form.employeeHrmsId,
          calendarYear: form.calendarYear,
          assessmentCycle: form.assessmentCycle,
          categoryId: form.categoryId,
          kpiName,
          measurementMethodId: form.measurementMethodId,
          unitId: form.unitId,
          target,
          targetDirection: form.targetDirection,
          periodStartMonth,
          periodEndMonth,
          weightage,
        });
        onCreated();
        const savedCtx = {
          employeeHrmsId: form.employeeHrmsId,
          calendarYear: form.calendarYear,
          assessmentCycle: form.assessmentCycle,
        };
        await onSaved({ keepOpen: true });
        resetFormForAnother(savedCtx);
        setPostSavePrompt(true);
      } else if (item) {
        await updateKpiFrameworkItem(item.id, {
          categoryId: form.categoryId,
          kpiName,
          measurementMethodId: form.measurementMethodId,
          unitId: form.unitId,
          target,
          targetDirection: form.targetDirection,
          periodStartMonth,
          periodEndMonth,
          weightage,
        });
        onUpdated();
        await onSaved();
      }
    } catch (e) {
      onError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const categoryOptions = useMemo(() => {
    const used = new Set<string>();
    if (form.categoryId) used.add(form.categoryId);
    return categories
      .filter((c) => c.isActive || used.has(c.id))
      .map((c) => ({ value: c.id, label: c.name }));
  }, [categories, form.categoryId]);
  const methodOptions = useMemo(() => {
    const used = new Set<string>();
    if (form.measurementMethodId) used.add(form.measurementMethodId);
    return methods
      .filter((m) => m.isActive || used.has(m.id))
      .map((m) => ({ value: m.id, label: m.name }));
  }, [methods, form.measurementMethodId]);
  const unitOptions = useMemo(() => {
    const used = new Set<string>();
    if (form.unitId) used.add(form.unitId);
    return units
      .filter((u) => u.isActive || used.has(u.id))
      .map((u) => ({ value: u.id, label: u.name }));
  }, [units, form.unitId]);

  return (
    <div className="fixed inset-0 z-40">
      <div onClick={onClose} className="absolute inset-0 bg-brand/30" aria-hidden />
      <div
        ref={focusRef}
        className="absolute right-0 top-0 flex h-full w-[440px] flex-col bg-surface shadow-2xl"
      >
        <div className="flex flex-shrink-0 items-center justify-between border-b border-border-soft px-5 py-4">
          <div>
            <div className="text-[15px] font-semibold text-foreground">{title}</div>
            {mode !== "create" && (
              <div className="mt-0.5 text-[12px] text-muted-foreground">
                {resourceName} · {form.calendarYear} / {CYCLE_LABEL[form.assessmentCycle]}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer text-muted-foreground hover:text-foreground"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-5 py-4">
          {mode === "create" && (
            <>
              <Field label="For resource" required>
                <FilterSelect
                  aria-label="For resource"
                  value={form.employeeHrmsId}
                  onChange={(v) => {
                    setForm((f) => ({ ...f, employeeHrmsId: v }));
                    setCopyFromId("");
                    setCopyKpiId("");
                  }}
                  options={directResources.map((e) => ({ value: e.id, label: e.name }))}
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Year" required>
                  <FilterSingleSelect
                    aria-label="Year"
                    value={String(form.calendarYear)}
                    onChange={(v) => {
                      setForm((f) => ({ ...f, calendarYear: Number(v) as KpiCalendarYear }));
                      setCopyFromId("");
                      setCopyKpiId("");
                    }}
                    options={KPI_CALENDAR_YEARS.map((y) => ({ value: String(y), label: String(y) }))}
                    fullWidth
                  />
                </Field>
                <Field label="Quarter" required>
                  <FilterSingleSelect
                    aria-label="Quarter"
                    value={form.assessmentCycle}
                    onChange={(v) => {
                      setForm((f) => ({ ...f, assessmentCycle: v as AssessmentCycle }));
                      setCopyFromId("");
                      setCopyKpiId("");
                    }}
                    options={drawerCycleOptions}
                    fullWidth
                  />
                </Field>
              </div>

              <div className="rounded-md border border-border-soft bg-surface-alt/50 p-3">
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Copy from (optional)
                </div>
                <div className="flex flex-col gap-2">
                  <FilterSelect
                    aria-label="Copy from resource"
                    value={copyFromId}
                    onChange={(v) => {
                      setCopyFromId(v);
                      setCopyKpiId("");
                    }}
                    options={copyFromOptions}
                    placeholder="Select resource…"
                  />
                  <Field label="Select KPI to copy…" required={Boolean(copyFromId)}>
                    <FilterSelect
                      aria-label="Copy KPI"
                      value={copyKpiId}
                      onChange={applyCopyKpi}
                      disabled={!copyFromId || loadingCopy}
                      options={copySourceItems.map((r) => ({
                        value: r.id,
                        label: r.kpiName,
                      }))}
                      placeholder={loadingCopy ? "Loading…" : "Select KPI to copy…"}
                    />
                  </Field>
                </div>
              </div>
            </>
          )}

          {readOnly && (
            <div className="rounded-md border border-border bg-surface-alt px-3 py-2 text-[12px] text-muted-foreground">
              View only — you can edit KPIs for direct reports only (draft, cycle open).
            </div>
          )}

          <Field label="Category" required>
            <FilterSelect
              aria-label="Category"
              disabled={readOnly}
              value={form.categoryId}
              onChange={(v) => setForm((f) => ({ ...f, categoryId: v }))}
              options={categoryOptions}
            />
          </Field>
          <Field label="KPI" required>
            <input
              disabled={readOnly}
              maxLength={KPI_NAME_MAX}
              value={form.kpiName}
              onChange={(e) => setForm((f) => ({ ...f, kpiName: e.target.value.slice(0, KPI_NAME_MAX) }))}
              placeholder={NEW_KPI_PLACEHOLDER}
              className={fieldClass}
            />
          </Field>
          <Field label="Method" required>
            <FilterSelect
              aria-label="Method"
              disabled={readOnly}
              value={form.measurementMethodId}
              onChange={(v) => setForm((f) => ({ ...f, measurementMethodId: v }))}
              options={methodOptions}
            />
          </Field>
          <Field label="Unit" required>
            <FilterSelect
              aria-label="Unit"
              disabled={readOnly}
              value={form.unitId}
              onChange={(v) => setForm((f) => ({ ...f, unitId: v }))}
              options={unitOptions}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Target" required>
              <input
                type="text"
                inputMode="numeric"
                disabled={readOnly}
                maxLength={KPI_TARGET_MAX_DIGITS}
                value={form.target}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    target: e.target.value.replace(/\D/g, "").slice(0, KPI_TARGET_MAX_DIGITS),
                  }))
                }
                className={fieldClass}
              />
            </Field>
            <Field label="Direction" required>
              <FilterSingleSelect
                aria-label="Direction"
                disabled={readOnly}
                value={form.targetDirection}
                onChange={(v) =>
                  setForm((f) => ({ ...f, targetDirection: v as KpiTargetDirection }))
                }
                options={[
                  { value: "higher_is_better", label: "High" },
                  { value: "lower_is_better", label: "Low" },
                ]}
                fullWidth
              />
            </Field>
          </div>
          <Field label="Period" required>
            <FilterSelect
              aria-label="Period"
              disabled={readOnly}
              value={form.periodValue}
              onChange={(v) => setForm((f) => ({ ...f, periodValue: v }))}
              options={periodOpts.map((o) => ({ value: o.value, label: o.label }))}
            />
          </Field>
          <Field
            label="Weight %"
            required
            hint={`Others ${othersWeight.toFixed(0)}% · Total ${totalWeight.toFixed(0)}%`}
            hintClassName={weightOk ? "text-success" : "text-warning"}
          >
            <input
              type="text"
              inputMode="numeric"
              disabled={readOnly}
              maxLength={KPI_WEIGHT_MAX_DIGITS}
              value={form.weightage}
              onChange={(e) => {
                const digits = e.target.value.replace(/\D/g, "").slice(0, KPI_WEIGHT_MAX_DIGITS);
                const n = digits === "" ? NaN : Number(digits);
                setForm((f) => ({
                  ...f,
                  weightage:
                    Number.isFinite(n) && n > KPI_WEIGHT_MAX ? String(KPI_WEIGHT_MAX) : digits,
                }));
              }}
              className={fieldClass}
            />
          </Field>
        </div>

        {canDelete && item ? (
          <div className="flex-shrink-0 border-t border-border-soft px-5 py-3">
            <div className="rounded-md border border-danger-border bg-danger-soft px-3 py-2.5">
              <button
                type="button"
                onClick={() => onRequestDelete(item.id)}
                className="flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-md border border-danger-border bg-surface px-3 py-2 text-[12px] font-medium text-danger transition-colors hover:bg-danger-soft"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete KPI
              </button>
            </div>
          </div>
        ) : null}

        {postSavePrompt ? (
          <div className="flex-shrink-0 border-t border-border-soft bg-accent-soft/40 px-5 py-4">
            <div className="text-[13px] font-semibold text-foreground">KPI saved.</div>
            <div className="mt-1 text-[13px] text-muted-foreground">
              Add another KPI from the same resource?
            </div>
            <div className="mt-3 flex gap-2.5">
              <button
                type="button"
                onClick={() => setPostSavePrompt(false)}
                className="flex-1 cursor-pointer rounded-md bg-brand py-2 text-[13px] font-medium text-white hover:opacity-95"
              >
                Yes
              </button>
              <button
                type="button"
                onClick={onClose}
                className="flex-1 cursor-pointer rounded-md border border-border bg-surface py-2 text-[13px] font-medium text-foreground hover:bg-surface-alt"
              >
                No, close
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-shrink-0 gap-2.5 border-t border-border-soft px-5 py-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 cursor-pointer rounded-md border border-border py-2 text-[13px] font-medium text-foreground hover:bg-surface-alt"
            >
              {readOnly ? "Close" : "Cancel"}
            </button>
            {!readOnly && (
              <button
                type="button"
                disabled={!canSave || saving}
                onClick={() => void save()}
                className="flex-1 cursor-pointer rounded-md bg-brand py-2 text-[13px] font-medium text-white transition-opacity hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {saving ? "Saving…" : "Save"}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  required,
  hint,
  hintClassName,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  hintClassName?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col">
      <span className="mb-1.5 flex items-baseline justify-between gap-2 text-[11px] text-muted">
        <span>
          {label}
          {required ? <span className="text-danger"> *</span> : null}
        </span>
        {hint ? <span className={`text-[11px] ${hintClassName ?? "text-muted-foreground"}`}>{hint}</span> : null}
      </span>
      {children}
    </label>
  );
}

function StatusChip({ status }: { status: string }) {
  if (status === "completed")
    return (
      <span className="rounded-full border border-success-border bg-success-soft px-2 py-0.5 text-[11px] font-medium text-success-fg">
        Completed
      </span>
    );
  if (status === "pending_result")
    return (
      <span className="rounded-full border border-warning-border bg-warning-soft px-2 py-0.5 text-[11px] font-medium text-warning">
        Pending Result
      </span>
    );
  return (
    <span className="rounded-full border border-border bg-surface-alt px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
      Draft
    </span>
  );
}
