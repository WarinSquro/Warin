import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { CockpitRoleId, LoginRole } from "../data/cockpit";
import { mapLoginToCockpitRole } from "../data/cockpit";
import { useAuth } from "./AuthContext";

interface CockpitRoleContextValue {
  loginRole: LoginRole;
  cockpitRoleId: CockpitRoleId | null;
  setLoginRole: (role: LoginRole) => void;
}

const CockpitRoleContext = createContext<CockpitRoleContextValue | null>(null);

export function CockpitRoleProvider({ children }: { children: ReactNode }) {
  const { isSuperAdmin } = useAuth();
  const [loginRole, setLoginRole] = useState<LoginRole>(() =>
    isSuperAdmin ? "executive" : "manager"
  );

  // Sync default when auth resolves (e.g. async token refresh)
  useEffect(() => {
    setLoginRole(isSuperAdmin ? "executive" : "manager");
  }, [isSuperAdmin]);

  const cockpitRoleId = mapLoginToCockpitRole(loginRole);

  return (
    <CockpitRoleContext.Provider value={{ loginRole, cockpitRoleId, setLoginRole }}>
      {children}
    </CockpitRoleContext.Provider>
  );
}

export function useCockpitRole() {
  const ctx = useContext(CockpitRoleContext);
  if (!ctx) throw new Error("useCockpitRole must be used within CockpitRoleProvider");
  return ctx;
}
