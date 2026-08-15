import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import {
  deleteKpiResultAttachment,
  fetchKpiResultAttachment,
  fetchKpiResults,
  saveKpiResult,
  type ApiKpiItem,
  type ApiKpiResultsSummary,
  type AssessmentCycle,
  type KpiRowStatus,
} from "../api/domain";
import { ConfirmDeleteDialog } from "../components/ConfirmDeleteDialog";
import { useEmployees } from "../context/EmployeesContext";
import { useMasters } from "../context/MastersContext";
import { useToast } from "../context/ToastContext";
import { useAuth } from "../context/AuthContext";
import { useFocusFirstField } from "../hooks/useFocusFirstField";
import { SortColHeader, useColumnSort } from "../components/SortColHeader";
import { useAppDateFormat } from "../hooks/useAppDateFormat";
import { useSharedDataSync, usePauseSharedDataSync, MASTER_TXN_SYNC_INTERVAL_MS } from "../hooks/useSharedDataSync";

const CYCLES: AssessmentCycle[] = ["Q1", "Q2", "Q3", "Q4"];
const fieldClass =
  "w-full rounded-md border border-border bg-surface px-3 py-2 text-[13px] text-foreground outline-none";

const KPI_RO_REMARKS_MAX = 200;

type KpiResultsSortKey =
  | "resource"
  | "kpi"
  | "period"
  | "target"
  | "weight"
  | "status"
  | "updatedOn";

const STATUS_ORDER: Record<KpiRowStatus, number> = {
  draft: 0,
  pending_result: 1,
  completed: 2,
};

function emptySummary(): ApiKpiResultsSummary {
  return { total: 0, pending: 0, completed: 0, finalAchievement: null };
}

