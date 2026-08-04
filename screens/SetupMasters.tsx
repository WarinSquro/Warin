import { useEffect, useState } from "react";
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
  error,
  onClose,
  onSave,
}: {
  skill: Skill | null;
  saving?: boolean;
  error?: string | null;
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
  const [categoryError, setCategoryError] = useState<string | null>(null);

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
    setCategoryError(null);
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
      setCategoryError(err instanceof Error ? err.message : "Failed to add category");
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
              className="w-full rounded-md border border-border bg-surface px-3 py-2 text-[13px] text-foreground outline-none focus:border-accent-line disabled:opacity-60"
              placeholder="e.g. React"
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
            {categoryError && <div className="mt-1 text-[12px] text-danger">{categoryError}</div>}
          </Field>
          {error && <div className="text-[12px] text-danger">{error}</div>}
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
  error,
  onClose,
  onSave,
}: {
  dept: Department | null;
  saving?: boolean;
  error?: string | null;
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
              className="w-full rounded-md border border-border bg-surface px-3 py-2 text-[13px] text-foreground outline-none focus:border-accent-line disabled:opacity-60"
              placeholder="e.g. Engineering"
            />
          </Field>
          {error && <div className="text-[12px] text-danger">{error}</div>}
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
  error,
  onClose,
  onSave,
  onCreateMilestone,
}: {
  activity: Activity | null;
  milestones: ActivityMilestone[];
  saving?: boolean;
  error?: string | null;
  onClose: () => void;
  onSave: (payload: { name: string; billable: boolean; milestoneId: string }) => void;
  onCreateMilestone: (payload: {
    name: string;
    projectType: ProjectType;
    kind: MilestoneKind;
  }) => Promise<ActivityMilestone>;
}) {
  const isEdit = !!activity;
  const [name, setName] = useState(activity?.name ?? "");
  const [milestoneId, setMilestoneId] = useState(activity?.milestoneId ?? milestones[0]?.id ?? "");
  const [billable, setBillable] = useState(activity?.billable ?? true);
  const [addingMilestone, setAddingMilestone] = useState(false);
  const [newMilestoneName, setNewMilestoneName] = useState("");
  const [newMilestoneKind, setNewMilestoneKind] = useState<MilestoneKind | "">("");
  const [newMilestoneType, setNewMilestoneType] = useState<ProjectType>("paid");
  const [milestoneSaving, setMilestoneSaving] = useState(false);
  const [milestoneError, setMilestoneError] = useState<string | null>(null);

  const cancelAddMilestone = () => {
    setAddingMilestone(false);
    setNewMilestoneName("");
    setNewMilestoneKind("");
    setNewMilestoneType("paid");
    setMilestoneError(null);
  };

  const addMilestone = async () => {
    const label = newMilestoneName.trim();
    if (!label || !newMilestoneKind || milestoneSaving) return;
    setMilestoneSaving(true);
    setMilestoneError(null);
    try {
      const created = await onCreateMilestone({
        name: label,
        projectType: newMilestoneType,
        kind: newMilestoneKind,
      });
      setMilestoneId(created.id);
      cancelAddMilestone();
    } catch (err) {
      setMilestoneError(err instanceof Error ? err.message : "Failed to add milestone");
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
              className="w-full rounded-md border border-border bg-surface px-3 py-2 text-[13px] text-foreground outline-none focus:border-accent-line disabled:opacity-60"
              placeholder="e.g. Feature Development"
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
                  {milestoneError && <div className="text-[12px] text-danger">{milestoneError}</div>}
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
          {error && <div className="text-[12px] text-danger">{error}</div>}
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
      <div className="flex flex-shrink-0 border-b border-border-soft bg-surface-alt px-4 py-2 text-[11px] font-semibold text-muted">
        <SortColHeader
          label="DEPARTMENT"
          col="department"
          sortKey={sortKey}
          sortDir={sortDir}
          onSort={handleSort}
          className="flex-1"
        />
        <SortColHeader
          label="MEMBERS"
          col="members"
          sortKey={sortKey}
          sortDir={sortDir}
          onSort={handleSort}
          className="w-[100px]"
        />
        <div className="w-[90px] text-right">ACTION</div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {sorted.map((d) => {
          const inactive = d.status === "inactive";
          return (
            <div
              key={d.id}
              className={`flex items-center border-b border-border-soft px-4 py-3 last:border-b-0 hover:bg-surface-alt ${
                inactive ? "opacity-60" : ""
              }`}
            >
              <div className="flex-1">
                <button
                  onClick={() => onEdit(d)}
                  className="text-[13px] font-medium text-foreground hover:text-primary"
                >
                  {d.name}
                </button>
              </div>
              <div className="w-[100px] text-[12px] text-muted-foreground">
                {d.memberCount} {d.memberCount === 1 ? "person" : "people"}
              </div>
              <div className="w-[90px] text-right">
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
      <div className="flex flex-shrink-0 border-b border-border-soft bg-surface-alt px-4 py-2 text-[11px] font-semibold text-muted">
        <SortColHeader
          label="SKILL"
          col="skill"
          sortKey={sortKey}
          sortDir={sortDir}
          onSort={handleSort}
          className="flex-1"
        />
        <SortColHeader
          label="CATEGORY"
          col="category"
          sortKey={sortKey}
          sortDir={sortDir}
          onSort={handleSort}
          className="w-[130px]"
        />
        <SortColHeader
          label="PEOPLE"
          col="people"
          sortKey={sortKey}
          sortDir={sortDir}
          onSort={handleSort}
          className="w-[100px]"
        />
        <div className="w-[90px] text-right">ACTION</div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {sorted.map((s) => {
          const inactive = s.status === "inactive";
          return (
            <div
              key={s.id}
              className={`flex items-center border-b border-border-soft px-4 py-3 last:border-b-0 hover:bg-surface-alt ${
                inactive ? "opacity-60" : ""
              }`}
            >
              <div className="flex-1">
                <button
                  onClick={() => onEdit(s)}
                  className="text-[13px] font-medium text-foreground hover:text-primary"
                >
                  {s.name}
                </button>
              </div>
              <div className="w-[130px]">
                <span className="rounded-sm bg-accent-soft px-1.5 py-0.5 text-[10px] text-accent-softfg">
                  {s.category}
                </span>
              </div>
              <div className="w-[100px] text-[12px] text-muted-foreground">
                {s.peopleCount} {s.peopleCount === 1 ? "person" : "people"}
              </div>
              <div className="w-[90px] text-right">
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
      <div
        className={`${gridCols} flex-shrink-0 border-b border-border-soft bg-surface-alt px-4 py-2 text-[11px] font-semibold text-muted`}
      >
        <SortColHeader
          label="ACTIVITY"
          col="activity"
          sortKey={sortKey}
          sortDir={sortDir}
          onSort={handleSort}
          className="min-w-0"
        />
        <SortColHeader
          label="TYPE"
          col="type"
          sortKey={sortKey}
          sortDir={sortDir}
          onSort={handleSort}
        />
        <SortColHeader
          label="MILESTONE"
          col="milestone"
          sortKey={sortKey}
          sortDir={sortDir}
          onSort={handleSort}
          className="min-w-0"
        />
        <SortColHeader
          label="MILESTONE TYPE"
          col="milestoneType"
          sortKey={sortKey}
          sortDir={sortDir}
          onSort={handleSort}
          className="min-w-0"
        />
        <SortColHeader
          label="PROJECT TYPE"
          col="projectType"
          sortKey={sortKey}
          sortDir={sortDir}
          onSort={handleSort}
        />
        <div className="text-right">ACTION</div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
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
  const [segment, setSegment] = useState<Segment>("departments");
  const [tab, setTab] = useState<Tab>("active");
  const [q, setQ] = useState("");
  const toast = useToast();

  const {
    departments: depts,
    skills,
    activities,
    activityMilestones,
    setActivityMilestones,
    refresh,
  } = useMasters();

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // departments state
  const [editingDept, setEditingDept] = useState<Department | null>(null);
  const [deptDrawer, setDeptDrawer] = useState(false);

  // skills state
  const [editingSkill, setEditingSkill] = useState<Skill | null>(null);
  const [skillDrawer, setSkillDrawer] = useState(false);

  // activities state
  const [editingActivity, setEditingActivity] = useState<Activity | null>(null);
  const [activityDrawer, setActivityDrawer] = useState(false);

  const toggleDept = async (id: string) => {
    const row = depts.find((d) => d.id === id);
    if (!row) return;
    const next: SetupStatus = row.status === "active" ? "inactive" : "active";
    try {
      await updateDepartment(id, { status: next });
      await refresh();
      toast.updated();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to update department");
    }
  };
  const toggleSkill = async (id: string) => {
    const row = skills.find((s) => s.id === id);
    if (!row) return;
    const next: SetupStatus = row.status === "active" ? "inactive" : "active";
    try {
      await updateSkill(id, { status: next });
      await refresh();
      toast.updated();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to update skill");
    }
  };
  const toggleActivity = async (id: string) => {
    const row = activities.find((a) => a.id === id);
    if (!row) return;
    const next: SetupStatus = row.status === "active" ? "inactive" : "active";
    try {
      await updateActivity(id, { status: next });
      await refresh();
      toast.updated();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to update activity");
    }
  };

  const openNewDept = () => {
    setSaveError(null);
    setEditingDept(null);
    setDeptDrawer(true);
  };
  const openNewSkill = () => {
    setSaveError(null);
    setEditingSkill(null);
    setSkillDrawer(true);
  };
  const openNewActivity = () => {
    setSaveError(null);
    setEditingActivity(null);
    setActivityDrawer(true);
  };

  const saveDept = async (name: string) => {
    setSaving(true);
    setSaveError(null);
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
      setSaveError(err instanceof Error ? err.message : "Failed to save department");
    } finally {
      setSaving(false);
    }
  };

  const saveSkill = async (payload: { name: string; categoryId: string }) => {
    setSaving(true);
    setSaveError(null);
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
      setSaveError(err instanceof Error ? err.message : "Failed to save skill");
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
    setSaveError(null);
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
      setSaveError(err instanceof Error ? err.message : "Failed to save activity");
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
    if (segment === "departments") openNewDept();
    else if (segment === "skills") openNewSkill();
    else openNewActivity();
  };

  const addLabel = {
    departments: "Add department",
    skills: "Add skill",
    activities: "Add activity",
  }[segment];

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
          onClick={handleAdd}
          className="flex cursor-pointer items-center gap-1.5 rounded-md bg-primary px-3.5 py-1.5 text-[12px] font-medium text-primary-foreground"
        >
          <Plus className="h-3.5 w-3.5" /> {addLabel}
        </button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden bg-background p-5">
        {/* segment switcher */}
        <div className="flex flex-shrink-0 gap-1 self-start rounded-lg border border-border bg-surface p-1">
          {(["departments", "skills", "activities"] as Segment[]).map((seg) => (
            <button
              key={seg}
              onClick={() => { setSegment(seg); setTab("active"); setQ(""); }}
              className={`cursor-pointer rounded-md px-4 py-1.5 text-[12px] font-medium capitalize ${
                segment === seg
                  ? "bg-brand text-white"
                  : "text-muted hover:bg-surface-alt"
              }`}
            >
              {segmentLabels[seg]}
            </button>
          ))}
        </div>

        {saveError && !deptDrawer && !skillDrawer && !activityDrawer && (
          <div className="flex-shrink-0 rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-[12px] text-danger">
            {saveError}
          </div>
        )}

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
          {segment === "departments" && (
            <DepartmentsList
              tab={tab}
              q={q}
              rows={depts}
              onEdit={(d) => { setSaveError(null); setEditingDept(d); setDeptDrawer(true); }}
              onToggle={toggleDept}
            />
          )}
          {segment === "skills" && (
            <SkillsList
              tab={tab}
              q={q}
              rows={skills}
              onEdit={(s) => { setSaveError(null); setEditingSkill(s); setSkillDrawer(true); }}
              onToggle={toggleSkill}
            />
          )}
          {segment === "activities" && (
            <ActivitiesList
              tab={tab}
              q={q}
              rows={activities}
              milestones={activityMilestones}
              onEdit={(a) => { setSaveError(null); setEditingActivity(a); setActivityDrawer(true); }}
              onToggle={toggleActivity}
            />
          )}
        </div>

        {/* activities billable note */}
        {segment === "activities" && (
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
          error={saveError}
          onClose={() => setDeptDrawer(false)}
          onSave={(name) => void saveDept(name)}
        />
      )}
      {skillDrawer && (
        <SkillDrawer
          skill={editingSkill}
          saving={saving}
          error={saveError}
          onClose={() => setSkillDrawer(false)}
          onSave={(payload) => void saveSkill(payload)}
        />
      )}
      {activityDrawer && (
        <ActivityDrawer
          activity={editingActivity}
          milestones={activityMilestones}
          saving={saving}
          error={saveError}
          onClose={() => setActivityDrawer(false)}
          onSave={(payload) => void saveActivity(payload)}
          onCreateMilestone={handleCreateMilestone}
        />
      )}
    </div>
  );
}
