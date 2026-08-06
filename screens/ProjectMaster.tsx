import { useState, useEffect, useRef, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { Plus, Search, X, AlertTriangle, Calendar, Trash2, Upload } from "lucide-react";
import { SortColHeader, useColumnSort } from "../components/SortColHeader";
import { FilterMultiSelect } from "../components/FilterMultiSelect";
import { createCustomer, createProject, fetchCustomers, updateProject } from "../api/domain";
import { useProjects } from "../context/ProjectsContext";
import { milestoneKindLabel, formatResourceDemand } from "../data/projects";
import { HEALTH_LABELS, HEALTH_OPTIONS } from "../data/executionReport";
import type { ProjectHealth } from "../data/executionReport";
import { milestonesForProjectType } from "../data/setup";
import type { Project, Milestone, ProjectStatus, ResourceDemandLine } from "../data/projects";
import { useMasters } from "../context/MastersContext";
import { useToast } from "../context/ToastContext";
import { useFocusFirstField } from "../hooks/useFocusFirstField";
import { matchesSearchQuery } from "../utils/textSearch";
import { formatAppDate } from "../utils/formatAppDate";
import { useAppDateFormat } from "../hooks/useAppDateFormat";

type Tab = "active" | "inactive";
type ProjectSortKey = "project" | "customer" | "kickoff" | "timeline" | "milestones" | "demand";

// ─── helpers ────────────────────────────────────────────────────────────────

function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline gap-1.5">
        <label className="text-[12px] font-medium text-foreground">{label}</label>
        {required && <span className="text-[12px] text-danger">*</span>}
        {hint && <span className="text-[11px] text-muted-foreground">· {hint}</span>}
      </div>
      {children}
    </div>
  );
}

