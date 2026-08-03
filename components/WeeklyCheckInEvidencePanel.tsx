import { Lock } from "lucide-react";
import { BillableSplitBar } from "./BillableSplitBar";
import { useSettings } from "../context/SettingsContext";
import { metricBand, type MetricBand } from "../data/deploymentReport";
import type {
  ActionStatus,
  WeeklyCheckInSubmission,
  WeeklyEvidenceSnapshot,
} from "../data/weeklyCheckIn";
import { WeeklyConfidenceBadge, WeeklyStatusBadge } from "./WeeklyCheckInStatusPicker";

const ACTION_REVIEW_STYLES: Record<ActionStatus, string> = {
  Completed: "border-success-border bg-success-soft text-success-fg",
  "Still Pending": "border-warning-border bg-warning-soft text-warning",
};

const RECOGNITION_STYLES = {
  active: "text-success-fg",
  none: "text-muted-foreground",
} as const;

const CARD_BAND_STYLES: Record<MetricBand, string> = {
  excellent: "border-success-border bg-success-soft",
  good: "border-accent-line bg-accent-soft",
  needs_attention: "border-warning-border bg-warning-soft",
  critical: "border-danger-border bg-danger-soft",
  not_available: "border-border bg-surface",
};

const VALUE_BAND_STYLES: Record<MetricBand, string> = {
  excellent: "text-success-fg",
  good: "text-accent-softfg",
  needs_attention: "text-warning",
  critical: "text-danger",
  not_available: "text-foreground",
};

interface WeeklyCheckInEvidencePanelProps {
  evidence: WeeklyEvidenceSnapshot;
  previousSubmission?: WeeklyCheckInSubmission;
  frozen?: boolean;
  previousActionStatus?: "Completed" | "Still Pending";
  onPreviousActionStatusChange?: (status: "Completed" | "Still Pending") => void;
  viewOnly?: boolean;
  showReadOnlyBanner?: boolean;
}

