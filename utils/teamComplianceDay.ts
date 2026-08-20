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

/**
 * One working-day cell for Team Compliance.
 * Live rules only — no demo/mock seeds:
 * - future calendar day → future
 * - company off-day → leave (not pending)
 * - confirmation present → C / CD / D / DD (delay = later IST calendar day)
 * - no confirmation + no plan/allocation that day → leave (nothing to confirm)
 * - no confirmation + had a plan → pending
 */
export function teamComplianceDayStatus(input: {
  workDate: string;
  today: string;
  isCompanyOff?: boolean;
  /** False when the employee had no active allocation covering this work date. */
  hasPlan?: boolean;
  confirmation?: { hasDeviation: boolean; submittedAt: string | Date } | null;
}): TeamComplianceDayStatus {
  const workDate = input.workDate.slice(0, 10);
  const today = input.today.slice(0, 10);
  if (workDate > today) return "future";
  if (input.isCompanyOff) return "leave";

  const conf = input.confirmation;
  if (conf) {
    const delayed = isConfirmationDelayed(conf.submittedAt, workDate);
    if (conf.hasDeviation) return delayed ? "deviation_delayed" : "deviation";
    return delayed ? "confirmed_delayed" : "confirmed";
  }

  if (input.hasPlan === false) return "leave";
  return "pending";
}
