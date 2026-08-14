import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Search, X } from "lucide-react";
import { SortColHeader, useColumnSort } from "../components/SortColHeader";
import {
  projectTypeLabel,
  milestoneKindLabel,
} from "../data/setup";
import type {
  Department,
  Skill,
  Activity,
  ActivityMilestone,
  SetupStatus,
} from "../data/setup";
import type { ProjectType, MilestoneKind } from "../data/projects";
import { MilestoneKindPicker } from "../components/MilestoneKindPicker";
import { useMasters } from "../context/MastersContext";
import { useToast } from "../context/ToastContext";
import { useAuth } from "../context/AuthContext";
import { usePauseSharedDataSync, useSharedDataSync, MASTER_TXN_SYNC_INTERVAL_MS } from "../hooks/useSharedDataSync";
import { matchesSearchQuery } from "../utils/textSearch";
import {
  createActivity,
  createActivityMilestone,
  createDepartment,
  createSkill,
  createSkillCategory,
  fetchSkillCategories,
  updateActivity,
  updateDepartment,
  updateSkill,
} from "../api/domain";

type Segment = "departments" | "skills" | "activities";

const SEGMENT_PERMISSION: Record<Segment, string> = {
  departments: "masters.departments",
  skills: "masters.skills",
  activities: "masters.activities",
};

const ALL_SEGMENTS: Segment[] = ["departments", "skills", "activities"];

function canAccessMastersSegment(
  seg: Segment,
  allowedKeys: Set<string>,
  isSuperAdmin: boolean
): boolean {
  if (isSuperAdmin) return true;
  if (allowedKeys.has("masters")) return true;
  return allowedKeys.has(SEGMENT_PERMISSION[seg]);
}
type Tab = "active" | "inactive";

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

function BillableChip({ billable }: { billable: boolean }) {
  if (billable) {
    return (
      <span className="rounded-sm bg-success-soft px-1.5 py-0.5 text-[10px] font-semibold text-success-fg">
        Billable
      </span>
    );
  }
  return (
    <span className="rounded-sm bg-surface-alt px-1.5 py-0.5 text-[10px] font-semibold text-muted">
      Internal
    </span>
  );
}

function ProjectTypeChip({ type }: { type: ProjectType }) {
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
    <span className="rounded-sm bg-surface-alt px-1.5 py-0.5 text-[10px] font-semibold text-muted">
      PRODUCT
    </span>
  );
}

// ─── skill drawer ────────────────────────────────────────────────────────────

type SkillCategoryOption = { id: string; name: string };

