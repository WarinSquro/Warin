import { useState, useEffect, useRef, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { Plus, Search, X, AlertTriangle, Calendar, Trash2, Upload } from "lucide-react";
import { SortColHeader, useColumnSort } from "../components/SortColHeader";
import { FilterMultiSelect } from "../components/FilterMultiSelect";
import {
  ReportColumnPicker,
  type ReportColumnOption,
} from "../components/ReportColumnPicker";
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
import { usePauseSharedDataSync } from "../hooks/useSharedDataSync";
import {
  decodeApprovalSnap,
  encodeApprovalSnap,
} from "../utils/approvalSnap";

type Tab = "active" | "inactive";
type ProjectColId =
  | "project"
  | "customer"
  | "kickoff"
  | "timeline"
  | "milestones"
  | "demand"
  | "createdAt"
  | "modifiedAt"
  | "createdBy"
  | "modifiedBy"
  | "action";
type ProjectSortKey = Extract<
  ProjectColId,
  "project" | "customer" | "kickoff" | "timeline" | "milestones" | "demand"
>;

type ProjectColumnDef = ReportColumnOption & {
  id: ProjectColId;
  width: string;
  sortable?: boolean;
};

/** All list columns — picker + grid (Daily Work Detail pattern). */
const PROJECT_COLUMNS: ProjectColumnDef[] = [
  // fr tracks fill the card width by default (no forced horizontal scroll).
  { id: "project", label: "PROJECT", defaultVisible: true, width: "minmax(0,1.55fr)", sortable: true },
  { id: "customer", label: "CUSTOMER", defaultVisible: true, width: "minmax(0,1.05fr)", sortable: true },
  { id: "kickoff", label: "KICKOFF", defaultVisible: true, width: "minmax(0,0.72fr)", sortable: true },
  { id: "timeline", label: "TIMELINE", defaultVisible: true, width: "minmax(0,1.1fr)", sortable: true },
  { id: "milestones", label: "MILESTONES", defaultVisible: true, width: "minmax(0,1.25fr)", sortable: true },
  { id: "demand", label: "DEMAND", defaultVisible: true, width: "minmax(0,1.05fr)", sortable: true },
  {
    id: "createdAt",
    label: "Project created date & time",
    defaultVisible: false,
    width: "minmax(9rem,0.95fr)",
  },
  {
    id: "modifiedAt",
    label: "Updated date & time",
    defaultVisible: false,
    width: "minmax(9rem,0.95fr)",
  },
  { id: "createdBy", label: "Created by", defaultVisible: false, width: "minmax(7rem,0.85fr)" },
  { id: "modifiedBy", label: "Updated by", defaultVisible: false, width: "minmax(7rem,0.85fr)" },
  {
    id: "action",
    label: "ACTION",
    defaultVisible: true,
    locked: true,
    width: "5.5rem",
  },
];

const PROJECT_AUDIT_COL_IDS = new Set<ProjectColId>([
  "createdAt",
  "modifiedAt",
  "createdBy",
  "modifiedBy",
]);

function defaultProjectVisibleColumns(): Set<string> {
  return new Set(PROJECT_COLUMNS.filter((c) => c.defaultVisible || c.locked).map((c) => c.id));
}

function projectHasExtraColumns(visibleCols: ProjectColumnDef[]): boolean {
  return visibleCols.some((c) => PROJECT_AUDIT_COL_IDS.has(c.id));
}

function ensureLockedProjectColumns(visible: Set<string>): Set<string> {
  const next = new Set(visible);
  for (const col of PROJECT_COLUMNS) {
    if (col.locked) next.add(col.id);
  }
  return next;
}

function projectHeaderLabel(col: ProjectColumnDef): string {
  switch (col.id) {
    case "createdAt":
      return "CREATED";
    case "modifiedAt":
      return "UPDATED";
    case "createdBy":
      return "CREATED BY";
    case "modifiedBy":
      return "UPDATED BY";
    default:
      return col.label;
  }
}

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

function ProjectCell({
  colId,
  p,
  stackDates,
  onEdit,
  onToggle,
}: {
  colId: ProjectColId;
  p: Project;
  /** When true (extra Columns selected), date ranges / date-times wrap to two lines. */
  stackDates: boolean;
  onEdit: () => void;
  onToggle: () => void;
}) {
  const { formatDate, formatTime, formatDateTime } = useAppDateFormat();
  const inactive = p.status === "inactive";
  const noMilestones = p.milestones.length === 0;

  switch (colId) {
    case "project":
      return (
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <button
              type="button"
              onClick={onEdit}
              className="min-w-0 truncate text-left text-[13px] font-medium text-foreground hover:text-primary"
            >
              {p.name}
            </button>
            <TypeBadge type={p.type} />
          </div>
          <div className="font-mono text-[11px] text-muted-foreground">{p.id}</div>
        </div>
      );
    case "customer":
      return (
        <div className="min-w-0">
          <div className="truncate text-[12px] text-foreground">{p.customer}</div>
          {p.poNumber.trim() && (
            <div className="truncate font-mono text-[11px] text-muted-foreground">{p.poNumber}</div>
          )}
        </div>
      );
    case "kickoff":
      return <div className="text-[12px] text-foreground">{formatDate(p.kickoffDate)}</div>;
    case "timeline":
      return stackDates ? (
        <div className="min-w-0 text-[12px] leading-snug text-foreground">
          <div>{formatDate(p.startDate)}</div>
          <div>
            <span className="text-muted-foreground">– </span>
            {formatDate(p.endDate)}
          </div>
        </div>
      ) : (
        <div className="truncate text-[12px] text-foreground">
          <span>{formatDate(p.startDate)}</span>
          <span className="mx-1 text-muted-foreground">–</span>
          <span>{formatDate(p.endDate)}</span>
        </div>
      );
    case "milestones":
      return noMilestones ? (
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
            <span className="text-[10px] text-muted-foreground">+{p.milestones.length - 2}</span>
          )}
        </div>
      );
    case "demand":
      return (
        <div className="truncate text-[12px] text-muted-foreground">
          {p.demand || <span className="text-muted">—</span>}
        </div>
      );
    case "createdAt":
      if (!p.createdAt) return <div className="text-[12px] text-muted">—</div>;
      return stackDates ? (
        <div className="min-w-0 text-[12px] leading-snug text-foreground">
          <div>{formatDate(p.createdAt)}</div>
          <div className="text-muted-foreground">{formatTime(p.createdAt)}</div>
        </div>
      ) : (
        <div className="truncate text-[12px] text-foreground">{formatDateTime(p.createdAt)}</div>
      );
    case "modifiedAt":
      if (!p.modifiedAt) return <div className="text-[12px] text-muted">—</div>;
      return stackDates ? (
        <div className="min-w-0 text-[12px] leading-snug text-foreground">
          <div>{formatDate(p.modifiedAt)}</div>
          <div className="text-muted-foreground">{formatTime(p.modifiedAt)}</div>
        </div>
      ) : (
        <div className="truncate text-[12px] text-foreground">{formatDateTime(p.modifiedAt)}</div>
      );
    case "createdBy":
      return (
        <div className="truncate text-[12px] text-foreground">
          {p.createdByName?.trim() || "—"}
        </div>
      );
    case "modifiedBy":
      return (
        <div className="truncate text-[12px] text-foreground">
          {p.modifiedByName?.trim() || "—"}
        </div>
      );
    case "action":
      return (
        <div className="text-right">
          <button
            type="button"
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
      );
    default:
      return null;
  }
}

