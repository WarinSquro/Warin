import { useState, useEffect } from "react";
import { ChevronDown, ChevronUp, Copy, Plus, Trash2 } from "lucide-react";
import {
  addCompetency,
  copyCompetenciesFromDepartment,
  getDepartmentConfigStatus,
  getWeeklyCheckInConfig,
  moveCompetency,
  rankingChipClass,
  removeCompetency,
  saveWeeklyCheckInConfig,
  updateRankingTitle,
} from "../data/weeklyCheckIn";
import type { CompetencyKind, DepartmentConfigStatus } from "../data/weeklyCheckIn";
import { useMasters } from "../context/MastersContext";
import { useToast } from "../context/ToastContext";
import { ConfirmDeleteDialog } from "../components/ConfirmDeleteDialog";
import { fetchWeeklyCheckInConfig, putWeeklyCheckInConfig } from "../api/domain";

type Segment = "competencies" | "ranking";

const STATUS_CHIP: Record<DepartmentConfigStatus, { label: string; className: string }> = {
  set: { label: "✓ Set", className: "border-success-border bg-success-soft text-success-fg" },
  partial: { label: "Partial", className: "border-warning-border bg-warning-soft text-warning" },
  not_set: { label: "Not set", className: "border-danger-border bg-danger-soft text-danger" },
};

