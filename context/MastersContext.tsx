import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
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
import { useSharedDataSync } from "../hooks/useSharedDataSync";

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

/** Mirrors Nest `@RequirePermissions` OR-lists for each masters GET. */
function canFetchDepartments(keys: Set<string>, isSuperAdmin: boolean): boolean {
  if (isSuperAdmin || keys.has("*") || keys.has("masters")) return true;
  return (
    keys.has("masters.departments") ||
    keys.has("my_team.weekly_check_in") ||
    keys.has("planner") ||
    keys.has("availability")
  );
}

function canFetchSkills(keys: Set<string>, isSuperAdmin: boolean): boolean {
  if (isSuperAdmin || keys.has("*") || keys.has("masters")) return true;
  return keys.has("masters.skills") || keys.has("planner") || keys.has("availability");
}

function canFetchActivities(keys: Set<string>, isSuperAdmin: boolean): boolean {
  if (isSuperAdmin || keys.has("*") || keys.has("masters")) return true;
  return keys.has("masters.activities") || keys.has("planner") || keys.has("availability");
}

export function MastersProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated, allowedKeys, isSuperAdmin } = useAuth();
  const [departments, setDepartments] = useState<Department[]>([]);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [activityMilestones, setActivityMilestones] = useState<ActivityMilestone[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchFlags = useMemo(
    () => ({
      departments: canFetchDepartments(allowedKeys, isSuperAdmin),
      skills: canFetchSkills(allowedKeys, isSuperAdmin),
      activities: canFetchActivities(allowedKeys, isSuperAdmin),
    }),
    [allowedKeys, isSuperAdmin]
  );

  const load = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!opts?.silent) setLoading(true);
      setError(null);
      try {
        const wantDept = fetchFlags.departments;
        const wantSkills = fetchFlags.skills;
        const wantActs = fetchFlags.activities;

        // Settle independently — only call endpoints the user can access (avoids 403 churn).
        const [d, s, a, m] = await Promise.allSettled([
          wantDept ? fetchDepartments(true) : Promise.resolve([] as Department[]),
          wantSkills ? fetchSkills(true) : Promise.resolve([] as Skill[]),
          wantActs ? fetchActivities(true) : Promise.resolve([] as Activity[]),
          wantActs ? fetchActivityMilestones() : Promise.resolve([] as ActivityMilestone[]),
        ]);

        if (wantDept) {
          if (d.status === "fulfilled") setDepartments(d.value);
        } else {
          setDepartments([]);
        }
        if (wantSkills) {
          if (s.status === "fulfilled") setSkills(s.value);
        } else {
          setSkills([]);
        }
        if (wantActs) {
          if (a.status === "fulfilled") setActivities(a.value);
          if (m.status === "fulfilled") setActivityMilestones(m.value);
        } else {
          setActivities([]);
          setActivityMilestones([]);
        }

        const attempted = [
          wantDept ? d : null,
          wantSkills ? s : null,
          wantActs ? a : null,
          wantActs ? m : null,
        ].filter(Boolean) as PromiseSettledResult<unknown>[];
        if (
          attempted.length > 0 &&
          attempted.every((r) => r.status === "rejected")
        ) {
          const firstErr = attempted.find((r) => r.status === "rejected") as PromiseRejectedResult;
          setError(
            firstErr.reason instanceof Error ? firstErr.reason.message : "Failed to load masters"
          );
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load masters");
      } finally {
        if (!opts?.silent) setLoading(false);
      }
    },
    [fetchFlags]
  );

  const refresh = useCallback(() => load(), [load]);

  const fetchKey = `${fetchFlags.departments ? "d" : ""}${fetchFlags.skills ? "s" : ""}${
    fetchFlags.activities ? "a" : ""
  }`;

  useEffect(() => {
    if (!isAuthenticated) {
      setDepartments([]);
      setSkills([]);
      setActivities([]);
      setActivityMilestones([]);
      return;
    }
    void load();
  }, [isAuthenticated, load, fetchKey]);

  useSharedDataSync(isAuthenticated, () => load({ silent: true }), { resources: ["masters"] });

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
