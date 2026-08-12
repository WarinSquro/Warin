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

const DEFAULT_MS = 3000;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const timers = useRef<Map<string, number>>(new Map());

  const dismiss = useCallback((id: string) => {
    const t = timers.current.get(id);
    if (t) {
      window.clearTimeout(t);
      timers.current.delete(id);
    }
    setItems((prev) => prev.filter((x) => x.id !== id));
  }, []);

  const clear = useCallback(() => {
    for (const t of timers.current.values()) {
      window.clearTimeout(t);
    }
    timers.current.clear();
    setItems([]);
  }, []);

  const push = useCallback(
    (tone: ToastTone, message: string) => {
      const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      setItems((prev) => [...prev, { id, tone, message }]);
      const handle = window.setTimeout(() => dismiss(id), DEFAULT_MS);
      timers.current.set(id, handle);
    },
    [dismiss]
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
      <ToastViewport items={items} onDismiss={dismiss} />
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
