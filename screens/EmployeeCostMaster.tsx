import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Search, X } from "lucide-react";
import {
  createEmployeeCost,
  fetchEmployeeCosts,
  updateEmployeeCost,
  type EmployeeCostRow,
} from "../api/domain";
import { FilterSelect } from "../components/FilterSelect";
import { FilterSingleSelect } from "../components/FilterSingleSelect";
import { SortColHeader, useColumnSort } from "../components/SortColHeader";
import { TruncateText } from "../components/TruncateText";
import { useEmployees } from "../context/EmployeesContext";
import { useSettings } from "../context/SettingsContext";
import { useToast } from "../context/ToastContext";
import { useAppDateFormat } from "../hooks/useAppDateFormat";
import { useFocusFirstField } from "../hooks/useFocusFirstField";
import { matchesSearchQuery } from "../utils/textSearch";
import { todayISO } from "../utils/date";

type Tab = "active" | "inactive";

function inr(n: number): string {
  return `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function EmployeeCostMaster() {
  const toast = useToast();
  const { formatDate } = useAppDateFormat();
  const { employees } = useEmployees();
  const [rows, setRows] = useState<EmployeeCostRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("active");
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<EmployeeCostRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await fetchEmployeeCosts(true));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load employee costs");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const { sortKey, sortDir, handleSort } = useColumnSort<"name" | "effective" | "rate">("name");

  const filtered = useMemo(() => {
    const list = rows.filter(
      (r) =>
        (tab === "active" ? r.status === "active" : r.status === "inactive") &&
        matchesSearchQuery(q, r.employeeName, r.hrmsId, String(r.costPerMinute))
    );
    const mul = sortDir === "asc" ? 1 : -1;
    return [...list].sort((a, b) => {
      if (sortKey === "rate") return mul * (a.costPerMinute - b.costPerMinute);
      if (sortKey === "effective") return mul * a.effectiveFrom.localeCompare(b.effectiveFrom);
      return mul * a.employeeName.localeCompare(b.employeeName);
    });
  }, [rows, tab, q, sortKey, sortDir]);

  const employeeOptions = useMemo(
    () =>
      employees
        // Same rule as Performance Card / Access Rights / KPI: platform Administrator is not a costed resource.
        .filter((e) => e.status === "active" && !e.isSuperAdmin)
        .map((e) => ({ value: e.id, label: `${e.name} (${e.id})` }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [employees]
  );

  const openCreate = () => {
    setEditing(null);
    setCreating(true);
  };

  const toggleStatus = async (row: EmployeeCostRow) => {
    const next = row.status === "active" ? "inactive" : "active";
    try {
      await updateEmployeeCost(row.id, { status: next });
      toast.success(next === "active" ? "Cost record activated" : "Cost record deactivated");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <header className="flex h-14 flex-shrink-0 items-center justify-between gap-3 border-b border-border bg-surface px-5">
        <div>
          <div className="text-[15px] font-semibold text-foreground">Employee Cost</div>
          <div className="text-[12px] text-muted-foreground">
            Effective-dated cost per minute for Cost Analyzer
          </div>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex cursor-pointer items-center gap-1.5 rounded-md bg-brand px-3 py-1.5 text-[12px] font-medium text-white hover:opacity-90"
        >
          <Plus className="h-3.5 w-3.5" />
          Add cost
        </button>
      </header>

      <div className="flex flex-wrap items-center gap-2 border-b border-border-soft bg-surface px-5 py-2">
        <div className="flex rounded-md border border-border text-[12px]">
          {(["active", "inactive"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`cursor-pointer px-3 py-1.5 capitalize ${
                tab === t ? "bg-brand text-white" : "bg-surface text-muted hover:bg-surface-alt"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search employee…"
            className="w-full rounded-md border border-border bg-surface py-1.5 pl-8 pr-3 text-[12px]"
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto bg-background p-4">
        {loading ? (
          <div className="py-16 text-center text-[12px] text-muted-foreground">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-[12px] text-muted-foreground">No cost records.</div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-border bg-surface">
            <div className="grid grid-cols-[minmax(0,1.4fr)_100px_120px_110px_84px] border-b border-border-soft bg-surface-alt px-4 py-2 text-[11px] font-semibold text-muted">
              <SortColHeader label="EMPLOYEE" col="name" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
              <div>HRMS</div>
              <SortColHeader
                label="COST / MIN"
                col="rate"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={handleSort}
              />
              <SortColHeader
                label="EFFECTIVE"
                col="effective"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={handleSort}
              />
              <div className="text-right">Actions</div>
            </div>
            {filtered.map((r) => (
              <div
                key={r.id}
                className="grid cursor-pointer grid-cols-[minmax(0,1.4fr)_100px_120px_110px_84px] items-center border-b border-border-soft px-4 py-2.5 hover:bg-surface-alt/60"
                onClick={() => {
                  setEditing(r);
                  setCreating(true);
                }}
              >
                <TruncateText className="text-[13px] font-medium text-foreground">{r.employeeName}</TruncateText>
                <div className="text-[12px] tabular-nums text-muted-foreground">{r.hrmsId}</div>
                <div className="text-[12px] font-medium tabular-nums">{inr(r.costPerMinute)}</div>
                <div className="text-[12px] tabular-nums text-muted-foreground">
                  {formatDate(r.effectiveFrom)}
                </div>
                <div className="text-right">
                  <button
                    type="button"
                    className="cursor-pointer text-[11px] font-medium text-brand hover:underline"
                    onClick={(e) => {
                      e.stopPropagation();
                      void toggleStatus(r);
                    }}
                  >
                    {r.status === "active" ? "Deactivate" : "Activate"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {creating && (
        <EmployeeCostForm
          row={editing}
          employeeOptions={employeeOptions}
          saving={saving}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSave={async (payload) => {
            setSaving(true);
            try {
              if (editing) {
                await updateEmployeeCost(editing.id, {
                  costPerMinute: payload.costPerMinute,
                  effectiveFrom: payload.effectiveFrom,
                  status: payload.status,
                });
                toast.success("Cost record updated");
              } else {
                await createEmployeeCost(payload);
                toast.success("Cost record created");
              }
              setCreating(false);
              setEditing(null);
              await load();
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Save failed");
            } finally {
              setSaving(false);
            }
          }}
        />
      )}
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline gap-1.5">
        <label className="text-[12px] font-medium text-foreground">{label}</label>
        {required && <span className="text-[12px] text-danger">*</span>}
      </div>
      {children}
    </div>
  );
}

function EmployeeCostForm({
  row,
  employeeOptions,
  saving,
  onClose,
  onSave,
}: {
  row: EmployeeCostRow | null;
  employeeOptions: Array<{ value: string; label: string }>;
  saving: boolean;
  onClose: () => void;
  onSave: (payload: {
    hrmsId: string;
    costPerMinute: number;
    effectiveFrom: string;
    status: "active" | "inactive";
  }) => Promise<void>;
}) {
  const formRef = useFocusFirstField<HTMLDivElement>();
  const { settings } = useSettings();
  const [hrmsId, setHrmsId] = useState(row?.hrmsId ?? "");
  const [costPerMinute, setCostPerMinute] = useState(
    row ? String(row.costPerMinute) : ""
  );
  const [effectiveFrom, setEffectiveFrom] = useState(row?.effectiveFrom ?? todayISO());
  const [status, setStatus] = useState<"active" | "inactive">(row?.status ?? "active");

  const canSave = Boolean(hrmsId && costPerMinute && effectiveFrom);

  const hoursPerDay =
    settings.workingHoursPerDay > 0 ? settings.workingHoursPerDay : 8;
  const rate = Number(costPerMinute);
  const dailyCost =
    Number.isFinite(rate) && rate >= 0 ? round2(rate * 60 * hoursPerDay) : null;
  const dailyCostLabel =
    dailyCost == null
      ? "__.__"
      : dailyCost.toLocaleString("en-IN", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        });

  return (
    <div className="fixed inset-0 z-40">
      <div
        onClick={() => !saving && onClose()}
        className="absolute inset-0 bg-brand/30"
        aria-hidden
      />
      <div
        ref={formRef}
        role="dialog"
        aria-label={row ? "Edit employee cost" : "Add employee cost"}
        className="absolute right-0 top-0 flex h-full w-[440px] flex-col bg-surface shadow-2xl"
      >
        <div className="flex flex-shrink-0 items-center justify-between border-b border-border-soft px-5 py-4">
          <div className="text-[15px] font-semibold text-foreground">
            {row ? "Edit employee cost" : "Add employee cost"}
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="cursor-pointer text-muted-foreground hover:text-foreground disabled:opacity-40"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-5 py-4">
          <Field label="Employee" required>
            <FilterSelect
              value={hrmsId}
              onChange={setHrmsId}
              options={employeeOptions}
              disabled={Boolean(row) || saving}
              placeholder="Select employee"
            />
          </Field>
          <Field label="Cost per minute (INR)" required>
            <input
              type="number"
              min={0}
              step="0.01"
              value={costPerMinute}
              disabled={saving}
              onChange={(e) => setCostPerMinute(e.target.value)}
              className="w-full rounded-md border border-border bg-surface px-3 py-2 text-[13px] text-foreground outline-none focus:border-accent-line disabled:opacity-60"
            />
          </Field>
          <Field label="Effective from" required>
            <input
              type="date"
              value={effectiveFrom}
              disabled={saving}
              onChange={(e) => setEffectiveFrom(e.target.value)}
              className="w-full rounded-md border border-border bg-surface px-3 py-2 text-[13px] text-foreground outline-none focus:border-accent-line disabled:opacity-60"
            />
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              Employee daily cost at {dailyCostLabel} Rs
            </p>
          </Field>
          <Field label="Status">
            <FilterSingleSelect
              value={status}
              onChange={(v) => setStatus(v as "active" | "inactive")}
              disabled={saving}
              fullWidth
              options={[
                { value: "active", label: "Active" },
                { value: "inactive", label: "Inactive" },
              ]}
            />
          </Field>
        </div>

        <div className="flex flex-shrink-0 gap-2 border-t border-border-soft px-5 py-3.5">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="flex-1 cursor-pointer rounded-md border border-border py-2 text-[13px] text-foreground hover:bg-surface-alt disabled:cursor-not-allowed disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={saving || !canSave}
            onClick={() =>
              void onSave({
                hrmsId,
                costPerMinute: Number(costPerMinute),
                effectiveFrom,
                status,
              })
            }
            className={`flex-1 cursor-pointer rounded-md bg-primary py-2 text-[13px] font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-40 ${
              !canSave && !saving ? "opacity-40" : ""
            }`}
          >
            {saving ? "Saving…" : row ? "Save changes" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
