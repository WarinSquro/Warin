import { peakDailyAllocationHours } from "../data/planner";
import type { AllocationSlice, PlannerRow } from "../data/planner";
import { useProjects } from "../context/ProjectsContext";
import { useMasters } from "../context/MastersContext";
import { useSettings } from "../context/SettingsContext";
import { ConfirmDeleteDialog } from "./ConfirmDeleteDialog";
import { AppDateInput } from "./AppDateInput";
import { milestoneKindLabel, type Project } from "../data/projects";
import { activitiesForProjectMilestone } from "../data/setup";
import type { Activity, ActivityMilestone } from "../data/setup";
import { useFocusFirstField } from "../hooks/useFocusFirstField";
import { formatHours } from "../utils/formatHours";
import { X, TriangleAlert, Info, Trash2 } from "lucide-react";
import { useState, useEffect, useMemo } from "react";

export interface AllocationEditRef {
  rowId: string;
  view: "day" | "week";
  cellIndex: number;
  chipIndex: number;
  allocationId?: string;
}

export interface AllocationCreateRef {
  rowId: string;
  view: "day" | "week";
  cellIndex: number;
}

export interface AllocationPrefill {
  mode?: "create" | "edit";
  personName?: string;
  projectName?: string;
  hoursPerDay?: number;
  milestoneId?: string;
  activity?: string;
  tasks?: string[];
  start?: string;
  end?: string;
  reason?: string;
  replacingHours?: number;
  pastAllocationHours?: number;
  editRef?: AllocationEditRef;
  createRef?: AllocationCreateRef;
}

export interface AllocationSavePayload {
  personId: string;
  projectId: string;
  milestoneId: string;
  activity: string;
  tasks: string[];
  start: string;
  end: string;
  hoursPerDay: number;
  reason: string;
  editRef?: AllocationEditRef;
  createRef?: AllocationCreateRef;
}

interface Props {
  open: boolean;
  onClose: () => void;
  prefill?: AllocationPrefill | null;
  people?: PlannerRow[];
  /** Live allocations — used to compute selected employee's total daily load. */
  allocations?: AllocationSlice[];
  onSave?: (payload: AllocationSavePayload) => void | Promise<void>;
  onDelete?: (editRef: AllocationEditRef) => void | Promise<void>;
}

