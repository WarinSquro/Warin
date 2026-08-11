import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, X } from "lucide-react";
import { WeeklyCheckInEvidencePanel } from "../components/WeeklyCheckInEvidencePanel";
import { WeeklyCheckInSubmittedReviewFields } from "../components/WeeklyCheckInSubmittedReviewFields";
import { CompetencyRankingLegend } from "../components/CompetencyRankingLegend";
import {
  ConfidenceArcLegend,
  CONFIDENCE_DOT_STYLES,
  StatusArcLegend,
  WeeklyConfidenceBadge,
  WeeklyStatusBadge,
} from "../components/WeeklyCheckInStatusPicker";
import {
  addWeeks,
  getSubmitterName,
  getCurrentWeekStart,
  getCompetenciesForDepartment,
  getWeeklyCheckInConfig,
  formatWeekLabel,
  rankingChipClass,
  rankingLevelForValue,
  saveWeeklyCheckInConfig,
  weeklyStatusArcClass,
} from "../data/weeklyCheckIn";
import type { WeeklyCheckInSubmission, EmployeeHistory } from "../data/weeklyCheckIn";
import { useAuth } from "../context/AuthContext";
import { useEmployees } from "../context/EmployeesContext";
import { useMasters } from "../context/MastersContext";
import { useSettings } from "../context/SettingsContext";
import { fetchWeeklyCheckInConfig, fetchWeeklySubmissions } from "../api/domain";
import { mapApiWeeklySubmission } from "../api/liveViews";
import { useAppDateFormat } from "../hooks/useAppDateFormat";
import { useSharedDataSync, MASTER_TXN_SYNC_INTERVAL_MS } from "../hooks/useSharedDataSync";

const HISTORY_WEEK_COUNT = 8;

