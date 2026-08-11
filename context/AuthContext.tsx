import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Employee } from "../data/employees";
import { getSuperAdminAssignableKeys } from "../data/accessRights";
import { getFirstAllowedRoute } from "../data/navConfig";
import {
  clearTokens,
  LOGIN_NOTICE_KEY,
  loginApi,
  meApi,
  PERMISSIONS_STALE_EVENT,
  SESSION_EXPIRED_EVENT,
  setTokens,
} from "../api/client";
import { DATA_CHANGED_EVENT, type DataChangedEvent } from "../api/realtimeEvents";

const SESSION_KEY = "oneview_session_email";
const USER_KEY = "oneview_session_user";
/** Fallback poll when SSE is unavailable — keep near-realtime without heavy load. */
const PERMISSION_SYNC_INTERVAL_MS = 30_000;

type SessionUser = {
  id: string;
  hrmsId: string;
  name: string;
  email: string;
  isSuperAdmin: boolean;
  permissionKeys: string[];
  departmentName?: string | null;
  mustChangePin?: boolean;
};

interface AuthContextValue {
  sessionEmail: string | null;
  currentEmployee: Employee | null;
  isSuperAdmin: boolean;
  allowedKeys: Set<string>;
  isAuthenticated: boolean;
  /** True when login requires forced PIN change before app access */
  mustChangePin: boolean;
  /** Prefer signInWithPin for production API auth */
  signIn: (email: string) => void;
  signInWithPin: (email: string, pin: string) => Promise<string>;
  clearMustChangePin: () => void;
  signOut: () => void;
  getDefaultLandingRoute: () => string;
  /** Re-fetch permission keys from /auth/me and update the session (handles live revoke). */
  refreshAllowedKeys: () => Promise<void>;
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

function persistUser(su: SessionUser) {
  sessionStorage.setItem(USER_KEY, JSON.stringify(su));
  sessionStorage.setItem(SESSION_KEY, su.email);
}

function keysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sa = [...a].sort();
  const sb = [...b].sort();
  return sa.every((k, i) => k === sb[i]);
}

function hasAppAccess(su: Pick<SessionUser, "isSuperAdmin" | "permissionKeys">): boolean {
  if (su.isSuperAdmin || su.permissionKeys.includes("*")) return true;
  return su.permissionKeys.length > 0;
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
  const syncInFlight = useRef<Promise<void> | null>(null);
  const userRef = useRef(user);
  userRef.current = user;

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
          mustChangePin: Boolean(u.mustChangePin),
        };
        setUser(su);
        setSessionEmail(su.email);
        persistUser(su);
      })
      .catch(() => {
        clearTokens();
        setUser(null);
        setSessionEmail(null);
      });
  }, [user]);

  const isSuperAdmin = user?.isSuperAdmin === true;
  const mustChangePin = Boolean(user?.mustChangePin);

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
      mustChangePin: Boolean(res.user.mustChangePin),
    };
    setUser(su);
    setSessionEmail(su.email);
    setKeysVersion((v) => v + 1);
    persistUser(su);
    if (su.mustChangePin) return "/change-pin";
    const keys =
      su.isSuperAdmin || su.permissionKeys.includes("*")
        ? new Set(getSuperAdminAssignableKeys())
        : new Set(su.permissionKeys);
    return getFirstAllowedRoute(keys, su.isSuperAdmin) ?? "/access-denied";
  }, []);

  const clearMustChangePin = useCallback(() => {
    setUser((prev) => {
      if (!prev) return prev;
      const next = { ...prev, mustChangePin: false };
      try {
        persistUser(next);
      } catch {
        /* ignore */
      }
      return next;
    });
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

  const refreshAllowedKeys = useCallback(async () => {
    if (syncInFlight.current) return syncInFlight.current;
    const token = sessionStorage.getItem("oneview_access_token");
    if (!token || !userRef.current) return;

    syncInFlight.current = (async () => {
      try {
        const u = await meApi();
        const prev = userRef.current;
        const nextKeys = u.permissionKeys ?? [];
        const su: SessionUser = {
          id: u.id,
          hrmsId: u.hrmsId,
          name: u.name,
          email: u.email,
          isSuperAdmin: u.isSuperAdmin,
          permissionKeys: nextKeys,
          departmentName: u.departmentName,
          mustChangePin: Boolean(u.mustChangePin),
        };

        if (!hasAppAccess(su)) {
          const prevHadAccess = Boolean(prev && hasAppAccess(prev));
          if (prevHadAccess) {
            try {
              sessionStorage.setItem(
                LOGIN_NOTICE_KEY,
                "Your access has been revoked. Please contact your administrator."
              );
            } catch {
              /* ignore */
            }
            signOut();
            return;
          }
          // Still no page access (e.g. landed on /access-denied) — keep session, update keys.
          setUser(su);
          setSessionEmail(su.email);
          setKeysVersion((v) => v + 1);
          persistUser(su);
          return;
        }

        const unchanged =
          prev &&
          prev.isSuperAdmin === su.isSuperAdmin &&
          keysEqual(prev.permissionKeys, su.permissionKeys) &&
          prev.mustChangePin === su.mustChangePin;

        if (unchanged) return;

        setUser(su);
        setSessionEmail(su.email);
        setKeysVersion((v) => v + 1);
        persistUser(su);
      } catch {
        /* network / 401 handled elsewhere */
      } finally {
        syncInFlight.current = null;
      }
    })();

    return syncInFlight.current;
  }, [signOut]);

  useEffect(() => {
    const onExpired = () => signOut();
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
  }, [signOut]);

  useEffect(() => {
    if (!user) return;

    const onStale = () => {
      void refreshAllowedKeys();
    };
    const onDataChanged = (ev: Event) => {
      const detail = (ev as CustomEvent<DataChangedEvent>).detail;
      if (detail?.resource === "access-rights") void refreshAllowedKeys();
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") void refreshAllowedKeys();
    };

    window.addEventListener(PERMISSIONS_STALE_EVENT, onStale);
    window.addEventListener(DATA_CHANGED_EVENT, onDataChanged);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);

    const interval = window.setInterval(() => {
      void refreshAllowedKeys();
    }, PERMISSION_SYNC_INTERVAL_MS);

    return () => {
      window.removeEventListener(PERMISSIONS_STALE_EVENT, onStale);
      window.removeEventListener(DATA_CHANGED_EVENT, onDataChanged);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      window.clearInterval(interval);
    };
  }, [user, refreshAllowedKeys]);

  const getDefaultLandingRoute = useCallback(() => {
    if (mustChangePin) return "/change-pin";
    const route = getFirstAllowedRoute(allowedKeys, isSuperAdmin);
    return route ?? "/access-denied";
  }, [allowedKeys, isSuperAdmin, mustChangePin]);

  const value = useMemo(
    (): AuthContextValue => ({
      sessionEmail,
      currentEmployee,
      isSuperAdmin,
      allowedKeys,
      isAuthenticated: Boolean(user && sessionEmail),
      mustChangePin,
      signIn,
      signInWithPin,
      clearMustChangePin,
      signOut,
      getDefaultLandingRoute,
      refreshAllowedKeys,
    }),
    [
      sessionEmail,
      currentEmployee,
      isSuperAdmin,
      allowedKeys,
      mustChangePin,
      signIn,
      signInWithPin,
      clearMustChangePin,
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
