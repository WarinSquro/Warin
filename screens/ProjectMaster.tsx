import { useState, useEffect, useRef, useMemo, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { Plus, Search, X, AlertTriangle, Calendar, Trash2, Upload, Users } from "lucide-react";
import { SortColHeader, useColumnSort } from "../components/SortColHeader";
import { MapEmployeesToProjectsModal } from "../components/MapEmployeesToProjectsModal";
import { FilterMultiSelect } from "../components/FilterMultiSelect";
import { FilterSelect } from "../components/FilterSelect";
import { FilterSingleSelect } from "../components/FilterSingleSelect";
import {
  ReportColumnPicker,
  type ReportColumnOption,
} from "../components/ReportColumnPicker";
import { useToast } from "../context/ToastContext";
import { useAuth } from "../context/AuthContext";
import { HardDeleteButton, HardDeleteDialog } from "../components/HardDeleteDialog";
import { createCustomer, createProject, fetchCustomers, hardDeleteRecord, updateProject } from "../api/domain";
import { useProjects } from "../context/ProjectsContext";
import { milestoneKindLabel, formatResourceDemand } from "../data/projects";
import { HEALTH_LABELS, HEALTH_OPTIONS } from "../data/executionReport";
import type { ProjectHealth } from "../data/executionReport";
import { ProjectHealthBadge } from "../components/ProjectHealthBadge";
import { milestonesForProjectType, projectTypeLabel } from "../data/setup";
import type { Project, Milestone, ProjectStatus, ResourceDemandLine } from "../data/projects";
import { useMasters } from "../context/MastersContext";
import { useFocusFirstField } from "../hooks/useFocusFirstField";
import { matchesSearchQuery } from "../utils/textSearch";
import { projectVisibleSearchFields } from "../utils/projectVisibleSearch";
import { useAppDateFormat } from "../hooks/useAppDateFormat";
import { AppDateInput } from "../components/AppDateInput";
import { usePauseSharedDataSync, useSharedDataSync, MASTER_TXN_SYNC_INTERVAL_MS } from "../hooks/useSharedDataSync";
import {
  decodeApprovalSnap,
  encodeApprovalSnap,
} from "../utils/approvalSnap";

type Tab = "active" | "inactive";

/** Add/Edit project drawer field length limits */
const PROJECT_ID_MAX = 10;
const PROJECT_NAME_MAX = 25;
const CUSTOMER_NAME_MAX = 25;
const PO_NUMBER_MAX = 15;
type ProjectColId =
  | "project"
  | "kickoff"
  | "timeline"
  | "milestones"
  | "demand"
  | "health"
  | "createdAt"
  | "modifiedAt"
  | "createdBy"
  | "modifiedBy"
  | "action";
type ProjectSortKey = Extract<
  ProjectColId,
  "project" | "kickoff" | "timeline" | "milestones" | "demand" | "health"
>;

type ProjectColumnDef = ReportColumnOption & {
  id: ProjectColId;
  width: string;
  sortable?: boolean;
};

/** All list columns — picker + grid. fr tracks fill card width; extras scroll horizontally (no wrap). */
const PROJECT_COLUMNS: ProjectColumnDef[] = [
  { id: "project", label: "PROJECT", defaultVisible: true, width: "minmax(0,1.35fr)", sortable: true },
  { id: "kickoff", label: "KICKOFF", defaultVisible: true, width: "minmax(0,0.72fr)", sortable: true },
  { id: "timeline", label: "TIMELINE", defaultVisible: true, width: "minmax(0,1.1fr)", sortable: true },
  { id: "milestones", label: "MILESTONES", defaultVisible: true, width: "minmax(0,1.05fr)", sortable: true },
  { id: "demand", label: "DEMAND", defaultVisible: true, width: "minmax(0,0.9fr)", sortable: true },
  {
    id: "health",
    label: "PROJECT HEALTH",
    defaultVisible: true,
    width: "6.75rem",
    sortable: true,
  },
  {
    id: "createdAt",
    label: "PROJECT CREATED DATE & TIME",
    defaultVisible: false,
    width: "minmax(9rem,0.95fr)",
  },
  {
    id: "modifiedAt",
    label: "UPDATED DATE & TIME",
    defaultVisible: false,
    width: "minmax(9rem,0.95fr)",
  },
  { id: "createdBy", label: "CREATED BY", defaultVisible: false, width: "minmax(7rem,0.85fr)" },
  { id: "modifiedBy", label: "UPDATED BY", defaultVisible: false, width: "minmax(7rem,0.85fr)" },
  {
    id: "action",
    label: "ACTION",
    defaultVisible: true,
    locked: true,
    width: "7.5rem",
  },
];

function defaultProjectVisibleColumns(): Set<string> {
  return new Set(PROJECT_COLUMNS.filter((c) => c.defaultVisible || c.locked).map((c) => c.id));
}

function ensureLockedProjectColumns(visible: Set<string>): Set<string> {
  const next = new Set(visible);
  for (const col of PROJECT_COLUMNS) {
    if (col.locked) next.add(col.id);
  }
  return next;
}

function projectHeaderLabel(col: ProjectColumnDef): ReactNode {
  switch (col.id) {
    case "health":
      // Two lines so the sort icon stays beside the label in the narrow column
      // (avoids the text flex item stretching and pushing the icon to the cell edge).
      return (
        <>
          PROJECT
          <br />
          HEALTH
        </>
      );
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
  if (type === "support") {
    return (
      <span className="rounded-sm bg-surface-alt px-1.5 py-0.5 text-[10px] font-semibold text-foreground">
        SUPPORT
      </span>
    );
  }
  return (
    <span className="rounded-sm bg-accent-soft px-1.5 py-0.5 text-[10px] font-semibold text-accent-softfg">
      PRODUCT
    </span>
  );
}

// ─── row ────────────────────────────────────────────────────────────────────

function ProjectCell({
  colId,
  p,
  onEdit,
  onToggle,
  onHardDelete,
}: {
  colId: ProjectColId;
  p: Project;
  onEdit: () => void;
  onToggle: () => void;
  onHardDelete?: () => void;
}) {
  const { formatDate, formatDateTime } = useAppDateFormat();
  const inactive = p.status === "inactive";
  const noMilestones = p.milestones.length === 0;

  switch (colId) {
    case "project": {
      const customerFull = p.customer.trim();
      const customerShort =
        customerFull.length > 15 ? `${customerFull.slice(0, 15)}…` : customerFull;
      const po = p.poNumber.trim();
      const customerPo = customerFull
        ? po
          ? `${customerShort} . ${po}`
          : customerShort
        : "";
      const needsCustomerTooltip = customerFull.length > 15;
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
          {customerPo ? (
            <div
              className="min-w-0 truncate text-[11px] text-muted-foreground"
              title={needsCustomerTooltip ? customerFull : undefined}
              data-full-text={needsCustomerTooltip ? customerFull : undefined}
            >
              {customerPo}
            </div>
          ) : null}
        </div>
      );
    }
    case "kickoff":
      return <div className="whitespace-nowrap text-[12px] text-foreground">{formatDate(p.kickoffDate)}</div>;
    case "timeline":
      return (
        <div className="truncate whitespace-nowrap text-[12px] text-foreground">
          <span>{formatDate(p.startDate)}</span>
          <span className="mx-1 text-muted-foreground">–</span>
          <span>{formatDate(p.endDate)}</span>
        </div>
      );
    case "milestones":
      return noMilestones ? (
        <div className="flex min-w-0 items-center gap-1 text-[11px] text-warning">
          <AlertTriangle className="h-3 w-3 flex-shrink-0" />
          <span className="truncate">No milestones — allocations blocked</span>
        </div>
      ) : (
        <div className="flex min-w-0 flex-nowrap items-center gap-1 overflow-hidden">
          {p.milestones.slice(0, 2).map((m) => (
            <span
              key={m.id}
              className="shrink-0 rounded-sm bg-surface-alt px-1.5 py-0.5 text-[10px] text-muted"
            >
              {m.name}
            </span>
          ))}
          {p.milestones.length > 2 && (
            <span className="shrink-0 text-[10px] text-muted-foreground">+{p.milestones.length - 2}</span>
          )}
        </div>
      );
    case "demand":
      return (
        <div className="truncate text-[12px] text-muted-foreground">
          {p.demand || <span className="text-muted">—</span>}
        </div>
      );
    case "health":
      return <ProjectHealthBadge health={p.health ?? "green"} />;
    case "createdAt":
      if (!p.createdAt) return <div className="text-[12px] text-muted">—</div>;
      return (
        <div className="truncate whitespace-nowrap text-[12px] text-foreground">
          {formatDateTime(p.createdAt)}
        </div>
      );
    case "modifiedAt":
      if (!p.modifiedAt) return <div className="text-[12px] text-muted">—</div>;
      return (
        <div className="truncate whitespace-nowrap text-[12px] text-foreground">
          {formatDateTime(p.modifiedAt)}
        </div>
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
    case "action": {
      const disableBlocked = !inactive && (p.allocationCount ?? 0) > 0;
      return (
        <div className="flex flex-col items-end gap-0.5 text-right">
          <button
            type="button"
            onClick={onToggle}
            disabled={disableBlocked}
            title={
              disableBlocked
                ? "Project is associated with one or more allocations and cannot be disabled."
                : undefined
            }
            className={`text-[11px] ${
              disableBlocked
                ? "cursor-not-allowed text-muted-foreground opacity-40"
                : inactive
                  ? "cursor-pointer text-success hover:underline"
                  : "cursor-pointer text-muted-foreground hover:text-danger hover:underline"
            }`}
          >
            {inactive ? "Reactivate" : "Disable"}
          </button>
          {onHardDelete ? <HardDeleteButton onClick={onHardDelete} /> : null}
        </div>
      );
    }
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
  onHardDelete,
}: {
  p: Project;
  highlighted?: boolean;
  visibleCols: ProjectColumnDef[];
  gridTemplate: string;
  onEdit: () => void;
  onToggle: () => void;
  onHardDelete?: () => void;
}) {
  const inactive = p.status === "inactive";

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
          onEdit={onEdit}
          onToggle={onToggle}
          onHardDelete={onHardDelete}
        />
      ))}
    </div>
  );
}