export function KpiResults() {
  const toast = useToast();
  const { formatDateTime } = useAppDateFormat();
  const { currentEmployee, isSuperAdmin } = useAuth();
  const { employees } = useEmployees();
  const { departments } = useMasters();
  const [year, setYear] = useState(new Date().getFullYear());
  const [cycle, setCycle] = useState<AssessmentCycle>("Q2");
  const [deptId, setDeptId] = useState("");
  const [resourceId, setResourceId] = useState("");
  const [statusTab, setStatusTab] = useState<"all" | "pending_result" | "completed">("all");
  const [items, setItems] = useState<ApiKpiItem[]>([]);
  const [summary, setSummary] = useState<ApiKpiResultsSummary>(emptySummary());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<ApiKpiItem | null>(null);
  const { sortKey, sortDir, handleSort } = useColumnSort<KpiResultsSortKey>("resource");

  const activeDepts = useMemo(
    () => departments.filter((d) => d.status === "active"),
    [departments]
  );

  const ownedEmployees = useMemo(() => {
    let list = employees.filter((e) => e.status === "active");
    if (!isSuperAdmin && currentEmployee) {
      const ownerId = currentEmployee.id;
      const ids = new Set<string>();
      const queue = [ownerId];
      while (queue.length) {
        const cur = queue.shift()!;
        for (const e of employees) {
          if (e.resourceOwnerId === cur && !ids.has(e.id)) {
            ids.add(e.id);
            queue.push(e.id);
          }
        }
      }
      list = list.filter((e) => ids.has(e.id));
    }
    if (deptId) {
      const dept = activeDepts.find((d) => d.dbId === deptId || d.id === deptId);
      if (dept) list = list.filter((e) => e.department === dept.name);
    }
    return list;
  }, [employees, isSuperAdmin, currentEmployee, deptId, activeDepts]);

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    setError("");
    try {
      // Always load unfiltered scope so summary / tab counts stay stable.
      const res = await fetchKpiResults({
        calendarYear: year,
        assessmentCycle: cycle,
        employeeHrmsId: resourceId || undefined,
        departmentId: deptId || undefined,
        status: "all",
      });
      setItems(res.items);
      setSummary(res.summary);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load KPI results");
      setItems([]);
      setSummary(emptySummary());
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  }, [year, cycle, resourceId, deptId]);

  useEffect(() => {
    void load();
  }, [load]);

  useSharedDataSync(!selected, () => load({ silent: true }), {
    resources: ["kpi"],
    intervalMs: MASTER_TXN_SYNC_INTERVAL_MS,
  });
  usePauseSharedDataSync(Boolean(selected));

  const pendingCount = summary.pending;
  const completedCount = summary.completed;

  const filteredItems = useMemo(() => {
    if (statusTab === "completed") return items.filter((i) => i.status === "completed");
    if (statusTab === "pending_result") {
      return items.filter((i) => i.status === "pending_result" || i.status === "draft");
    }
    return items;
  }, [items, statusTab]);

  const sorted = useMemo(() => {
    const mul = sortDir === "asc" ? 1 : -1;
    return [...filteredItems].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "resource":
          cmp = (a.employeeName ?? "").localeCompare(b.employeeName ?? "");
          break;
        case "kpi":
          cmp = a.kpiName.localeCompare(b.kpiName);
          break;
        case "period":
          cmp = a.periodLabel.localeCompare(b.periodLabel);
          break;
        case "target":
          cmp = a.target - b.target;
          break;
        case "weight":
          cmp = a.weightage - b.weightage;
          break;
        case "status":
          cmp = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
          break;
        case "updatedOn":
          cmp = (a.resultUpdatedAt ?? "").localeCompare(b.resultUpdatedAt ?? "");
          break;
      }
      if (cmp !== 0) return mul * cmp;
      return (a.employeeName ?? "").localeCompare(b.employeeName ?? "") || a.id.localeCompare(b.id);
    });
  }, [filteredItems, sortKey, sortDir]);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <header className="flex h-14 flex-shrink-0 items-center justify-between border-b border-border bg-surface px-5">
        <div>
          <div className="text-[15px] font-semibold tracking-tight text-foreground">KPI Results</div>
          <div className="text-[12px] text-muted-foreground">
            My Team · enter results for your direct and indirect reports
          </div>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-auto bg-background p-5">
        {error && <div className="mb-3 text-[12px] text-danger">{error}</div>}

        <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          <SummaryCard
            label="Total KPIs"
            value={String(summary.total)}
            active={statusTab === "all"}
            onClick={() => setStatusTab("all")}
          />
          <SummaryCard
            label="Pending"
            value={String(pendingCount)}
            valueClass="text-warning"
            active={statusTab === "pending_result"}
            onClick={() => setStatusTab("pending_result")}
          />
          <SummaryCard
            label="Completed"
            value={String(completedCount)}
            valueClass="text-success"
            active={statusTab === "completed"}
            onClick={() => setStatusTab("completed")}
          />
          <SummaryCard
            label="Final Achievement"
            value={
              summary.finalAchievement != null ? `${summary.finalAchievement}` : "—"
            }
            hint={resourceId ? (summary.finalAchievement == null ? "Complete all KPIs" : undefined) : "Select a resource"}
          />
        </div>

        <div className="mb-3 flex flex-wrap items-end justify-between gap-3 rounded-lg border border-border bg-surface px-4 py-3 shadow-sm">
          <div className="flex flex-wrap gap-3">
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
                    Quarter {c.slice(1)}
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
                <option value="">All</option>
                {ownedEmployees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
            </Filter>
          </div>
          <div className="flex overflow-hidden rounded-md border border-border text-[12px]">
            {(
              [
                ["all", `All ${summary.total}`],
                ["pending_result", `Pending ${pendingCount}`],
                ["completed", `Completed ${completedCount}`],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setStatusTab(id)}
                className={`px-3 py-1.5 ${
                  statusTab === id ? "bg-brand font-medium text-white" : "text-muted hover:bg-surface-alt"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-hidden rounded-lg border border-border bg-surface shadow-sm">
          {loading ? (
            <div className="px-4 py-12 text-center text-[12px] text-muted-foreground">Loading…</div>
          ) : filteredItems.length === 0 ? (
            <div className="px-4 py-12 text-center text-[12px] text-muted-foreground">
              No KPI results for this filter.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-left text-[12px]">
                <thead className="border-b border-border-soft bg-surface-alt text-[11px] uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2.5 font-medium">
                      <SortColHeader
                        label="Resource"
                        col="resource"
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
                        label="KPI Period"
                        col="period"
                        sortKey={sortKey}
                        sortDir={sortDir}
                        onSort={handleSort}
                      />
                    </th>
                    <th className="px-3 py-2.5 font-medium">
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
                    <th className="px-3 py-2.5 font-medium">
                      <SortColHeader
                        label="Result Updated On"
                        col="updatedOn"
                        sortKey={sortKey}
                        sortDir={sortDir}
                        onSort={handleSort}
                      />
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((row) => (
                    <tr
                      key={row.id}
                      onClick={() => setSelected(row)}
                      className="cursor-pointer border-b border-border-soft last:border-b-0 hover:bg-surface-alt/80"
                    >
                      <td className="px-3 py-2.5 text-foreground">{row.employeeName}</td>
                      <td className="px-3 py-2.5 text-foreground">{row.kpiName}</td>
                      <td className="px-3 py-2.5 text-muted-foreground">{row.periodLabel}</td>
                      <td className="px-3 py-2.5">
                        {row.target} {row.unitName}
                      </td>
                      <td className="px-3 py-2.5">{row.weightage}</td>
                      <td className="px-3 py-2.5">
                        <StatusChip status={row.status} />
                      </td>
                      <td className="px-3 py-2.5 text-muted-foreground">
                        {row.resultUpdatedAt ? formatDateTime(row.resultUpdatedAt) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {selected && (
        <ResultDrawer
          item={selected}
          onClose={() => setSelected(null)}
          onSaved={async () => {
            setSelected(null);
            await load();
            toast.updated();
          }}
          onError={(msg) => toast.error(msg)}
        />
      )}
    </div>
  );
}

function ResultDrawer({
  item,
  onClose,
  onSaved,
  onError,
}: {
  item: ApiKpiItem;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
  onError: (msg: string) => void;
}) {
  const focusRef = useFocusFirstField<HTMLDivElement>();
  const locked = item.status === "completed";
  const canSave = item.periodExpired && !locked;
  const [kpiResult, setKpiResult] = useState(item.kpiResult != null ? String(item.kpiResult) : "");
  const [kpiScore, setKpiScore] = useState(item.kpiScore != null ? String(item.kpiScore) : "");
  const [remarks, setRemarks] = useState(() => (item.remarks ?? "").slice(0, KPI_RO_REMARKS_MAX));
  const [file, setFile] = useState<File | null>(null);
  const [savedAttachment, setSavedAttachment] = useState(item.hasAttachment);
  const [savedAttachmentName, setSavedAttachmentName] = useState(item.attachmentName);
  const [confirmDeleteAttach, setConfirmDeleteAttach] = useState(false);
  const [deletingAttach, setDeletingAttach] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const attachmentName = file?.name ?? (savedAttachment ? savedAttachmentName : null);
  const hasAttachment = Boolean(file) || savedAttachment;

  const viewAttachment = async () => {
    try {
      if (file) {
        const url = URL.createObjectURL(file);
        const opened = window.open(url, "_blank", "noopener,noreferrer");
        if (!opened) {
          URL.revokeObjectURL(url);
          onError("Pop-up blocked — allow pop-ups to view the file.");
          return;
        }
        window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
        return;
      }
      const blob = await fetchKpiResultAttachment(item.id);
      const url = URL.createObjectURL(blob);
      const opened = window.open(url, "_blank", "noopener,noreferrer");
      if (!opened) {
        URL.revokeObjectURL(url);
        onError("Pop-up blocked — allow pop-ups to view the file.");
        return;
      }
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) {
      onError(e instanceof Error ? e.message : "Failed to open attachment");
    }
  };

  const confirmDeleteAttachment = async () => {
    if (deletingAttach) return;
    if (file) {
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      setConfirmDeleteAttach(false);
      return;
    }
    setDeletingAttach(true);
    try {
      await deleteKpiResultAttachment(item.id);
      setSavedAttachment(false);
      setSavedAttachmentName(null);
      setConfirmDeleteAttach(false);
    } catch (e) {
      onError(e instanceof Error ? e.message : "Failed to delete attachment");
    } finally {
      setDeletingAttach(false);
    }
  };

  const title = locked ? "KPI Result" : canSave ? "Update KPI Result" : "KPI Result";

  const save = async () => {
    if (!canSave || saving) return;
    const resultNum = Number(kpiResult);
    const scoreNum = Number(kpiScore);
    if (!Number.isFinite(resultNum)) {
      onError("KPI Result must be numeric");
      return;
    }
    if (!Number.isFinite(scoreNum) || scoreNum < 0 || scoreNum > 100) {
      onError("RO KPI Score must be between 0 and 100");
      return;
    }
    setSaving(true);
    try {
      let attachment: { fileName: string; mimeType: string; base64: string } | undefined;
      if (file) {
        const allowed = [
          "application/pdf",
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "application/vnd.ms-excel",
          "image/jpeg",
          "image/jpg",
        ];
        if (!allowed.includes(file.type) && !file.name.match(/\.(pdf|xlsx|xls|jpg|jpeg)$/i)) {
          onError("Attachment must be PDF, XLSX, JPG, or JPEG");
          setSaving(false);
          return;
        }
        if (file.size > 5 * 1024 * 1024) {
          onError("Attachment must be 5 MB or less");
          setSaving(false);
          return;
        }
        const base64 = await fileToBase64(file);
        attachment = { fileName: file.name, mimeType: file.type || "application/octet-stream", base64 };
      }
      await saveKpiResult(item.id, {
        kpiResult: resultNum,
        kpiScore: scoreNum,
        remarks: remarks.trim().slice(0, KPI_RO_REMARKS_MAX) || undefined,
        attachment,
      });
      await onSaved();
    } catch (e) {
      onError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40">
      <div onClick={onClose} className="absolute inset-0 bg-brand/30" aria-hidden />
      <div
        ref={focusRef}
        className="absolute right-0 top-0 flex h-full w-[440px] flex-col bg-surface shadow-2xl"
      >
        <div className="flex flex-shrink-0 items-center justify-between border-b border-border-soft px-5 py-4">
          <div className="text-[15px] font-semibold text-foreground">{title}</div>
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-5 py-4">
          <ReadOnly label="KPI Category" value={item.categoryName ?? "—"} />
          <ReadOnly label="KPI" value={item.kpiName} />
          <ReadOnly label="Measurement Method" value={item.measurementMethodName ?? "—"} />
          <ReadOnly label="Unit" value={item.unitName ?? "—"} />
          <ReadOnly label="Target" value={`${item.target} ${item.unitName ?? ""}`} />
          <ReadOnly
            label="Target Direction"
            value={item.targetDirection === "higher_is_better" ? "High" : "Low"}
          />
          <ReadOnly label="KPI Period" value={item.periodLabel} />
          <ReadOnly label="KPI Weightage" value={`${item.weightage}%`} />

          {!item.periodExpired && (
            <div className="rounded-md border border-warning-border bg-warning-soft px-3 py-2 text-[12px] text-warning">
              Results can be submitted only after the KPI period ends.
            </div>
          )}

          <label className="flex flex-col">
            <span className="mb-1.5 text-[11px] text-muted">
              KPI Result <span className="text-danger">*</span>
            </span>
            <input
              type="number"
              step="any"
              disabled={locked || !canSave}
              value={kpiResult}
              onChange={(e) => setKpiResult(e.target.value)}
              className={`${fieldClass} focus:border-accent-line disabled:cursor-not-allowed disabled:bg-surface-alt disabled:text-muted`}
            />
          </label>
          <label className="flex flex-col">
            <span className="mb-1.5 text-[11px] text-muted">
              RO KPI Score (0–100) <span className="text-danger">*</span>
            </span>
            <input
              type="number"
              min={0}
              max={100}
              step="0.01"
              disabled={locked || !canSave}
              value={kpiScore}
              onChange={(e) => setKpiScore(e.target.value)}
              className={`${fieldClass} focus:border-accent-line disabled:cursor-not-allowed disabled:bg-surface-alt disabled:text-muted`}
            />
          </label>
          <label className="flex flex-col">
            <span className="mb-1.5 flex items-baseline justify-between gap-2 text-[11px] text-muted">
              <span>Resource Owner Remarks</span>
              <span className="text-muted-foreground">
                {remarks.length}/{KPI_RO_REMARKS_MAX} (Max {KPI_RO_REMARKS_MAX} char)
              </span>
            </span>
            <textarea
              disabled={locked || !canSave}
              value={remarks}
              maxLength={KPI_RO_REMARKS_MAX}
              onChange={(e) => setRemarks(e.target.value.slice(0, KPI_RO_REMARKS_MAX))}
              rows={3}
              className={`${fieldClass} focus:border-accent-line disabled:cursor-not-allowed disabled:bg-surface-alt disabled:text-muted`}
            />
          </label>
          <div className="flex flex-col">
            <span className="mb-1.5 text-[11px] text-muted">
              Attachment (PDF / XLSX / JPG · max 5 MB)
            </span>
            {hasAttachment && (
              <div className="mb-1.5 flex min-w-0 items-center justify-between gap-2">
                <span className="min-w-0 truncate text-[12px] text-foreground" title={attachmentName ?? undefined}>
                  {attachmentName || "Attachment"}
                </span>
                <div className="flex shrink-0 items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => void viewAttachment()}
                    className="cursor-pointer text-[12px] text-primary hover:underline"
                  >
                    View
                  </button>
                  {!locked && canSave && (
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteAttach(true)}
                      className="cursor-pointer text-[12px] text-danger hover:underline"
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
            )}
            {!locked && canSave && (
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.xlsx,.xls,.jpg,.jpeg,application/pdf,image/jpeg"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="block w-full cursor-pointer text-[12px]"
              />
            )}
          </div>
        </div>

        <div className="flex flex-shrink-0 gap-2 border-t border-border-soft px-5 py-3.5">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="flex-1 cursor-pointer rounded-md border border-border py-2 text-[13px] text-foreground hover:bg-surface-alt disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!canSave || saving}
            onClick={() => void save()}
            className="flex-1 cursor-pointer rounded-md bg-primary py-2 text-[13px] font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-40"
          >
            {saving ? "Saving…" : locked ? "Locked" : "Save"}
          </button>
        </div>
      </div>
      <ConfirmDeleteDialog
        open={confirmDeleteAttach}
        confirming={deletingAttach}
        onCancel={() => setConfirmDeleteAttach(false)}
        onConfirm={() => void confirmDeleteAttachment()}
      />
    </div>
  );
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const s = String(reader.result || "");
      const i = s.indexOf(",");
      resolve(i >= 0 ? s.slice(i + 1) : s);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function SummaryCard({
  label,
  value,
  valueClass,
  hint,
  active,
  onClick,
}: {
  label: string;
  value: string;
  valueClass?: string;
  hint?: string;
  active?: boolean;
  onClick?: () => void;
}) {
  const interactive = typeof onClick === "function";
  const className = `rounded-lg border bg-surface px-4 py-3 text-left shadow-sm ${
    active ? "border-accent-line ring-1 ring-accent-line" : "border-border"
  } ${interactive ? "cursor-pointer transition hover:border-primary/40 hover:shadow-md" : ""}`;

  if (interactive) {
    return (
      <button type="button" onClick={onClick} className={className}>
        <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className={`mt-1 text-[22px] font-semibold tracking-tight ${valueClass ?? "text-foreground"}`}>
          {value}
        </div>
        {hint && <div className="mt-0.5 text-[11px] text-muted-foreground">{hint}</div>}
      </button>
    );
  }

  return (
    <div className={className}>
      <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`mt-1 text-[22px] font-semibold tracking-tight ${valueClass ?? "text-foreground"}`}>
        {value}
      </div>
      {hint && <div className="mt-0.5 text-[11px] text-muted-foreground">{hint}</div>}
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

function ReadOnly({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] text-muted">{label}</div>
      <div className="mt-0.5 text-[13px] text-foreground">{value}</div>
    </div>
  );
}

function StatusChip({ status }: { status: KpiRowStatus }) {
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
