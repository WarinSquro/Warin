import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { Employee } from "../data/employees";
import { fetchEmployees } from "../api/domain";
import { useAuth } from "./AuthContext";
import { useSharedDataSync } from "../hooks/useSharedDataSync";

interface EmployeesContextValue {
  employees: Employee[];
  setEmployees: React.Dispatch<React.SetStateAction<Employee[]>>;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

const EmployeesContext = createContext<EmployeesContextValue | null>(null);

export function EmployeesProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    setError(null);
    try {
      const rows = await fetchEmployees();
      setEmployees(rows);
    } catch (e) {
      // Keep last-known employees — do not wipe UI on transient/auth failures.
      setError(e instanceof Error ? e.message : "Failed to load employees");
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  }, []);

  const refresh = useCallback(() => load(), [load]);

  useEffect(() => {
    if (!isAuthenticated) {
      setEmployees([]);
      return;
    }
    void load();
  }, [isAuthenticated, load]);

  useSharedDataSync(isAuthenticated, () => load({ silent: true }), { resources: ["employees"] });

  return (
    <EmployeesContext.Provider value={{ employees, setEmployees, loading, error, refresh }}>
      {children}
    </EmployeesContext.Provider>
  );
}

export function useEmployees() {
  const ctx = useContext(EmployeesContext);
  if (!ctx) throw new Error("useEmployees must be used within EmployeesProvider");
  return ctx;
}
