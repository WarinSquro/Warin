import { dispatchDataChanged, type DataChangedEvent } from "./realtimeEvents";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3001/api/v1";

function getAccessToken(): string | null {
  try {
    return sessionStorage.getItem("oneview_access_token");
  } catch {
    return null;
  }
}

/**
 * Opens an EventSource to `/events/stream` and fans Redis-backed data-change
 * notifications into `window` CustomEvents for `useSharedDataSync`.
 * Returns a disconnect function.
 */
export function connectRealtimeStream(opts?: {
  onError?: () => void;
}): () => void {
  let es: EventSource | null = null;
  let closed = false;
  let retryTimer: number | undefined;
  let attempt = 0;

  const clearRetry = () => {
    if (retryTimer != null) {
      window.clearTimeout(retryTimer);
      retryTimer = undefined;
    }
  };

  const open = () => {
    if (closed) return;
    const token = getAccessToken();
    if (!token) {
      opts?.onError?.();
      return;
    }
    const base = API_BASE.replace(/\/$/, "");
    const url = `${base}/events/stream?access_token=${encodeURIComponent(token)}`;
    try {
      es?.close();
    } catch {
      /* ignore */
    }
    es = new EventSource(url);

    es.addEventListener("data-changed", (ev) => {
      attempt = 0;
      try {
        const data = JSON.parse((ev as MessageEvent).data as string) as DataChangedEvent;
        if (data?.v === 1 && data.resource) dispatchDataChanged(data);
      } catch {
        /* ignore malformed */
      }
    });

    // Some proxies deliver without named event type — also handle default `message`
    es.onmessage = (ev) => {
      attempt = 0;
      try {
        const data = JSON.parse(ev.data as string) as DataChangedEvent;
        if (data?.v === 1 && data.resource) dispatchDataChanged(data);
      } catch {
        /* ignore */
      }
    };

    es.onerror = () => {
      try {
        es?.close();
      } catch {
        /* ignore */
      }
      es = null;
      if (closed) return;
      attempt += 1;
      const delay = Math.min(30_000, 1000 * 2 ** Math.min(attempt, 5));
      clearRetry();
      retryTimer = window.setTimeout(open, delay);
      opts?.onError?.();
    };
  };

  open();

  return () => {
    closed = true;
    clearRetry();
    try {
      es?.close();
    } catch {
      /* ignore */
    }
    es = null;
  };
}
