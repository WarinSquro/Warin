import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Search } from "lucide-react";
import { fetchTeamProjects, type TeamProjectCard } from "../api/domain";
import { FilterSingleSelect } from "../components/FilterSingleSelect";
import { ProjectHealthBadge } from "../components/ProjectHealthBadge";
import { Tooltip } from "../components/Tooltip";
import { ProjectTypeBadge } from "../components/ProjectTypeBadge";
import { TruncateText } from "../components/TruncateText";
import { useToast } from "../context/ToastContext";
import { useAppDateFormat } from "../hooks/useAppDateFormat";
import type { ProjectHealth } from "../data/executionReport";
import { formatHoursLabel } from "../utils/formatHours";

type HealthFilter = "all" | ProjectHealth;
type StatusFilter = "active" | "inactive" | "all";

const STATUS_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
  { value: "all", label: "All" },
] as const;

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`cursor-pointer rounded-md px-3 py-1.5 text-[12px] ${
        active ? "bg-brand font-medium text-white" : "text-muted hover:bg-surface-alt"
      }`}
    >
      {children}
    </button>
  );
}

function TeamProjectCardView({
  row,
  formatDate,
}: {
  row: TeamProjectCard;
  formatDate: (iso: string | null | undefined) => string;
}) {
  const statusLabel = row.status === "active" && row.isActive ? "Active" : "Inactive";
  const thisWeekLabel = `${formatHoursLabel(row.weekPlannedHours)} this week`;
  const nextWeekLabel = `${formatHoursLabel(row.nextWeekPlannedHours ?? 0)} next week`;
  const planTooltip = `your team plan\n${thisWeekLabel}\n${nextWeekLabel}`;

  return (
    <article className="flex flex-col rounded-lg border border-border bg-surface">
      <div className="flex items-start justify-between gap-4 border-b border-border-soft px-4 py-3.5">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <ProjectHealthBadge health={row.health} />
            <h3 className="text-[14px] font-semibold text-foreground">{row.projectName}</h3>
            <ProjectTypeBadge type={row.type} />
            <span className="rounded-sm bg-surface-alt px-1.5 py-0.5 text-[10px] font-semibold text-muted">
              {statusLabel}
            </span>
          </div>
          <div className="mt-1 text-[12px] text-muted-foreground">
            <TruncateText
              text={`${row.customerName} · ${formatDate(row.startDate)} – ${formatDate(row.endDate)}`}
              className="block truncate"
            />
          </div>
        </div>
        <Tooltip label={planTooltip} multiline placement="bottom">
          <div className="shrink-0 cursor-default text-right">
            <div className="text-[12px] font-medium text-foreground">{thisWeekLabel}</div>
            <div className="mt-0.5 text-[11px] text-muted-foreground">{nextWeekLabel}</div>
          </div>
        </Tooltip>
      </div>

      <div className="border-b border-border-soft px-4 py-3">
        <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted">
          Team ({row.teamHeadcount})
        </div>
        <div className="flex flex-wrap gap-1.5">
          {row.members.map((m) => (
            <span
              key={m.employeeId}
              className="inline-flex items-center gap-1 rounded-md border border-border bg-surface-alt px-2 py-1 text-[11px] text-foreground"
              title={`${m.name} (${m.relation === "direct" ? "Direct" : "Indirect"})`}
            >
              {m.name}
              <span
                className={`rounded-sm px-1 py-0 text-[9px] font-semibold uppercase ${
                  m.relation === "direct"
                    ? "bg-brand/10 text-brand"
                    : "bg-surface text-muted-foreground"
                }`}
              >
                {m.relation === "direct" ? "Direct" : "Indirect"}
              </span>
            </span>
          ))}
        </div>
      </div>

      <div className="px-4 py-3">
        <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted">Milestones</div>
        {row.milestones.length === 0 ? (
          <div className="text-[12px] text-muted-foreground">No milestones defined</div>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {row.milestones.map((m, idx) => (
              <li
                key={m.id}
                className={`flex items-baseline justify-between gap-3 text-[12px] ${
                  m.isNext
                    ? "font-semibold text-foreground"
                    : m.isOverdue
                      ? "text-danger"
                      : "text-muted-foreground"
                }`}
              >
                <span className="min-w-0 truncate">
                  {idx + 1}. {m.name}
                  {m.isOverdue && <span className="ml-1.5 font-semibold">Overdue</span>}
                  {m.isNext && <span className="ml-1.5 font-semibold text-foreground">Next</span>}
                </span>
                <span className="shrink-0">{formatDate(m.date)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </article>
  );
}

export function TeamProjects() {
  const toast = useToast();
  const { formatDate } = useAppDateFormat();
  const [items, setItems] = useState<TeamProjectCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [healthFilter, setHealthFilter] = useState<HealthFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("active");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchTeamProjects(statusFilter);
      setItems(res.items);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to load team projects";
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((row) => {
      if (healthFilter !== "all" && row.health !== healthFilter) return false;
      if (!q) return true;
      if (row.projectName.toLowerCase().includes(q)) return true;
      if (row.customerName.toLowerCase().includes(q)) return true;
      if (row.members.some((m) => m.name.toLowerCase().includes(q))) return true;
      return false;
    });
  }, [items, search, healthFilter]);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <header className="flex h-14 flex-shrink-0 items-center justify-between border-b border-border bg-surface px-5">
        <div>
          <div className="text-[15px] font-semibold tracking-tight text-foreground">Team Projects</div>
          <div className="text-[12px] text-muted-foreground">
            Projects your team is working on · view only
          </div>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-auto bg-background p-5">
        {error && <div className="mb-3 text-[12px] text-danger">{error}</div>}

        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-border bg-surface px-4 py-2.5">
          <div className="relative min-w-[200px] flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search project, customer, or member…"
              className="w-full rounded-md border border-border bg-surface py-1.5 pl-8 pr-2.5 text-[12px] text-foreground outline-none placeholder:text-muted-foreground focus:border-primary"
            />
          </div>
          <div className="flex overflow-hidden rounded-md border border-border text-[12px]">
            {(
              [
                ["all", "All"],
                ["green", "Green"],
                ["amber", "Amber"],
                ["red", "Red"],
              ] as const
            ).map(([id, label]) => (
              <FilterChip
                key={id}
                active={healthFilter === id}
                onClick={() => setHealthFilter(id)}
              >
                {label}
              </FilterChip>
            ))}
          </div>
          <FilterSingleSelect
            value={statusFilter}
            onChange={(v) => setStatusFilter(v as StatusFilter)}
            options={STATUS_OPTIONS}
            aria-label="Project status filter"
          />
        </div>

        {loading ? (
          <div className="py-16 text-center text-[12px] text-muted-foreground">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-[12px] text-muted-foreground">
            {items.length === 0
              ? "No projects with team allocation."
              : "No projects match your search or filters."}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {filtered.map((row) => (
              <TeamProjectCardView key={row.projectId} row={row} formatDate={formatDate} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
