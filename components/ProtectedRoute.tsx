import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { isRouteAllowed, PERMISSION_PAGES } from "../data/navConfig";

interface ProtectedRouteProps {
  children: React.ReactNode;
  permissionKey?: string;
  superAdminOnly?: boolean;
}

export function ProtectedRoute({
  children,
  permissionKey,
  superAdminOnly,
}: ProtectedRouteProps) {
  const { isAuthenticated, isSuperAdmin, allowedKeys, getDefaultLandingRoute } = useAuth();
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (location.pathname === "/access-denied" || location.pathname === "/account") {
    return <>{children}</>;
  }

  if (superAdminOnly && !isSuperAdmin) {
    const fallback = getDefaultLandingRoute();
    return <Navigate to={fallback} replace />;
  }

  const path = location.pathname;
  let allowed = false;

  if (superAdminOnly && isSuperAdmin) {
    allowed = true;
  } else if (permissionKey) {
    allowed = isSuperAdmin || allowedKeys.has(permissionKey);
  } else {
    allowed = isSuperAdmin || isRouteAllowed(path, allowedKeys);
  }

  if (!allowed) {
    if (allowedKeys.size === 0 && !isSuperAdmin) {
      return <Navigate to="/access-denied" replace />;
    }
    const fallback = getDefaultLandingRoute();
    if (fallback === path || fallback === "/access-denied") {
      return <Navigate to="/access-denied" replace />;
    }
    return <Navigate to={fallback} replace />;
  }

  return <>{children}</>;
}

export function getRouteGuardProps(pathname: string): {
  permissionKey?: string;
  superAdminOnly?: boolean;
} {
  const page = PERMISSION_PAGES.find((p) => p.route === pathname);
  if (!page) return {};
  if (page.superAdminOnly) return { superAdminOnly: true };
  if (page.children?.length) return {};
  return { permissionKey: page.key };
}
