import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { isRouteAllowed } from "../data/navConfig";

const MODULE_REVOKED_MSG = "Your access to this module has been revoked.";

/**
 * When live permission sync removes access to the current route, show a clear
 * message. ProtectedRoute performs the redirect to an allowed page / Login.
 */
export function AccessRevocationWatcher() {
  const { isAuthenticated, isSuperAdmin, allowedKeys, mustChangePin } = useAuth();
  const toast = useToast();
  const location = useLocation();
  const wasAllowedRef = useRef(true);

  useEffect(() => {
    if (!isAuthenticated || mustChangePin) {
      wasAllowedRef.current = true;
      return;
    }

    const path = location.pathname;
    if (path === "/access-denied" || path === "/account" || path === "/login" || path === "/change-pin") {
      wasAllowedRef.current = true;
      return;
    }

    const allowed = isSuperAdmin || isRouteAllowed(path, allowedKeys);
    if (wasAllowedRef.current && !allowed) {
      toast.warning(MODULE_REVOKED_MSG);
    }
    wasAllowedRef.current = allowed;
  }, [allowedKeys, isAuthenticated, isSuperAdmin, location.pathname, mustChangePin, toast]);

  return null;
}
