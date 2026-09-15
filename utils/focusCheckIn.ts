/** Focus timer “still focused?” check-in (System Parameters + Work Confirmation). */

/** Seconds to answer the Continue prompt before auto-stop. */
export const FOCUS_CHECK_IN_RESPONSE_SECONDS = 30;

/** Max configurable interval (minutes). */
export const FOCUS_CHECK_IN_MINUTES_MAX = 240;

/** Normalize settings value: 0 / empty / invalid → disabled (0); else 1…MAX. */
export function normalizeFocusCheckInMinutes(raw: unknown): number {
  if (raw == null || raw === "") return 0;
  const n = Math.trunc(Number(raw));
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(FOCUS_CHECK_IN_MINUTES_MAX, Math.max(1, n));
}

export function focusCheckInIntervalMs(intervalMinutes: number): number {
  const mins = normalizeFocusCheckInMinutes(intervalMinutes);
  if (mins <= 0) return 0;
  return mins * 60_000;
}

/** Wall-clock deadline when the Continue prompt should open. */
export function focusCheckInPromptAt(anchorMs: number, intervalMinutes: number): number | null {
  const ms = focusCheckInIntervalMs(intervalMinutes);
  if (ms <= 0 || !Number.isFinite(anchorMs)) return null;
  return anchorMs + ms;
}

/** Seconds remaining until auto-stop (0 = expired). */
export function focusCheckInSecondsLeft(deadlineMs: number, nowMs: number): number {
  if (!Number.isFinite(deadlineMs) || !Number.isFinite(nowMs)) return 0;
  return Math.max(0, Math.ceil((deadlineMs - nowMs) / 1000));
}
