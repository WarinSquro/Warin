import { useEffect, useRef } from "react";
import { LOGIN_NOTICE_KEY } from "../api/client";

/** Sign out after this much time without user activity. */
export const IDLE_SESSION_TIMEOUT_MS = 30 * 60 * 1000;

const ACTIVITY_THROTTLE_MS = 5_000;

const ACTIVITY_EVENTS = ["mousedown", "keydown", "touchstart", "scroll", "click"] as const;

/**
 * Calls `onTimeout` when the user has been idle for {@link IDLE_SESSION_TIMEOUT_MS}.
 * Resets on common interaction events; re-checks when the tab becomes visible again.
 */
export function useIdleSessionTimeout(enabled: boolean, onTimeout: () => void) {
  const onTimeoutRef = useRef(onTimeout);
  onTimeoutRef.current = onTimeout;
  const lastActivityRef = useRef(Date.now());
  const timeoutRef = useRef<number | null>(null);
  const lastThrottleRef = useRef(0);

  useEffect(() => {
    if (!enabled) return;

    const clearTimer = () => {
      if (timeoutRef.current != null) {
        window.clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };

    const fireTimeout = () => {
      clearTimer();
      try {
        sessionStorage.setItem(
          LOGIN_NOTICE_KEY,
          "You were signed out after 30 minutes of inactivity."
        );
      } catch {
        /* ignore */
      }
      onTimeoutRef.current();
    };

    const schedule = () => {
      clearTimer();
      timeoutRef.current = window.setTimeout(fireTimeout, IDLE_SESSION_TIMEOUT_MS);
    };

    const bump = () => {
      const now = Date.now();
      if (now - lastThrottleRef.current < ACTIVITY_THROTTLE_MS) return;
      lastThrottleRef.current = now;
      lastActivityRef.current = now;
      schedule();
    };

    const onVisibility = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastActivityRef.current >= IDLE_SESSION_TIMEOUT_MS) {
        fireTimeout();
        return;
      }
      schedule();
    };

    lastActivityRef.current = Date.now();
    schedule();

    for (const ev of ACTIVITY_EVENTS) {
      window.addEventListener(ev, bump, { passive: true });
    }
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      clearTimer();
      for (const ev of ACTIVITY_EVENTS) {
        window.removeEventListener(ev, bump);
      }
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [enabled]);
}