function SkillDrawer({
  skill,
  saving,
  onClose,
  onSave,
}: {
  skill: Skill | null;
  saving?: boolean;
  onClose: () => void;
  onSave: (payload: { name: string; categoryId: string }) => void;
}) {
  const toast = useToast();
  const isEdit = !!skill;
  const [name, setName] = useState(skill?.name ?? "");
  const [categoryId, setCategoryId] = useState<string>(skill?.categoryId ?? "");
  const [categoryList, setCategoryList] = useState<SkillCategoryOption[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [newCategory, setNewCategory] = useState("");
  const [addingCategory, setAddingCategory] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setCategoriesLoading(true);
    void fetchSkillCategories(false)
      .then((rows) => {
        if (cancelled) return;
        const opts = rows.map((r) => ({ id: String(r.id), name: r.name }));
        setCategoryList(opts);
        setCategoryId((prev) => {
          if (prev && opts.some((o) => o.id === prev)) return prev;
          if (skill?.categoryId && opts.some((o) => o.id === skill.categoryId)) {
            return skill.categoryId;
          }
          const byName = skill?.category
            ? opts.find((o) => o.name === skill.category)
            : undefined;
          return byName?.id ?? opts[0]?.id ?? "";
        });
      })
      .catch(() => {
        if (!cancelled) setCategoryList([]);
      })
      .finally(() => {
        if (!cancelled) setCategoriesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [skill]);

  const addCategory = async () => {
    const v = newCategory.trim();
    if (!v) return;
    try {
      const created = await createSkillCategory(v);
      const opt = { id: String(created.id), name: created.name };
      setCategoryList((c) =>
        c.some((x) => x.id === opt.id) ? c : [...c, opt].sort((a, b) => a.name.localeCompare(b.name))
      );
      setCategoryId(opt.id);
      setNewCategory("");
      setAddingCategory(false);
      toast.created();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add category");
    }
  };

  return (
    <div className="fixed inset-0 z-40">
      <div onClick={() => !saving && onClose()} className="absolute inset-0 bg-brand/30" />
      <div className="absolute right-0 top-0 flex h-full w-[440px] flex-col bg-surface shadow-2xl">
        <div className="flex flex-shrink-0 items-center justify-between border-b border-border-soft px-5 py-4">
          <div className="text-[15px] font-semibold text-foreground">
            {isEdit ? "Edit skill" : "Add skill"}
          </div>
          <button
            onClick={onClose}
            disabled={saving}
            className="cursor-pointer text-muted-foreground hover:text-foreground disabled:opacity-40"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-5 py-4">
          <Field label="Skill name" required>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              disabled={saving}
              maxLength={30}
              className="w-full rounded-md border border-border bg-surface px-3 py-2 text-[13px] text-foreground outline-none focus:border-accent-line disabled:opacity-60"
              placeholder="e.g. React (30 characters)"
            />
          </Field>
          <Field label="Category" required>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              disabled={saving || categoriesLoading || categoryList.length === 0}
              className="w-full cursor-pointer rounded-md border border-border bg-surface px-3 py-2 text-[13px] text-foreground outline-none focus:border-accent-line disabled:opacity-60"
            >
              {categoriesLoading && <option value="">Loading…</option>}
              {!categoriesLoading && categoryList.length === 0 && (
                <option value="">No categories</option>
              )}
              {categoryList.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            {addingCategory ? (
              <div className="mt-2 flex gap-2">
                <input
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void addCategory();
                    }
                  }}
                  className="flex-1 rounded-md border border-border bg-surface px-3 py-1.5 text-[12px] text-foreground outline-none focus:border-accent-line"
                  placeholder="New category name"
                  autoFocus
                />
                <button
                  onClick={() => void addCategory()}
                  className="cursor-pointer rounded-md border border-accent-line px-3 text-[12px] text-primary hover:bg-accent-soft"
                >
                  Add
                </button>
                <button
                  onClick={() => setAddingCategory(false)}
                  className="cursor-pointer text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setAddingCategory(true)}
                className="mt-1.5 cursor-pointer text-[11px] text-primary hover:underline"
              >
                + Add Category
              </button>
            )}
          </Field>
        </div>
        <div className="flex flex-shrink-0 gap-2 border-t border-border-soft px-5 py-3.5">
          <button
            onClick={onClose}
            disabled={saving}
            className="flex-1 cursor-pointer rounded-md border border-border py-2 text-[13px] text-foreground hover:bg-surface-alt disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              if (!name.trim() || !categoryId || saving) return;
              onSave({ name: name.trim(), categoryId });
            }}
            disabled={!name.trim() || !categoryId || saving}
            className="flex-1 cursor-pointer rounded-md bg-primary py-2 text-[13px] font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-40"
          >
            {saving ? "Saving…" : isEdit ? "Save changes" : "Create skill"}
          </button>
        </div>
      </div>
    </div>
  );
}