// ─── drawer ─────────────────────────────────────────────────────────────────

function ProjectDrawer({
  project,
  existingProjects,
  saving,
  onClose,
  onSave,
}: {
  project: Project | null;
  existingProjects: Project[];
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
  const { formatDate } = useAppDateFormat();

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
    const v = newCustomer.trim().slice(0, CUSTOMER_NAME_MAX);
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
    if (msDate && milestoneDateMin && msDate < milestoneDateMin) return;
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
    const floor =
      value && startDate ? (value > startDate ? value : startDate) : value || startDate;
    if (floor && msDate && msDate < floor) setMsDate(floor);
  };

  const handleStartChange = (value: string) => {
    setStartDate(value);
    if (value && endDate && endDate < value) setEndDate(value);
    const floor =
      kickoffDate && value
        ? kickoffDate > value
          ? kickoffDate
          : value
        : kickoffDate || value;
    if (floor && msDate && msDate < floor) setMsDate(floor);
  };

  const startMin = kickoffDate || undefined;
  const endMin = startDate || kickoffDate || undefined;
  /** Milestone date must be on/after both kickoff and start (later of the two). */
  const milestoneDateMin =
    kickoffDate && startDate
      ? kickoffDate > startDate
        ? kickoffDate
        : startDate
      : kickoffDate || startDate || undefined;
  const milestoneDateTooEarly =
    !!msDate && !!milestoneDateMin && msDate < milestoneDateMin;
  const milestonesDatesValid = milestones.every(
    (m) => !m.date || !milestoneDateMin || m.date >= milestoneDateMin
  );
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
  const duplicateId =
    !isEdit &&
    !!id.trim() &&
    existingProjects.some((p) => p.id.trim().toLowerCase() === id.trim().toLowerCase());
  const duplicateName =
    !!name.trim() &&
    existingProjects.some(
      (p) => p.id !== project?.id && p.name.trim().toLowerCase() === name.trim().toLowerCase()
    );
  const canSave =
    !!id.trim() &&
    id.trim().length <= PROJECT_ID_MAX &&
    !!name.trim() &&
    name.trim().length <= PROJECT_NAME_MAX &&
    !!customer.trim() &&
    poNumber.trim().length <= PO_NUMBER_MAX &&
    datesValid &&
    milestones.length > 0 &&
    milestonesDatesValid &&
    (!poRequired || !!poNumber.trim()) &&
    (!pocRequired || pocComplete) &&
    (!healthRemarksRequired || !!healthRemarks.trim()) &&
    !duplicateId &&
    !duplicateName;

  const handleSave = () => {
    if (saving) return;
    if (duplicateId) {
      toast.error("Project ID already exists.");
      return;
    }
    if (duplicateName) {
      toast.error("Project name already exists.");
      return;
    }
    if (!canSave) return;
    onSave({
      id: id.trim().slice(0, PROJECT_ID_MAX),
      name: name.trim().slice(0, PROJECT_NAME_MAX),
      customer,
      poNumber: poNumber.trim().slice(0, PO_NUMBER_MAX),
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
            <Field label="Project ID" required hint={isEdit ? undefined : duplicateId ? "Already exists" : "Unique"}>
              <input
                value={id}
                disabled={coreLocked}
                maxLength={PROJECT_ID_MAX}
                onChange={(e) => setId(e.target.value.slice(0, PROJECT_ID_MAX))}
                className={`w-full rounded-md border px-3 py-2 font-mono text-[13px] outline-none focus:border-accent-line ${coreInputClass} ${
                  duplicateId ? "border-danger" : "border-border"
                }`}
                placeholder="PRJ-019"
              />
            </Field>

            <Field label="Type" required>
              <FilterSingleSelect
                value={projectType}
                disabled={coreLocked}
                onChange={(v) => {
                  setProjectType(v as Project["type"]);
                  // Catalog milestones differ by type — clear any already-added lines.
                  setMilestones([]);
                  setMsCatalogId("");
                  setMsDate("");
                }}
                options={[
                  { value: "paid", label: "Paid" },
                  { value: "poc", label: "POC" },
                  { value: "product", label: "Product" },
                  { value: "support", label: "Support" },
                ]}
                fullWidth
                aria-label="Project type"
              />
            </Field>
          </div>

          <Field label="Project Name" required hint={duplicateName ? "Already exists" : undefined}>
            <input
              value={name}
              disabled={coreLocked}
              maxLength={PROJECT_NAME_MAX}
              onChange={(e) => setName(e.target.value.slice(0, PROJECT_NAME_MAX))}
              className={`w-full rounded-md border px-3 py-2 text-[13px] outline-none focus:border-accent-line ${coreInputClass} ${
                duplicateName ? "border-danger" : "border-border"
              }`}
              placeholder="e.g. Project Nova"
            />
          </Field>

          <Field label="Customer" required>
            <FilterSingleSelect
              value={customer}
              onChange={setCustomer}
              disabled={coreLocked || customersLoading || customerList.length === 0}
              options={
                customersLoading && customerList.length === 0
                  ? [{ value: "", label: "Loading customers…", disabled: true }]
                  : customerList.length === 0
                    ? [{ value: "", label: "No customers available", disabled: true }]
                    : customerList.map((c) => ({ value: c, label: c }))
              }
              fullWidth
              aria-label="Customer"
            />
            {customersError && (
              <p className="mt-1 text-[11px] text-danger">{customersError}</p>
            )}
            {!coreLocked &&
              (addingCustomer ? (
              <div className="mt-2 flex gap-2">
                <input
                  value={newCustomer}
                  maxLength={CUSTOMER_NAME_MAX}
                  onChange={(e) => setNewCustomer(e.target.value.slice(0, CUSTOMER_NAME_MAX))}
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
                    <AppDateInput
                      value={approvedByDate}
                      onChange={setApprovedByDate}
                      inputClassName="focus:border-accent-line"
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
                maxLength={PO_NUMBER_MAX}
                onChange={(e) => setPoNumber(e.target.value.slice(0, PO_NUMBER_MAX))}
                className={`w-full rounded-md border border-border px-3 py-2 text-[13px] outline-none focus:border-accent-line ${coreInputClass}`}
                placeholder={poRequired ? "e.g. PO-2025-0012" : "Optional"}
              />
            </Field>
            <Field label="Kickoff date" required>
              <AppDateInput
                value={kickoffDate}
                disabled={coreLocked}
                onChange={handleKickoffChange}
                inputClassName={`focus:border-accent-line ${coreInputClass}`}
              />
            </Field>
            <Field label="Start date" required>
              <AppDateInput
                value={startDate}
                min={startMin}
                disabled={coreLocked}
                onChange={handleStartChange}
                inputClassName={`focus:border-accent-line ${coreInputClass}`}
              />
              {kickoffDate && startDate && startDate < kickoffDate && (
                <div className="mt-1 text-[11px] text-danger">Start date cannot be before kickoff.</div>
              )}
            </Field>
            <Field label="End date" required>
              <AppDateInput
                value={endDate}
                min={endMin}
                disabled={coreLocked}
                onChange={setEndDate}
                inputClassName={`focus:border-accent-line ${coreInputClass}`}
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
                        {m.date ? formatDate(m.date) : "No date"}
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
                  No {projectTypeLabel(projectType)} milestones left — add them in Org → Activities.
                </div>
              )}
              <FilterSelect
                value={msCatalogId}
                onChange={setMsCatalogId}
                options={catalogMilestones.map((m) => ({
                  value: m.id,
                  label: `${m.name} · ${milestoneKindLabel(m.kind)}`,
                }))}
                placeholder="Select milestone…"
                aria-label="Select milestone"
              />
              <div className="flex gap-2">
                <AppDateInput
                  value={msDate}
                  min={milestoneDateMin}
                  onChange={(v) => {
                    if (milestoneDateMin && v && v < milestoneDateMin) {
                      setMsDate(milestoneDateMin);
                      return;
                    }
                    setMsDate(v);
                  }}
                  className="min-w-0 flex-1"
                  inputClassName="py-2 text-[12px] focus:border-accent-line"
                />
                <button
                  type="button"
                  onClick={addMilestone}
                  disabled={!msCatalogId || milestoneDateTooEarly}
                  className="shrink-0 rounded-md border border-accent-line px-4 py-2 text-[12px] text-primary hover:bg-accent-soft disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Add
                </button>
              </div>
              {milestoneDateTooEarly && (
                <div className="text-[11px] text-danger">
                  Milestone date cannot be before project kickoff or start date.
                </div>
              )}
              {!milestonesDatesValid && (
                <div className="text-[11px] text-danger">
                  One or more milestones are before the project kickoff or start date.
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Project health" required>
              <FilterSingleSelect
                value={health}
                onChange={(v) => setHealth(v as ProjectHealth)}
                options={HEALTH_OPTIONS.map((h) => ({ value: h, label: HEALTH_LABELS[h] }))}
                fullWidth
                aria-label="Project health"
              />
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
  const { isSuperAdmin, currentEmployee } = useAuth();
  const { formatDate, formatDateTime } = useAppDateFormat();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>("active");
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<Project | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [mapEmployeesOpen, setMapEmployeesOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [hardDelete, setHardDelete] = useState<{ id: string; name: string } | null>(null);
  const [hardDeleting, setHardDeleting] = useState(false);
  const [hardDeleteError, setHardDeleteError] = useState<string | null>(null);
  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(
    () => defaultProjectVisibleColumns()
  );

  usePauseSharedDataSync(drawerOpen || mapEmployeesOpen || !!hardDelete);
  useSharedDataSync(!drawerOpen && !mapEmployeesOpen, () => refresh(), {
    resources: ["projects"],
    intervalMs: MASTER_TXN_SYNC_INTERVAL_MS,
  });

  const { sortKey, sortDir, handleSort } = useColumnSort<ProjectSortKey>("project");

  const visibleColDefs = useMemo(
    () => PROJECT_COLUMNS.filter((c) => visibleColumns.has(c.id)),
    [visibleColumns]
  );
  const gridTemplate = useMemo(
    () => visibleColDefs.map((c) => c.width).join(" "),
    [visibleColDefs]
  );
  /** Default set = 100% width; each optional column adds rem so the table scrolls instead of crushing. */
  const tableMinWidth = useMemo(() => {
    const extraCount = visibleColDefs.filter((c) => !c.defaultVisible && !c.locked).length;
    if (extraCount === 0) return undefined;
    return `calc(100% + ${extraCount * 9}rem)`;
  }, [visibleColDefs]);

  const filtered = useMemo(
    () =>
      rows.filter(
        (p) =>
          p.status === tab &&
          matchesSearchQuery(q, ...projectVisibleSearchFields(p, visibleColumns, formatDate, formatDateTime))
      ),
    [rows, tab, q, visibleColumns, formatDate, formatDateTime]
  );

  const sorted = [...filtered].sort((a, b) => {
    const mul = sortDir === "asc" ? 1 : -1;

    if (sortKey === "project") {
      return mul * a.name.localeCompare(b.name);
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
    if (sortKey === "health") {
      return mul * HEALTH_LABELS[a.health ?? "green"].localeCompare(HEALTH_LABELS[b.health ?? "green"]);
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
    if (next === "inactive" && (project.allocationCount ?? 0) > 0) {
      toast.error("Project is associated with one or more allocations and cannot be disabled.");
      return;
    }
    try {
      await updateProject(id, { status: next });
      await refresh();
      toast.updated();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update status");
    }
  };

  const confirmHardDelete = async (email: string, pin: string) => {
    if (!hardDelete) return;
    setHardDeleting(true);
    setHardDeleteError(null);
    try {
      const res = await hardDeleteRecord("projects", hardDelete.id, { email, pin });
      setHardDelete(null);
      await refresh();
      toast.success(res.message);
    } catch (err) {
      setHardDeleteError(err instanceof Error ? err.message : "Hard delete failed");
      toast.error(err instanceof Error ? err.message : "Hard delete failed");
    } finally {
      setHardDeleting(false);
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
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setMapEmployeesOpen(true)}
            className="flex cursor-pointer items-center gap-1.5 rounded-md border border-border bg-surface px-3.5 py-1.5 text-[12px] font-medium text-foreground hover:bg-surface-alt"
          >
            <Users className="h-3.5 w-3.5" /> Map Employees
          </button>
          <button
            type="button"
            onClick={openNew}
            className="flex cursor-pointer items-center gap-1.5 rounded-md bg-primary px-3.5 py-1.5 text-[12px] font-medium text-primary-foreground"
          >
            <Plus className="h-3.5 w-3.5" /> Add project
          </button>
        </div>
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
              <div className="relative w-[176px] shrink-0">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search…"
                  className="w-full rounded-md border border-border bg-surface py-1.5 pl-8 pr-2.5 text-[12px] text-foreground outline-none placeholder:text-muted-foreground focus:border-primary"
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

          {/* single scroll: sticky header + rows; default cols fit card width */}
          <div className="min-h-0 flex-1 overflow-x-auto overflow-y-auto overscroll-contain">
            <div className="w-full min-w-0" style={tableMinWidth ? { minWidth: tableMinWidth } : undefined}>
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
                  onHardDelete={
                    isSuperAdmin
                      ? () => {
                          setHardDeleteError(null);
                          setHardDelete({ id: p.id, name: p.name });
                        }
                      : undefined
                  }
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
          existingProjects={rows}
          saving={saving}
          onClose={() => setDrawerOpen(false)}
          onSave={saveProject}
        />
      )}
      {mapEmployeesOpen && (
        <MapEmployeesToProjectsModal onClose={() => setMapEmployeesOpen(false)} />
      )}
      <HardDeleteDialog
        open={!!hardDelete}
        entityLabel="project"
        recordName={hardDelete?.name ?? ""}
        expectedEmail={currentEmployee?.email}
        confirming={hardDeleting}
        error={hardDeleteError}
        onCancel={() => {
          if (hardDeleting) return;
          setHardDelete(null);
          setHardDeleteError(null);
        }}
        onConfirm={(email, pin) => void confirmHardDelete(email, pin)}
      />
    </div>
  );
}
