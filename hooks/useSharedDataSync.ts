import { useCallback, useEffect, useRef, useState } from "react";
import {
  DATA_CHANGED_EVENT,
  type DataChangedEvent,
  type DataResource,
} from "../api/realtimeEvents";

const DEFAULT_INTERVAL_MS = 45_000;
const REALTIME_DEBOUNCE_MS = 400;

type SyncOptions = {
  /** Poll while the tab is visible. Pass `false` to disable polling (visibility/focus only). */
  intervalMs?: number | false;
  /**
   * When Phase-2 SSE fires a data-change for one of these resources,
   * run a silent sync (debounced). Poll/focus still apply.
   */
  resources?: DataResource[];
};

/** Nested pause count — while > 0, all shared sync (poll / focus / SSE) is skipped. */
let syncPauseCount = 0;
const syncPauseListeners = new Set<() => void>();

function notifySyncPauseListeners() {
  syncPauseListeners.forEach((l) => l());
}

export function isSharedDataSyncPaused(): boolean {
  return syncPauseCount > 0;
}

function acquireSharedDataSyncPause() {
  syncPauseCount += 1;
  notifySyncPauseListeners();
}

function releaseSharedDataSyncPause() {
  syncPauseCount = Math.max(0, syncPauseCount - 1);
  notifySyncPauseListeners();
}

/**
 * While `paused` is true, suppress background shared-data refresh across the app
 * (contexts + screens) so open masters/transaction forms are not overwritten.
 */
export function usePauseSharedDataSync(paused: boolean) {
  useEffect(() => {
    if (!paused) return;
    acquireSharedDataSyncPause();
    return () => releaseSharedDataSyncPause();
  }, [paused]);
}

/**
 * Keeps shared list/context data fresher across users:
 * - Refetch when the tab becomes visible / window gains focus
 * - Optional interval poll while the document is visible
 * - Optional SSE-driven refresh for matching `resources` (Phase 2)
 *
 * Callers should pass a silent refresh (no full-page loading spinner).
 * Sync is skipped while any `usePauseSharedDataSync(true)` is active.
 */
export function useSharedDataSync(
  enabled: boolean,
  onSync: () => void | Promise<void>,
  options?: SyncOptions
) {
  const intervalMs = options?.intervalMs === false ? false : (options?.intervalMs ?? DEFAULT_INTERVAL_MS);
  const resourcesKey = options?.resources?.length
    ? [...options.resources].sort().join(",")
    : "";
  const onSyncRef = useRef(onSync);
  onSyncRef.current = onSync;
  const inFlightRef = useRef(false);
  const debounceRef = useRef<number | undefined>(undefined);
  const [pauseEpoch, setPauseEpoch] = useState(0);

  useEffect(() => {
    const onPauseChange = () => setPauseEpoch((n) => n + 1);
    syncPauseListeners.add(onPauseChange);
    return () => {
      syncPauseListeners.delete(onPauseChange);
    };
  }, []);

  const run = useCallback(async () => {
    if (!enabled || inFlightRef.current) return;
    if (isSharedDataSyncPaused()) return;
    if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
    inFlightRef.current = true;
    try {
      await onSyncRef.current();
    } catch {
      /* caller handles errors; never throw out of sync loop */
    } finally {
      inFlightRef.current = false;
    }
  }, [enabled, pauseEpoch]);

  const runDebounced = useCallback(() => {
    if (debounceRef.current != null) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      debounceRef.current = undefined;
      void run();
    }, REALTIME_DEBOUNCE_MS);
  }, [run]);

  useEffect(() => {
    if (!enabled) return;

    const onVisible = () => {
      if (document.visibilityState === "visible") void run();
    };

    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [enabled, run]);

  useEffect(() => {
    if (!enabled || intervalMs === false) return;
    const id = window.setInterval(() => void run(), intervalMs);
    return () => window.clearInterval(id);
  }, [enabled, intervalMs, run]);

  useEffect(() => {
    if (!enabled || !resourcesKey) return;
    const wanted = new Set(resourcesKey.split(","));

    const onDataChanged = (ev: Event) => {
      const detail = (ev as CustomEvent<DataChangedEvent>).detail;
      if (!detail?.resource) return;
      if (!wanted.has(detail.resource)) return;
      runDebounced();
    };

    window.addEventListener(DATA_CHANGED_EVENT, onDataChanged);
    return () => {
      window.removeEventListener(DATA_CHANGED_EVENT, onDataChanged);
      if (debounceRef.current != null) window.clearTimeout(debounceRef.current);
    };
  }, [enabled, resourcesKey, runDebounced]);
}