export function WeeklyCheckInHistory() {
  const { employeeId = "" } = useParams();
  const { currentEmployee, isSuperAdmin } = useAuth();
  const { employees, loading: employeesLoading } = useEmployees();
  const { departments } = useMasters();
  const { settings } = useSettings();
  // Route param and Employee.id are both HRMS ids.
  const emp = employees.find((e) => e.id === employeeId);
  const dept = departments.find((d) => d.name === emp?.department);

  const [submissions, setSubmissions] = useState<WeeklyCheckInSubmission[]>([]);
  const [configReady, setConfigReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const reviewerId = currentEmployee?.id ?? "";
  const isDirectReport = !!emp && (isSuperAdmin || emp.resourceOwnerId === reviewerId);

  const loadHistory = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!opts?.silent) setLoading(true);
      try {
        const [config, rows] = await Promise.all([
          fetchWeeklyCheckInConfig(),
          fetchWeeklySubmissions({ employeeHrmsId: employeeId }),
        ]);
        saveWeeklyCheckInConfig({
          competenciesByDepartment: config.competenciesByDepartment as never,
          rankingLevels: config.rankingLevels as never,
          actionTypes: config.actionTypes,
        });
        setConfigReady(true);
        setSubmissions(rows.map(mapApiWeeklySubmission));
        setLoadError("");
      } catch (e) {
        setSubmissions([]);
        setLoadError(e instanceof Error ? e.message : "Failed to load history");
      } finally {
        if (!opts?.silent) setLoading(false);
      }
    },
    [employeeId]
  );

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  useSharedDataSync(true, () => loadHistory({ silent: true }), {
    resources: ["weekly-check-in"],
    intervalMs: MASTER_TXN_SYNC_INTERVAL_MS,
  });

  const history = useMemo((): EmployeeHistory => {
    const current = getCurrentWeekStart();
    const lastCompleted = addWeeks(current, -1);
    const weekStarts = Array.from({ length: HISTORY_WEEK_COUNT }, (_, i) =>
      addWeeks(lastCompleted, i - HISTORY_WEEK_COUNT + 1)
    );
    const weeks = weekStarts.map((weekStart) => {
      const sub = submissions.find((s) => s.weekStart === weekStart);
      return {
        weekStart,
        weekLabel: formatWeekLabel(weekStart, settings.workingDays).split(",")[0] ?? weekStart,
        submissionId: sub?.id,
        weeklyStatus: sub?.weeklyStatus,
        confidence: sub?.confidence,
        technicalRatings: sub?.technicalRatings ?? {},
        behaviouralRatings: sub?.behaviouralRatings ?? {},
        actionType: sub?.actionType,
        actionOutcome: sub?.actionOutcome,
      };
    });

    const actions = submissions
      .filter((s) => s.actionType && s.actionType !== "None")
      .map((s) => ({
        weekStart: s.weekStart,
        weekLabel: formatWeekLabel(s.weekStart, settings.workingDays).split(",")[0] ?? s.weekStart,
        actionType: s.actionType,
        actionNotes: s.actionNotes,
        outcome: s.actionOutcome,
      }))
      .sort((a, b) => a.weekStart.localeCompare(b.weekStart));

    const comps =
      dept && configReady
        ? getCompetenciesForDepartment(dept.dbId ?? dept.id)
        : [];
    const competencyLabels = comps.map((c) => ({ id: c.id, kind: c.kind, label: c.label }));

    return {
      employeeId,
      employeeName: emp?.name ?? employeeId,
      department: emp?.department ?? "—",
      competencyLabels,
      weeks,
      actions,
    };
  }, [submissions, dept, configReady, emp, employeeId, settings.workingDays]);

  const [snapshotId, setSnapshotId] = useState<string | null>(null);
  const snapshot = snapshotId ? submissions.find((s) => s.id === snapshotId) : undefined;

  const allCompetencies = history.competencyLabels;
  const techComps = allCompetencies.filter((c) => c.kind === "technical");
  const behComps = allCompetencies.filter((c) => c.kind === "behavioural");
  const competencyGroups = [
    { title: "Technical", competencies: techComps },
    { title: "Behavioural", competencies: behComps },
  ].filter((g) => g.competencies.length > 0);
  const rankingLevels = getWeeklyCheckInConfig().rankingLevels;

  if (!currentEmployee) {
    return (
      <div className="flex flex-1 items-center justify-center text-[13px] text-muted-foreground">
        Sign in to view weekly check-in history.
      </div>
    );
  }

  if (employeesLoading && !emp) {
    return (
      <div className="flex flex-1 items-center justify-center text-[13px] text-muted-foreground">
        Loading employee…
      </div>
    );
  }

  if (!emp) {
    return (
      <div className="flex flex-1 items-center justify-center text-[13px] text-muted-foreground">
        Employee not found.
      </div>
    );
  }

  if (!isDirectReport) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 text-[13px] text-muted-foreground">
        <p>You can only view history for direct reports (Resource Owner).</p>
        <Link to="/my-team/weekly-check-in" className="text-primary hover:underline">
          Back to queue
        </Link>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center text-[13px] text-muted-foreground">
        Loading history…
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-surface">
      <header className="flex h-14 flex-shrink-0 items-center gap-3 border-b border-border bg-surface px-5">
        <Link
          to={`/my-team/weekly-check-in/${employeeId}`}
          className="rounded-md p-1 text-muted-foreground hover:bg-surface-alt"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <div className="text-[15px] font-semibold tracking-tight text-foreground">
            {history.employeeName} — Weekly History
          </div>
          <div className="text-[12px] text-muted-foreground">
            {history.department} · continuous performance record
          </div>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-auto bg-background p-5 space-y-4">
        {loadError && (
          <div className="rounded-md border border-danger-border bg-danger-soft px-3 py-2 text-[12px] text-danger">
            {loadError}
          </div>
        )}
        <section className="rounded-lg border border-border bg-surface p-4 shadow-sm">
          <div className="mb-3 flex flex-nowrap items-center justify-between gap-x-3 gap-y-1">
            <h2 className="shrink-0 text-[12px] font-medium uppercase tracking-wide text-muted-foreground">
              Status arc
            </h2>
            <div className="flex shrink-0 flex-nowrap items-center gap-2 overflow-x-auto">
              <StatusArcLegend />
              <span className="h-3.5 w-px shrink-0 bg-border-soft" aria-hidden />
              <ConfidenceArcLegend />
            </div>
          </div>
          <StatusArcTimeline
            weeks={history.weeks}
            onSelect={(submissionId) => setSnapshotId(submissionId)}
          />
        </section>

        <section className="rounded-lg border border-border bg-surface p-4 shadow-sm">
          <div className="mb-3 flex flex-nowrap items-center justify-between gap-x-3 gap-y-1">
            <h2 className="shrink-0 text-[12px] font-medium uppercase tracking-wide text-muted-foreground">
              Competency history
            </h2>
            <CompetencyRankingLegend rankingLevels={rankingLevels} />
          </div>
          {competencyGroups.length === 0 ? (
            <p className="text-[12px] text-muted-foreground">No competency data available.</p>
          ) : (
            <CompetencyHistoryTable weeks={history.weeks} groups={competencyGroups} />
          )}
        </section>

        <section className="rounded-lg border border-border bg-surface p-4 shadow-sm">
          <h2 className="mb-3 text-[12px] font-medium uppercase tracking-wide text-muted-foreground">Action-item track</h2>
          {history.actions.length === 0 ? (
            <p className="text-[12px] text-muted-foreground">No actions recorded.</p>
          ) : (
            <div className="space-y-2">
              {history.actions.map((a) => (
                <div
                  key={a.weekStart + a.actionType}
                  className="flex flex-wrap items-center gap-2 rounded-md border border-border-soft bg-surface-alt/70 px-3 py-2 text-[12px]"
                >
                  <span className="font-medium text-foreground">{a.weekLabel}</span>
                  <span className="text-muted-foreground">{a.actionType}</span>
                  {a.outcome && (
                    <span
                      className={`rounded-sm border px-1.5 py-0.5 text-[10px] font-semibold ${
                        a.outcome === "Completed"
                          ? "border-success-border bg-success-soft text-success-fg"
                          : "border-warning-border bg-warning-soft text-warning"
                      }`}
                    >
                      {a.outcome}
                    </span>
                  )}
                  {a.actionNotes && (
                    <span className="w-full text-[11px] text-muted-foreground">{a.actionNotes}</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {snapshot && <SnapshotDrawer submission={snapshot} onClose={() => setSnapshotId(null)} />}
    </div>
  );
}

type CompetencyLabel = EmployeeHistory["competencyLabels"][number];

function CompetencyHistoryTable({
  weeks,
  groups,
}: {
  weeks: EmployeeHistory["weeks"];
  groups: { title: string; competencies: CompetencyLabel[] }[];
}) {
  const currentWeekStart = getCurrentWeekStart();
  const colCount = weeks.length + 1;

  return (
    <div className="overflow-x-auto rounded-lg border border-border shadow-sm">
      <table className="min-w-full border-collapse text-[11px]">
        <thead>
          <tr className="border-b border-border-soft bg-surface-alt/50">
            <th className="sticky left-0 z-10 min-w-[7.5rem] border-r border-border-soft bg-surface-alt/50 px-2.5 py-2 text-left font-medium text-muted-foreground">
              Competency
            </th>
            {weeks.map((w) => {
              const isCurrent = w.weekStart === currentWeekStart;
              return (
                <th
                  key={w.weekStart}
                  className={`min-w-[3.25rem] px-1 py-2 text-center font-medium ${
                    isCurrent ? "text-accent-softfg" : "text-muted-foreground"
                  }`}
                >
                  {w.weekLabel.split("–")[0]?.trim()}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {groups.map((group, groupIdx) => (
            <Fragment key={group.title}>
              <tr className="border-b border-border-soft bg-surface-alt/70">
                <td
                  colSpan={colCount}
                  className="px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"
                >
                  {group.title}
                </td>
              </tr>
              {group.competencies.map((comp, rowIdx) => (
                <tr
                  key={comp.id}
                  className={`border-b border-border-soft hover:bg-surface-alt/40 ${
                    groupIdx === groups.length - 1 && rowIdx === group.competencies.length - 1
                      ? "border-b-0"
                      : ""
                  }`}
                >
                  <td
                    className="sticky left-0 z-10 border-r border-border-soft bg-surface px-2.5 py-1.5 font-medium text-foreground"
                    title={comp.label}
                  >
                    <span className="line-clamp-2">{comp.label}</span>
                  </td>
                  {weeks.map((w) => {
                    const rating =
                      w.technicalRatings[comp.id] ?? w.behaviouralRatings[comp.id];
                    const level = rating ? rankingLevelForValue(rating) : undefined;
                    return (
                      <td key={w.weekStart} className="px-1 py-1.5 text-center">
                        {level ? (
                          <div
                            className={`mx-auto flex h-7 w-7 items-center justify-center rounded-md text-[11px] font-bold ${rankingChipClass(level, true)}`}
                            title={level.title}
                          >
                            {level.value}
                          </div>
                        ) : (
                          <div className="mx-auto h-7 w-7 rounded border border-dashed border-border bg-surface-alt" />
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StatusArcTimeline({
  weeks,
  onSelect,
}: {
  weeks: EmployeeHistory["weeks"];
  onSelect: (submissionId: string) => void;
}) {
  const currentWeekStart = getCurrentWeekStart();

  return (
    <div className="flex w-full min-w-0 items-start">
      {weeks.map((w, idx) => {
        const isCurrent = w.weekStart === currentWeekStart;
        return (
        <Fragment key={w.weekStart}>
          {idx > 0 && (
            <div className="flex h-8 min-w-3 flex-1 items-center" aria-hidden>
              <div className="h-[2px] w-full bg-border-soft" />
            </div>
          )}
          <button
            type="button"
            disabled={!w.submissionId}
            onClick={() => w.submissionId && onSelect(w.submissionId)}
            className="group flex w-[4.25rem] shrink-0 flex-col items-center gap-1 disabled:cursor-default enabled:cursor-pointer"
          >
            <div
              className={`relative h-8 w-8 shrink-0 rounded-md border transition-shadow ${
                w.weeklyStatus
                  ? weeklyStatusArcClass(w.weeklyStatus)
                  : "border-border bg-surface-alt"
              } ${w.submissionId ? "group-hover:ring-2 group-hover:ring-accent-line/40" : ""}`}
              title={
                [w.weeklyStatus, w.confidence ? `Confidence: ${w.confidence}` : null]
                  .filter(Boolean)
                  .join(" · ") || "No review"
              }
            >
              {w.confidence && (
                <span
                  className={`absolute bottom-0.5 right-0.5 h-1.5 w-1.5 rounded-full ring-1 ring-surface ${CONFIDENCE_DOT_STYLES[w.confidence]}`}
                  aria-hidden
                />
              )}
            </div>
            <span
              className={`w-full truncate text-center text-[9px] ${
                isCurrent
                  ? "font-semibold text-accent-softfg"
                  : "text-muted-foreground"
              }`}
            >
              {w.weekLabel.split("–")[0]?.trim()}
            </span>
          </button>
        </Fragment>
        );
      })}
    </div>
  );
}

function SnapshotDrawer({
  submission,
  onClose,
}: {
  submission: WeeklyCheckInSubmission;
  onClose: () => void;
}) {
  const { formatDateTime } = useAppDateFormat();
  const { settings } = useSettings();
  return (
    <div className="fixed inset-0 z-40">
      <div onClick={onClose} className="absolute inset-0 bg-brand/30" />
      <div className="absolute right-0 top-0 flex h-full w-full max-w-lg flex-col bg-surface shadow-2xl">
        <div className="flex flex-shrink-0 items-start justify-between gap-3 border-b border-border-soft px-5 py-4">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <div className="text-[15px] font-semibold text-foreground">Frozen snapshot</div>
              <div className="shrink-0 text-[11px] text-muted-foreground">
                Week Period:{" "}
                <span className="font-medium text-foreground">
                  {formatWeekLabel(submission.weekStart, settings.workingDays)}
                </span>
              </div>
            </div>
            <div className="mt-0.5 text-[11px] text-muted-foreground">
              Reviewed by {getSubmitterName(submission.submittedByEmployeeId)} ·{" "}
              {formatDateTime(submission.submittedAt)}
            </div>
          </div>
          <button type="button" onClick={onClose} className="shrink-0 text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
            <WeeklyStatusBadge status={submission.weeklyStatus} />
            <div className="flex shrink-0 items-center gap-2">
              <span className="text-[11px] text-muted-foreground">Confidence:</span>
              <WeeklyConfidenceBadge confidence={submission.confidence} />
            </div>
          </div>
          <WeeklyCheckInEvidencePanel
            evidence={submission.evidence}
            frozen
            viewOnly
            showReadOnlyBanner={false}
          />
          <WeeklyCheckInSubmittedReviewFields submission={submission} />
        </div>
      </div>
    </div>
  );
}