function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function upcomingFridayISO(from = new Date()) {
  const date = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const daysUntilFriday = (5 - date.getDay() + 7) % 7;
  date.setDate(date.getDate() + daysUntilFriday);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function inclusiveDaysBetween(start: string, end: string) {
  if (!start || !end || end < start) return 0;
  const s = new Date(`${start}T12:00:00`);
  const e = new Date(`${end}T12:00:00`);
  return Math.round((e.getTime() - s.getTime()) / 86400000) + 1;
}

function createEmptyForm() {
  const start = todayISO();
  return {
    personId: "",
    projectId: "",
    milestoneId: "",
    activity: "",
    tasks: [] as string[],
    start,
    end: upcomingFridayISO(),
    hoursPerDay: 6,
    reason: "",
  };
}

const EMPTY = createEmptyForm();

export function AllocationDrawer({ open, onClose, prefill, people, allocations = [], onSave, onDelete }: Props) {
  const { projects, refresh: refreshProjects } = useProjects();
  const { activities, activityMilestones, refresh: refreshMasters } = useMasters();
  const { settings } = useSettings();
  const roster = people ?? [];
  const isEdit = prefill?.mode === "edit";
  const [form, setForm] = useState({ ...EMPTY });
  const [taskInput, setTaskInput] = useState("");
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const focusRef = useFocusFirstField<HTMLDivElement>(open);
  const today = todayISO();
  /** End date cannot be before start (and in create mode, not before today). */
  const endDateMin = form.start
    ? isEdit
      ? form.start
      : form.start >= today
        ? form.start
        : today
    : isEdit
      ? undefined
      : today;

  const resolveActivities = (milestoneName: string | undefined, projectType: Project["type"] | undefined) =>
    activitiesForProjectMilestone(
      milestoneName,
      projectType,
      activities as Activity[],
      activityMilestones as ActivityMilestone[]
    );

  // Re-fetch if empty (e.g. earlier 403 before planner/availability was allowed on read APIs)
  useEffect(() => {
    if (!open) return;
    if (projects.length === 0) void refreshProjects();
    if (activities.length === 0 || activityMilestones.length === 0) void refreshMasters();
  }, [open, projects.length, activities.length, activityMilestones.length, refreshProjects, refreshMasters]);

  useEffect(() => {
    if (open) {
      const person = roster.find((p) => p.name === prefill?.personName);
      const project = projects.find((p) => p.name === prefill?.projectName);
      const defaults = createEmptyForm();
      const milestoneId =
        prefill?.milestoneId ??
        (project?.milestones[0]?.id ?? "");
      const milestone = project?.milestones.find((m) => m.id === milestoneId);
      const acts = milestone
        ? resolveActivities(milestone.name, project?.type)
        : [];
      setConfirmDeleteOpen(false);
      setDeleting(false);
      setForm({
        ...defaults,
        personId: person?.id ?? "",
        projectId: project?.id ?? "",
        milestoneId,
        activity: prefill?.activity ?? acts[0]?.name ?? "",
        tasks: prefill?.tasks ? [...prefill.tasks] : [],
        start: prefill?.start ?? defaults.start,
        end: prefill?.end ?? defaults.end,
        hoursPerDay: Math.min(12, prefill?.hoursPerDay ?? 6),
        reason: prefill?.reason ?? "",
      });
      setTaskInput("");
    }
  }, [open, prefill, projects, roster, activities, activityMilestones]);

  const person = roster.find((p) => p.id === form.personId);
  const project = projects.find((p) => p.id === form.projectId);
  const projectMilestones = project?.milestones ?? [];
  const selectedProjectMilestone = projectMilestones.find((m) => m.id === form.milestoneId);
  const noProjectMilestones = !!project && projectMilestones.length === 0;
  const availableActivities = resolveActivities(
    selectedProjectMilestone?.name,
    project?.type
  );

  useEffect(() => {
    if (!form.milestoneId || !project) return;
    if (!project.milestones.some((m) => m.id === form.milestoneId)) {
      setForm((f) => ({ ...f, milestoneId: "" }));
    }
  }, [form.milestoneId, form.projectId, project]);

  useEffect(() => {
    if (!form.activity || !project || !selectedProjectMilestone) return;
    const allowed = resolveActivities(selectedProjectMilestone.name, project.type);
    if (!allowed.some((a) => a.name === form.activity)) {
      setForm((f) => ({ ...f, activity: "" }));
    }
  }, [form.milestoneId, form.projectId, form.activity, project, selectedProjectMilestone?.name, activities, activityMilestones]);

  const allocationDays = inclusiveDaysBetween(form.start, form.end);
  const newAllocationHours = allocationDays * form.hoursPerDay;
  const hoursHint =
    allocationDays > 0
      ? `${formatHours(newAllocationHours)} hrs total · ${allocationDays} day${allocationDays === 1 ? "" : "s"}`
      : undefined;

  const calendarOpts = useMemo(
    () => ({
      workingDays: settings.workingDays,
      companyOffDays: settings.companyOffDays.map((d) => d.date.slice(0, 10)),
      workingHoursPerDay: settings.workingHoursPerDay,
    }),
    [settings.workingDays, settings.companyOffDays, settings.workingHoursPerDay]
  );

  // Peak daily load for the selected employee (existing overlapping allocs + this draft).
  const combinedHoursPerDay = useMemo(() => {
    if (!form.personId || !form.start || !form.end || form.end < form.start) {
      return form.hoursPerDay;
    }
    return peakDailyAllocationHours(allocations, form.personId, form.start, form.end, {
      calendar: calendarOpts,
      extraHoursPerDay: form.hoursPerDay,
      excludeAllocationId: prefill?.editRef?.allocationId,
    });
  }, [
    allocations,
    form.personId,
    form.start,
    form.end,
    form.hoursPerDay,
    calendarOpts,
    prefill?.editRef?.allocationId,
  ]);

  const dailyLimit = settings.workingHoursPerDay;
  // Only warn once a team member is chosen and their total daily hours exceed Hours per Day.
  const isOver =
    !!form.personId &&
    !!form.start &&
    !!form.end &&
    form.end >= form.start &&
    combinedHoursPerDay > dailyLimit + 0.01;
  const overPct = isOver
    ? Math.round(((combinedHoursPerDay - dailyLimit) / dailyLimit) * 100)
    : 0;

  const canSave =
    !!form.personId &&
    !!form.projectId &&
    !noProjectMilestones &&
    !!form.milestoneId &&
    !!form.activity &&
    !!form.start &&
    !!form.end &&
    (isEdit || form.start >= today) &&
    (isEdit || form.end >= today) &&
    form.end >= form.start &&
    (!isOver || form.reason.trim().length > 0);

  const handleSave = async () => {
    if (!canSave) return;
    try {
      await onSave?.({
        personId: form.personId,
        projectId: form.projectId,
        milestoneId: form.milestoneId,
        activity: form.activity,
        tasks: [...form.tasks],
        start: form.start,
        end: form.end,
        hoursPerDay: form.hoursPerDay,
        reason: form.reason,
        editRef: prefill?.editRef,
        createRef: prefill?.createRef,
      });
      onClose();
    } catch {
      /* keep drawer open — parent surfaces error */
    }
  };

  /** Only strictly future allocations (start after today) may be deleted. */
  const canDelete =
    isEdit &&
    !!prefill?.editRef &&
    !!prefill.start &&
    prefill.start > today;

  const handleDelete = async () => {
    if (!canDelete || !prefill?.editRef) return;
    setDeleting(true);
    try {
      await onDelete?.(prefill.editRef);
      setConfirmDeleteOpen(false);
      onClose();
    } catch {
      /* keep drawer open — parent surfaces error */
    } finally {
      setDeleting(false);
    }
  };

  const set = (k: keyof typeof form, v: string | number) => setForm((f) => ({ ...f, [k]: v }));

  const setHoursPerDay = (raw: number) => {
    if (!Number.isFinite(raw)) return;
    set("hoursPerDay", Math.min(12, Math.max(0, raw)));
  };

  const addTask = () => {
    const v = taskInput.trim();
    if (v && !form.tasks.includes(v)) {
      setForm((f) => ({ ...f, tasks: [...f.tasks, v] }));
    }
    setTaskInput("");
  };

  const removeTask = (task: string) => {
    setForm((f) => ({ ...f, tasks: f.tasks.filter((t) => t !== task) }));
  };

  const setStart = (start: string) => {
    // Past calendar days are disabled; ignore any value before today.
    if (start && start < today) return;
    setForm((f) => {
      const nextEnd = f.end && start > f.end ? start : f.end;
      return { ...f, start, end: nextEnd };
    });
  };

  const setEnd = (end: string) => {
    setForm((f) => {
      if (f.start && end < f.start) return f;
      return { ...f, end };
    });
  };

  return (
    <div className={`fixed inset-0 z-40 ${open ? "" : "pointer-events-none"}`}>
      <div
        onClick={onClose}
        className={`absolute inset-0 bg-brand/30 transition-opacity duration-200 ${open ? "opacity-100" : "opacity-0"}`}
      />
      <div
        ref={focusRef}
        className={`absolute right-0 top-0 flex h-full w-[344px] flex-col bg-surface shadow-2xl transition-transform duration-200 ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex flex-shrink-0 items-center justify-between border-b border-border-soft px-[18px] py-3.5">
          <div className="text-[14px] font-semibold text-foreground">
            {isEdit ? "Edit Allocation" : "New Allocation"}
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-1 flex-col gap-3.5 overflow-y-auto px-[18px] py-[18px]">
          <Field label="Team Member" required>
            <Select value={form.personId} onChange={(v) => set("personId", v)} placeholder="Select person">
              {roster.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </Select>
          </Field>

          <Field label="Project" required>
            <Select value={form.projectId} onChange={(v) => { set("projectId", v); set("milestoneId", ""); set("activity", ""); }} placeholder="Select project">
              {projects.filter((p) => p.status === "active").map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </Select>
          </Field>

          <Field label="Milestone" required hint="from milestones added to this project">
            <Select
              value={form.milestoneId}
              onChange={(v) => setForm((f) => ({ ...f, milestoneId: v, activity: "" }))}
              placeholder="Select milestone"
              disabled={!project || noProjectMilestones}
            >
              {projectMilestones.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                  {m.kind ? ` · ${milestoneKindLabel(m.kind)}` : ""}
                </option>
              ))}
            </Select>
          </Field>

          {project && noProjectMilestones && (
            <div className="flex gap-2.5 rounded-md border border-warning-border bg-warning-soft px-3 py-2.5">
              <Info className="mt-px h-3.5 w-3.5 flex-shrink-0 text-warning" />
              <div className="text-[11px] leading-relaxed text-warning">
                This project has no milestones yet — add them in Projects before allocating.
              </div>
            </div>
          )}

          <Field label="Activity" required hint="from activities linked to milestone">
            <Select
              value={form.activity}
              onChange={(v) => set("activity", v)}
              placeholder="Select activity"
              disabled={!form.milestoneId}
            >
              {availableActivities.map((a) => (
                <option key={a.id} value={a.name}>{a.name}</option>
              ))}
            </Select>
            {form.milestoneId && availableActivities.length === 0 && (
              <div className="mt-1.5 text-[11px] text-muted-foreground">
                No activities mapped to this milestone yet — link them in Org → Activities.
              </div>
            )}
          </Field>

          <Field label="Tasks">
            <div className="flex gap-2">
              <input
                value={taskInput}
                onChange={(e) => setTaskInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addTask())}
                placeholder="Type a task, Enter to add"
                className="flex-1 rounded-md border border-border bg-surface px-2.5 py-2 text-[13px] text-foreground outline-none placeholder:text-muted-foreground focus:border-primary"
              />
              <button
                type="button"
                onClick={addTask}
                className="rounded-md border border-accent-line px-3 text-[12px] text-primary hover:bg-accent-soft"
              >
                Add
              </button>
            </div>
            {form.tasks.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {form.tasks.map((task) => (
                  <span
                    key={task}
                    className="flex items-center gap-1 rounded-sm bg-accent-soft px-2 py-0.5 text-[11px] text-accent-softfg"
                  >
                    {task}
                    <button type="button" onClick={() => removeTask(task)} className="hover:text-danger">
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </Field>

          <div className="flex gap-2.5">
            <Field label="Start" required>
              <AppDateInput value={form.start} onChange={setStart} min={today} inputClassName="focus:border-primary" />
            </Field>
            <Field label="End" required>
              <AppDateInput value={form.end} onChange={setEnd} min={endDateMin} inputClassName="focus:border-primary" />
            </Field>
          </div>
          {!isEdit && form.start && form.start < today && (
            <div className="text-[11px] text-danger">System don't allow past dates.</div>
          )}
          {form.start && form.end && form.end < form.start && (
            <div className="text-[11px] text-danger">End date must be on or after the start date.</div>
          )}

          <Field label="Hours per day" hint={hoursHint}>
            <input
              type="number"
              min={0}
              max={12}
              step={0.5}
              value={form.hoursPerDay}
              onChange={(e) => setHoursPerDay(Number(e.target.value))}
              className="w-full rounded-md border border-border bg-surface px-2.5 py-2 text-[13px] text-foreground outline-none focus:border-primary"
            />
          </Field>

          {isOver && (
            <div className="rounded-md border border-danger-border bg-danger-soft px-3 py-2.5">
              <div className="flex gap-2.5">
                <TriangleAlert className="mt-px h-3.5 w-3.5 flex-shrink-0 text-danger" />
                <div className="text-[11px] leading-relaxed text-danger-fg">
                  This pushes {person?.name.split(" ")[0] ?? "this allocation"} to{" "}
                  <b>
                    {formatHours(combinedHoursPerDay)}h / {formatHours(dailyLimit)}h
                  </b>{" "}
                  per day. Overallocated by {overPct}%.
                </div>
              </div>
              <div className="mt-2.5">
                <div className="mb-1 text-[11px] font-medium text-danger-fg">Reason for overallocation <span className="text-danger">*</span></div>
                <textarea
                  value={form.reason}
                  onChange={(e) => set("reason", e.target.value)}
                  placeholder="Logged to the audit trail…"
                  rows={2}
                  className="w-full resize-none rounded-md border border-danger-border bg-surface px-2.5 py-1.5 text-[12px] text-foreground outline-none placeholder:text-muted-foreground focus:border-danger"
                />
              </div>
            </div>
          )}
        </div>

        {isEdit && (
          <div className="flex-shrink-0 border-t border-border-soft px-[18px] py-3">
            {canDelete ? (
              <div className="rounded-md border border-danger-border bg-danger-soft px-3 py-2.5">
                <button
                  type="button"
                  onClick={() => setConfirmDeleteOpen(true)}
                  className="flex w-full items-center justify-center gap-1.5 rounded-md border border-danger-border bg-surface px-3 py-2 text-[12px] font-medium text-danger transition-colors hover:bg-danger-soft"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete allocation
                </button>
              </div>
            ) : (
              <div className="rounded-md border border-border bg-surface-alt px-3 py-2.5 text-[11px] leading-relaxed text-muted-foreground">
                Past and current allocations cannot be deleted — adjust hours instead.
              </div>
            )}
          </div>
        )}

        <div className="flex flex-shrink-0 gap-2.5 border-t border-border-soft px-[18px] py-3.5">
          <button onClick={onClose} className="flex-1 rounded-md border border-border py-2 text-[13px] font-medium text-foreground hover:bg-surface-alt">
            Cancel
          </button>
          <button
            disabled={!canSave}
            onClick={handleSave}
            className="flex-1 rounded-md bg-primary py-2 text-[13px] font-medium text-primary-foreground transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isEdit ? "Save Changes" : "Save Allocation"}
          </button>
        </div>
      </div>

      <ConfirmDeleteDialog
        open={confirmDeleteOpen}
        confirming={deleting}
        onCancel={() => {
          if (!deleting) setConfirmDeleteOpen(false);
        }}
        onConfirm={() => void handleDelete()}
      />
    </div>
  );
}

function Field({ label, required, hint, children }: { label: string; required?: boolean; hint?: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-1 flex-col">
      <span className="mb-1.5 text-[11px] text-muted">
        {label} {required && <span className="text-danger">*</span>}
        {hint && <span className="text-muted-foreground"> · {hint}</span>}
      </span>
      {children}
    </label>
  );
}

function Select({ value, onChange, children, placeholder, disabled }: { value: string; onChange: (v: string) => void; children: React.ReactNode; placeholder: string; disabled?: boolean }) {
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-md border border-border bg-surface px-2.5 py-2 text-[13px] text-foreground outline-none focus:border-primary disabled:opacity-50"
    >
      <option value="" disabled>{placeholder}</option>
      {children}
    </select>
  );
}
