import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import {
  copyKpiFramework,
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
import { SortColHeader, useColumnSort } from "../components/SortColHeader";
import { useSharedDataSync, usePauseSharedDataSync, MASTER_TXN_SYNC_INTERVAL_MS } from "../hooks/useSharedDataSync";
import { useAuth } from "../context/AuthContext";
import { useEmployees } from "../context/EmployeesContext";
import { useMasters } from "../context/MastersContext";
import { useToast } from "../context/ToastContext";
import { getImmediateReports } from "../data/employees";
import { clampKpiMasterName, KPI_MASTER_NAME_MAX } from "../utils/kpiMasterLimits";

type PageSeg = "framework" | "masters";
type MasterTab = "categories" | "methods" | "units";
type FrameworkSortKey =
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

const FRAMEWORK_STATUS_ORDER: Record<string, number> = {
  draft: 0,
  pending_result: 1,
  completed: 2,
};

const CYCLES: AssessmentCycle[] = ["Q1", "Q2", "Q3", "Q4"];
const CYCLE_MONTHS: Record<AssessmentCycle, number[]> = {
  Q1: [1, 2, 3],
  Q2: [4, 5, 6],
  Q3: [7, 8, 9],
  Q4: [10, 11, 12],
};
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

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
  "w-full rounded-md border border-border bg-surface px-2 py-1.5 text-[12px] text-foreground outline-none";

export function KpiFramework() {
  const toast = useToast();
  const { currentEmployee, isSuperAdmin } = useAuth();
  const { employees } = useEmployees();
  const { departments } = useMasters();
  const [seg, setSeg] = useState<PageSeg>("framework");
  const [masterTab, setMasterTab] = useState<MasterTab>("categories");
  const [year, setYear] = useState(new Date().getFullYear());
  const [cycle, setCycle] = useState<AssessmentCycle>("Q1");
  const [deptId, setDeptId] = useState("");
  const [resourceId, setResourceId] = useState("");
  const [copyFromId, setCopyFromId] = useState("");
  const [items, setItems] = useState<ApiKpiItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const { sortKey, sortDir, handleSort } = useColumnSort<FrameworkSortKey>("category");
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
  const activeEmployees = useMemo(() => {
    let list = employees.filter((e) => e.status === "active");
    if (!isSuperAdmin) {
      list = currentEmployee
        ? getImmediateReports(currentEmployee.id, list, { activeOnly: true })
        : [];
    }
    if (deptId) {
      const dept = activeDepts.find((d) => d.dbId === deptId || d.id === deptId);
      const name = dept?.name;
      if (name) list = list.filter((e) => e.department === name);
    }
    return list;
  }, [employees, deptId, activeDepts, isSuperAdmin, currentEmployee]);

  useEffect(() => {
    const ids = new Set(activeEmployees.map((e) => e.id));
    if (resourceId && !ids.has(resourceId)) setResourceId("");
    if (copyFromId && (!ids.has(copyFromId) || copyFromId === resourceId)) setCopyFromId("");
  }, [activeEmployees, resourceId, copyFromId]);

  const months = CYCLE_MONTHS[cycle];
  const periodOptions = useMemo(() => periodRangeOptions(months), [months]);
  const weightTotal = items.reduce((s, i) => s + Number(i.weightage || 0), 0);
  const weightOk = Math.abs(weightTotal - 100) < 0.01;
  const canEdit = items.every((i) => i.status === "draft") && !items.some((i) => i.cycleExpired);
  const canCopy = Boolean(resourceId) && items.length === 0;

  const sortedItems = useMemo(() => {
    const mul = sortDir === "asc" ? 1 : -1;
    return [...items].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
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
  }, [items, sortKey, sortDir]);

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
    if (!resourceId) {
      setItems([]);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const rows = await fetchKpiFramework({
        calendarYear: year,
        assessmentCycle: cycle,
        employeeHrmsId: resourceId,
        departmentId: deptId || undefined,
      });
      setItems(rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load KPI framework");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [year, cycle, resourceId, deptId]);

  useEffect(() => {
    void loadMasters().catch((e) =>
      setError(e instanceof Error ? e.message : "Failed to load KPI masters")
    );
  }, [loadMasters]);

  useEffect(() => {
    if (seg === "framework") void loadFramework();
  }, [seg, loadFramework]);

  const syncKpi = useCallback(async () => {
    await loadMasters();
    if (seg !== "framework" || !resourceId) return;
    try {
      const rows = await fetchKpiFramework({
        calendarYear: year,
        assessmentCycle: cycle,
        employeeHrmsId: resourceId,
        departmentId: deptId || undefined,
      });
      setItems(rows);
    } catch {
      /* keep current rows; avoid spinner flash on background sync */
    }
  }, [loadMasters, seg, resourceId, year, cycle, deptId]);

  useSharedDataSync(true, syncKpi, {
    resources: ["kpi"],
    intervalMs: MASTER_TXN_SYNC_INTERVAL_MS,
  });
  /** Pause only while typing a new master name — allow live reload of the open framework/list. */
  usePauseSharedDataSync(Boolean(newMasterName.trim()));

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

  const addKpi = async () => {
    if (!resourceId) return;
    const cat = categories.find((c) => c.isActive) ?? categories[0];
    const meth = methods.find((m) => m.isActive) ?? methods[0];
    const unit = units.find((u) => u.isActive) ?? units[0];
    if (!cat || !meth || !unit) {
      toast.warning("Add KPI masters first (Category, Method, Unit).");
      return;
    }
    try {
      await createKpiFrameworkItem({
        employeeHrmsId: resourceId,
        calendarYear: year,
        assessmentCycle: cycle,
        categoryId: cat.id,
        kpiName: "New KPI",
        measurementMethodId: meth.id,
        unitId: unit.id,
        target: 0,
        targetDirection: "higher_is_better",
        periodStartMonth: months[0]!,
        periodEndMonth: months[months.length - 1]!,
        weightage: 0,
      });
      await loadFramework();
      toast.created();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to add KPI");
    }
  };

  const patchRow = async (id: string, patch: Parameters<typeof updateKpiFrameworkItem>[1]) => {
    try {
      await updateKpiFrameworkItem(id, patch);
      await loadFramework();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update KPI");
      await loadFramework();
    }
  };

  const confirmDelete = async () => {
    if (!pendingDeleteId) return;
    setDeleting(true);
    try {
      await deleteKpiFrameworkItem(pendingDeleteId);
      setPendingDeleteId(null);
      await loadFramework();
      toast.deleted();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete");
    } finally {
      setDeleting(false);
    }
  };

  const doCopy = async () => {
    if (!resourceId || !copyFromId) return;
    try {
      await copyKpiFramework({
        targetEmployeeHrmsId: resourceId,
        sourceEmployeeHrmsId: copyFromId,
        calendarYear: year,
        assessmentCycle: cycle,
      });
      setCopyFromId("");
      await loadFramework();
      toast.created();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Copy failed");
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <header className="flex h-14 flex-shrink-0 items-center justify-between border-b border-border bg-surface px-5">
        <div>
          <div className="text-[15px] font-semibold tracking-tight text-foreground">KPI Framework</div>
          <div className="text-[12px] text-muted-foreground">Setup · define KPIs by assessment cycle</div>
        </div>
        <div className="flex overflow-hidden rounded-md border border-border text-[12px]">
          {(["framework", "masters"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSeg(s)}
              className={`px-3.5 py-1.5 capitalize ${
                seg === s ? "bg-brand font-medium text-white" : "text-muted hover:bg-surface-alt"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-auto bg-background p-5">
        {error && <div className="mb-3 text-[12px] text-danger">{error}</div>}

        {seg === "masters" ? (
          <div className="rounded-lg border border-border bg-surface shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-soft px-4 py-3">
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
                    className={`px-3 py-1.5 ${
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
                  onClick={() => void addMaster()}
                  className="flex items-center gap-1 rounded-md bg-brand px-3 py-1.5 text-[12px] font-medium text-white"
                >
                  <Plus className="h-3.5 w-3.5" /> Add
                </button>
              </div>
            </div>
            <div>
              {sortedMasters.length === 0 ? (
                <div className="px-4 py-10 text-center text-[12px] text-muted-foreground">No items yet.</div>
              ) : (
                <>
                  <div className="flex items-center justify-between border-b border-border-soft bg-surface-alt px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
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
                      <button
                        type="button"
                        onClick={() => void toggleMaster(row)}
                        className="text-[12px] text-muted-foreground hover:text-foreground hover:underline"
                      >
                        {row.status === "active" ? "Disable" : "Enable"}
                      </button>
                    </div>
                  </div>
                  ))}
                </>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-surface px-4 py-3 shadow-sm">
              <Filter label="Calendar Year">
                <select
                  value={year}
                  onChange={(e) => setYear(Number(e.target.value))}
                  className={fieldClass}
                >
                  {[year - 1, year, year + 1].map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </Filter>
              <Filter label="Cycle">
                <select
                  value={cycle}
                  onChange={(e) => setCycle(e.target.value as AssessmentCycle)}
                  className={fieldClass}
                >
                  {CYCLES.map((c) => (
                    <option key={c} value={c}>
                      {c === "Q1"
                        ? "Quarter 1"
                        : c === "Q2"
                          ? "Quarter 2"
                          : c === "Q3"
                            ? "Quarter 3"
                            : "Quarter 4"}
                    </option>
                  ))}
                </select>
              </Filter>
              <Filter label="Department">
                <select value={deptId} onChange={(e) => setDeptId(e.target.value)} className={fieldClass}>
                  <option value="">All</option>
                  {activeDepts.map((d) => (
                    <option key={d.id} value={d.dbId ?? d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </Filter>
              <Filter label="Resource">
                <select
                  value={resourceId}
                  onChange={(e) => setResourceId(e.target.value)}
                  className={fieldClass}
                >
                  <option value="">Select…</option>
                  {activeEmployees.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name}
                    </option>
                  ))}
                </select>
              </Filter>
              <Filter label="Copy from Resource">
                <div className="flex gap-1.5">
                  <select
                    value={copyFromId}
                    onChange={(e) => setCopyFromId(e.target.value)}
                    disabled={!canCopy}
                    className={fieldClass}
                  >
                    <option value="">Select…</option>
                    {activeEmployees
                      .filter((e) => e.id !== resourceId)
                      .map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.name}
                        </option>
                      ))}
                  </select>
                  <button
                    type="button"
                    disabled={!canCopy || !copyFromId}
                    onClick={() => void doCopy()}
                    className="rounded-md border border-border px-2.5 py-1.5 text-[12px] disabled:opacity-40"
                  >
                    Copy
                  </button>
                </div>
              </Filter>
              <div className="ml-auto flex items-center gap-3">
                <span
                  className={`text-[12px] font-medium ${weightOk ? "text-success" : "text-warning"}`}
                >
                  Weightage {weightTotal.toFixed(0)}% / 100%
                </span>
                <button
                  type="button"
                  disabled={!resourceId || !canEdit}
                  onClick={() => void addKpi()}
                  className="flex items-center gap-1 rounded-md bg-brand px-3 py-1.5 text-[12px] font-medium text-white disabled:opacity-40"
                >
                  <Plus className="h-3.5 w-3.5" /> Add KPI
                </button>
              </div>
            </div>

            <div className="overflow-hidden rounded-lg border border-border bg-surface shadow-sm">
              {!resourceId ? (
                <div className="px-4 py-12 text-center text-[12px] text-muted-foreground">
                  Select a resource to define KPIs.
                </div>
              ) : loading ? (
                <div className="px-4 py-12 text-center text-[12px] text-muted-foreground">Loading…</div>
              ) : items.length === 0 ? (
                <div className="px-4 py-12 text-center text-[12px] text-muted-foreground">
                  No KPIs yet. Add KPI or copy from another resource.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[1100px] text-left text-[12px]">
                    <thead className="border-b border-border-soft bg-surface-alt text-[11px] uppercase tracking-wide text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2.5 font-medium">
                          <SortColHeader
                            label="Category"
                            col="category"
                            sortKey={sortKey}
                            sortDir={sortDir}
                            onSort={handleSort}
                          />
                        </th>
                        <th className="px-3 py-2.5 font-medium">
                          <SortColHeader
                            label="KPI"
                            col="kpi"
                            sortKey={sortKey}
                            sortDir={sortDir}
                            onSort={handleSort}
                          />
                        </th>
                        <th className="px-3 py-2.5 font-medium">
                          <SortColHeader
                            label="Method"
                            col="method"
                            sortKey={sortKey}
                            sortDir={sortDir}
                            onSort={handleSort}
                          />
                        </th>
                        <th className="px-3 py-2.5 font-medium">
                          <SortColHeader
                            label="Unit"
                            col="unit"
                            sortKey={sortKey}
                            sortDir={sortDir}
                            onSort={handleSort}
                          />
                        </th>
                        <th className="w-16 whitespace-nowrap px-3 py-2.5 font-medium">
                          <SortColHeader
                            label="Target"
                            col="target"
                            sortKey={sortKey}
                            sortDir={sortDir}
                            onSort={handleSort}
                          />
                        </th>
                        <th className="px-3 py-2.5 font-medium">
                          <SortColHeader
                            label="Direction"
                            col="direction"
                            sortKey={sortKey}
                            sortDir={sortDir}
                            onSort={handleSort}
                          />
                        </th>
                        <th className="px-3 py-2.5 font-medium">
                          <SortColHeader
                            label="Period"
                            col="period"
                            sortKey={sortKey}
                            sortDir={sortDir}
                            onSort={handleSort}
                          />
                        </th>
                        <th className="w-16 whitespace-nowrap px-3 py-2.5 font-medium">
                          <SortColHeader
                            label="Weight %"
                            col="weight"
                            sortKey={sortKey}
                            sortDir={sortDir}
                            onSort={handleSort}
                          />
                        </th>
                        <th className="px-3 py-2.5 font-medium">
                          <SortColHeader
                            label="Status"
                            col="status"
                            sortKey={sortKey}
                            sortDir={sortDir}
                            onSort={handleSort}
                          />
                        </th>
                        <th className="px-3 py-2.5 font-medium" />
                      </tr>
                    </thead>
                    <tbody>
                      {sortedItems.map((row) => {
                        const locked = row.status !== "draft" || row.cycleExpired;
                        return (
                          <tr key={row.id} className="border-b border-border-soft last:border-b-0">
                            <td className="px-3 py-2">
                              <select
                                disabled={locked}
                                value={row.categoryId}
                                onChange={(e) => void patchRow(row.id, { categoryId: e.target.value })}
                                className={fieldClass}
                              >
                                {categories.map((c) => (
                                  <option key={c.id} value={c.id}>
                                    {c.name}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className="px-3 py-2">
                              <input
                                disabled={locked}
                                defaultValue={row.kpiName}
                                onBlur={(e) => {
                                  const v = e.target.value.trim();
                                  if (v && v !== row.kpiName) void patchRow(row.id, { kpiName: v });
                                }}
                                className={fieldClass}
                              />
                            </td>
                            <td className="px-3 py-2">
                              <select
                                disabled={locked}
                                value={row.measurementMethodId}
                                onChange={(e) =>
                                  void patchRow(row.id, { measurementMethodId: e.target.value })
                                }
                                className={fieldClass}
                              >
                                {methods.map((m) => (
                                  <option key={m.id} value={m.id}>
                                    {m.name}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className="px-3 py-2">
                              <select
                                disabled={locked}
                                value={row.unitId}
                                onChange={(e) => void patchRow(row.id, { unitId: e.target.value })}
                                className={fieldClass}
                              >
                                {units.map((u) => (
                                  <option key={u.id} value={u.id}>
                                    {u.name}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className="w-16 px-3 py-2">
                              <input
                                type="number"
                                disabled={locked}
                                defaultValue={row.target}
                                onBlur={(e) => {
                                  const v = Number(e.target.value);
                                  if (Number.isFinite(v) && v !== row.target)
                                    void patchRow(row.id, { target: v });
                                }}
                                className="w-14 rounded-md border border-border bg-surface px-1.5 py-1.5 text-[12px] text-foreground outline-none"
                              />
                            </td>
                            <td className="px-3 py-2">
                              <select
                                disabled={locked}
                                value={row.targetDirection}
                                onChange={(e) =>
                                  void patchRow(row.id, {
                                    targetDirection: e.target.value as KpiTargetDirection,
                                  })
                                }
                                className={fieldClass}
                              >
                                <option value="higher_is_better">High</option>
                                <option value="lower_is_better">Low</option>
                              </select>
                            </td>
                            <td className="px-3 py-2">
                              <select
                                disabled={locked}
                                value={`${row.periodStartMonth}-${row.periodEndMonth}`}
                                onChange={(e) => {
                                  const [start, end] = e.target.value.split("-").map(Number);
                                  if (!Number.isFinite(start) || !Number.isFinite(end)) return;
                                  void patchRow(row.id, {
                                    periodStartMonth: start,
                                    periodEndMonth: end,
                                  });
                                }}
                                className={fieldClass}
                              >
                                {periodOptions.map((opt) => (
                                  <option key={opt.value} value={opt.value}>
                                    {opt.label}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className="w-16 px-3 py-2">
                              <input
                                type="number"
                                disabled={locked}
                                defaultValue={row.weightage}
                                onBlur={(e) => {
                                  const v = Number(e.target.value);
                                  if (Number.isFinite(v) && v !== row.weightage)
                                    void patchRow(row.id, { weightage: v });
                                }}
                                className="w-14 rounded-md border border-border bg-surface px-1.5 py-1.5 text-[12px] text-foreground outline-none"
                              />
                            </td>
                            <td className="px-3 py-2">
                              <StatusChip status={row.status} />
                            </td>
                            <td className="px-3 py-2">
                              {!locked && (
                                <button
                                  type="button"
                                  onClick={() => setPendingDeleteId(row.id)}
                                  className="rounded p-1 text-danger hover:bg-danger-soft"
                                  aria-label="Delete KPI"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <ConfirmDeleteDialog
        open={pendingDeleteId != null}
        confirming={deleting}
        onCancel={() => !deleting && setPendingDeleteId(null)}
        onConfirm={() => void confirmDelete()}
      />
    </div>
  );
}

function Filter({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex min-w-[120px] flex-col gap-1">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
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
