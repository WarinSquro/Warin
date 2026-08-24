/**
 * Server-side idle window for refresh sessions.
 * Must stay aligned with client `IDLE_SESSION_TIMEOUT_MS` in hooks/useIdleSessionTimeout.ts.
 * Closing a tab never runs client logout — without this, refresh tokens stay “active”
 * until JWT_REFRESH_DAYS and incorrectly trigger session_conflict.
 */
function resolveSessionIdleTimeoutMs(): number {
  const mins = Number(process.env.SESSION_IDLE_TIMEOUT_MINUTES);
  if (Number.isFinite(mins) && mins >= 1) return Math.floor(mins) * 60 * 1000;
  return 120 * 60 * 1000;
}

export const SESSION_IDLE_TIMEOUT_MS = resolveSessionIdleTimeoutMs();

/** True when lastSeenAt is at least the idle timeout ago (stale for conflict / refresh). */
export function isRefreshSessionIdleExpired(lastSeenAt: Date, now = new Date()): boolean {
  const seen = lastSeenAt.getTime();
  if (Number.isNaN(seen)) return true;
  return now.getTime() - seen >= SESSION_IDLE_TIMEOUT_MS;
}