function DeptDrawer({
  dept,
  saving,
  onClose,
  onSave,
}: {
  dept: Department | null;
  saving?: boolean;
  onClose: () => void;
  onSave: (name: string) => void;
}) {
  const isEdit = !!dept;
  const [name, setName] = useState(dept?.name ?? "");

  return (
    <div className="fixed inset-0 z-40">
      <div onClick={() => !saving && onClose()} className="absolute inset-0 bg-brand/30" />
      <div className="absolute right-0 top-0 flex h-full w-[440px] flex-col bg-surface shadow-2xl">
        <div className="flex flex-shrink-0 items-center justify-between border-b border-border-soft px-5 py-4">
          <div className="text-[15px] font-semibold text-foreground">
            {isEdit ? "Edit department" : "Add department"}
          </div>
          <button
            onClick={onClose}
            disabled={saving}
            className="cursor-pointer text-muted-foreground hover:text-foreground disabled:opacity-40"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-5 py-4">
          <Field label="Department name" required>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              disabled={saving}
              maxLength={30}
              className="w-full rounded-md border border-border bg-surface px-3 py-2 text-[13px] text-foreground outline-none focus:border-accent-line disabled:opacity-60"
              placeholder="e.g. Engineering (30 characters)"
            />
          </Field>
        </div>
        <div className="flex flex-shrink-0 gap-2 border-t border-border-soft px-5 py-3.5">
          <button
            onClick={onClose}
            disabled={saving}
            className="flex-1 cursor-pointer rounded-md border border-border py-2 text-[13px] text-foreground hover:bg-surface-alt disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              if (!name.trim() || saving) return;
              onSave(name.trim());
            }}
            disabled={!name.trim() || saving}
            className="flex-1 cursor-pointer rounded-md bg-primary py-2 text-[13px] font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-40"
          >
            {saving ? "Saving…" : isEdit ? "Save changes" : "Create department"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── activity drawer ─────────────────────────────────────────────────────────

function ActivityDrawer({
  activity,
  milestones,
  saving,
  onClose,
  onSave,
  onCreateMilestone,
}: {
  activity: Activity | null;
  milestones: ActivityMilestone[];
  saving?: boolean;
  onClose: () => void;
  onSave: (payload: { name: string; billable: boolean; milestoneId: string }) => void;
  onCreateMilestone: (payload: {
    name: string;
    projectType: ProjectType;
    kind: MilestoneKind;
  }) => Promise<ActivityMilestone>;
}) {
  const toast = useToast();
  const isEdit = !!activity;
  const [name, setName] = useState(activity?.name ?? "");
  const [milestoneId, setMilestoneId] = useState(activity?.milestoneId ?? milestones[0]?.id ?? "");
  const [billable, setBillable] = useState(activity?.billable ?? true);
  const [addingMilestone, setAddingMilestone] = useState(false);
  const [newMilestoneName, setNewMilestoneName] = useState("");
  const [newMilestoneKind, setNewMilestoneKind] = useState<MilestoneKind | "">("");
  const [newMilestoneType, setNewMilestoneType] = useState<ProjectType>("paid");
  const [milestoneSaving, setMilestoneSaving] = useState(false);

  const cancelAddMilestone = () => {
    setAddingMilestone(false);
    setNewMilestoneName("");
    setNewMilestoneKind("");
    setNewMilestoneType("paid");
  };

  const addMilestone = async () => {
    const label = newMilestoneName.trim();
    if (!label || !newMilestoneKind || milestoneSaving) return;
    setMilestoneSaving(true);
    try {
      const created = await onCreateMilestone({
        name: label,
        projectType: newMilestoneType,
        kind: newMilestoneKind,
      });
      setMilestoneId(created.id);
      cancelAddMilestone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add milestone");
    } finally {
      setMilestoneSaving(false);
    }
  };

  const canSave = !!name.trim() && !!milestoneId;

  return (
    <div className="fixed inset-0 z-40">
      <div onClick={() => !saving && onClose()} className="absolute inset-0 bg-brand/30" />
      <div className="absolute right-0 top-0 flex h-full w-[440px] flex-col bg-surface shadow-2xl">
        <div className="flex flex-shrink-0 items-center justify-between border-b border-border-soft px-5 py-4">
          <div className="text-[15px] font-semibold text-foreground">
            {isEdit ? "Edit activity" : "Add activity"}
          </div>
          <button
            onClick={onClose}
            disabled={saving}
            className="cursor-pointer text-muted-foreground hover:text-foreground disabled:opacity-40"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-5 py-4">
          <Field label="Activity name" required>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              disabled={saving}
              maxLength={30}
              className="w-full rounded-md border border-border bg-surface px-3 py-2 text-[13px] text-foreground outline-none focus:border-accent-line disabled:opacity-60"
              placeholder="e.g. Feature Development (30 characters)"
            />
          </Field>

          <div>
            <div className="mb-1.5 text-[12px] font-medium text-foreground">Billable</div>
            <div className="flex gap-2">
              <button
                onClick={() => setBillable(true)}
                disabled={saving}
                className={`flex-1 cursor-pointer rounded-md border py-2 text-[12px] font-medium disabled:opacity-60 ${
                  billable
                    ? "border-success bg-success-soft text-success-fg"
                    : "border-border text-muted hover:bg-surface-alt"
                }`}
              >
                Billable
              </button>
              <button
                onClick={() => setBillable(false)}
                disabled={saving}
                className={`flex-1 cursor-pointer rounded-md border py-2 text-[12px] font-medium disabled:opacity-60 ${
                  !billable
                    ? "border-border bg-surface-alt text-foreground"
                    : "border-border text-muted hover:bg-surface-alt"
                }`}
              >
                Internal (non-billable)
              </button>
            </div>
            <div className="mt-1.5 text-[11px] text-muted-foreground">
              {billable
                ? "Counts toward utilization — hours logged here are billable."
                : "Excluded from utilization — prevents misclassifying people as idle."}
            </div>
          </div>

          <div className="border-t border-border-soft pt-4">
            <Field label="Milestone" required>
              <select
                value={milestoneId}
                onChange={(e) => setMilestoneId(e.target.value)}
                disabled={saving}
                className="w-full cursor-pointer rounded-md border border-border bg-surface px-3 py-2 text-[13px] text-foreground outline-none focus:border-accent-line disabled:opacity-60"
              >
                {milestones.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} · {projectTypeLabel(m.projectType)} · {milestoneKindLabel(m.kind)}
                  </option>
                ))}
              </select>
              {addingMilestone ? (
                <div className="mt-2 flex flex-col gap-2 rounded-md border border-border-soft bg-surface px-3 py-2.5">
                  <input
                    value={newMilestoneName}
                    onChange={(e) => setNewMilestoneName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void addMilestone();
                      }
                    }}
                    className="w-full rounded-md border border-border bg-surface px-3 py-1.5 text-[12px] text-foreground outline-none focus:border-accent-line"
                    placeholder="Milestone name"
                    autoFocus
                  />
                  <MilestoneKindPicker
                    value={newMilestoneKind}
                    onChange={setNewMilestoneKind}
                    required
                  />
                  <div className="text-[11px] font-medium text-foreground">Project type</div>
                  <select
                    value={newMilestoneType}
                    onChange={(e) => setNewMilestoneType(e.target.value as ProjectType)}
                    className="w-full cursor-pointer rounded-md border border-border bg-surface px-3 py-1.5 text-[12px] text-foreground outline-none focus:border-accent-line"
                  >
                    <option value="paid">Paid</option>
                    <option value="poc">POC</option>
                    <option value="product">Product</option>
                  </select>
                  <div className="flex gap-2">
                    <button
                      onClick={() => void addMilestone()}
                      disabled={!newMilestoneName.trim() || !newMilestoneKind || milestoneSaving}
                      className="cursor-pointer rounded-md border border-accent-line px-3 py-1.5 text-[12px] text-primary hover:bg-accent-soft disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {milestoneSaving ? "Adding…" : "Add"}
                    </button>
                    <button
                      onClick={cancelAddMilestone}
                      disabled={milestoneSaving}
                      className="cursor-pointer text-[12px] text-muted-foreground hover:text-foreground"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setAddingMilestone(true)}
                  className="mt-1.5 cursor-pointer text-[11px] text-primary hover:underline"
                >
                  + Add Milestone
                </button>
              )}
            </Field>
          </div>
        </div>
        <div className="flex flex-shrink-0 gap-2 border-t border-border-soft px-5 py-3.5">
          <button
            onClick={onClose}
            disabled={saving}
            className="flex-1 cursor-pointer rounded-md border border-border py-2 text-[13px] text-foreground hover:bg-surface-alt disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              if (!canSave || saving) return;
              onSave({ name: name.trim(), billable, milestoneId });
            }}
            disabled={!canSave || saving}
            className="flex-1 cursor-pointer rounded-md bg-primary py-2 text-[13px] font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-40"
          >
            {saving ? "Saving…" : isEdit ? "Save changes" : "Create activity"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── departments list ────────────────────────────────────────────────────────

type DepartmentSortKey = "department" | "members";

function DepartmentsList({
  tab,
  q,
  rows,
  onEdit,
  onToggle,
}: {
  tab: Tab;
  q: string;
  rows: Department[];
  onEdit: (d: Department) => void;
  onToggle: (id: string) => void;
}) {
  const { sortKey, sortDir, handleSort } = useColumnSort<DepartmentSortKey>("department");

  const filtered = rows.filter(
    (d) => d.status === tab && matchesSearchQuery(q, d.name, d.head, d.memberCount)
  );

  const sorted = [...filtered].sort((a, b) => {
    const mul = sortDir === "asc" ? 1 : -1;

    if (sortKey === "department") {
      return mul * a.name.localeCompare(b.name);
    }
    return mul * (a.memberCount - b.memberCount);
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="sticky top-0 z-10 flex items-center border-b border-border-soft bg-surface-alt px-4 py-2 text-[11px] font-semibold text-muted">
          <div className="min-w-0 flex-1">
            <SortColHeader
              label="DEPARTMENT"
              col="department"
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={handleSort}
            />
          </div>
          <div className="w-[100px] shrink-0">
            <SortColHeader
              label="MEMBERS"
              col="members"
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={handleSort}
            />
          </div>
          <div className="w-[90px] shrink-0 text-right">ACTION</div>
        </div>
        {sorted.map((d) => {
          const inactive = d.status === "inactive";
          return (
            <div
              key={d.id}
              className={`flex items-center border-b border-border-soft px-4 py-3 last:border-b-0 hover:bg-surface-alt ${
                inactive ? "opacity-60" : ""
              }`}
            >
              <div className="min-w-0 flex-1">
                <button
                  onClick={() => onEdit(d)}
                  className="text-[13px] font-medium text-foreground hover:text-primary"
                >
                  {d.name}
                </button>
              </div>
              <div className="w-[100px] shrink-0 text-[12px] text-muted-foreground">
                {d.memberCount} {d.memberCount === 1 ? "person" : "people"}
              </div>
              <div className="w-[90px] shrink-0 text-right">
                <button
                  onClick={() => onToggle(d.id)}
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
        })}
        {filtered.length === 0 && (
          <div className="px-4 py-10 text-center text-[12px] text-muted-foreground">
            No departments match.
          </div>
        )}
      </div>
    </div>
  );
}

// ─── skills list ─────────────────────────────────────────────────────────────

type SkillSortKey = "skill" | "category" | "people";

function SkillsList({
  tab,
  q,
  rows,
  onEdit,
  onToggle,
}: {
  tab: Tab;
  q: string;
  rows: Skill[];
  onEdit: (s: Skill) => void;
  onToggle: (id: string) => void;
}) {
  const { sortKey, sortDir, handleSort } = useColumnSort<SkillSortKey>("skill");

  const filtered = rows.filter(
    (s) =>
      s.status === tab && matchesSearchQuery(q, s.name, s.category, s.peopleCount)
  );

  const sorted = [...filtered].sort((a, b) => {
    const mul = sortDir === "asc" ? 1 : -1;

    if (sortKey === "skill") {
      return mul * a.name.localeCompare(b.name);
    }
    if (sortKey === "category") {
      return mul * a.category.localeCompare(b.category);
    }
    return mul * (a.peopleCount - b.peopleCount);
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="sticky top-0 z-10 flex items-center border-b border-border-soft bg-surface-alt px-4 py-2 text-[11px] font-semibold text-muted">
          <div className="min-w-0 flex-1">
            <SortColHeader
              label="SKILL"
              col="skill"
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={handleSort}
            />
          </div>
          <div className="w-[130px] shrink-0">
            <SortColHeader
              label="CATEGORY"
              col="category"
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={handleSort}
            />
          </div>
          <div className="w-[100px] shrink-0">
            <SortColHeader
              label="PEOPLE"
              col="people"
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={handleSort}
            />
          </div>
          <div className="w-[90px] shrink-0 text-right">ACTION</div>
        </div>
        {sorted.map((s) => {
          const inactive = s.status === "inactive";
          return (
            <div
              key={s.id}
              className={`flex items-center border-b border-border-soft px-4 py-3 last:border-b-0 hover:bg-surface-alt ${
                inactive ? "opacity-60" : ""
              }`}
            >
              <div className="min-w-0 flex-1">
                <button
                  onClick={() => onEdit(s)}
                  className="text-[13px] font-medium text-foreground hover:text-primary"
                >
                  {s.name}
                </button>
              </div>
              <div className="w-[130px] shrink-0">
                <span className="rounded-sm bg-accent-soft px-1.5 py-0.5 text-[10px] text-accent-softfg">
                  {s.category}
                </span>
              </div>
              <div className="w-[100px] shrink-0 text-[12px] text-muted-foreground">
                {s.peopleCount} {s.peopleCount === 1 ? "person" : "people"}
              </div>
              <div className="w-[90px] shrink-0 text-right">
                <button
                  onClick={() => onToggle(s.id)}
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
        })}
        {filtered.length === 0 && (
          <div className="px-4 py-10 text-center text-[12px] text-muted-foreground">
            No skills match.
          </div>
        )}
      </div>
    </div>
  );
}

// ─── activities list ─────────────────────────────────────────────────────────

type ActivitySortKey = "activity" | "type" | "milestone" | "milestoneType" | "projectType";

function ActivitiesList({
  tab,
  q,
  rows,
  milestones,
  onEdit,
  onToggle,
}: {
  tab: Tab;
  q: string;
  rows: Activity[];
  milestones: ActivityMilestone[];
  onEdit: (a: Activity) => void;
  onToggle: (id: string) => void;
}) {
  const { sortKey, sortDir, handleSort } = useColumnSort<ActivitySortKey>("activity");

  const milestoneMap = Object.fromEntries(milestones.map((m) => [m.id, m]));

  const filtered = rows.filter((a) => {
    const milestone = milestoneMap[a.milestoneId];
    return (
      a.status === tab &&
      matchesSearchQuery(
        q,
        a.name,
        a.billable ? "Billable" : "Internal",
        milestone?.name,
        milestoneKindLabel(milestone?.kind),
        milestone ? projectTypeLabel(milestone.projectType) : undefined
      )
    );
  });

  const sorted = [...filtered].sort((a, b) => {
    const mul = sortDir === "asc" ? 1 : -1;

    if (sortKey === "activity") {
      return mul * a.name.localeCompare(b.name);
    }
    if (sortKey === "milestone") {
      const ma = milestoneMap[a.milestoneId]?.name ?? "";
      const mb = milestoneMap[b.milestoneId]?.name ?? "";
      return mul * ma.localeCompare(mb);
    }
    if (sortKey === "milestoneType") {
      const ka = milestoneKindLabel(milestoneMap[a.milestoneId]?.kind);
      const kb = milestoneKindLabel(milestoneMap[b.milestoneId]?.kind);
      return mul * ka.localeCompare(kb);
    }
    if (sortKey === "projectType") {
      const pa = milestoneMap[a.milestoneId]
        ? projectTypeLabel(milestoneMap[a.milestoneId].projectType)
        : "";
      const pb = milestoneMap[b.milestoneId]
        ? projectTypeLabel(milestoneMap[b.milestoneId].projectType)
        : "";
      return mul * pa.localeCompare(pb);
    }
    const ta = a.billable ? "Billable" : "Internal";
    const tb = b.billable ? "Billable" : "Internal";
    return mul * ta.localeCompare(tb);
  });

  const gridCols =
    "grid grid-cols-[minmax(0,1.15fr)_100px_minmax(0,0.95fr)_minmax(120px,0.9fr)_92px_84px] items-center";

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div
          className={`${gridCols} sticky top-0 z-10 border-b border-border-soft bg-surface-alt px-4 py-2 text-[11px] font-semibold text-muted`}
        >
          <div className="min-w-0">
            <SortColHeader
              label="ACTIVITY"
              col="activity"
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={handleSort}
            />
          </div>
          <div className="min-w-0">
            <SortColHeader
              label="TYPE"
              col="type"
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={handleSort}
            />
          </div>
          <div className="min-w-0">
            <SortColHeader
              label="MILESTONE"
              col="milestone"
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={handleSort}
            />
          </div>
          <div className="min-w-0">
            <SortColHeader
              label="MILESTONE TYPE"
              col="milestoneType"
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={handleSort}
            />
          </div>
          <div className="min-w-0">
            <SortColHeader
              label="PROJECT TYPE"
              col="projectType"
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={handleSort}
            />
          </div>
          <div className="text-right">ACTION</div>
        </div>
        {sorted.map((a) => {
          const inactive = a.status === "inactive";
          const milestone = milestoneMap[a.milestoneId];
          return (
            <div
              key={a.id}
              className={`${gridCols} border-b border-border-soft px-4 py-3 last:border-b-0 hover:bg-surface-alt ${
                inactive ? "opacity-60" : ""
              }`}
            >
              <div className="min-w-0 pr-3">
                <button
                  onClick={() => onEdit(a)}
                  className="truncate text-left text-[13px] font-medium text-foreground hover:text-primary"
                >
                  {a.name}
                </button>
              </div>
              <div>
                <BillableChip billable={a.billable} />
              </div>
              <div className="min-w-0 pr-2">
                <div className="truncate text-[12px] text-foreground">{milestone?.name ?? "—"}</div>
              </div>
              <div className="min-w-0 pr-2">
                <div className="truncate text-[12px] text-foreground">
                  {milestone ? milestoneKindLabel(milestone.kind) : "—"}
                </div>
              </div>
              <div>
                {milestone ? (
                  <ProjectTypeChip type={milestone.projectType} />
                ) : (
                  <span className="text-[12px] text-muted-foreground">—</span>
                )}
              </div>
              <div className="text-right">
                <button
                  onClick={() => onToggle(a.id)}
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
        })}
        {filtered.length === 0 && (
          <div className="px-4 py-10 text-center text-[12px] text-muted-foreground">
            No activities match.
          </div>
        )}
      </div>
    </div>
  );
}

// ─── screen ─────────────────────────────────────────────────────────────────

export function SetupMasters() {
  const { allowedKeys, isSuperAdmin } = useAuth();
  const [segment, setSegment] = useState<Segment>("departments");
  const [tab, setTab] = useState<Tab>("active");
  const [q, setQ] = useState("");
  const toast = useToast();

  const segmentAllowed = useMemo(() => {
    const map = {} as Record<Segment, boolean>;
    for (const seg of ALL_SEGMENTS) {
      map[seg] = canAccessMastersSegment(seg, allowedKeys, isSuperAdmin);
    }
    return map;
  }, [allowedKeys, isSuperAdmin]);

  const firstAllowedSegment = useMemo(
    () => ALL_SEGMENTS.find((seg) => segmentAllowed[seg]) ?? null,
    [segmentAllowed]
  );

  useEffect(() => {
    if (!segmentAllowed[segment] && firstAllowedSegment) {
      setSegment(firstAllowedSegment);
      setTab("active");
      setQ("");
    }
  }, [segment, segmentAllowed, firstAllowedSegment]);

  const {
    departments: depts,
    skills,
    activities,
    activityMilestones,
    setActivityMilestones,
    refresh,
  } = useMasters();

  const retriedEmptySeg = useRef<Partial<Record<Segment, boolean>>>({});

  // One-shot reload when an allowed segment still has no rows (rights granted after first fetch).
  useEffect(() => {
    if (!segmentAllowed[segment] || retriedEmptySeg.current[segment]) return;
    const empty =
      (segment === "departments" && depts.length === 0) ||
      (segment === "skills" && skills.length === 0) ||
      (segment === "activities" && activities.length === 0);
    if (!empty) return;
    retriedEmptySeg.current[segment] = true;
    void refresh();
  }, [segment, segmentAllowed, depts.length, skills.length, activities.length, refresh]);

  const [saving, setSaving] = useState(false);

  // departments state
  const [editingDept, setEditingDept] = useState<Department | null>(null);
  const [deptDrawer, setDeptDrawer] = useState(false);

  // skills state
  const [editingSkill, setEditingSkill] = useState<Skill | null>(null);
  const [skillDrawer, setSkillDrawer] = useState(false);

  // activities state
  const [editingActivity, setEditingActivity] = useState<Activity | null>(null);
  const [activityDrawer, setActivityDrawer] = useState(false);

  usePauseSharedDataSync(deptDrawer || skillDrawer || activityDrawer);
  useSharedDataSync(!(deptDrawer || skillDrawer || activityDrawer), () => refresh(), {
    resources: ["masters"],
    intervalMs: MASTER_TXN_SYNC_INTERVAL_MS,
  });

  const toggleDept = async (id: string) => {
    const row = depts.find((d) => d.id === id);
    if (!row) return;
    const next: SetupStatus = row.status === "active" ? "inactive" : "active";
    if (next === "inactive" && row.memberCount > 0) {
      toast.error("Department is mapped to one or more employees and cannot be disabled.");
      return;
    }
    try {
      await updateDepartment(id, { status: next });
      await refresh();
      toast.updated();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update department");
    }
  };
  const toggleSkill = async (id: string) => {
    const row = skills.find((s) => s.id === id);
    if (!row) return;
    const next: SetupStatus = row.status === "active" ? "inactive" : "active";
    if (next === "inactive" && row.peopleCount > 0) {
      toast.error("Skill is mapped to one or more employees and cannot be disabled.");
      return;
    }
    try {
      await updateSkill(id, { status: next });
      await refresh();
      toast.updated();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update skill");
    }
  };
  const toggleActivity = async (id: string) => {
    const row = activities.find((a) => a.id === id);
    if (!row) return;
    const next: SetupStatus = row.status === "active" ? "inactive" : "active";
    if (next === "inactive" && (row.projectCount ?? 0) > 0) {
      toast.error("Activity is associated with one or more allocations and cannot be disabled.");
      return;
    }
    try {
      await updateActivity(id, { status: next });
      await refresh();
      toast.updated();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update activity");
    }
  };

  const openNewDept = () => {
    setEditingDept(null);
    setDeptDrawer(true);
  };
  const openNewSkill = () => {
    setEditingSkill(null);
    setSkillDrawer(true);
  };
  const openNewActivity = () => {
    setEditingActivity(null);
    setActivityDrawer(true);
  };

  const saveDept = async (name: string) => {
    setSaving(true);
    try {
      if (editingDept) {
        await updateDepartment(editingDept.id, { name });
        await refresh();
        setDeptDrawer(false);
        toast.updated();
      } else {
        await createDepartment({ name });
        await refresh();
        setDeptDrawer(false);
        toast.created();
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save department");
    } finally {
      setSaving(false);
    }
  };

  const saveSkill = async (payload: { name: string; categoryId: string }) => {
    setSaving(true);
    try {
      if (editingSkill) {
        await updateSkill(editingSkill.id, payload);
        await refresh();
        setSkillDrawer(false);
        toast.updated();
      } else {
        await createSkill(payload);
        await refresh();
        setSkillDrawer(false);
        toast.created();
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save skill");
    } finally {
      setSaving(false);
    }
  };

  const saveActivity = async (payload: {
    name: string;
    billable: boolean;
    milestoneId: string;
  }) => {
    setSaving(true);
    try {
      if (editingActivity) {
        await updateActivity(editingActivity.id, {
          name: payload.name,
          billable: payload.billable,
          milestoneCode: payload.milestoneId,
        });
        await refresh();
        setActivityDrawer(false);
        toast.updated();
      } else {
        await createActivity({
          name: payload.name,
          billable: payload.billable,
          milestoneCode: payload.milestoneId,
        });
        await refresh();
        setActivityDrawer(false);
        toast.created();
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save activity");
    } finally {
      setSaving(false);
    }
  };

  const handleCreateMilestone = async (payload: {
    name: string;
    projectType: ProjectType;
    kind: MilestoneKind;
  }) => {
    const created = await createActivityMilestone(payload);
    setActivityMilestones((prev) => {
      if (prev.some((m) => m.id === created.id)) return prev;
      return [...prev, created];
    });
    toast.created();
    return created;
  };

  const segmentLabels: Record<Segment, string> = {
    departments: "Departments",
    skills: "Skills",
    activities: "Activities",
  };

  const activeCountFor = (seg: Segment) => {
    if (seg === "departments") return depts.filter((d) => d.status === "active").length;
    if (seg === "skills") return skills.filter((s) => s.status === "active").length;
    return activities.filter((a) => a.status === "active").length;
  };
  const inactiveCountFor = (seg: Segment) => {
    if (seg === "departments") return depts.filter((d) => d.status === "inactive").length;
    if (seg === "skills") return skills.filter((s) => s.status === "inactive").length;
    return activities.filter((a) => a.status === "inactive").length;
  };

  const handleAdd = () => {
    if (!segmentAllowed[segment]) return;
    if (segment === "departments") openNewDept();
    else if (segment === "skills") openNewSkill();
    else openNewActivity();
  };

  const addLabel = {
    departments: "Add department",
    skills: "Add skill",
    activities: "Add activity",
  }[segment];

  const canAdd = segmentAllowed[segment];

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <header className="flex h-14 flex-shrink-0 items-center justify-between border-b border-border bg-surface px-5">
        <div>
          <div className="text-[15px] font-semibold tracking-tight text-foreground">
            Org · Skills · Activities
          </div>
          <div className="text-[12px] text-muted-foreground">
            {activeCountFor(segment)} active · {inactiveCountFor(segment)} inactive ·{" "}
            {segmentLabels[segment]}
          </div>
        </div>
        <button
          type="button"
          onClick={handleAdd}
          disabled={!canAdd}
          className="flex cursor-pointer items-center gap-1.5 rounded-md bg-primary px-3.5 py-1.5 text-[12px] font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Plus className="h-3.5 w-3.5" /> {addLabel}
        </button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden bg-background p-5">
        {/* segment switcher — each tab gated by Access Rights child key */}
        <div className="flex flex-shrink-0 gap-1 self-start rounded-lg border border-border bg-surface p-1">
          {ALL_SEGMENTS.map((seg) => {
            const allowed = segmentAllowed[seg];
            const active = segment === seg;
            return (
              <button
                key={seg}
                type="button"
                disabled={!allowed}
                title={
                  allowed
                    ? undefined
                    : `No access to ${segmentLabels[seg]} — ask an administrator`
                }
                onClick={() => {
                  if (!allowed) return;
                  setSegment(seg);
                  setTab("active");
                  setQ("");
                }}
                className={`rounded-md px-4 py-1.5 text-[12px] font-medium capitalize ${
                  !allowed
                    ? "cursor-not-allowed text-muted-foreground opacity-40"
                    : active
                      ? "cursor-pointer bg-brand text-white"
                      : "cursor-pointer text-muted hover:bg-surface-alt"
                }`}
              >
                {segmentLabels[seg]}
              </button>
            );
          })}
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border bg-surface">
          {/* toolbar */}
          <div className="flex flex-shrink-0 items-center justify-between border-b border-border-soft px-4 py-2.5">
            <div className="flex gap-1">
              <TabBtn active={tab === "active"} onClick={() => setTab("active")}>
                Active {activeCountFor(segment)}
              </TabBtn>
              <TabBtn active={tab === "inactive"} onClick={() => setTab("inactive")}>
                Inactive {inactiveCountFor(segment)}
              </TabBtn>
            </div>
            <div className="flex items-center gap-2 rounded-md border border-border px-2.5 py-1.5">
              <Search className="pointer-events-none h-3.5 w-3.5 text-muted-foreground" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={`Search ${segmentLabels[segment].toLowerCase()}…`}
                className="w-44 bg-transparent text-[12px] text-foreground outline-none placeholder:text-muted-foreground"
              />
            </div>
          </div>

          {/* segment content */}
          {segmentAllowed[segment] && segment === "departments" && (
            <DepartmentsList
              tab={tab}
              q={q}
              rows={depts}
              onEdit={(d) => { setEditingDept(d); setDeptDrawer(true); }}
              onToggle={toggleDept}
            />
          )}
          {segmentAllowed[segment] && segment === "skills" && (
            <SkillsList
              tab={tab}
              q={q}
              rows={skills}
              onEdit={(s) => { setEditingSkill(s); setSkillDrawer(true); }}
              onToggle={toggleSkill}
            />
          )}
          {segmentAllowed[segment] && segment === "activities" && (
            <ActivitiesList
              tab={tab}
              q={q}
              rows={activities}
              milestones={activityMilestones}
              onEdit={(a) => { setEditingActivity(a); setActivityDrawer(true); }}
              onToggle={toggleActivity}
            />
          )}
          {!segmentAllowed[segment] && (
            <div className="px-4 py-12 text-center text-[12px] text-muted-foreground">
              You do not have access to this section.
            </div>
          )}
        </div>

        {/* activities billable note */}
        {segmentAllowed.activities && segment === "activities" && (
          <div className="flex-shrink-0 rounded-md border border-border-soft bg-surface-alt px-4 py-3 text-[11px] text-muted-foreground">
            <span className="font-medium text-foreground">Billable flag:</span> Only billable
            activities count toward utilization. Mark internal activities (meetings, training,
            standups) as <span className="font-medium">Internal</span> so they don't inflate
            utilization or misclassify people as idle.
          </div>
        )}
      </div>

      {deptDrawer && (
        <DeptDrawer
          dept={editingDept}
          saving={saving}
          onClose={() => setDeptDrawer(false)}
          onSave={(name) => void saveDept(name)}
        />
      )}
      {skillDrawer && (
        <SkillDrawer
          skill={editingSkill}
          saving={saving}
          onClose={() => setSkillDrawer(false)}
          onSave={(payload) => void saveSkill(payload)}
        />
      )}
      {activityDrawer && (
        <ActivityDrawer
          activity={editingActivity}
          milestones={activityMilestones}
          saving={saving}
          onClose={() => setActivityDrawer(false)}
          onSave={(payload) => void saveActivity(payload)}
          onCreateMilestone={handleCreateMilestone}
        />
      )}
    </div>
  );
}