function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-md px-3 py-1.5 text-[12px] font-medium ${
        active ? "bg-brand text-white" : "text-muted hover:bg-surface-alt"
      }`}
    >
      {children}
    </button>
  );
}

function TypeBadge({ type }: { type: Project["type"] }) {
  if (type === "paid") {
    return (
      <span className="rounded-sm bg-success-soft px-1.5 py-0.5 text-[10px] font-semibold text-success-fg">
        PAID
      </span>
    );
  }
  if (type === "poc") {
    return (
      <span className="rounded-sm bg-warning-soft px-1.5 py-0.5 text-[10px] font-semibold text-warning">
        POC
      </span>
    );
  }
  return (
    <span className="rounded-sm bg-accent-soft px-1.5 py-0.5 text-[10px] font-semibold text-accent-softfg">
      PRODUCT
    </span>
  );
}

function fmtDate(iso: string, pattern = "dd/MM/yyyy") {
  if (!iso) return "—";
  return formatAppDate(iso, pattern as "dd/MM/yyyy" | "MM/dd/yyyy" | "yyyy-MM-dd" | "dd-MMM-yyyy");
}

// ─── row ────────────────────────────────────────────────────────────────────

function ProjectRow({
  p,
  highlighted,
  onEdit,
  onToggle,
}: {
  p: Project;
  highlighted?: boolean;
  onEdit: () => void;
  onToggle: () => void;
}) {
  const { formatDate } = useAppDateFormat();
  const inactive = p.status === "inactive";
  const noMilestones = p.milestones.length === 0;

  return (
    <div
      id={`project-row-${p.id}`}
      className={`flex items-center border-b border-border-soft px-4 py-3 last:border-b-0 hover:bg-surface-alt ${
        inactive ? "opacity-60" : ""
      } ${highlighted ? "bg-accent-soft ring-1 ring-inset ring-accent-line" : ""}`}
    >
      {/* PROJECT */}
      <div className="w-[240px] min-w-0">
        <div className="flex items-center gap-2">
          <button
            onClick={onEdit}
            className="truncate text-[13px] font-medium text-foreground hover:text-primary"
          >
            {p.name}
          </button>
          <TypeBadge type={p.type} />
        </div>
        <div className="font-mono text-[11px] text-muted-foreground">{p.id}</div>
      </div>

      {/* CUSTOMER */}
      <div className="w-[140px] min-w-0">
        <div className="truncate text-[12px] text-foreground">{p.customer}</div>
        {p.poNumber.trim() && (
          <div className="truncate font-mono text-[11px] text-muted-foreground">{p.poNumber}</div>
        )}
      </div>

      {/* KICKOFF */}
      <div className="w-[100px] text-[12px] text-foreground">{formatDate(p.kickoffDate)}</div>

      {/* TIMELINE */}
      <div className="w-[160px] text-[12px] text-foreground">
        <span>{formatDate(p.startDate)}</span>
        <span className="mx-1 text-muted-foreground">–</span>
        <span>{formatDate(p.endDate)}</span>
      </div>

      {/* MILESTONES */}
      <div className="w-[180px]">
        {noMilestones ? (
          <div className="flex items-center gap-1 text-[11px] text-warning">
            <AlertTriangle className="h-3 w-3 flex-shrink-0" />
            <span>No milestones — allocations blocked</span>
          </div>
        ) : (
          <div className="flex flex-wrap gap-1">
            {p.milestones.slice(0, 2).map((m) => (
              <span
                key={m.id}
                className="rounded-sm bg-surface-alt px-1.5 py-0.5 text-[10px] text-muted"
              >
                {m.name}
              </span>
            ))}
            {p.milestones.length > 2 && (
              <span className="text-[10px] text-muted-foreground">
                +{p.milestones.length - 2}
              </span>
            )}
          </div>
        )}
      </div>

      {/* DEMAND */}
      <div className="flex-1 text-[12px] text-muted-foreground">
        {p.demand || <span className="text-muted">—</span>}
      </div>

      {/* ACTION */}
      <div className="w-[90px] text-right">
        <button
          onClick={onToggle}
          className={`text-[11px] ${
            inactive
              ? "text-success hover:underline"
              : "text-muted-foreground hover:text-danger hover:underline"
          }`}
        >
          {inactive ? "Reactivate" : "Disable"}
        </button>
      </div>
    </div>
  );
}

// ─── drawer ─────────────────────────────────────────────────────────────────

function ProjectDrawer({
  project,
  saving,
  onClose,
  onSave,
}: {
  project: Project | null;
  saving?: boolean;
  onClose: () => void;
  onSave: (project: Project) => void;
}) {
  const isEdit = !!project;
  const { skills: skillRows, activityMilestones } = useMasters();

  const [id, setId] = useState(project?.id ?? "");
  const [projectType, setProjectType] = useState<Project["type"]>(project?.type ?? "paid");
  const [name, setName] = useState(project?.name ?? "");
  const [customer, setCustomer] = useState(project?.customer ?? "");
  const [newCustomer, setNewCustomer] = useState("");
  const [addingCustomer, setAddingCustomer] = useState(false);
  const [addingCustomerBusy, setAddingCustomerBusy] = useState(false);
  const [poNumber, setPoNumber] = useState(project?.poNumber ?? "");
  const [approvedByName, setApprovedByName] = useState(project?.approvedByName ?? "");
  const [approvedByDate, setApprovedByDate] = useState(project?.approvedByDate ?? "");
  const [approvalSnapName, setApprovalSnapName] = useState(project?.approvedBySnap ?? "");
  const [approvalSnapPreview, setApprovalSnapPreview] = useState<string | null>(null);
  const [kickoffDate, setKickoffDate] = useState(project?.kickoffDate ?? "");
  const [startDate, setStartDate] = useState(project?.startDate ?? "");
  const [endDate, setEndDate] = useState(project?.endDate ?? "");
  const [demandLines, setDemandLines] = useState<ResourceDemandLine[]>(
    project?.demandLines ?? []
  );
  const [demandSkillDraft, setDemandSkillDraft] = useState<string[]>([]);
  const [demandCountDraft, setDemandCountDraft] = useState("1");
  const [health, setHealth] = useState<ProjectHealth>(project?.health ?? "green");
  const [healthRemarks, setHealthRemarks] = useState(project?.healthRemarks ?? "");
  const [milestones, setMilestones] = useState<Milestone[]>(
    project?.milestones ?? []
  );
  const [msCatalogId, setMsCatalogId] = useState("");
  const [msDate, setMsDate] = useState("");

  const [customerList, setCustomerList] = useState<string[]>(
    project?.customer ? [project.customer] : []
  );
  const [customersLoading, setCustomersLoading] = useState(true);
  const [customersError, setCustomersError] = useState<string | null>(null);
  const focusRef = useFocusFirstField<HTMLDivElement>();

  useEffect(() => {
    let cancelled = false;
    setCustomersLoading(true);
    setCustomersError(null);
    void fetchCustomers(false)
      .then((names) => {
        if (cancelled) return;
        const merged =
          project?.customer && !names.includes(project.customer)
            ? [project.customer, ...names]
            : names;
        setCustomerList(merged);
        setCustomer((prev) => {
          if (prev && merged.includes(prev)) return prev;
          if (project?.customer && merged.includes(project.customer)) return project.customer;
          return merged[0] ?? "";
        });
      })
      .catch((e) => {
        if (cancelled) return;
        setCustomersError(e instanceof Error ? e.message : "Failed to load customers");
      })
      .finally(() => {
        if (!cancelled) setCustomersLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [project?.customer]);

  const activeSkillNames = useMemo(
    () =>
      skillRows
        .filter((s) => s.status === "active")
        .map((s) => s.name)
        .sort((a, b) => a.localeCompare(b)),
    [skillRows]
  );

  const skillCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const skill of skillRows) {
      if (skill.status === "active") counts[skill.name] = skill.peopleCount;
    }
    return counts;
  }, [skillRows]);

  const catalogMilestones = milestonesForProjectType(projectType, activityMilestones).filter(
    (m) => !milestones.some((added) => added.name === m.name)
  );

  const toast = useToast();

  const addCustomer = async () => {
    const v = newCustomer.trim();
    if (!v || addingCustomerBusy) return;
    setAddingCustomerBusy(true);
    try {
      const saved = await createCustomer(v);
      setCustomerList((c) => (c.includes(saved) ? c : [...c, saved].sort((a, b) => a.localeCompare(b))));
      setCustomer(saved);
      setNewCustomer("");
      setAddingCustomer(false);
      setCustomersError(null);
      toast.created();
    } catch (e) {
      setCustomersError(e instanceof Error ? e.message : "Failed to add customer");
    } finally {
      setAddingCustomerBusy(false);
    }
  };

  const addMilestone = () => {
    const catalog = activityMilestones.find((m) => m.id === msCatalogId);
    if (!catalog) return;
    const newMs: Milestone = {
      id: `ms-${Date.now()}`,
      name: catalog.name,
      date: msDate,
      kind: catalog.kind,
    };
    setMilestones((m) => [...m, newMs]);
    setMsCatalogId("");
    setMsDate("");
  };

  const removeMilestone = (id: string) =>
    setMilestones((m) => m.filter((x) => x.id !== id));

  const addDemandLine = () => {
    if (demandSkillDraft.length === 0) return;
    const count = Number.parseInt(demandCountDraft, 10);
    if (!Number.isFinite(count) || count < 1) return;
    setDemandLines((lines) => [
      ...lines,
      {
        id: `rd-${Date.now()}`,
        skills: [...demandSkillDraft],
        count,
      },
    ]);
    setDemandSkillDraft([]);
    setDemandCountDraft("1");
  };

  const removeDemandLine = (lineId: string) =>
    setDemandLines((lines) => lines.filter((l) => l.id !== lineId));

  const attachApprovalSnap = (file: File | null) => {
    if (!file || !file.type.startsWith("image/")) return;
    setApprovalSnapName(file.name);
    const reader = new FileReader();
    reader.onload = () => setApprovalSnapPreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  const clearApprovalSnap = () => {
    setApprovalSnapName("");
    setApprovalSnapPreview(null);
  };

  const handleKickoffChange = (value: string) => {
    setKickoffDate(value);
    if (value && startDate && startDate < value) setStartDate(value);
    if (value && endDate && endDate < value) setEndDate(value);
  };

  const handleStartChange = (value: string) => {
    setStartDate(value);
    if (value && endDate && endDate < value) setEndDate(value);
  };

  const startMin = kickoffDate || undefined;
  const endMin = startDate || kickoffDate || undefined;
  const datesValid =
    !!kickoffDate &&
    !!startDate &&
    !!endDate &&
    endDate >= startDate &&
    startDate >= kickoffDate;

  const poRequired = projectType === "paid";
  const pocRequired = projectType === "poc";
  const pocComplete =
    approvedByName.trim().length > 0 &&
    !!approvedByDate &&
    !!approvalSnapName.trim();
  const healthRemarksRequired = health === "amber" || health === "red";
  const canSave =
    !!id.trim() &&
    !!name.trim() &&
    !!customer.trim() &&
    datesValid &&
    milestones.length > 0 &&
    (!poRequired || !!poNumber.trim()) &&
    (!pocRequired || pocComplete) &&
    (!healthRemarksRequired || !!healthRemarks.trim());

  const handleSave = () => {
    if (!canSave) return;
    onSave({
      id: id.trim(),
      name: name.trim(),
      customer,
      poNumber,
      type: projectType,
      approvedByName: pocRequired ? approvedByName.trim() : undefined,
      approvedByDate: pocRequired ? approvedByDate : undefined,
      approvedBySnap: pocRequired ? approvalSnapName.trim() : undefined,
      kickoffDate,
      startDate,
      endDate,
      milestones,
      demand: formatResourceDemand(demandLines),
      demandLines: demandLines.length > 0 ? demandLines : undefined,
      health,
      healthRemarks: healthRemarks.trim(),
      status: project?.status ?? "active",
    });
  };

  return (
    <div className="fixed inset-0 z-40">
      <div onClick={onClose} className="absolute inset-0 bg-brand/30" />
      <div ref={focusRef} className="absolute right-0 top-0 flex h-full w-[440px] flex-col bg-surface shadow-2xl">
        {/* header */}
        <div className="flex flex-shrink-0 items-center justify-between border-b border-border-soft px-5 py-4">
          <div className="text-[15px] font-semibold text-foreground">
            {isEdit ? "Edit project" : "Add project"}
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* body */}
        <div className="flex flex-1 flex-col gap-4 overflow-x-hidden overflow-y-auto px-5 py-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Project ID" required hint={isEdit ? undefined : "Unique"}>
              <input
                value={id}
                disabled={isEdit}
                onChange={(e) => setId(e.target.value)}
                className={`w-full rounded-md border border-border px-3 py-2 font-mono text-[13px] outline-none focus:border-accent-line ${
                  isEdit
                    ? "cursor-not-allowed bg-surface-alt text-muted"
                    : "bg-surface text-foreground"
                }`}
                placeholder="PRJ-019"
              />
            </Field>

            <Field label="Type" required>
              <select
                value={projectType}
                onChange={(e) => {
                  setProjectType(e.target.value as Project["type"]);
                  setMsCatalogId("");
                }}
                className="w-full rounded-md border border-border bg-surface px-3 py-2 text-[13px] text-foreground outline-none focus:border-accent-line"
              >
                <option value="paid">Paid</option>
                <option value="poc">POC</option>
                <option value="product">Product</option>
              </select>
            </Field>
          </div>

          <Field label="Project Name" required>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-md border border-border bg-surface px-3 py-2 text-[13px] text-foreground outline-none focus:border-accent-line"
              placeholder="e.g. Project Nova"
            />
          </Field>

          <Field label="Customer" required>
            <select
              value={customer}
              onChange={(e) => setCustomer(e.target.value)}
              disabled={customersLoading || customerList.length === 0}
              className="w-full cursor-pointer rounded-md border border-border bg-surface px-3 py-2 text-[13px] text-foreground outline-none focus:border-accent-line disabled:cursor-not-allowed disabled:opacity-60"
            >
              {customersLoading && customerList.length === 0 ? (
                <option value="">Loading customers…</option>
              ) : customerList.length === 0 ? (
                <option value="">No customers available</option>
              ) : (
                customerList.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))
              )}
            </select>
            {customersError && (
              <p className="mt-1 text-[11px] text-danger">{customersError}</p>
            )}
            {addingCustomer ? (
              <div className="mt-2 flex gap-2">
                <input
                  value={newCustomer}
                  onChange={(e) => setNewCustomer(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void addCustomer();
                    }
                  }}
                  disabled={addingCustomerBusy}
                  className="flex-1 rounded-md border border-border bg-surface px-3 py-1.5 text-[12px] text-foreground outline-none focus:border-accent-line"
                  placeholder="New customer name"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => void addCustomer()}
                  disabled={addingCustomerBusy || !newCustomer.trim()}
                  className="cursor-pointer rounded-md border border-accent-line px-3 text-[12px] text-primary hover:bg-accent-soft disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {addingCustomerBusy ? "Adding…" : "Add"}
                </button>
                <button
                  type="button"
                  onClick={() => setAddingCustomer(false)}
                  disabled={addingCustomerBusy}
                  className="cursor-pointer text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setAddingCustomer(true)}
                className="mt-1.5 cursor-pointer text-[11px] text-primary hover:underline"
              >
                + Add customer
              </button>
            )}
          </Field>

          {pocRequired && (
            <div className="rounded-md border border-border-soft bg-surface-alt px-3.5 py-3">
              <div className="flex flex-col gap-3">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Approved By" required>
                    <input
                      value={approvedByName}
                      onChange={(e) => setApprovedByName(e.target.value)}
                      className="w-full rounded-md border border-border bg-surface px-3 py-2 text-[13px] text-foreground outline-none focus:border-accent-line"
                      placeholder="Approver name"
                    />
                  </Field>
                  <Field label="Approved On" required>
                    <input
                      type="date"
                      value={approvedByDate}
                      onChange={(e) => setApprovedByDate(e.target.value)}
                      className="w-full rounded-md border border-border bg-surface px-3 py-2 text-[13px] text-foreground outline-none focus:border-accent-line [color-scheme:light]"
                    />
                  </Field>
                </div>
                <Field label="Email snap" required>
                    <label className="flex cursor-pointer flex-col items-center justify-center rounded-md border border-dashed border-border bg-surface px-3 py-3 text-center transition-colors hover:bg-surface-alt">
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => attachApprovalSnap(e.target.files?.[0] ?? null)}
                      />
                      {approvalSnapPreview ? (
                        <img
                          src={approvalSnapPreview}
                          alt="Approval snap"
                          className="max-h-16 max-w-full rounded-sm object-contain"
                        />
                      ) : (
                        <>
                          <Upload className="mb-1 h-4 w-4 text-muted-foreground" />
                          <span className="text-[11px] text-muted-foreground">Attach image</span>
                        </>
                      )}
                    </label>
                    {approvalSnapName && (
                      <div className="mt-1.5 flex items-center justify-between gap-2">
                        <span className="truncate text-[10px] text-muted-foreground">{approvalSnapName}</span>
                        <button
                          type="button"
                          onClick={clearApprovalSnap}
                          className="flex-shrink-0 text-[10px] text-danger hover:underline"
                        >
                          Remove
                        </button>
                      </div>
                    )}
                  </Field>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Field label="PO Number" required={poRequired}>
              <input
                value={poNumber}
                onChange={(e) => setPoNumber(e.target.value)}
                className="w-full rounded-md border border-border bg-surface px-3 py-2 text-[13px] text-foreground outline-none focus:border-accent-line"
                placeholder={poRequired ? "e.g. PO-2025-0012" : "Optional"}
              />
            </Field>
            <Field label="Kickoff date" required>
              <input
                type="date"
                value={kickoffDate}
                onChange={(e) => handleKickoffChange(e.target.value)}
                className="w-full rounded-md border border-border bg-surface px-3 py-2 text-[13px] text-foreground outline-none focus:border-accent-line [color-scheme:light]"
              />
            </Field>
            <Field label="Start date" required>
              <input
                type="date"
                value={startDate}
                min={startMin}
                onChange={(e) => handleStartChange(e.target.value)}
                className="w-full rounded-md border border-border bg-surface px-3 py-2 text-[13px] text-foreground outline-none focus:border-accent-line [color-scheme:light]"
              />
              {kickoffDate && startDate && startDate < kickoffDate && (
                <div className="mt-1 text-[11px] text-danger">Start date cannot be before kickoff.</div>
              )}
            </Field>
            <Field label="End date" required>
              <input
                type="date"
                value={endDate}
                min={endMin}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full rounded-md border border-border bg-surface px-3 py-2 text-[13px] text-foreground outline-none focus:border-accent-line [color-scheme:light]"
              />
              {startDate && endDate && endDate < startDate && (
                <div className="mt-1 text-[11px] text-danger">End date cannot be before start date.</div>
              )}
            </Field>
          </div>

          {/* milestones editor */}
          <div>
            <div className="mb-1.5 flex items-baseline gap-1.5">
              <label className="text-[12px] font-medium text-foreground">Milestones</label>
              <span className="text-[12px] text-danger">*</span>
            </div>

            {milestones.length > 0 && (
              <div className="mb-2 flex flex-col gap-1">
                {milestones.map((m) => (
                  <div
                    key={m.id}
                    className="flex items-center gap-2 rounded-md border border-border-soft bg-surface-alt px-3 py-2"
                  >
                    <Calendar className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
                    <div className="flex-1 min-w-0">
                      <div className="truncate text-[12px] text-foreground">{m.name}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {m.date ? fmtDate(m.date) : "No date"}
                        {m.kind ? ` · ${milestoneKindLabel(m.kind)}` : ""}
                      </div>
                    </div>
                    <button
                      onClick={() => removeMilestone(m.id)}
                      className="text-muted-foreground hover:text-danger"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex flex-col gap-2">
              {catalogMilestones.length === 0 && (
                <div className="text-[11px] text-muted-foreground">
                  No {projectType === "paid" ? "Paid" : projectType === "poc" ? "POC" : "Product"} milestones left — add them in Org → Activities.
                </div>
              )}
              <select
                value={msCatalogId}
                onChange={(e) => setMsCatalogId(e.target.value)}
                className="w-full min-w-0 rounded-md border border-border bg-surface px-3 py-2 text-[12px] text-foreground outline-none focus:border-accent-line"
              >
                <option value="">Select milestone…</option>
                {catalogMilestones.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} · {milestoneKindLabel(m.kind)}
                  </option>
                ))}
              </select>
              <div className="flex gap-2">
                <input
                  type="date"
                  value={msDate}
                  onChange={(e) => setMsDate(e.target.value)}
                  className="min-w-0 flex-1 rounded-md border border-border bg-surface px-3 py-2 text-[12px] text-foreground outline-none focus:border-accent-line"
                />
                <button
                  onClick={addMilestone}
                  disabled={!msCatalogId}
                  className="shrink-0 rounded-md border border-accent-line px-4 py-2 text-[12px] text-primary hover:bg-accent-soft disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Add
                </button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Project health" required hint="FR-147 portfolio">
              <select
                value={health}
                onChange={(e) => setHealth(e.target.value as ProjectHealth)}
                className="w-full cursor-pointer rounded-md border border-border bg-surface px-3 py-2 text-[13px] text-foreground outline-none focus:border-accent-line"
              >
                {HEALTH_OPTIONS.map((h) => (
                  <option key={h} value={h}>
                    {HEALTH_LABELS[h]}
                  </option>
                ))}
              </select>
            </Field>
            <div />
          </div>

          {(health === "amber" || health === "red") && (
            <Field label="Health remarks" required hint="Required for Amber / Red">
              <textarea
                value={healthRemarks}
                onChange={(e) => setHealthRemarks(e.target.value)}
                rows={2}
                className="w-full rounded-md border border-border bg-surface px-3 py-2 text-[13px] text-foreground outline-none focus:border-accent-line"
                placeholder="Reason for Amber or Red status"
              />
            </Field>
          )}

          <div>
            <div className="mb-1.5">
              <label className="text-[12px] font-medium text-foreground">Resource demand</label>
            </div>

            {demandLines.length > 0 && (
              <div className="mb-2 flex flex-col gap-1">
                {demandLines.map((line) => (
                  <div
                    key={line.id}
                    className="flex items-center gap-2 rounded-md border border-border-soft bg-surface-alt px-3 py-2"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-[12px] font-medium text-foreground">
                        {line.count}× {line.skills.join(", ")}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeDemandLine(line.id)}
                      className="text-muted-foreground hover:text-danger"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {demandLines.length === 0 && isEdit && project?.demand && (
              <p className="mb-2 text-[11px] text-muted-foreground">
                Current: {project.demand}
              </p>
            )}

            <div className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <FilterMultiSelect
                  items={activeSkillNames}
                  selected={demandSkillDraft}
                  onChange={setDemandSkillDraft}
                  counts={skillCounts}
                  allLabel="Select skills"
                  pluralLabel="skills"
                  emptyNeutral
                  fullWidth
                />
              </div>
              <input
                type="number"
                min={1}
                value={demandCountDraft}
                onChange={(e) => setDemandCountDraft(e.target.value)}
                className="w-16 shrink-0 rounded-md border border-border bg-surface px-2.5 py-1.5 text-[12px] text-foreground outline-none focus:border-accent-line"
                placeholder="Qty"
                aria-label="Number of resources"
              />
              <button
                type="button"
                onClick={addDemandLine}
                disabled={
                  demandSkillDraft.length === 0 ||
                  !Number.isFinite(Number.parseInt(demandCountDraft, 10)) ||
                  Number.parseInt(demandCountDraft, 10) < 1
                }
                className="shrink-0 rounded-md border border-accent-line px-4 py-1.5 text-[12px] text-primary hover:bg-accent-soft disabled:cursor-not-allowed disabled:opacity-40"
              >
                Add
              </button>
            </div>
          </div>
        </div>

        {/* footer */}
        <div className="flex flex-shrink-0 gap-2 border-t border-border-soft px-5 py-3.5">
          <button
            onClick={onClose}
            disabled={saving}
            className="flex-1 rounded-md border border-border py-2 text-[13px] text-foreground hover:bg-surface-alt disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!canSave || saving}
            className="flex-1 rounded-md bg-primary py-2 text-[13px] font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-40"
          >
            {saving ? "Saving…" : isEdit ? "Save changes" : "Create project"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── screen ─────────────────────────────────────────────────────────────────

export function ProjectMaster() {
  const [searchParams, setSearchParams] = useSearchParams();
  const highlightId = searchParams.get("highlight");
  const [flashId, setFlashId] = useState<string | null>(null);
  const scrolledRef = useRef<string | null>(null);

  const { projects: rows, refresh } = useProjects();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>("active");
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<Project | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const { sortKey, sortDir, handleSort } = useColumnSort<ProjectSortKey>("project");

  const filtered = rows.filter(
    (p) =>
      p.status === tab &&
      matchesSearchQuery(
        q,
        p.name,
        p.id,
        p.customer,
        p.poNumber,
        p.type,
        p.demand,
        p.health,
        ...(p.demandLines ?? []).flatMap((l) => [String(l.count), ...l.skills])
      )
  );

  const sorted = [...filtered].sort((a, b) => {
    const mul = sortDir === "asc" ? 1 : -1;

    if (sortKey === "project") {
      return mul * a.name.localeCompare(b.name);
    }
    if (sortKey === "customer") {
      return mul * a.customer.localeCompare(b.customer);
    }
    if (sortKey === "kickoff") {
      return mul * a.kickoffDate.localeCompare(b.kickoffDate);
    }
    if (sortKey === "timeline") {
      return mul * a.startDate.localeCompare(b.startDate);
    }
    if (sortKey === "milestones") {
      const diff = a.milestones.length - b.milestones.length;
      if (diff !== 0) return mul * diff;
      const ma = a.milestones[0]?.name ?? "";
      const mb = b.milestones[0]?.name ?? "";
      return mul * ma.localeCompare(mb);
    }
    return mul * (a.demand || "—").localeCompare(b.demand || "—");
  });

  const activeCount = rows.filter((p) => p.status === "active").length;
  const inactiveCount = rows.filter((p) => p.status === "inactive").length;

  useEffect(() => {
    if (!highlightId) return;
    const target = rows.find((p) => p.id === highlightId);
    if (!target) return;
    setTab(target.status);
    setFlashId(highlightId);
    const t = window.setTimeout(() => {
      setFlashId(null);
      setSearchParams({}, { replace: true });
    }, 4000);
    return () => window.clearTimeout(t);
  }, [highlightId, rows, setSearchParams]);

  useEffect(() => {
    if (!flashId || scrolledRef.current === flashId) return;
    const el = document.getElementById(`project-row-${flashId}`);
    if (el) {
      el.scrollIntoView({ block: "center", behavior: "smooth" });
      scrolledRef.current = flashId;
    }
  }, [flashId, sorted]);

  const openNew = () => {
    setSaveError(null);
    setEditing(null);
    setDrawerOpen(true);
  };
  const openEdit = (p: Project) => {
    setSaveError(null);
    setEditing(p);
    setDrawerOpen(true);
  };
  const toggleStatus = async (id: string) => {
    const project = rows.find((p) => p.id === id);
    if (!project) return;
    const next = (project.status === "active" ? "inactive" : "active") as ProjectStatus;
    try {
      await updateProject(id, { status: next });
      await refresh();
      toast.updated();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to update status");
    }
  };

  const toWriteBody = (saved: Project) => ({
    projectCode: saved.id,
    name: saved.name,
    customer: saved.customer,
    poNumber: saved.poNumber,
    type: saved.type,
    approvedByName: saved.approvedByName,
    approvedByDate: saved.approvedByDate,
    kickoffDate: saved.kickoffDate,
    startDate: saved.startDate,
    endDate: saved.endDate,
    demand: saved.demand,
    health: saved.health ?? "green",
    healthRemarks: saved.healthRemarks ?? "",
    status: saved.status,
    milestones: saved.milestones.map((m) => ({
      name: m.name,
      date: m.date,
      kind: m.kind,
    })),
    demandLines: (saved.demandLines ?? []).map((l) => ({
      skills: l.skills,
      count: l.count,
    })),
  });

  const saveProject = async (saved: Project) => {
    setSaving(true);
    setSaveError(null);
    try {
      if (editing) {
        await updateProject(saved.id, toWriteBody(saved));
        await refresh();
        setDrawerOpen(false);
        setEditing(null);
        toast.updated();
      } else {
        await createProject(toWriteBody(saved));
        await refresh();
        setDrawerOpen(false);
        setEditing(null);
        toast.created();
      }
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to save project");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <header className="flex h-14 flex-shrink-0 items-center justify-between border-b border-border bg-surface px-5">
        <div>
          <div className="text-[15px] font-semibold tracking-tight text-foreground">Projects</div>
          <div className="text-[12px] text-muted-foreground">
            {activeCount} active · {inactiveCount} inactive · Paid requires PO · POC requires approver details
          </div>
        </div>
        <button
          onClick={openNew}
          className="flex items-center gap-1.5 rounded-md bg-primary px-3.5 py-1.5 text-[12px] font-medium text-primary-foreground"
        >
          <Plus className="h-3.5 w-3.5" /> Add project
        </button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background p-5">
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border bg-surface">
          {/* toolbar */}
          <div className="flex flex-shrink-0 items-center justify-between border-b border-border-soft px-4 py-2.5">
            <div className="flex gap-1">
              <TabBtn active={tab === "active"} onClick={() => setTab("active")}>
                Active {activeCount}
              </TabBtn>
              <TabBtn active={tab === "inactive"} onClick={() => setTab("inactive")}>
                Inactive {inactiveCount}
              </TabBtn>
            </div>
            <div className="flex items-center gap-2 rounded-md border border-border px-2.5 py-1.5">
              <Search className="pointer-events-none h-3.5 w-3.5 text-muted-foreground" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search project or customer…"
                className="w-52 bg-transparent text-[12px] text-foreground outline-none placeholder:text-muted-foreground"
              />
            </div>
          </div>

          {/* column headers */}
          <div className="flex flex-shrink-0 border-b border-border-soft bg-surface-alt px-4 py-2 text-[11px] font-semibold text-muted">
            <SortColHeader
              label="PROJECT"
              col="project"
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={handleSort}
              className="w-[240px]"
            />
            <SortColHeader
              label="CUSTOMER"
              col="customer"
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={handleSort}
              className="w-[140px]"
            />
            <SortColHeader
              label="KICKOFF"
              col="kickoff"
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={handleSort}
              className="w-[100px]"
            />
            <SortColHeader
              label="TIMELINE"
              col="timeline"
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={handleSort}
              className="w-[160px]"
            />
            <SortColHeader
              label="MILESTONES"
              col="milestones"
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={handleSort}
              className="w-[180px]"
            />
            <SortColHeader
              label="DEMAND"
              col="demand"
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={handleSort}
              className="flex-1"
            />
            <div className="w-[90px] text-right">ACTION</div>
          </div>

          {/* rows */}
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            {sorted.map((p) => (
              <ProjectRow
                key={p.id}
                p={p}
                highlighted={flashId === p.id}
                onEdit={() => openEdit(p)}
                onToggle={() => toggleStatus(p.id)}
              />
            ))}
            {filtered.length === 0 && (
              <div className="px-4 py-10 text-center text-[12px] text-muted-foreground">
                No projects match.
              </div>
            )}
          </div>
        </div>
      </div>

      {saveError && (
        <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-md border border-danger/30 bg-surface px-4 py-2 text-[12px] text-danger shadow-lg">
          {saveError}
        </div>
      )}

      {drawerOpen && (
        <ProjectDrawer
          project={editing}
          saving={saving}
          onClose={() => setDrawerOpen(false)}
          onSave={saveProject}
        />
      )}
    </div>
  );
}
