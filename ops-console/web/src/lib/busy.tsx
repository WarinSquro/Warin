import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

type BusyApi = {
  busy: boolean;
  /** Increment busy count (nested-safe). */
  begin: () => void;
  /** Decrement busy count. */
  end: () => void;
  /** Run an async fn while showing the global working cursor. */
  withBusy: <T>(fn: () => Promise<T>) => Promise<T>;
};

const BusyCtx = createContext<BusyApi | null>(null);

export function BusyProvider({ children }: { children: ReactNode }) {
  const [count, setCount] = useState(0);
  const countRef = useRef(0);

  const begin = useCallback(() => {
    countRef.current += 1;
    setCount(countRef.current);
  }, []);

  const end = useCallback(() => {
    countRef.current = Math.max(0, countRef.current - 1);
    setCount(countRef.current);
  }, []);

  const withBusy = useCallback(
    async <T,>(fn: () => Promise<T>) => {
      begin();
      try {
        return await fn();
      } finally {
        end();
      }
    },
    [begin, end],
  );

  const busy = count > 0;

  useEffect(() => {
    document.documentElement.classList.toggle("ops-busy", busy);
    return () => document.documentElement.classList.remove("ops-busy");
  }, [busy]);

  const value = useMemo(() => ({ busy, begin, end, withBusy }), [busy, begin, end, withBusy]);

  return <BusyCtx.Provider value={value}>{children}</BusyCtx.Provider>;
}

export function useBusy() {
  const v = useContext(BusyCtx);
  if (!v) throw new Error("BusyProvider missing");
  return v;
}
