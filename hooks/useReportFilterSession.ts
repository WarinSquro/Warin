import { useCallback, useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { clearStoredReportFilters } from "../utils/reportFilterPersistence";

/**
 * Per-report filter session: resets when the user (re)opens the route (`location.key`).
 * Call `markFiltersReady()` after the first data fetch so multi-selects reconcile against
 * the full option list (avoids Deployment "Unallocated-only" bootstrap).
 */
export function useReportFilterSession(reportKey: string) {
  const location = useLocation();
  const sessionKey = location.key;
  const [filtersReady, setFiltersReady] = useState(false);

  useEffect(() => {
    setFiltersReady(false);
    clearStoredReportFilters(reportKey);
  }, [sessionKey, reportKey]);

  const markFiltersReady = useCallback(() => {
    setFiltersReady(true);
  }, []);

  return { sessionKey, filtersReady, markFiltersReady };
}
