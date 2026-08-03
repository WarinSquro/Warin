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

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await fetchEmployees();
      setEmployees(rows);
    } catch (e) {
      // Keep last-known employees — do not wipe UI on transient/auth failures.
      setError(e instanceof Error ? e.message : "Failed to load employees");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isAuthenticated) {
      setEmployees([]);
      return;
    }
    void refresh();
  }, [isAuthenticated, refresh]);

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
