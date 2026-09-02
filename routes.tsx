import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { ProtectedRoute, getRouteGuardProps } from "./components/ProtectedRoute";
import { useAuth } from "./context/AuthContext";
import { ResourcePlanner } from "./screens/ResourcePlanner";
import { Utilization } from "./screens/Utilization";
import { ExecutiveCockpit } from "./screens/ExecutiveCockpit";
import { PlanningConflicts } from "./screens/PlanningConflicts";
import { EmployeeMaster } from "./screens/EmployeeMaster";
import { Settings } from "./screens/Settings";
import { ProjectMaster } from "./screens/ProjectMaster";
import { SetupMasters } from "./screens/SetupMasters";
import { WorkConfirmation } from "./screens/WorkConfirmation";
import { Availability } from "./screens/Availability";
import { Login } from "./screens/Login";
import { ForgotPin } from "./screens/ForgotPin";
import { ResetPin } from "./screens/ResetPin";
import { ResourceDeploymentReport } from "./screens/ResourceDeploymentReport";
import { ResourcePerformanceReport } from "./screens/ResourcePerformanceReport";
import { ProjectExecutionReport } from "./screens/ProjectExecutionReport";
import { DailyWorkReport } from "./screens/DailyWorkReport";
import { WorkdaySummaryReport } from "./screens/WorkdaySummaryReport";
import { WeeklyCheckInQueue } from "./screens/WeeklyCheckInQueue";
import { WeeklyCheckInWorkspace } from "./screens/WeeklyCheckInWorkspace";
import { WeeklyCheckInHistory } from "./screens/WeeklyCheckInHistory";
import { WeeklyCheckInConfig } from "./screens/WeeklyCheckInConfig";
import { KpiFramework } from "./screens/KpiFramework";
import { KpiResults } from "./screens/KpiResults";
import { DecisionPoints } from "./screens/DecisionPoints";
import { TeamProjects } from "./screens/TeamProjects";
import { ChangePinRequired } from "./screens/ChangePinRequired";
import { AccessRights } from "./screens/AccessRights";
import { AccessDenied } from "./screens/AccessDenied";
import { AccountSettings } from "./screens/AccountSettings";

function DefaultRedirect() {
  const { isAuthenticated, getDefaultLandingRoute, mustChangePin } = useAuth();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (mustChangePin) return <Navigate to="/change-pin" replace />;
  return <Navigate to={getDefaultLandingRoute()} replace />;
}

function Guarded({
  path,
  permissionKey,
  superAdminOnly,
  children,
}: {
  path: string;
  permissionKey?: string;
  superAdminOnly?: boolean;
  children: React.ReactNode;
}) {
  const props = permissionKey
    ? { permissionKey }
    : superAdminOnly
      ? { superAdminOnly: true }
      : getRouteGuardProps(path);
  return <ProtectedRoute {...props}>{children}</ProtectedRoute>;
}

function AppShellRoutes() {
  const { isAuthenticated } = useAuth();
  const location = useLocation();

  if (
    !isAuthenticated &&
    location.pathname !== "/login" &&
    location.pathname !== "/forgot-pin" &&
    location.pathname !== "/reset-pin"
  ) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<DefaultRedirect />} />
        <Route path="/cockpit" element={<Guarded path="/cockpit"><ExecutiveCockpit /></Guarded>} />
        <Route path="/planning-conflicts" element={<Guarded path="/planning-conflicts"><PlanningConflicts /></Guarded>} />
        <Route path="/dashboard" element={<Navigate to="/cockpit" replace />} />
        <Route path="/exec-dashboard" element={<Navigate to="/cockpit" replace />} />
        <Route path="/planner" element={<Guarded path="/planner"><ResourcePlanner /></Guarded>} />
        <Route path="/availability" element={<Guarded path="/availability"><Availability /></Guarded>} />
        <Route path="/utilization" element={<Guarded path="/utilization"><Utilization /></Guarded>} />
        <Route path="/confirmations" element={<Guarded path="/confirmations"><WorkConfirmation /></Guarded>} />
        <Route path="/reports/deployment" element={<Guarded path="/reports/deployment"><ResourceDeploymentReport /></Guarded>} />
        <Route path="/reports/performance" element={<Guarded path="/reports/performance"><ResourcePerformanceReport /></Guarded>} />
        <Route path="/reports/execution" element={<Guarded path="/reports/execution"><ProjectExecutionReport /></Guarded>} />
        <Route path="/reports/daily-work" element={<Guarded path="/reports/daily-work"><DailyWorkReport /></Guarded>} />
        <Route path="/reports/workday-summary" element={<Guarded path="/reports/workday-summary"><WorkdaySummaryReport /></Guarded>} />
        <Route path="/my-team/weekly-check-in" element={<Guarded path="/my-team/weekly-check-in" permissionKey="my_team.weekly_check_in"><WeeklyCheckInQueue /></Guarded>} />
        <Route path="/my-team/weekly-check-in/:employeeId/history" element={<Guarded path="/my-team/weekly-check-in" permissionKey="my_team.weekly_check_in"><WeeklyCheckInHistory /></Guarded>} />
        <Route path="/my-team/weekly-check-in/:employeeId" element={<Guarded path="/my-team/weekly-check-in" permissionKey="my_team.weekly_check_in"><WeeklyCheckInWorkspace /></Guarded>} />
        <Route path="/my-team/kpi-results" element={<Guarded path="/my-team/kpi-results" permissionKey="my_team.kpi_results"><KpiResults /></Guarded>} />
        <Route path="/my-team/decision-points" element={<Guarded path="/my-team/decision-points" permissionKey="my_team.decision_points"><DecisionPoints /></Guarded>} />
        <Route path="/my-team/team-projects" element={<Guarded path="/my-team/team-projects" permissionKey="my_team.team_projects"><TeamProjects /></Guarded>} />
        <Route path="/projects" element={<Guarded path="/projects"><ProjectMaster /></Guarded>} />
        <Route path="/masters/weekly-check-in" element={<Guarded path="/masters/weekly-check-in" superAdminOnly><WeeklyCheckInConfig /></Guarded>} />
        <Route path="/masters/kpi-framework" element={<Guarded path="/masters/kpi-framework" permissionKey="masters.kpi_framework"><KpiFramework /></Guarded>} />
        <Route path="/masters" element={<Guarded path="/masters"><SetupMasters /></Guarded>} />
        <Route path="/employees" element={<Guarded path="/employees"><EmployeeMaster /></Guarded>} />
        <Route path="/settings" element={<Guarded path="/settings"><Settings /></Guarded>} />
        <Route path="/account" element={<ProtectedRoute><AccountSettings /></ProtectedRoute>} />
        <Route path="/access-rights" element={<Guarded path="/access-rights"><AccessRights /></Guarded>} />
        <Route path="/access-denied" element={<ProtectedRoute><AccessDenied /></ProtectedRoute>} />
        <Route path="*" element={<DefaultRedirect />} />
      </Routes>
    </AppShell>
  );
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/forgot-pin" element={<ForgotPin />} />
      <Route path="/reset-pin" element={<ResetPin />} />
      <Route path="/change-pin" element={<ChangePinRequired />} />
      <Route path="/*" element={<AppShellRoutes />} />
    </Routes>
  );
}
