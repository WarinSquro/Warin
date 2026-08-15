/** Default auto-dismiss duration for all toasts (app-wide). */
export const TOAST_DURATION_MS = 5000;

/** Remaining time after a running interval is paused. */
export function remainingAfterElapsed(remainingMs: number, elapsedMs: number): number {
  return Math.max(0, remainingMs - elapsedMs);
}
