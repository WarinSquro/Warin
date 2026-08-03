import { ActionReviewBadge } from "./WeeklyCheckInEvidencePanel";
import type { WeeklyCheckInSubmission } from "../data/weeklyCheckIn";

const RECOGNITION_STYLES = {
  active: "text-success-fg",
  none: "text-muted-foreground",
} as const;

interface WeeklyCheckInSubmittedReviewFieldsProps {
  submission: WeeklyCheckInSubmission;
}

export function WeeklyCheckInSubmittedReviewFields({
  submission,
}: WeeklyCheckInSubmittedReviewFieldsProps) {
  return (
    <div className="rounded-lg border border-border bg-surface px-3 py-2.5 shadow-sm">
      <div className="space-y-2 text-[12px]">
        <p className="text-foreground">{submission.roRemarks}</p>
        <div className="rounded-md border border-border-soft bg-surface-alt/70 px-2.5 py-2">
          <div
            className={`text-[12px] font-medium ${
              submission.recognition !== "None"
                ? RECOGNITION_STYLES.active
                : RECOGNITION_STYLES.none
            }`}
          >
            Recognition: {submission.recognition}
          </div>
          <div className="mt-2.5 border-t border-border-soft pt-2.5">
            <div className="font-medium text-foreground">Action: {submission.actionType}</div>
            {submission.actionNotes && (
              <p className="mt-1 text-muted-foreground">{submission.actionNotes}</p>
            )}
          </div>
          {submission.actionType !== "None" && (
            <div className="mt-2.5 border-t border-border-soft pt-2.5">
              <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Action Review
              </div>
              {submission.actionOutcome ? (
                <div className="mt-1.5">
                  <ActionReviewBadge status={submission.actionOutcome} />
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
