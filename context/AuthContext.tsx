import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Employee } from "../data/employees";
import { getSuperAdminAssignableKeys } from "../data/accessRights";
import { getFirstAllowedRoute } from "../data/navConfig";
import { clearTokens, loginApi, meApi, SESSION_EXPIRED_EVENT, setTokens } from "../api/client";

const SESSION_KEY = "oneview_session_email";
const USER_KEY = "oneview_session_user";

type SessionUser = {
  id: string;
  hrmsId: string;
  name: string;
  email: string;
  isSuperAdmin: boolean;
  permissionKeys: string[];
  departmentName?: string | null;
};

interface AuthContextValue {
  sessionEmail: string | null;
  currentEmployee: Employee | null;
  isSuperAdmin: boolean;
  allowedKeys: Set<string>;
  isAuthenticated: boolean;
  /** Prefer signInWithPin for production API auth */
  signIn: (email: string) => void;
  signInWithPin: (email: string, pin: string) => Promise<string>;
  signOut: () => void;
  getDefaultLandingRoute: () => string;
  refreshAllowedKeys: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function toEmployee(u: SessionUser): Employee {
  return {
    id: u.hrmsId,
    name: u.name,
    email: u.email,
    department: u.departmentName ?? "—",
    skills: [],
    status: "active",
  };
}

function loadUser(): SessionUser | null {
  try {
    const raw = sessionStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as SessionUser) : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [sessionEmail, setSessionEmail] = useState<string | null>(() => {
    try {
      return sessionStorage.getItem(SESSION_KEY);
    } catch {
      return null;
    }
  });
  const [user, setUser] = useState<SessionUser | null>(() => loadUser());
  const [keysVersion, setKeysVersion] = useState(0);

  useEffect(() => {
    const token = sessionStorage.getItem("oneview_access_token");
    if (!token || user) return;
    meApi()
      .then((u) => {
        const su: SessionUser = {
          id: u.id,
          hrmsId: u.hrmsId,
          name: u.name,
          email: u.email,
          isSuperAdmin: u.isSuperAdmin,
          permissionKeys: u.permissionKeys ?? [],
          departmentName: u.departmentName,
        };
        setUser(su);
        setSessionEmail(su.email);
        sessionStorage.setItem(USER_KEY, JSON.stringify(su));
        sessionStorage.setItem(SESSION_KEY, su.email);
      })
      .catch(() => {
        clearTokens();
        setUser(null);
        setSessionEmail(null);
      });
  }, [user]);

  const isSuperAdmin = user?.isSuperAdmin === true;

  const currentEmployee = useMemo(() => (user ? toEmployee(user) : null), [user]);

  const allowedKeys = useMemo(() => {
    void keysVersion;
    if (!user) return new Set<string>();
    if (user.isSuperAdmin || user.permissionKeys.includes("*")) {
      return new Set(getSuperAdminAssignableKeys());
    }
    return new Set(user.permissionKeys);
  }, [user, keysVersion]);

  const signIn = useCallback((email: string) => {
    const trimmed = email.trim().toLowerCase();
    setSessionEmail(trimmed);
    try {
      sessionStorage.setItem(SESSION_KEY, trimmed);
    } catch {
      /* ignore */
    }
  }, []);

  const signInWithPin = useCallback(async (email: string, pin: string) => {
    const res = await loginApi(email.trim().toLowerCase(), pin);
    setTokens(res.accessToken, res.refreshToken);
    const su: SessionUser = {
      id: res.user.id,
      hrmsId: res.user.hrmsId,
      name: res.user.name,
      email: res.user.email,
      isSuperAdmin: res.user.isSuperAdmin,
      permissionKeys: res.user.permissionKeys ?? [],
      departmentName: res.user.departmentName,
    };
    setUser(su);
    setSessionEmail(su.email);
    setKeysVersion((v) => v + 1);
    sessionStorage.setItem(USER_KEY, JSON.stringify(su));
    sessionStorage.setItem(SESSION_KEY, su.email);
    const keys = su.isSuperAdmin || su.permissionKeys.includes("*")
      ? new Set(getSuperAdminAssignableKeys())
      : new Set(su.permissionKeys);
    return getFirstAllowedRoute(keys, su.isSuperAdmin) ?? "/access-denied";
  }, []);

  const signOut = useCallback(() => {
    setSessionEmail(null);
    setUser(null);
    clearTokens();
    try {
      sessionStorage.removeItem(SESSION_KEY);
      sessionStorage.removeItem(USER_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    const onExpired = () => signOut();
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
  }, [signOut]);

  const refreshAllowedKeys = useCallback(() => {
    setKeysVersion((v) => v + 1);
  }, []);

  const getDefaultLandingRoute = useCallback(() => {
    const route = getFirstAllowedRoute(allowedKeys, isSuperAdmin);
    return route ?? "/access-denied";
  }, [allowedKeys, isSuperAdmin]);

  const value = useMemo(
    (): AuthContextValue => ({
      sessionEmail,
      currentEmployee,
      isSuperAdmin,
      allowedKeys,
      isAuthenticated: Boolean(user && sessionEmail),
      signIn,
      signInWithPin,
      signOut,
      getDefaultLandingRoute,
      refreshAllowedKeys,
    }),
    [
      sessionEmail,
      currentEmployee,
      isSuperAdmin,
      allowedKeys,
      signIn,
      signInWithPin,
      signOut,
      getDefaultLandingRoute,
      refreshAllowedKeys,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export { SUPER_ADMIN_EMAIL } from "../data/accessRights";
