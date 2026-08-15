import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ToastViewport, type ToastItem, type ToastTone } from "../components/ToastViewport";
import { remainingAfterElapsed, TOAST_DURATION_MS } from "../utils/toastTiming";

const CRUD = {
  created: "Record created successfully.",
  updated: "Record updated successfully.",
  deleted: "Record deleted successfully.",
} as const;

type ToastApi = {
  push: (tone: ToastTone, message: string) => void;
  /** Dismiss all visible toasts (e.g. before showing the next sequential validation message). */
  clear: () => void;
  success: (message: string) => void;
  info: (message: string) => void;
  warning: (message: string) => void;
  error: (message: string) => void;
  /** Standard CRUD copy */
  created: () => void;
  updated: () => void;
  deleted: () => void;
};

const ToastContext = createContext<ToastApi | null>(null);

type ToastTimer = {
  remainingMs: number;
  startedAt: number;
  timeoutId: number | null;
  paused: boolean;
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const timers = useRef<Map<string, ToastTimer>>(new Map());

  const dismiss = useCallback((id: string) => {
    const entry = timers.current.get(id);
    if (entry?.timeoutId != null) {
      window.clearTimeout(entry.timeoutId);
    }
    timers.current.delete(id);
    setItems((prev) => prev.filter((x) => x.id !== id));
  }, []);

  const armTimer = useCallback(
    (id: string, remainingMs: number) => {
      const timeoutId = window.setTimeout(() => dismiss(id), remainingMs);
      const prev = timers.current.get(id);
      timers.current.set(id, {
        remainingMs,
        startedAt: Date.now(),
        timeoutId,
        paused: false,
      });
      if (prev?.timeoutId != null && prev.timeoutId !== timeoutId) {
        window.clearTimeout(prev.timeoutId);
      }
    },
    [dismiss]
  );

  const pause = useCallback((id: string) => {
    const entry = timers.current.get(id);
    if (!entry || entry.paused) return;
    if (entry.timeoutId != null) {
      window.clearTimeout(entry.timeoutId);
    }
    const remainingMs = remainingAfterElapsed(entry.remainingMs, Date.now() - entry.startedAt);
    timers.current.set(id, {
      remainingMs,
      startedAt: Date.now(),
      timeoutId: null,
      paused: true,
    });
  }, []);

  const resume = useCallback(
    (id: string) => {
      const entry = timers.current.get(id);
      if (!entry || !entry.paused) return;
      if (entry.remainingMs <= 0) {
        dismiss(id);
        return;
      }
      armTimer(id, entry.remainingMs);
    },
    [armTimer, dismiss]
  );

  const clear = useCallback(() => {
    for (const entry of timers.current.values()) {
      if (entry.timeoutId != null) window.clearTimeout(entry.timeoutId);
    }
    timers.current.clear();
    setItems([]);
  }, []);

  const push = useCallback(
    (tone: ToastTone, message: string) => {
      const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      setItems((prev) => [...prev, { id, tone, message }]);
      armTimer(id, TOAST_DURATION_MS);
    },
    [armTimer]
  );

  const api = useMemo<ToastApi>(
    () => ({
      push,
      clear,
      success: (message) => push("success", message),
      info: (message) => push("info", message),
      warning: (message) => push("warning", message),
      error: (message) => push("error", message),
      created: () => push("success", CRUD.created),
      updated: () => push("success", CRUD.updated),
      deleted: () => push("success", CRUD.deleted),
    }),
    [push, clear]
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <ToastViewport items={items} onDismiss={dismiss} onPause={pause} onResume={resume} />
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within ToastProvider");
  }
  return ctx;
}

export const CRUD_TOAST = CRUD;
