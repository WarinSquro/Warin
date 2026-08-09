import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { RefreshCw } from "lucide-react";
import { CockpitDailyCard } from "../components/CockpitDailyCard";
import { CockpitWeeklyMetricCard } from "../components/CockpitWeeklyMetricCard";
import { CockpitUtilTrendChart } from "../components/CockpitUtilTrendChart";
import { CockpitDeptHealthList } from "../components/CockpitDeptHealthList";
import { CockpitTeamLoadPanel } from "../components/CockpitTeamLoadPanel";
import { useCockpitRole } from "../context/CockpitRoleContext";
import { useAuth } from "../context/AuthContext";
import { useEmployees } from "../context/EmployeesContext";
import { useMasters } from "../context/MastersContext";
import { useProjects } from "../context/ProjectsContext";
import { useSettings } from "../context/SettingsContext";
import {
  COCKPIT_ROLE_PROFILES,
  buildLiveCockpitSnapshot,
  formatCockpitRefreshTime,
  type CockpitRoleId,
} from "../data/cockpit";
import { HEALTH_LABELS } from "../data/executionReport";
import {
  fetchAllocations,
  fetchConfirmations,
  type ApiAllocation,
  type ApiConfirmation,
} from "../api/domain";
import { addDaysISO, mondayISO } from "../api/liveViews";
import { useSharedDataSync } from "../hooks/useSharedDataSync";

/** Fetch window: 7 prior weeks + current week + next 2 weeks (daily availability). */
function cockpitOpsRange() {
  const currentMon = mondayISO();
  return {
    from: addDaysISO(currentMon, -7 * 7),
    to: addDaysISO(currentMon, 13),
  };
}

