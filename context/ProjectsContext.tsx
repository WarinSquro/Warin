import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { Project } from "../data/projects";
import { fetchProjects } from "../api/domain";
import { useAuth } from "./AuthContext";
import { useSharedDataSync } from "../hooks/useSharedDataSync";

interface ProjectsContextValue {
  projects: Project[];
  setProjects: React.Dispatch<React.SetStateAction<Project[]>>;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

const ProjectsContext = createContext<ProjectsContextValue | null>(null);

export function ProjectsProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    setError(null);
    try {
      setProjects(await fetchProjects());
    } catch (e) {
      // Keep last-known projects — do not wipe UI on transient/auth failures.
      setError(e instanceof Error ? e.message : "Failed to load projects");
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  }, []);

  const refresh = useCallback(() => load(), [load]);

  useEffect(() => {
    if (!isAuthenticated) {
      setProjects([]);
      return;
    }
    void load();
  }, [isAuthenticated, load]);

  useSharedDataSync(isAuthenticated, () => load({ silent: true }), { resources: ["projects"] });

  return (
    <ProjectsContext.Provider value={{ projects, setProjects, loading, error, refresh }}>
      {children}
    </ProjectsContext.Provider>
  );
}

export function useProjects() {
  const ctx = useContext(ProjectsContext);
  if (!ctx) {
    throw new Error("useProjects must be used within ProjectsProvider");
  }
  return ctx;
}
