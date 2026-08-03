import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { Activity, ActivityMilestone, Department, Skill } from "../data/setup";
import {
  fetchActivities,
  fetchActivityMilestones,
  fetchDepartments,
  fetchSkills,
} from "../api/domain";
import { useAuth } from "./AuthContext";

interface MastersContextValue {
  departments: Department[];
  setDepartments: React.Dispatch<React.SetStateAction<Department[]>>;
  skills: Skill[];
  setSkills: React.Dispatch<React.SetStateAction<Skill[]>>;
  activities: Activity[];
  setActivities: React.Dispatch<React.SetStateAction<Activity[]>>;
  activityMilestones: ActivityMilestone[];
  setActivityMilestones: React.Dispatch<React.SetStateAction<ActivityMilestone[]>>;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

const MastersContext = createContext<MastersContextValue | null>(null);

export function MastersProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();
  const [departments, setDepartments] = useState<Department[]>([]);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [activityMilestones, setActivityMilestones] = useState<ActivityMilestone[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Settle independently — managers with WCI (but not full masters) still get departments.
      const [d, s, a, m] = await Promise.allSettled([
        fetchDepartments(true),
        fetchSkills(true),
        fetchActivities(true),
        fetchActivityMilestones(),
      ]);
      if (d.status === "fulfilled") setDepartments(d.value);
      if (s.status === "fulfilled") setSkills(s.value);
      if (a.status === "fulfilled") setActivities(a.value);
      if (m.status === "fulfilled") setActivityMilestones(m.value);
      const firstErr = [d, s, a, m].find((r) => r.status === "rejected") as
        | PromiseRejectedResult
        | undefined;
      if (firstErr && [d, s, a, m].every((r) => r.status === "rejected")) {
        setError(
          firstErr.reason instanceof Error ? firstErr.reason.message : "Failed to load masters"
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load masters");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isAuthenticated) {
      setDepartments([]);
      setSkills([]);
      setActivities([]);
      setActivityMilestones([]);
      return;
    }
    void refresh();
  }, [isAuthenticated, refresh]);

  return (
    <MastersContext.Provider
      value={{
        departments,
        setDepartments,
        skills,
        setSkills,
        activities,
        setActivities,
        activityMilestones,
        setActivityMilestones,
        loading,
        error,
        refresh,
      }}
    >
      {children}
    </MastersContext.Provider>
  );
}

export function useMasters() {
  const ctx = useContext(MastersContext);
  if (!ctx) throw new Error("useMasters must be used within MastersProvider");
  return ctx;
}