export function WeeklyCheckInEvidencePanel({
  evidence,
  previousSubmission,
  frozen = false,
  previousActionStatus,
  onPreviousActionStatusChange,
  viewOnly = false,
  showReadOnlyBanner = true,
}: WeeklyCheckInEvidencePanelProps) {
  return (
    <div className="space-y-4">
      {showReadOnlyBanner && (
      <div className="flex items-center gap-2 rounded-md border border-border-soft bg-surface-alt/70 px-2.5 py-2 text-[11px] text-muted-foreground">
        <Lock className="h-3.5 w-3.5 shrink-0" />
        <span>
          {frozen
            ? "Frozen snapshot — as captured at submission"
            : "Auto-pulled from OneView · read-only"}
        </span>
      </div>
      )}

      {evidence.noOperationalData ? (
        <div className="rounded-md border border-warning-border bg-warning-soft px-3 py-2.5 text-[12px] text-warning">
          No operational data available for this period. You may still complete the review.
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <MetricCard
            label="Planning Accuracy"
            pct={evidence.planningAccuracy}
            value={
              evidence.planningAccuracy != null ? `${evidence.planningAccuracy}%` : "N/A"
            }
            sub={`${evidence.planningDeviationCount} deviation${evidence.planningDeviationCount !== 1 ? "s" : ""}`}
          />
          <MetricCard
            label="Confirmation Discipline"
            pct={evidence.confirmationDiscipline}
            value={
              evidence.confirmationDiscipline != null
                ? `${evidence.confirmationDiscipline}%`
                : "N/A"
            }
            sub={`${evidence.confirmationDelayCount} delayed confirmation${evidence.confirmationDelayCount !== 1 ? "s" : ""}`}
          />
          <MetricCard
            label="Utilization"
            value={`${evidence.utilizationHrs}h`}
            sub={`of ${evidence.utilizationCapacityHrs}h capacity`}
          />
          <div className="rounded-lg border border-border bg-surface px-3 py-2.5 shadow-sm">
            <div className="mb-1.5 text-[11px] font-medium text-muted-foreground">
              Billability split
            </div>
            <BillableSplitBar
              billablePct={evidence.billablePct}
              nonBillablePct={evidence.nonBillablePct}
            />
          </div>
        </div>
      )}

      <div className="rounded-lg border border-border bg-surface px-3 py-2.5 shadow-sm">
        <div className="mb-1.5 text-[11px] font-medium text-muted-foreground">Projects this week</div>
        {evidence.projects.length === 0 ? (
          <div className="text-[12px] text-muted-foreground">—</div>
        ) : (
          <ul className="space-y-1 text-[12px] text-foreground">
            {evidence.projects.map((p) => (
              <li key={p}>· {p}</li>
            ))}
          </ul>
        )}
      </div>

      {(previousSubmission || !frozen) && (
      <div className="rounded-lg border border-border bg-surface px-3 py-2.5 shadow-sm">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
          <div className="flex items-center gap-2">
            <div className="text-[10px] font-medium uppercase tracking-wide text-muted">
              Previous week review
            </div>
            {previousSubmission && (
              <WeeklyStatusBadge status={previousSubmission.weeklyStatus} />
            )}
          </div>
          {previousSubmission && (
            <div className="flex shrink-0 items-center gap-2">
              <span className="text-[11px] text-muted-foreground">Confidence:</span>
              <WeeklyConfidenceBadge confidence={previousSubmission.confidence} />
            </div>
          )}
        </div>
        {!previousSubmission ? (
          <div className="text-[12px] text-muted-foreground">No previous review available.</div>
        ) : (
          <div className="space-y-2 text-[12px]">
            <p className="text-foreground">{previousSubmission.roRemarks}</p>
            <div className="rounded-md border border-border-soft bg-surface-alt/70 px-2.5 py-2">
              <div
                className={`text-[12px] font-medium ${
                  previousSubmission.recognition !== "None"
                    ? RECOGNITION_STYLES.active
                    : RECOGNITION_STYLES.none
                }`}
              >
                Recognition: {previousSubmission.recognition}
              </div>
              <div className="mt-2.5 border-t border-border-soft pt-2.5">
                <div className="font-medium text-foreground">
                  Action: {previousSubmission.actionType}
                </div>
                {previousSubmission.actionNotes && (
                  <p className="mt-1 text-muted-foreground">{previousSubmission.actionNotes}</p>
                )}
              </div>
              {previousSubmission.actionType !== "None" && (
                <div className="mt-2.5 border-t border-border-soft pt-2.5">
                  <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    Action Review
                  </div>
                  {!viewOnly && onPreviousActionStatusChange ? (
                    <div className="mt-1.5 flex flex-wrap gap-2">
                      {(["Completed", "Still Pending"] as const).map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => onPreviousActionStatusChange(s)}
                          className={`rounded-md border px-3 py-1.5 text-[12px] font-medium transition-colors ${
                            previousActionStatus === s
                              ? ACTION_REVIEW_STYLES[s]
                              : "border-border bg-surface text-muted-foreground hover:bg-surface-alt"
                          }`}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  ) : (
                    (() => {
                      const reviewStatus =
                        previousActionStatus ?? previousSubmission.actionOutcome;
                      return reviewStatus ? (
                        <div className="mt-1.5">
                          <ActionReviewBadge status={reviewStatus} />
                        </div>
                      ) : null;
                    })()
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
      )}
    </div>
  );
}

function ActionReviewBadge({ status }: { status: ActionStatus }) {
  return (
    <div
      className={`inline-flex rounded-md border px-2.5 py-1 text-[12px] font-semibold ${ACTION_REVIEW_STYLES[status]}`}
    >
      {status}
    </div>
  );
}

export { ActionReviewBadge };

function MetricCard({
  label,
  value,
  sub,
  pct,
}: {
  label: string;
  value: string;
  sub: string;
  pct?: number | null;
}) {
  const { settings } = useSettings();
  const band = pct != null ? metricBand(pct, settings.metricBands) : null;
  const cardClass = band ? CARD_BAND_STYLES[band] : CARD_BAND_STYLES.not_available;
  const valueClass = band ? VALUE_BAND_STYLES[band] : VALUE_BAND_STYLES.not_available;

  return (
    <div className={`rounded-lg border px-3 py-2.5 shadow-sm ${cardClass}`}>
      <div className="text-[11px] font-medium text-muted-foreground">{label}</div>
      <div
        className={`mt-0.5 text-[22px] font-semibold tabular-nums tracking-tight ${valueClass}`}
      >
        {value}
      </div>
      <div className="text-[10px] text-muted-foreground">{sub}</div>
    </div>
  );
}
