import { useEffect, useRef, useState } from "react";
import type { FocusAllocationState } from "../utils/confirmationProductivity";
import {
  FOCUS_CHECK_IN_RESPONSE_SECONDS,
  focusCheckInPromptAt,
  focusCheckInSecondsLeft,
  normalizeFocusCheckInMinutes,
} from "../utils/focusCheckIn";
import { alertFocusCheckInOpened } from "../utils/focusCheckInAlert";

/**
 * While a focus segment is running, after every N minutes show Continue prompt;
 * no click within 30s → onAutoStop(allocationId).
 * On open: beep + OS notification (when permitted).
 */
export function useFocusCheckIn({
  enabled,
  intervalMinutes,
  activeTimerId,
  focusByAllocation,
  onAutoStop,
}: {
  enabled: boolean;
  intervalMinutes: number;
  activeTimerId: string | null | undefined;
  focusByAllocation: Record<string, FocusAllocationState>;
  onAutoStop: (allocationId: string) => void;
}): {
  open: boolean;
  secondsLeft: number;
  onContinue: () => void;
} {
  const mins = normalizeFocusCheckInMinutes(intervalMinutes);
  const runningId =
    enabled && mins > 0 && activeTimerId && focusByAllocation[activeTimerId]?.segmentStartedAt
      ? activeTimerId
      : null;
  const segmentStartedAt = runningId
    ? focusByAllocation[runningId]?.segmentStartedAt ?? null
    : null;

  const [promptOpen, setPromptOpen] = useState(false);
  const [deadlineMs, setDeadlineMs] = useState<number | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(FOCUS_CHECK_IN_RESPONSE_SECONDS);
  /** Wall clock when the current check-in cycle started (segment start or last Continue). */
  const anchorMsRef = useRef<number | null>(null);
  const lastSegmentRef = useRef<string | null>(null);
  const stoppedForDeadlineRef = useRef(false);
  /** Avoid duplicate beep/notification for the same prompt deadline. */
  const alertedDeadlineRef = useRef<number | null>(null);

  // Reset cycle when timer starts / allocation changes / feature disabled.
  useEffect(() => {
    if (!runningId || !segmentStartedAt) {
      anchorMsRef.current = null;
      lastSegmentRef.current = null;
      setPromptOpen(false);
      setDeadlineMs(null);
      stoppedForDeadlineRef.current = false;
      alertedDeadlineRef.current = null;
      return;
    }
    const segKey = `${runningId}:${segmentStartedAt}`;
    if (lastSegmentRef.current !== segKey) {
      lastSegmentRef.current = segKey;
      anchorMsRef.current = new Date(segmentStartedAt).getTime();
      setPromptOpen(false);
      setDeadlineMs(null);
      stoppedForDeadlineRef.current = false;
      alertedDeadlineRef.current = null;
    }
  }, [runningId, segmentStartedAt]);

  useEffect(() => {
    if (!runningId || !segmentStartedAt || mins <= 0) return;

    const tick = () => {
      const now = Date.now();
      const anchor = anchorMsRef.current ?? new Date(segmentStartedAt).getTime();
      anchorMsRef.current = anchor;

      if (promptOpen && deadlineMs != null) {
        const left = focusCheckInSecondsLeft(deadlineMs, now);
        setSecondsLeft(left);
        if (left <= 0 && !stoppedForDeadlineRef.current) {
          stoppedForDeadlineRef.current = true;
          setPromptOpen(false);
          setDeadlineMs(null);
          onAutoStop(runningId);
        }
        return;
      }

      if (promptOpen) return;

      const dueAt = focusCheckInPromptAt(anchor, mins);
      if (dueAt != null && now >= dueAt) {
        stoppedForDeadlineRef.current = false;
        setDeadlineMs(now + FOCUS_CHECK_IN_RESPONSE_SECONDS * 1000);
        setSecondsLeft(FOCUS_CHECK_IN_RESPONSE_SECONDS);
        setPromptOpen(true);
      }
    };

    tick();
    const id = window.setInterval(tick, 250);
    const onVis = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [runningId, segmentStartedAt, mins, promptOpen, deadlineMs, onAutoStop]);

  useEffect(() => {
    if (!promptOpen || deadlineMs == null) return;
    if (alertedDeadlineRef.current === deadlineMs) return;
    alertedDeadlineRef.current = deadlineMs;
    alertFocusCheckInOpened();
  }, [promptOpen, deadlineMs]);

  const onContinue = () => {
    anchorMsRef.current = Date.now();
    setPromptOpen(false);
    setDeadlineMs(null);
    setSecondsLeft(FOCUS_CHECK_IN_RESPONSE_SECONDS);
    stoppedForDeadlineRef.current = false;
  };

  return {
    open: promptOpen,
    secondsLeft,
    onContinue,
  };
}