export function WeeklyCheckInConfig() {
  const { departments } = useMasters();
  const toast = useToast();
  const [segment, setSegment] = useState<Segment>("competencies");
  const [selectedDeptId, setSelectedDeptId] = useState("");
  const [config, setConfig] = useState(() => getWeeklyCheckInConfig());
  const [newLabel, setNewLabel] = useState("");
  const [newKind, setNewKind] = useState<CompetencyKind>("technical");
  const [copyFromId, setCopyFromId] = useState("");
  const [editingRank, setEditingRank] = useState<number | null>(null);
  const [rankDraft, setRankDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [pendingDelete, setPendingDelete] = useState<{
    id: string;
    label: string;
    kind: CompetencyKind;
  } | null>(null);

  const activeDepts = departments.filter((d) => d.status === "active");
  const deptKey = (d: (typeof activeDepts)[0]) => d.dbId ?? d.id;

  useEffect(() => {
    if (!selectedDeptId && activeDepts[0]) setSelectedDeptId(deptKey(activeDepts[0]));
  }, [activeDepts, selectedDeptId]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void fetchWeeklyCheckInConfig()
      .then((apiConfig) => {
        if (cancelled) return;
        saveWeeklyCheckInConfig({
          competenciesByDepartment: apiConfig.competenciesByDepartment as never,
          rankingLevels: apiConfig.rankingLevels as never,
          actionTypes: apiConfig.actionTypes,
        });
        setConfig(getWeeklyCheckInConfig());
        setLoadError("");
      })
      .catch((e) => {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : "Failed to load configuration");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const deptComps = config.competenciesByDepartment[selectedDeptId] ?? [];
  const techComps = deptComps.filter((c) => c.kind === "technical").sort((a, b) => a.sequence - b.sequence);
  const behComps = deptComps.filter((c) => c.kind === "behavioural").sort((a, b) => a.sequence - b.sequence);

  const persistConfig = async (next: ReturnType<typeof getWeeklyCheckInConfig>) => {
    setSaving(true);
    setSaveError("");
    try {
      await putWeeklyCheckInConfig({
        rankingLevels: next.rankingLevels,
        actionTypes: next.actionTypes,
        competencies: Object.values(next.competenciesByDepartment)
          .flat()
          .map((c) => ({
            code: c.id,
            departmentId: c.departmentId,
            kind: c.kind,
            label: c.label,
            sequence: c.sequence,
          })),
      });
      return true;
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Failed to save configuration");
      return false;
    } finally {
      setSaving(false);
    }
  };

  const refresh = async (notify?: "created" | "updated" | "deleted") => {
    const next = getWeeklyCheckInConfig();
    setConfig(next);
    const ok = await persistConfig(next);
    if (ok && notify === "created") toast.created();
    if (ok && notify === "updated") toast.updated();
    if (ok && notify === "deleted") toast.deleted();
  };

  const handleAdd = () => {
    if (!newLabel.trim()) return;
    const result = addCompetency(selectedDeptId, newKind, newLabel);
    if (!result.ok) return;
    setNewLabel("");
    void refresh("created");
  };

  const handleCopy = () => {
    if (!copyFromId || copyFromId === selectedDeptId) return;
    copyCompetenciesFromDepartment(copyFromId, selectedDeptId);
    void refresh("created");
  };

  const saveRankTitle = (value: 1 | 2 | 3 | 4 | 5) => {
    updateRankingTitle(value, rankDraft);
    setEditingRank(null);
    void refresh("updated");
  };

  const confirmDeleteCompetency = () => {
    if (!pendingDelete) return;
    removeCompetency(pendingDelete.id);
    setPendingDelete(null);
    void refresh("deleted");
  };

  const renderCompList = (kind: CompetencyKind, list: typeof techComps, title: string) => (
    <div className="rounded-lg border border-border bg-surface p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-[13px] font-semibold text-foreground">{title}</div>
        <span className="text-[11px] text-muted-foreground">
          {list.length} of 5 · {5 - list.length} slot{5 - list.length !== 1 ? "s" : ""} left
        </span>
      </div>
      <div className="space-y-2">
        {list.map((c) => (
          <div
            key={c.id}
            className="flex items-center gap-2 rounded-md border border-border-soft bg-surface-alt/70 px-2.5 py-2"
          >
            <span className="flex h-6 w-6 items-center justify-center rounded bg-surface text-[11px] font-semibold text-muted-foreground">
              {c.sequence}
            </span>
            <span className="flex-1 text-[12px] text-foreground">{c.label}</span>
            <button
              type="button"
              onClick={() => {
                moveCompetency(c.id, "up");
                void refresh("updated");
              }}
              className="rounded p-1 text-muted-foreground hover:bg-surface"
              aria-label="Move up"
            >
              <ChevronUp className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => {
                moveCompetency(c.id, "down");
                void refresh("updated");
              }}
              className="rounded p-1 text-muted-foreground hover:bg-surface"
              aria-label="Move down"
            >
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setPendingDelete({ id: c.id, label: c.label, kind: c.kind })}
              className="rounded p-1 text-danger hover:bg-danger-soft/30"
              aria-label="Remove"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
      {list.length < 5 && (
        <div className="mt-3 flex gap-2">
          <input
            value={newKind === kind ? newLabel : ""}
            onChange={(e) => {
              setNewKind(kind);
              setNewLabel(e.target.value);
            }}
            onFocus={() => setNewKind(kind)}
            placeholder={`Add ${kind} competency…`}
            className="flex-1 rounded-md border border-border bg-surface px-2.5 py-1.5 text-[12px] outline-none focus:border-accent-line"
          />
          <button
            type="button"
            onClick={() => {
              setNewKind(kind);
              handleAdd();
            }}
            className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-[12px] font-medium text-primary-foreground"
          >
            <Plus className="h-3.5 w-3.5" />
            Add
          </button>
        </div>
      )}
    </div>
  );

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center text-[13px] text-muted-foreground">
        Loading configuration…
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <header className="flex h-14 flex-shrink-0 items-center justify-between border-b border-border bg-surface px-5">
        <div>
          <div className="text-[15px] font-semibold tracking-tight text-foreground">
            Weekly Check-In Config
          </div>
          <div className="text-[12px] text-muted-foreground">
            Department competencies and ranking master
          </div>
        </div>
        <div className="text-[11px] text-muted-foreground">
          {saving ? "Saving…" : saveError ? <span className="text-danger">{saveError}</span> : null}
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden bg-background p-5">
        {loadError && (
          <div className="flex-shrink-0 rounded-md border border-danger-border bg-danger-soft px-3 py-2 text-[12px] text-danger">
            {loadError}
          </div>
        )}
        <div className="flex flex-shrink-0 gap-1 self-start rounded-lg border border-border bg-surface p-1">
          {(
            [
              ["competencies", "Competencies"],
              ["ranking", "Ranking Master"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setSegment(id)}
              className={`rounded-md px-4 py-1.5 text-[12px] font-medium ${
                segment === id ? "bg-brand text-white" : "text-muted hover:bg-surface-alt"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {segment === "competencies" ? (
          <div className="flex min-h-0 flex-1 overflow-hidden rounded-lg border border-border bg-surface">
            <aside className="flex w-[220px] flex-shrink-0 flex-col border-r border-border-soft bg-surface">
              <div className="border-b border-border-soft px-3 py-2.5 text-[11px] font-medium uppercase tracking-wide text-muted">
                Departments
              </div>
              <div className="flex-1 overflow-y-auto p-2">
                {activeDepts.map((d) => {
                  const key = deptKey(d);
                  const st = getDepartmentConfigStatus(key);
                  const chip = STATUS_CHIP[st];
                  const selected = selectedDeptId === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setSelectedDeptId(key)}
                      className={`mb-0.5 flex w-full items-center justify-between rounded-md border-l-[3px] px-2.5 py-2 text-left text-[12px] ${
                        selected
                          ? "border-primary bg-highlight font-medium text-foreground"
                          : "border-transparent text-foreground hover:bg-surface-alt"
                      }`}
                    >
                      <span className="truncate">{d.name}</span>
                      <span
                        className={`ml-1 shrink-0 rounded border px-1 py-0.5 text-[9px] font-semibold ${chip.className}`}
                      >
                        {chip.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </aside>

            <div className="min-h-0 flex-1 overflow-y-auto p-4 space-y-4">
              <div className="flex flex-wrap items-center gap-2 rounded-md border border-border-soft bg-surface-alt/70 px-3 py-2">
                <Copy className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-[12px] text-muted-foreground">Copy from department</span>
                <select
                  value={copyFromId}
                  onChange={(e) => setCopyFromId(e.target.value)}
                  className="rounded-md border border-border bg-surface px-2 py-1 text-[12px] outline-none focus:border-accent-line"
                >
                  <option value="">Select…</option>
                  {activeDepts
                    .filter((d) => deptKey(d) !== selectedDeptId)
                    .map((d) => (
                      <option key={deptKey(d)} value={deptKey(d)}>
                        {d.name}
                      </option>
                    ))}
                </select>
                <button
                  type="button"
                  onClick={handleCopy}
                  disabled={!copyFromId}
                  className="rounded-md border border-border px-2.5 py-1 text-[11px] text-foreground hover:bg-surface disabled:opacity-40"
                >
                  Apply
                </button>
              </div>
              {renderCompList("technical", techComps, "Technical Competencies")}
              {renderCompList("behavioural", behComps, "Behavioural Competencies")}
              <p className="text-[11px] text-muted-foreground">
                Fewer than five competencies per category is allowed — empty categories are skipped
                during review.
              </p>
            </div>
          </div>
        ) : (
          <div className="max-w-xl space-y-4 rounded-lg border border-border bg-surface p-5 shadow-sm">
            <p className="text-[12px] text-muted-foreground">
              Five levels ordered highest to lowest. Values and colours are fixed; titles are
              editable.
            </p>
            <div className="space-y-2">
              {[...config.rankingLevels].sort((a, b) => b.value - a.value).map((level) => (
                <div
                  key={level.value}
                  className="flex items-center gap-3 rounded-md border border-border-soft bg-surface-alt/50 px-4 py-3"
                >
                  <span
                    className={`flex h-8 w-8 items-center justify-center rounded-md text-[13px] font-bold ${rankingChipClass(level, true)}`}
                  >
                    {level.value}
                  </span>
                  {editingRank === level.value ? (
                    <input
                      autoFocus
                      value={rankDraft}
                      onChange={(e) => setRankDraft(e.target.value)}
                      onBlur={() => saveRankTitle(level.value)}
                      onKeyDown={(e) => e.key === "Enter" && saveRankTitle(level.value)}
                      className="flex-1 rounded-md border border-border bg-surface px-2 py-1 text-[12px] outline-none focus:border-accent-line"
                    />
                  ) : (
                    <span className="flex-1 text-[13px] font-medium text-foreground">
                      {level.title}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setEditingRank(level.value);
                      setRankDraft(level.title);
                    }}
                    className="text-[11px] text-primary hover:underline"
                  >
                    Edit
                  </button>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground">
              Reusable by future Performance Intelligence modules (PIE).
            </p>
          </div>
        )}
      </div>

      <ConfirmDeleteDialog
        open={!!pendingDelete}
        confirming={saving}
        onCancel={() => {
          if (!saving) setPendingDelete(null);
        }}
        onConfirm={confirmDeleteCompetency}
      />
    </div>
  );
}
