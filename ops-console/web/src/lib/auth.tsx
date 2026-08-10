import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api } from "../lib/api";
import { useBusy } from "./busy";

type AuthState = {
  userId: string | null;
  loading: boolean;
  login: (userId: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
};

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { withBusy } = useBusy();
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const me = await api<{ userId: string }>("/auth/me");
      setUserId(me.userId);
    } catch {
      setUserId(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void withBusy(() => refresh());
  }, [refresh, withBusy]);

  const login = async (uid: string, password: string) => {
    await api("/auth/login", { method: "POST", json: { userId: uid, password } });
    setUserId(uid);
  };

  const logout = async () => {
    try {
      await api("/auth/logout", { method: "POST", json: {} });
    } finally {
      setUserId(null);
    }
  };

  return (
    <Ctx.Provider value={{ userId, loading, login, logout, refresh }}>{children}</Ctx.Provider>
  );
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error("AuthProvider missing");
  return v;
}
