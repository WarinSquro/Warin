import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AlertCircle, Check, Search } from "lucide-react";
import { SortColHeader, useColumnSort } from "../components/SortColHeader";
import { useAuth } from "../context/AuthContext";
import { WeeklyCheckInWeekPicker } from "../components/WeeklyCheckInWeekPicker";
import { WeeklyStatusBadge } from "../components/WeeklyCheckInStatusPicker";
import {
  disciplinePctClass,
  formatQueueOpenAction,
  formatReviewStatus,
  getCurrentWeekStart,
  sortQueueRows,
  type QueueRow,
  type QueueSortKey,
  type Recognition,
  type WeeklyStatus,
} from "../data/weeklyCheckIn";
import { fetchWeeklyQueue } from "../api/domain";
import { matchesSearchQuery } from "../utils/textSearch";

type FilterTab = "all" | "pending" | "completed";

const QUEUE_GRID =
  "grid w-full grid-cols-[minmax(0,1.2fr)_minmax(0,0.85fr)_minmax(5.5rem,0.72fr)_minmax(0,1.85fr)_minmax(0,0.88fr)_minmax(5.75rem,0.75fr)] items-start gap-x-5 gap-y-1 px-4";

export function WeeklyCheckInQueue() {
  const { currentEmployee } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const weekStart = searchParams.get("week") ?? getCurrentWeekStart();
  const [filter, setFilter] = useState<FilterTab>("all");
  const [search, setSearch] = useState("");
  const { sortKey, sortDir, handleSort } = useColumnSort<QueueSortKey>("reviewStatus", "asc");
  const [rows, setRows] = useState<QueueRow[]>([]);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let cancelled = false;
    void fetchWeeklyQueue(weekStart)
      .then((res) => {
        if (cancelled) return;
        setRows(
          res.rows.map((r) => ({
            employeeId: r.employeeId,
            employeeName: r.employeeName,
            department: r.department,
            role: r.role,
            initials: r.initials,
            status: r.status,
            submissionId: r.submissionId,
            lastWeekStatus: r.lastWeekStatus as WeeklyStatus | undefined,
            confirmationDiscipline: r.confirmationDiscipline,
            openActionType: r.openActionType,
            openActionNotes: r.openActionNotes,
            prevRecognition: r.prevRecognition as Recognition | undefined,
            prevActionCompleted: r.prevActionCompleted,
            submittedAt: r.submittedAt,
            weeklyStatus: r.weeklyStatus as WeeklyStatus | undefined,
            recognition: r.recognition as Recognition | undefined,
            noPriorReview: r.noPriorReview,
            noOperationalData: r.noOperationalData,
          }))
        );
        setLoadError("");
      })
      .catch((e) => {
        if (!cancelled) {
          setRows([]);
          setLoadError(e instanceof Error ? e.message : "Failed to load queue");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [weekStart]);

  const tabCounts = useMemo(
    () => ({
      all: rows.length,
      pending: rows.filter((r) => r.status === "pending").length,
      completed: rows.filter((r) => r.status === "completed").length,
    }),
    [rows]
  );

  const filtered = useMemo(() => {
    let list = rows;
    if (filter === "pending") list = list.filter((r) => r.status === "pending");
    if (filter === "completed") list = list.filter((r) => r.status === "completed");
    if (search.trim()) {
      list = list.filter((r) => {
        const action = formatQueueOpenAction(r);
        const review = formatReviewStatus(r);
        return matchesSearchQuery(
          search,
          r.employeeName,
          r.role,
          r.department,
          r.lastWeekStatus,
          r.weeklyStatus,
          r.confirmationDiscipline != null ? `${r.confirmationDiscipline}%` : undefined,
          r.confirmationDiscipline,
          action.text,
          r.openActionType,
          r.openActionNotes,
          review.label,
          r.status === "pending" ? "Pending" : "Done",
          r.status
        );
      });
    }
    return list;
  }, [rows, filter, search]);

  const sorted = useMemo(
    () => sortQueueRows(filtered, sortKey, sortDir),
    [filtered, sortKey, sortDir]
  );

  const setWeek = (w: string) => {
    setSearchParams({ week: w });
  };

  const openRow = (row: QueueRow) => {
    navigate(`/my-team/weekly-check-in/${row.employeeId}?week=${weekStart}`);
  };

  if (!currentEmployee) {
    return (
      <div className="flex flex-1 items-center justify-center text-[13px] text-muted-foreground">
        Sign in to view weekly check-in queue.
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-surface">
      <header className="flex h-14 flex-shrink-0 items-center justify-between border-b border-border bg-surface px-5">
        <div>
          <div className="text-[15px] font-semibold tracking-tight text-foreground">
            Weekly Check-In
          </div>
          <div className="text-[12px] text-muted-foreground">
            My Team · reviewing as {currentEmployee.name} · your direct reports only
          </div>
        </div>
        <WeeklyCheckInWeekPicker weekStart={weekStart} onChange={setWeek} />
      </header>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background p-5">
        {loadError && <div className="mb-3 text-[12px] text-danger">{loadError}</div>}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border bg-surface shadow-sm">
          <div className="flex flex-shrink-0 flex-wrap items-center gap-3 border-b border-border-soft px-4 py-2.5">
            <div className="flex min-w-[220px] flex-1 items-center gap-2 rounded-md border border-border bg-surface px-2.5 py-1.5">
              <Search className="pointer-events-none h-3.5 w-3.5 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search your reports…"
                className="w-full bg-transparent text-[12px] text-foreground outline-none placeholder:text-muted-foreground"
              />
            </div>
            <div className="flex gap-1">
              <FilterTabBtn active={filter === "all"} onClick={() => setFilter("all")}>
                All {tabCounts.all}
              </FilterTabBtn>
              <FilterTabBtn active={filter === "pending"} onClick={() => setFilter("pending")}>
                Pending {tabCounts.pending}
              </FilterTabBtn>
              <FilterTabBtn active={filter === "completed"} onClick={() => setFilter("completed")}>
                Completed {tabCounts.completed}
              </FilterTabBtn>
            </div>
          </div>

          <div className={`${QUEUE_GRID} flex-shrink-0 border-b border-border-soft bg-surface-alt py-2 text-[11px] font-semibold text-muted`}>
            <SortColHeader label="RESOURCE" col="resource" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
            <SortColHeader label="LAST WEEK" col="lastWeek" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
            <SortColHeader
              label="CONFIRM %"
              col="confirmationDiscipline"
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={handleSort}
            />
            <SortColHeader label="OPEN ACTION" col="openAction" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
            <SortColHeader
              label="REVIEW"
              col="reviewStatus"
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={handleSort}
            />
            <SortColHeader
              label="STATUS"
              col="status"
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={handleSort}
              className="justify-end"
            />
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            {sorted.length === 0 ? (
              <div className="px-4 py-10 text-center text-[13px] text-muted-foreground">
                {rows.length === 0
                  ? "No direct reports yet — set Resource Owner on employees to build this queue."
                  : "No people match the selected filters."}
              </div>
            ) : (
              sorted.map((row) => {
                const review = formatReviewStatus(row);
                const action = formatQueueOpenAction(row);
                return (
                  <button
                    key={row.employeeId}
                    type="button"
                    onClick={() => openRow(row)}
                    className={`${QUEUE_GRID} w-full border-b border-border-soft py-3 text-left last:border-b-0 hover:bg-surface-alt`}
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-accent-soft text-[11px] font-semibold text-accent-softfg">
                        {row.initials}
                      </div>
                      <div className="min-w-0">
                        <div className="truncate text-[13px] font-medium text-foreground">{row.employeeName}</div>
                        <div className="truncate text-[11px] text-muted-foreground">
                          {row.role} · {row.department}
                        </div>
                      </div>
                    </div>
                    <div className="pt-0.5">
                      {row.lastWeekStatus ? (
                        <WeeklyStatusBadge status={row.lastWeekStatus} />
                      ) : (
                        <span className="text-[11px] text-muted-foreground">—</span>
                      )}
                    </div>
                    <div className={`pt-0.5 text-[12px] ${disciplinePctClass(row.confirmationDiscipline, row.noOperationalData)}`}>
                      {row.noOperationalData || row.confirmationDiscipline == null
                        ? "—"
                        : `${row.confirmationDiscipline}%`}
                    </div>
                    <div
                      className={`pt-0.5 text-[11px] ${
                        action.tone === "warning"
                          ? "text-warning"
                          : action.tone === "success"
                            ? "text-success"
                            : "text-muted-foreground"
                      }`}
                    >
                      {action.text}
                    </div>
                    <div className="pt-0.5 text-[11px] text-muted-foreground">{review.label}</div>
                    <div className="flex justify-end pt-0.5">
                      {row.status === "pending" ? (
                        <span className="inline-flex items-center gap-1 rounded-md border border-warning-border bg-warning-soft px-2 py-0.5 text-[10px] font-medium text-warning">
                          <AlertCircle className="h-3 w-3" /> Pending
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-md border border-success-border bg-success-soft px-2 py-0.5 text-[10px] font-medium text-success">
                          <Check className="h-3 w-3" /> Done
                        </span>
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function FilterTabBtn({
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
      type="button"
      onClick={onClick}
      className={`rounded-md px-2.5 py-1 text-[11px] ${
        active ? "bg-brand font-medium text-white" : "text-muted hover:bg-surface-alt"
      }`}
    >
      {children}
    </button>
  );
}