function ProjectRow({
  p,
  highlighted,
  visibleCols,
  gridTemplate,
  onEdit,
  onToggle,
}: {
  p: Project;
  highlighted?: boolean;
  visibleCols: ProjectColumnDef[];
  gridTemplate: string;
  onEdit: () => void;
  onToggle: () => void;
}) {
  const inactive = p.status === "inactive";
  const stackDates = projectHasExtraColumns(visibleCols);

  return (
    <div
      id={`project-row-${p.id}`}
      className={`grid w-full items-center gap-x-3 border-b border-border-soft px-4 py-3 last:border-b-0 hover:bg-surface-alt ${
        inactive ? "opacity-60" : ""
      } ${highlighted ? "bg-accent-soft ring-1 ring-inset ring-accent-line" : ""}`}
      style={{ gridTemplateColumns: gridTemplate }}
    >
      {visibleCols.map((col) => (
        <ProjectCell
          key={col.id}
          colId={col.id}
          p={p}
          stackDates={stackDates}
          onEdit={onEdit}
          onToggle={onToggle}
        />
      ))}
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
  /** On edit, identity / commercial / timeline fields are locked. */
  const coreLocked = isEdit;
  const coreInputClass = coreLocked
    ? "cursor-not-allowed bg-surface-alt text-muted"
    : "bg-surface text-foreground";
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
  const initialSnap = decodeApprovalSnap(project?.approvedBySnap);
  const [approvalSnapName, setApprovalSnapName] = useState(initialSnap.name);
  const [approvalSnapPreview, setApprovalSnapPreview] = useState<string | null>(
    initialSnap.dataUrl
  );
  const [snapViewerOpen, setSnapViewerOpen] = useState(false);
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

  /** Skills already on a demand line cannot be added again. */
  const usedDemandSkills = useMemo(
    () => new Set(demandLines.flatMap((l) => l.skills)),
    [demandLines]
  );

  const availableDemandSkills = useMemo(
    () => activeSkillNames.filter((s) => !usedDemandSkills.has(s)),
    [activeSkillNames, usedDemandSkills]
  );

  useEffect(() => {
    setDemandSkillDraft((prev) => {
      const next = prev.filter((s) => !usedDemandSkills.has(s));
      return next.length === prev.length ? prev : next;
    });
  }, [usedDemandSkills]);

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
    const skills = demandSkillDraft.filter((s) => !usedDemandSkills.has(s));
    if (skills.length === 0) return;
    const count = Number.parseInt(demandCountDraft, 10);
    if (!Number.isFinite(count) || count < 1) return;
    setDemandLines((lines) => [
      ...lines,
      {
        id: `rd-${Date.now()}`,
        skills,
        count,
      },
    ]);
    setDemandSkillDraft([]);
    setDemandCountDraft("1");
  };

  const removeDemandLine = (lineId: string) =>
    setDemandLines((lines) => lines.filter((l) => l.id !== lineId));

  const snapInputRef = useRef<HTMLInputElement>(null);

  const attachApprovalSnap = (file: File | null) => {
    if (!file) return;
    const byMime = file.type.startsWith("image/");
    const byExt = /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(file.name);
    if (!byMime && !byExt) {
      toast.error("Please choose an image file (PNG, JPG, etc.)");
      return;
    }
    setApprovalSnapName(file.name);
    const reader = new FileReader();
    reader.onerror = () => {
      toast.error("Could not read image file");
      setApprovalSnapName("");
      setApprovalSnapPreview(null);
    };
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === "string" && result.startsWith("data:")) {
        setApprovalSnapPreview(result);
      } else {
        toast.error("Could not read image file");
        setApprovalSnapName("");
        setApprovalSnapPreview(null);
      }
    };
    reader.readAsDataURL(file);
  };

  const clearApprovalSnap = () => {
    setApprovalSnapName("");
    setApprovalSnapPreview(null);
    setSnapViewerOpen(false);
    if (snapInputRef.current) snapInputRef.current.value = "";
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
    (!!approvalSnapPreview || !!approvalSnapName.trim());
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
      approvedBySnap: pocRequired
        ? approvalSnapPreview
          ? encodeApprovalSnap(approvalSnapName || "Email snap", approvalSnapPreview)
          : approvalSnapName.trim() || undefined
        : undefined,
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
                disabled={coreLocked}
                onChange={(e) => setId(e.target.value)}
                className={`w-full rounded-md border border-border px-3 py-2 font-mono text-[13px] outline-none focus:border-accent-line ${coreInputClass}`}
                placeholder="PRJ-019"
              />
            </Field>

            <Field label="Type" required>
              <select
                value={projectType}
                disabled={coreLocked}
                onChange={(e) => {
                  setProjectType(e.target.value as Project["type"]);
                  // Catalog milestones differ by type — clear any already-added lines.
                  setMilestones([]);
                  setMsCatalogId("");
                  setMsDate("");
                }}
                className={`w-full rounded-md border border-border px-3 py-2 text-[13px] outline-none focus:border-accent-line ${
                  coreLocked
                    ? "cursor-not-allowed bg-surface-alt text-muted"
                    : "cursor-pointer bg-surface text-foreground"
                }`}
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
              disabled={coreLocked}
              onChange={(e) => setName(e.target.value)}
              className={`w-full rounded-md border border-border px-3 py-2 text-[13px] outline-none focus:border-accent-line ${coreInputClass}`}
              placeholder="e.g. Project Nova"
            />
          </Field>

          <Field label="Customer" required>
            <select
              value={customer}
              onChange={(e) => setCustomer(e.target.value)}
              disabled={coreLocked || customersLoading || customerList.length === 0}
              className={`w-full rounded-md border border-border px-3 py-2 text-[13px] outline-none focus:border-accent-line disabled:cursor-not-allowed disabled:opacity-60 ${
                coreLocked
                  ? "bg-surface-alt text-muted"
                  : "cursor-pointer bg-surface text-foreground"
              }`}
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
            {!coreLocked &&
              (addingCustomer ? (
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
            ))}
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
                    <input
                      ref={snapInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/jpg,image/gif,image/webp,image/bmp,.png,.jpg,.jpeg,.gif,.webp,.bmp"
                      className="sr-only"
                      tabIndex={-1}
                      onChange={(e) => {
                        const file = e.target.files?.[0] ?? null;
                        attachApprovalSnap(file);
                        // Allow re-selecting the same file later
                        e.target.value = "";
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => snapInputRef.current?.click()}
                      className="flex w-full cursor-pointer flex-col items-center justify-center rounded-md border border-dashed border-border bg-surface px-3 py-3 text-center transition-colors hover:bg-surface-alt"
                    >
                      {approvalSnapPreview ? (
                        <img
                          src={approvalSnapPreview}
                          alt="Approval snap"
                          className="max-h-16 max-w-full rounded-sm object-contain"
                        />
                      ) : approvalSnapName ? (
                        <>
                          <Upload className="mb-1 h-4 w-4 text-muted-foreground" />
                          <span className="text-[11px] text-foreground">{approvalSnapName}</span>
                          <span className="mt-0.5 text-[10px] text-muted-foreground">
                            Preview unavailable — click to re-attach
                          </span>
                        </>
                      ) : (
                        <>
                          <Upload className="mb-1 h-4 w-4 text-muted-foreground" />
                          <span className="text-[11px] text-muted-foreground">Attach image</span>
                        </>
                      )}
                    </button>
                    {(approvalSnapName || approvalSnapPreview) && (
                      <div className="mt-1.5 flex items-center justify-between gap-2">
                        <span className="truncate text-[10px] text-muted-foreground">
                          {approvalSnapName || "Email snap"}
                        </span>
                        <div className="flex shrink-0 items-center gap-2.5">
                          {approvalSnapPreview && (
                            <button
                              type="button"
                              onClick={() => setSnapViewerOpen(true)}
                              className="cursor-pointer text-[10px] text-primary hover:underline"
                            >
                              View
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={clearApprovalSnap}
                            className="cursor-pointer text-[10px] text-danger hover:underline"
                          >
                            Remove
                          </button>
                        </div>
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
                disabled={coreLocked}
                onChange={(e) => setPoNumber(e.target.value)}
                className={`w-full rounded-md border border-border px-3 py-2 text-[13px] outline-none focus:border-accent-line ${coreInputClass}`}
                placeholder={poRequired ? "e.g. PO-2025-0012" : "Optional"}
              />
            </Field>
            <Field label="Kickoff date" required>
              <input
                type="date"
                value={kickoffDate}
                disabled={coreLocked}
                onChange={(e) => handleKickoffChange(e.target.value)}
                className={`w-full rounded-md border border-border px-3 py-2 text-[13px] outline-none focus:border-accent-line [color-scheme:light] ${coreInputClass}`}
              />
            </Field>
            <Field label="Start date" required>
              <input
                type="date"
                value={startDate}
                min={startMin}
                disabled={coreLocked}
                onChange={(e) => handleStartChange(e.target.value)}
                className={`w-full rounded-md border border-border px-3 py-2 text-[13px] outline-none focus:border-accent-line [color-scheme:light] ${coreInputClass}`}
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
                disabled={coreLocked}
                onChange={(e) => setEndDate(e.target.value)}
                className={`w-full rounded-md border border-border px-3 py-2 text-[13px] outline-none focus:border-accent-line [color-scheme:light] ${coreInputClass}`}
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
            <Field label="Project health" required>
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
                  items={availableDemandSkills}
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
                  availableDemandSkills.length === 0 ||
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

      {snapViewerOpen && approvalSnapPreview && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-6">
          <div
            className="absolute inset-0 bg-brand/70"
            onClick={() => setSnapViewerOpen(false)}
          />
          <div className="relative z-10 flex max-h-full max-w-full flex-col overflow-hidden rounded-xl bg-surface shadow-2xl">
            <div className="flex flex-shrink-0 items-center justify-between gap-3 border-b border-border-soft px-4 py-3">
              <div className="truncate text-[13px] font-medium text-foreground">
                {approvalSnapName || "Email snap"}
              </div>
              <button
                type="button"
                onClick={() => setSnapViewerOpen(false)}
                className="cursor-pointer text-muted-foreground hover:text-foreground"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex max-h-[min(80vh,720px)] items-center justify-center overflow-auto bg-surface-alt p-4">
              <img
                src={approvalSnapPreview}
                alt={approvalSnapName || "Email snap"}
                className="max-h-[min(75vh,680px)] max-w-full object-contain"
              />
            </div>
          </div>
        </div>
      )}
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
  const [saving, setSaving] = useState(false);
  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(
    () => defaultProjectVisibleColumns()
  );

  usePauseSharedDataSync(drawerOpen);

  const { sortKey, sortDir, handleSort } = useColumnSort<ProjectSortKey>("project");

  const visibleColDefs = useMemo(
    () => PROJECT_COLUMNS.filter((c) => visibleColumns.has(c.id)),
    [visibleColumns]
  );
  const gridTemplate = useMemo(
    () => visibleColDefs.map((c) => c.width).join(" "),
    [visibleColDefs]
  );

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
    setEditing(null);
    setDrawerOpen(true);
  };
  const openEdit = (p: Project) => {
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
      toast.error(err instanceof Error ? err.message : "Failed to update status");
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
    approvedBySnap: saved.approvedBySnap ?? null,
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
      toast.error(err instanceof Error ? err.message : "Failed to save project");
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
          <div className="flex flex-shrink-0 items-center justify-between gap-3 border-b border-border-soft px-4 py-2.5">
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
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
            <ReportColumnPicker
              columns={PROJECT_COLUMNS}
              visible={visibleColumns}
              onChange={(next) => setVisibleColumns(ensureLockedProjectColumns(next))}
              onReset={() => setVisibleColumns(defaultProjectVisibleColumns())}
            />
          </div>

          {/* single scroll: sticky header + rows (Daily Work Detail pattern) */}
          <div className="min-h-0 flex-1 overflow-x-auto overflow-y-auto overscroll-contain">
            <div className="w-full min-w-0">
              <div
                className="sticky top-0 z-10 grid w-full items-center gap-x-3 border-b border-border-soft bg-surface-alt px-4 py-2 text-[11px] font-semibold text-muted"
                style={{ gridTemplateColumns: gridTemplate }}
              >
                {visibleColDefs.map((col) =>
                  col.sortable ? (
                    <SortColHeader
                      key={col.id}
                      label={projectHeaderLabel(col)}
                      col={col.id as ProjectSortKey}
                      sortKey={sortKey}
                      sortDir={sortDir}
                      onSort={handleSort}
                    />
                  ) : (
                    <div
                      key={col.id}
                      className={col.id === "action" ? "text-right" : undefined}
                    >
                      {projectHeaderLabel(col)}
                    </div>
                  )
                )}
              </div>

              {sorted.map((p) => (
                <ProjectRow
                  key={p.id}
                  p={p}
                  highlighted={flashId === p.id}
                  visibleCols={visibleColDefs}
                  gridTemplate={gridTemplate}
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
      </div>

      {drawerOpen && (
        <ProjectDrawer
          key={editing?.id ?? "new-project"}
          project={editing}
          saving={saving}
          onClose={() => setDrawerOpen(false)}
          onSave={saveProject}
        />
      )}
    </div>
  );
}
