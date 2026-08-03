import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { DEFAULT_SETTINGS } from "../data/settings";
import type { MetricBands, SettingsState } from "../data/settings";
import { fetchSettings } from "../api/domain";
import { useAuth } from "./AuthContext";

interface SettingsContextValue {
  settings: SettingsState;
  setSettings: React.Dispatch<React.SetStateAction<SettingsState>>;
  patchSettings: (patch: Partial<SettingsState>) => void;
  patchMetricBands: (patch: Partial<MetricBands>) => void;
  loading: boolean;
  refresh: () => Promise<void>;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();
  const [settings, setSettings] = useState<SettingsState>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setSettings(await fetchSettings());
    } catch {
      /* keep defaults if settings API unavailable */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;
    void refresh();
  }, [isAuthenticated, refresh]);

  const patchSettings = (patch: Partial<SettingsState>) => {
    setSettings((prev) => ({ ...prev, ...patch }));
  };

  const patchMetricBands = (patch: Partial<MetricBands>) => {
    setSettings((prev) => ({
      ...prev,
      metricBands: { ...prev.metricBands, ...patch },
    }));
  };

  return (
    <SettingsContext.Provider
      value={{ settings, setSettings, patchSettings, patchMetricBands, loading, refresh }}
    >
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) {
    throw new Error("useSettings must be used within SettingsProvider");
  }
  return ctx;
}
