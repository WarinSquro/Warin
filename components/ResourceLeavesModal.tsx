import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarOff, Pencil, Plus, Search, X } from "lucide-react";
import {
  cancelResourceLeave,
  createResourceLeave,
  fetchResourceLeaves,
  updateResourceLeaveReason,
  type ResourceLeaveRow,
} from "../api/domain";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import type { Employee } from "../data/employees";
import { formatAppDate, formatAppDateTime } from "../utils/formatAppDate";
import { useSettings } from "../context/SettingsContext";
import {
  isLeaveDateAllowed,
  scopeLeaveMutateEmployees,
  scopeLeaveViewEmployees,
  todayIsoLocal,
} from "../utils/resourceLeaveScope";
import { ConfirmDeleteDialog } from "./ConfirmDeleteDialog";
import { FilterSelect } from "./FilterSelect";
import { FilterSingleSelect } from "./FilterSingleSelect";
import { SortColHeader, useColumnSort } from "./SortColHeader";
import { TruncateText } from "./TruncateText";

type SortKey =
  | "leaveDate"
  | "employeeName"
  | "department"
  | "leaveType"
  | "classification"
  | "status";

export function ResourceLeavesModal({
  onClose,
  onChanged,
  allEmployees,
}: {
  onClose: () => void;
  onChanged?: () => void;
  allEmployees: Employee[];
}) {
  const { currentEmployee, isSuperAdmin } = useAuth();
  const { settings } = useSettings();
  const dateFmt = settings.dateFormat ?? "dd/MM/yyyy";
  const toast = useToast();

  const [rows, setRows] = useState<ResourceLeaveRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [addEmployee, setAddEmployee] = useState("");
  const [addDate, setAddDate] = useState(todayIsoLocal());
  const [addType, setAddType] = useState<"planned" | "unplanned">("planned");
  const [addReason, setAddReason] = useState("");

  const [qDate, setQDate] = useState("");
  const [qDept, setQDept] = useState("");
  const [qResource, setQResource] = useState("");
  const [qLeaveType, setQLeaveType] = useState("");
  const [qClass, setQClass] = useState("");
  const [qStatus, setQStatus] = useState("");

  const [editRow, setEditRow] = useState<ResourceLeaveRow | null>(null);
  const [editReason, setEditReason] = useState("");
  const [cancelTarget, setCancelTarget] = useState<ResourceLeaveRow | null>(null);

  const { sortKey, sortDir, handleSort } = useColumnSort<SortKey>("leaveDate", "desc");

  const viewEmployees = useMemo(
    () => scopeLeaveViewEmployees(allEmployees, currentEmployee, isSuperAdmin),
    [allEmployees, currentEmployee, isSuperAdmin]
  );
  const mutateEmployees = useMemo(
    () => scopeLeaveMutateEmployees(allEmployees, currentEmployee, isSuperAdmin),
    [allEmployees, currentEmployee, isSuperAdmin]
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await fetchResourceLeaves();
      setRows(list);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load leaves");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    let list = rows.filter((r) =>
      viewEmployees.some((e) => e.id === r.employeeHrmsId)
    );
    const dateQ = qDate.trim();
    const deptQ = qDept.trim().toLowerCase();
    const resQ = qResource.trim().toLowerCase();
    if (dateQ) list = list.filter((r) => r.leaveDate.includes(dateQ));
    if (deptQ) list = list.filter((r) => r.department.toLowerCase().includes(deptQ));
    if (resQ) {
      list = list.filter(
        (r) =>
          r.employeeName.toLowerCase().includes(resQ) ||
          r.employeeHrmsId.toLowerCase().includes(resQ)
      );
    }
    if (qLeaveType) list = list.filter((r) => r.leaveType === qLeaveType);
    if (qClass) list = list.filter((r) => r.classification === qClass);
    if (qStatus) list = list.filter((r) => r.status === qStatus);

    const mul = sortDir === "asc" ? 1 : -1;
    list = [...list].sort((a, b) => {
      let cmp = 0;
      if (sortKey === "leaveDate") cmp = a.leaveDate.localeCompare(b.leaveDate);
      else if (sortKey === "employeeName") cmp = a.employeeName.localeCompare(b.employeeName);
      else if (sortKey === "department") cmp = a.department.localeCompare(b.department);
      else if (sortKey === "leaveType") cmp = a.leaveType.localeCompare(b.leaveType);
      else if (sortKey === "classification") cmp = a.classification.localeCompare(b.classification);
      else cmp = a.status.localeCompare(b.status);
      return mul * cmp || a.id.localeCompare(b.id);
    });
    return list;
  }, [rows, viewEmployees, qDate, qDept, qResource, qLeaveType, qClass, qStatus, sortKey, sortDir]);

  const handleCreate = async () => {
    if (!addEmployee) {
      toast.error("Select a resource");
      return;
    }
    if (!addDate || !isLeaveDateAllowed(addDate)) {
      toast.error("Leave date must be today or a future date");
      return;
    }
    const reason = addReason.trim();
    if (!reason) {
      toast.error("Reason is required");
      return;
    }
    if (reason.length > 30) {
      toast.error("Reason must be at most 30 characters");
      return;
    }
    setBusy(true);
    try {
      await createResourceLeave({
        employeeHrmsId: addEmployee,
        leaveDate: addDate.slice(0, 10),
        leaveType: addType,
        reason,
      });
      toast.created();
      setAddReason("");
      await load();
      onChanged?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create leave");
    } finally {
      setBusy(false);
    }
  };

  const saveEditReason = async () => {
    if (!editRow) return;
    const reason = editReason.trim();
    if (!reason || reason.length > 30) {
      toast.error("Reason must be 1–30 characters");
      return;
    }
    setBusy(true);
    try {
      await updateResourceLeaveReason(editRow.id, reason);
      toast.updated();
      setEditRow(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update reason");
    } finally {
      setBusy(false);
    }
  };

  const confirmCancel = async () => {
    if (!cancelTarget) return;
    setBusy(true);
    try {
      await cancelResourceLeave(cancelTarget.id);
      toast.updated();
      setCancelTarget(null);
      await load();
      onChanged?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to cancel leave");
    } finally {
      setBusy(false);
    }
  };

  const mutateOptions = useMemo(
    () =>
      mutateEmployees
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((e) => ({ value: e.id, label: e.name })),
    [mutateEmployees]
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
      <div className="absolute inset-0 bg-brand/50" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="resource-leaves-title"
        className="relative z-10 flex h-[min(92vh,880px)] w-full max-w-[1180px] flex-col overflow-hidden rounded-xl bg-surface shadow-2xl"
      >
        <div className="flex flex-shrink-0 items-center justify-between border-b border-border-soft px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-accent-soft text-accent-softfg">
              <CalendarOff className="h-4 w-4" />
            </div>
            <div>
              <div id="resource-leaves-title" className="text-[15px] font-semibold text-foreground">
                Leaves
              </div>
              <div className="text-[12px] text-muted-foreground">
                Mark reportee availability — full-day leave only (not HRMS leave management)
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer rounded p-1 text-muted-foreground hover:bg-surface-alt hover:text-foreground"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-shrink-0 border-b border-border-soft bg-surface-alt/40 px-5 py-3">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Add leave
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[160px] flex-1">
              <label className="mb-1 block text-[11px] font-medium text-muted-foreground">Resource</label>
              <FilterSelect
                value={addEmployee}
                onChange={setAddEmployee}
                options={mutateOptions}
                placeholder="Select reportee…"
                aria-label="Resource for leave"
              />
            </div>
            <div className="w-[140px]">
              <label className="mb-1 block text-[11px] font-medium text-muted-foreground">Leave date</label>
              <input
                type="date"
                min={todayIsoLocal()}
                value={addDate}
                onChange={(e) => setAddDate(e.target.value)}
                className="w-full rounded-md border border-border bg-surface px-2.5 py-1.5 text-[12px] text-foreground outline-none focus:border-accent-line"
              />
            </div>
            <div className="w-[130px]">
              <label className="mb-1 block text-[11px] font-medium text-muted-foreground">Leave type</label>
              <FilterSingleSelect
                value={addType}
                onChange={(v) => setAddType(v as "planned" | "unplanned")}
                options={[
                  { value: "planned", label: "Planned" },
                  { value: "unplanned", label: "Unplanned" },
                ]}
                fullWidth
                aria-label="Leave type"
              />
            </div>
            <div className="min-w-[180px] flex-[2]">
              <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
                Reason <span className="text-danger">*</span>{" "}
                <span className="font-normal">(max 30)</span>
              </label>
              <input
                required
                maxLength={30}
                value={addReason}
                onChange={(e) => setAddReason(e.target.value)}
                placeholder="Reason…"
                className="w-full rounded-md border border-border bg-surface px-2.5 py-1.5 text-[12px] text-foreground outline-none focus:border-accent-line"
              />
            </div>
            <button
              type="button"
              disabled={busy || mutateOptions.length === 0 || !addReason.trim()}
              onClick={() => void handleCreate()}
              className={`flex items-center gap-1 rounded-md bg-primary px-3.5 py-1.5 text-[12px] font-medium text-primary-foreground ${
                busy || mutateOptions.length === 0 || !addReason.trim()
                  ? "cursor-not-allowed opacity-50"
                  : "cursor-pointer hover:opacity-95"
              }`}
            >
              <Plus className="h-3.5 w-3.5" /> Add Leave
            </button>
          </div>
          {mutateOptions.length === 0 && (
            <p className="mt-2 text-[11px] text-muted-foreground">
              You can view your own leave history but cannot enter leave for yourself — only for reportees.
            </p>
          )}
        </div>

        <div className="flex flex-shrink-0 flex-wrap items-center gap-2 border-b border-border-soft px-5 py-2.5">
          <input
            value={qDate}
            onChange={(e) => setQDate(e.target.value)}
            placeholder="Filter date…"
            className="h-8 w-[120px] rounded-md border border-border bg-surface px-2.5 text-[12px] outline-none focus:border-accent-line"
          />
          <input
            value={qDept}
            onChange={(e) => setQDept(e.target.value)}
            placeholder="Department…"
            className="h-8 w-[120px] rounded-md border border-border bg-surface px-2.5 text-[12px] outline-none focus:border-accent-line"
          />
          <div className="relative min-w-[140px] flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={qResource}
              onChange={(e) => setQResource(e.target.value)}
              placeholder="Resource…"
              className="h-8 w-full rounded-md border border-border bg-surface py-0 pl-8 pr-2.5 text-[12px] outline-none focus:border-accent-line"
            />
          </div>
          <FilterSingleSelect
            value={qLeaveType}
            onChange={setQLeaveType}
            options={[
              { value: "", label: "All types" },
              { value: "Planned", label: "Planned" },
              { value: "Unplanned", label: "Unplanned" },
            ]}
            aria-label="Filter leave type"
          />
          <FilterSingleSelect
            value={qClass}
            onChange={setQClass}
            options={[
              { value: "", label: "Neg / Zero" },
              { value: "Negative", label: "Negative" },
              { value: "Zero", label: "Zero" },
            ]}
            aria-label="Filter classification"
          />
          <FilterSingleSelect
            value={qStatus}
            onChange={setQStatus}
            options={[
              { value: "", label: "All status" },
              { value: "Active", label: "Active" },
              { value: "Cancelled", label: "Cancelled" },
            ]}
            aria-label="Filter status"
          />
        </div>

        <div className="min-h-0 flex-1 overflow-auto">
          {loading ? (
            <div className="px-5 py-12 text-center text-[13px] text-muted-foreground">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="px-5 py-12 text-center text-[13px] text-muted-foreground">
              No leave records match the filters.
            </div>
          ) : (
            <table className="w-full min-w-[960px] border-collapse text-left text-[12px]">
              <thead className="sticky top-0 z-[1] bg-surface-alt">
                <tr className="border-b border-border-soft text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2.5">
                    <SortColHeader label="LEAVE DATE" col="leaveDate" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                  </th>
                  <th className="px-3 py-2.5">
                    <SortColHeader label="RESOURCE" col="employeeName" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                  </th>
                  <th className="px-3 py-2.5">
                    <SortColHeader label="DEPARTMENT" col="department" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                  </th>
                  <th className="px-3 py-2.5">
                    <SortColHeader label="LEAVE TYPE" col="leaveType" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                  </th>
                  <th className="px-3 py-2.5">
                    <SortColHeader label="NEGATIVE / ZERO" col="classification" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                  </th>
                  <th className="px-3 py-2.5">REASON</th>
                  <th className="px-3 py-2.5">ENTERED BY</th>
                  <th className="px-3 py-2.5">ENTERED ON</th>
                  <th className="px-3 py-2.5">IMPACTED HRS</th>
                  <th className="px-3 py-2.5">
                    <SortColHeader label="STATUS" col="status" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                  </th>
                  <th className="px-3 py-2.5">ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id} className="border-b border-border-soft hover:bg-surface-alt/60">
                    <td className="px-3 py-2.5 whitespace-nowrap">{formatAppDate(r.leaveDate, dateFmt)}</td>
                    <td className="max-w-[140px] px-3 py-2.5 font-medium">
                      <TruncateText>{r.employeeName}</TruncateText>
                    </td>
                    <td className="max-w-[120px] px-3 py-2.5 text-muted-foreground">
                      <TruncateText>{r.department}</TruncateText>
                    </td>
                    <td className="px-3 py-2.5">{r.leaveType}</td>
                    <td className="px-3 py-2.5">
                      {r.classification === "Negative" ? (
                        <span className="inline-flex items-center rounded-sm border border-danger bg-danger-soft px-2 py-1 text-[12px] font-medium text-danger">
                          {r.classification}
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-sm border border-border bg-surface-alt px-2 py-1 text-[12px] text-muted-foreground">
                          {r.classification}
                        </span>
                      )}
                    </td>
                    <td className="max-w-[160px] px-3 py-2.5">
                      <TruncateText>{r.reason}</TruncateText>
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground">{r.enteredBy}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-muted-foreground">
                      {formatAppDateTime(r.enteredAt, dateFmt)}
                    </td>
                    <td className="px-3 py-2.5 tabular-nums">
                      {r.impactedPlannedHours > 0 ? r.impactedPlannedHours : "—"}
                    </td>
                    <td className="px-3 py-2.5">{r.status}</td>
                    <td className="px-3 py-2.5">
                      {r.canMutate && r.status === "Active" ? (
                        <div className="flex gap-2">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => {
                              setEditRow(r);
                              setEditReason(r.reason);
                            }}
                            className="inline-flex cursor-pointer items-center gap-1 text-[11px] text-primary hover:underline"
                          >
                            <Pencil className="h-3 w-3" /> Edit reason
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => setCancelTarget(r)}
                            className="cursor-pointer text-[11px] text-danger hover:underline"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <span className="text-[11px] text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {editRow && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-brand/40" onClick={() => setEditRow(null)} aria-hidden />
          <div className="relative z-10 w-full max-w-md rounded-lg border border-border bg-surface p-4 shadow-xl">
            <div className="mb-3 text-[14px] font-semibold text-foreground">
              Edit reason <span className="text-danger">*</span>
            </div>
            <input
              required
              maxLength={30}
              value={editReason}
              onChange={(e) => setEditReason(e.target.value)}
              className="mb-4 w-full rounded-md border border-border bg-surface px-2.5 py-1.5 text-[12px] outline-none focus:border-accent-line"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditRow(null)}
                className="cursor-pointer rounded-md border border-border px-3 py-1.5 text-[12px]"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy || !editReason.trim()}
                onClick={() => void saveEditReason()}
                className={`rounded-md bg-primary px-3 py-1.5 text-[12px] font-medium text-primary-foreground ${
                  busy || !editReason.trim()
                    ? "cursor-not-allowed opacity-50"
                    : "cursor-pointer"
                }`}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDeleteDialog
        open={Boolean(cancelTarget)}
        confirming={busy}
        onCancel={() => setCancelTarget(null)}
        onConfirm={() => void confirmCancel()}
      />
    </div>
  );
}
