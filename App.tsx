import "./index.css";
import { BrowserRouter } from "react-router-dom";
import { ProjectsProvider } from "./context/ProjectsContext";
import { SettingsProvider } from "./context/SettingsContext";
import { CockpitRoleProvider } from "./context/CockpitRoleContext";
import { AuthProvider } from "./context/AuthContext";
import { EmployeesProvider } from "./context/EmployeesContext";
import { MastersProvider } from "./context/MastersContext";
import { ToastProvider } from "./context/ToastContext";
import { RealtimeSyncBridge } from "./components/RealtimeSyncBridge";
import { AccessRevocationWatcher } from "./components/AccessRevocationWatcher";
import { TruncateHoverTitles } from "./components/TruncateHoverTitles";
import { AppRoutes } from "./routes";

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <RealtimeSyncBridge />
          <AccessRevocationWatcher />
          <TruncateHoverTitles />
          <SettingsProvider>
            <EmployeesProvider>
              <MastersProvider>
                <ProjectsProvider>
                  <CockpitRoleProvider>
                    <AppRoutes />
                  </CockpitRoleProvider>
                </ProjectsProvider>
              </MastersProvider>
            </EmployeesProvider>
          </SettingsProvider>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}
