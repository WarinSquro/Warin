import { isConfirmationDelayed } from "./confirmationDelay";

/** Team Compliance week-dot statuses (Work Confirmation → manager view). */
export type TeamComplianceDayStatus =
  | "confirmed"
  | "confirmed_delayed"
  | "deviation"
  | "deviation_delayed"
  | "pending"
  | "leave"
  | "future";

export type TeamComplianceLineKind = "planned" | "deviation" | "unplanned" | string;

/** True when confirmation includes a deviation or unplanned line (maps to D / DD). */
export function confirmationHasDeviantWork(
  confirmation:
    | {
        hasDeviation?: boolean;
        lines?: Array<{ kind: TeamComplianceLineKind }>;
      }
    | null
    | undefined
): boolean {
  if (!confirmation) return false;
  const lines = confirmation.lines;
  if (lines && lines.length > 0) {
    return lines.some((l) => l.kind === "deviation" || l.kind === "unplanned");
  }
  return Boolean(confirmation.hasDeviation);
}

/**
 * One working-day cell for Team Compliance.
 * Live rules only — no demo/mock seeds:
 * - future calendar day → future
 * - company off-day → leave (not pending)
 * - confirmation with deviation/unplanned lines → D / DD (delay = later IST calendar day)
 * - confirmation as-planned only → C / CD
 * - no confirmation + no plan/allocation that day → leave
 * - no confirmation + had a plan → pending
 */
export function teamComplianceDayStatus(input: {
  workDate: string;
  today: string;
  isCompanyOff?: boolean;
  /** False when the employee had no active allocation covering this work date. */
  hasPlan?: boolean;
  confirmation?: {
    hasDeviation?: boolean;
    submittedAt: string | Date;
    lines?: Array<{ kind: TeamComplianceLineKind }>;
  } | null;
}): TeamComplianceDayStatus {
  const workDate = input.workDate.slice(0, 10);
  const today = input.today.slice(0, 10);
  if (workDate > today) return "future";
  if (input.isCompanyOff) return "leave";

  const conf = input.confirmation;
  if (conf) {
    const delayed = isConfirmationDelayed(conf.submittedAt, workDate);
    const deviant = confirmationHasDeviantWork(conf);
    if (deviant) return delayed ? "deviation_delayed" : "deviation";
    return delayed ? "confirmed_delayed" : "confirmed";
  }

  if (input.hasPlan === false) return "leave";
  return "pending";
}

/**
 * Index of “today” within the Team Compliance week strip (working weekdays only).
 * On weekends / days not in the strip, use the latest working day on or before `today`
 * so we never fall back to a fake `pending` (which incorrectly showed Remind).
 * Returns -1 only when every strip day is still in the future.
 */
export function teamComplianceTodayIndex(weekDates: string[], todayIso: string): number {
  const today = todayIso.slice(0, 10);
  const exact = weekDates.indexOf(today);
  if (exact >= 0) return exact;
  let best = -1;
  for (let i = 0; i < weekDates.length; i++) {
    const d = weekDates[i]?.slice(0, 10);
    if (d && d <= today) best = i;
  }
  return best;
}

/** True when any working-day cell in the week strip is still pending confirmation. */
export function teamComplianceWeekHasPending(
  week: Array<TeamComplianceDayStatus | string> | null | undefined
): boolean {
  if (!week?.length) return false;
  return week.some((s) => s === "pending");
}