export function ExecutiveCockpit() {
  const navigate = useNavigate();
  const { cockpitRoleId, setLoginRole } = useCockpitRole();
  const roleId: CockpitRoleId = cockpitRoleId ?? "executive";
  const { currentEmployee } = useAuth();
  const { employees, refresh: refreshEmployees } = useEmployees();
  const { departments, refresh: refreshMasters } = useMasters();
  const { projects, refresh: refreshProjects } = useProjects();
  const { settings } = useSettings();
  const dateFmt = settings.dateFormat ?? "dd/MM/yyyy";
  const [refreshedAt, setRefreshedAt] = useState(() => formatCockpitRefreshTime(new Date(), dateFmt));
  const [refreshToast, setRefreshToast] = useState<string | null>(null);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [allocations, setAllocations] = useState<ApiAllocation[]>([]);
  const [confirmations, setConfirmations] = useState<ApiConfirmation[]>([]);
  const [opsLoaded, setOpsLoaded] = useState(false);

  const weekCapacity = Math.round(settings.workingHoursPerDay * settings.workingDays.length);
  const hoursPerDay = settings.workingHoursPerDay || 8;

  const loadOps = useCallback(async () => {
    const range = cockpitOpsRange();
    try {
      const [a, c] = await Promise.all([
        fetchAllocations({ from: range.from, to: range.to }),
        fetchConfirmations({ from: range.from, to: range.to }),
      ]);
      setAllocations(a);
      setConfirmations(c);
      setOpsLoaded(true);
    } catch {
      setAllocations([]);
      setConfirmations([]);
      setOpsLoaded(true);
    }
  }, []);

  useEffect(() => {
    void loadOps();
  }, [loadOps, weekCapacity]);

  useSharedDataSync(true, loadOps, { resources: ["allocations", "confirmations", "projects", "employees"] });

  const data = useMemo(
    () =>
      buildLiveCockpitSnapshot(roleId, {
        refreshedAt,
        employees,
        departmentNames: departments.filter((d) => d.status === "active").map((d) => d.name),
        weekCapacityHours: weekCapacity || 40,
        hoursPerDay,
        workingDays: settings.workingDays,
        projects,
        allocations,
        confirmations,
        opsLoaded,
        currentUserHrmsId: currentEmployee?.id,
      }),
    [
      roleId,
      refreshedAt,
      employees,
      departments,
      weekCapacity,
      hoursPerDay,
      settings.workingDays,
      projects,
      allocations,
      confirmations,
      opsLoaded,
      currentEmployee,
    ]
  );

  const onRefresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    setRefreshError(null);
    try {
      await Promise.all([refreshEmployees(), refreshMasters(), refreshProjects(), loadOps()]);
      setRefreshedAt(formatCockpitRefreshTime(new Date(), dateFmt));
      setRefreshToast("Data refreshed");
      window.setTimeout(() => setRefreshToast(null), 2000);
    } catch (e) {
      setRefreshError(e instanceof Error ? e.message : "Refresh failed. Try again.");
      window.setTimeout(() => setRefreshError(null), 4000);
    } finally {
      setRefreshing(false);
    }
  };

  const attentionPreview = data.attentionProjects.map(
    (p) => `${p.projectName} · ${HEALTH_LABELS[p.health]}`
  );
  const shortagePreview = data.resourceShortages.map(
    (s) => `${s.project} · ${s.role} ×${s.count}`
  );
  const availablePreview = data.availableResources.map(
    (r) => `${r.name} · from ${r.availableFrom}`
  );

  return (
    <>
      <header className="flex h-14 flex-shrink-0 items-center justify-between border-b border-border bg-surface px-5">
        <div>
          <div className="text-[15px] font-semibold tracking-tight text-foreground">
            My Workspace
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden text-right sm:block">
            <div className="text-[11px] text-muted-foreground">Latest approved data</div>
            <div className="text-[12px] tabular-nums text-foreground">{refreshedAt}</div>
          </div>
          <button
            type="button"
            disabled={refreshing}
            onClick={() => void onRefresh()}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-[12px] text-foreground hover:bg-surface-alt disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
            {refreshing ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </header>

      {refreshToast && (
        <div className="absolute right-5 top-16 z-50 rounded-md border border-border bg-surface px-3 py-2 text-[12px] shadow-md">
          {refreshToast}
        </div>
      )}
      {refreshError && (
        <div className="absolute right-5 top-16 z-50 rounded-md border border-danger-border bg-danger-soft px-3 py-2 text-[12px] text-danger shadow-md">
          {refreshError}
        </div>
      )}

      <div className="flex flex-1 flex-col gap-6 overflow-y-auto bg-background p-5">
        <section>
          <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-wide text-muted-foreground">
            Daily · Operational Snapshot
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <CockpitDailyCard
              title="Projects Need Attention"
              variant="attention"
              count={data.attentionProjects.length}
              previewLines={attentionPreview}
              zeroLabel="All clear · 0 projects"
              onClick={() => navigate("/reports/execution?preset=attention")}
            />
            <CockpitDailyCard
              title="Resource Shortage"
              variant="shortage"
              count={data.resourceShortages.length}
              previewLines={shortagePreview}
              zeroLabel="No shortages"
              onClick={() => navigate("/planner?panel=demand")}
            />
            <CockpitDailyCard
              title="Upcoming Availability"
              variant="available"
              count={data.availableResources.length}
              previewLines={availablePreview}
              zeroLabel={`0 in ${data.planningWindowLabel.toLowerCase()}`}
              onClick={() => navigate("/reports/deployment?status=Available")}
            />
            <CockpitDailyCard
              title="Planning Conflicts"
              variant="conflict"
              count={data.planningConflicts.length}
              previewLines={data.planningConflicts.map(
                (c) => `${c.employeeName} · ${c.conflictType}`
              )}
              zeroLabel="All clear"
              onClick={() => navigate("/planning-conflicts")}
            />
          </div>
        </section>

        <section>
          <div className="mb-3">
            <h2 className="text-[13px] font-semibold uppercase tracking-wide text-muted-foreground">
              Weekly · Operational Excellence
            </h2>
            <p className="mt-0.5 text-[11px] text-muted-foreground">{data.weekContextLabel}</p>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3 xl:items-stretch">
            <CockpitWeeklyMetricCard
              title="Confirmation Discipline"
              metric={data.confirmationDiscipline}
              bottomItems={data.worstConfirmationEmployees}
              showBottomTrend
              onClick={() => navigate("/reports/performance")}
            />
            <CockpitWeeklyMetricCard
              title="Planning Accuracy"
              metric={data.planningAccuracy}
              bottomItems={data.worstPlanningProjects}
              onClick={() => navigate("/reports/execution")}
            />
            <CockpitUtilTrendChart
              data={data.utilizationTrend}
              avg={data.utilizationAvg}
              onClick={() => navigate("/reports/performance")}
            />
          </div>

          <div className="mt-3 grid grid-cols-1 items-stretch gap-3 lg:grid-cols-2">
            <CockpitDeptHealthList
              rows={data.departmentHealth}
              onRowClick={(dept) =>
                navigate(`/reports/performance?department=${encodeURIComponent(dept)}`)
              }
            />
            <CockpitTeamLoadPanel
              rows={data.teamLoad}
              onRowClick={(plannerRowId) =>
                navigate(`/planner?highlight=${encodeURIComponent(plannerRowId)}`)
              }
            />
          </div>
        </section>

        {import.meta.env.DEV && (
          <div className="rounded-md border border-dashed border-border bg-surface-alt p-3 text-[11px] text-muted-foreground">
            Dev: switch cockpit profile —{" "}
            {(Object.keys(COCKPIT_ROLE_PROFILES) as CockpitRoleId[]).map((id) => (
              <button
                key={id}
                type="button"
                className="mr-2 text-primary hover:underline"
                onClick={() => setLoginRole(id === "executive" ? "executive" : "manager")}
              >
                {COCKPIT_ROLE_PROFILES[id].displayName}
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
