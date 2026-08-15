// Central registry for menu structure and page permission keys.

export interface PermissionSubpage {
  key: string;
  label: string;
  route: string;
  segment?: string;
}

export interface PermissionPage {
  key: string;
  label: string;
  route: string;
  group: string;
  menuVisible: boolean;
  /** When false, hidden from Access Rights tree (e.g. sub-screens opened from My Workspace). Default true. */
  accessRightsVisible?: boolean;
  superAdminOnly?: boolean;
  badge?: string;
  children?: PermissionSubpage[];
}

export const PERMISSION_PAGES: PermissionPage[] = [
  {
    key: "my_workspace",
    label: "My Workspace",
    route: "/cockpit",
    group: "My Workspace",
    menuVisible: true,
  },
  {
    key: "planner",
    label: "Resource Planner",
    route: "/planner",
    group: "Planning",
    menuVisible: true,
  },
  {
    key: "availability",
    label: "Availability",
    route: "/availability",
    group: "Planning",
    menuVisible: true,
  },
  {
    key: "utilization",
    label: "Utilization",
    route: "/utilization",
    group: "Planning",
    menuVisible: true,
  },
  {
    key: "confirmations",
    label: "Confirmations",
    route: "/confirmations",
    group: "Planning",
    menuVisible: true,
  },
  {
    key: "planning_conflicts",
    label: "Planning Conflicts",
    route: "/planning-conflicts",
    group: "Planning",
    menuVisible: false,
  },
  {
    key: "reports.deployment",
    label: "Resource Deployment",
    route: "/reports/deployment",
    group: "Reports",
    menuVisible: true,
  },
  {
    key: "reports.performance",
    label: "Resource Performance",
    route: "/reports/performance",
    group: "Reports",
    menuVisible: true,
  },
  {
    key: "reports.execution",
    label: "Project Execution",
    route: "/reports/execution",
    group: "Reports",
    menuVisible: true,
  },
  {
    key: "reports.daily_work",
    label: "Daily Work Detail",
    route: "/reports/daily-work",
    group: "Reports",
    menuVisible: true,
  },
  {
    key: "my_team.weekly_check_in",
    label: "Weekly Check-In",
    route: "/my-team/weekly-check-in",
    group: "My Team",
    menuVisible: true,
  },
  {
    key: "my_team.kpi_results",
    label: "KPI Results",
    route: "/my-team/kpi-results",
    group: "My Team",
    menuVisible: true,
  },
  {
    key: "masters",
    label: "Org · Skills · Activities",
    route: "/masters",
    group: "Setup",
    menuVisible: true,
    children: [
      { key: "masters.departments", label: "Organization", route: "/masters", segment: "departments" },
      { key: "masters.skills", label: "Skills", route: "/masters", segment: "skills" },
      { key: "masters.activities", label: "Activities", route: "/masters", segment: "activities" },
    ],
  },
  {
    key: "masters.kpi_framework",
    label: "KPI Framework",
    route: "/masters/kpi-framework",
    group: "Setup",
    menuVisible: true,
  },
  {
    key: "masters.weekly_check_in",
    label: "Weekly Check-In Config",
    route: "/masters/weekly-check-in",
    group: "Setup",
    menuVisible: true,
    superAdminOnly: true,
  },
  {
    key: "employees",
    label: "Employees",
    route: "/employees",
    group: "Setup",
    menuVisible: true,
  },
  {
    key: "projects",
    label: "Projects",
    route: "/projects",
    group: "Setup",
    menuVisible: true,
  },
  {
    key: "settings",
    label: "Settings",
    route: "/settings",
    group: "Setup",
    menuVisible: false,
  },
  {
    key: "access_rights",
    label: "Access Rights",
    route: "/access-rights",
    group: "Setup",
    menuVisible: false,
    superAdminOnly: true,
  },
];

const GROUP_ORDER = ["My Workspace", "My Team", "Planning", "Reports", "Setup"];

export function getPermissionGroups(includeSuperAdminOnly: boolean): { heading?: string; pages: PermissionPage[] }[] {
  const pages = PERMISSION_PAGES.filter(
    (p) => (includeSuperAdminOnly || !p.superAdminOnly) && p.accessRightsVisible !== false
  );
  const byGroup = new Map<string, PermissionPage[]>();
  for (const page of pages) {
    const list = byGroup.get(page.group) ?? [];
    list.push(page);
    byGroup.set(page.group, list);
  }
  return GROUP_ORDER.filter((g) => byGroup.has(g)).map((heading) => ({
    heading: heading === "My Workspace" ? undefined : heading,
    pages: byGroup.get(heading)!,
  }));
}

export type AssignedAccessLeaf = { key: string; label: string };
export type AssignedAccessPage = AssignedAccessLeaf & { children?: AssignedAccessLeaf[] };
export type AssignedAccessGroup = { heading: string; pages: AssignedAccessPage[] };

/** Assigned pages in nav/Access Rights order (group → page → child), not alphabetical. */
export function getAssignedAccessTree(allowedKeys: Set<string>): AssignedAccessGroup[] {
  const groups = getPermissionGroups(false)
    .map((group) => ({
      heading: group.heading ?? "My Workspace",
      pages: group.pages.flatMap((page): AssignedAccessPage[] => {
        if (page.superAdminOnly) return [];
        // Settings is listed under Account with Profile (user menu), not Setup.
        if (page.key === "settings") return [];
        if (page.children?.length) {
          const children = page.children
            .filter((c) => allowedKeys.has(c.key))
            .map((c) => ({ key: c.key, label: c.label }));
          if (children.length === 0) return [];
          return [{ key: page.key, label: page.label, children }];
        }
        if (!allowedKeys.has(page.key)) return [];
        return [{ key: page.key, label: page.label }];
      }),
    }))
    .filter((g) => g.pages.length > 0);

  const accountPages: AssignedAccessPage[] = [{ key: "account", label: "Profile" }];
  if (allowedKeys.has("settings")) {
    accountPages.push({ key: "settings", label: "Settings" });
  }
  return [...groups, { heading: "Account", pages: accountPages }];
}

/** All assignable permission keys (leaves; parent pages with children use child keys). */
export function getAllAssignableKeys(includeSuperAdminOnly: boolean): string[] {
  const keys: string[] = [];
  for (const page of PERMISSION_PAGES) {
    if (page.superAdminOnly && !includeSuperAdminOnly) continue;
    if (page.accessRightsVisible === false) continue;
    if (page.children?.length) {
      for (const child of page.children) keys.push(child.key);
    } else {
      keys.push(page.key);
    }
  }
  return keys;
}

export function flattenPermissionKeys(pages: PermissionPage[]): string[] {
  const keys: string[] = [];
  for (const page of pages) {
    if (page.children?.length) {
      for (const child of page.children) keys.push(child.key);
    } else {
      keys.push(page.key);
    }
  }
  return keys;
}

export function getPageByKey(key: string): PermissionPage | undefined {
  return PERMISSION_PAGES.find((p) => p.key === key);
}

export function getPermissionKeyForPath(pathname: string): string | null {
  const normalized = pathname.split("?")[0];
  if (normalized === "/" || normalized === "") return "my_workspace";

  const exact = PERMISSION_PAGES.find((p) => p.route === normalized);
  if (exact) {
    if (exact.children?.length) {
      return exact.children[0].key;
    }
    return exact.key;
  }

  const prefix = PERMISSION_PAGES.find(
    (p) => normalized.startsWith(p.route + "/") || normalized.startsWith(p.route)
  );
  if (prefix) return prefix.children?.[0]?.key ?? prefix.key;

  const myTeam = PERMISSION_PAGES.find((p) => p.key === "my_team.weekly_check_in");
  if (myTeam && normalized.startsWith(myTeam.route)) return myTeam.key;

  return null;
}

export function isRouteAllowed(pathname: string, allowedKeys: Set<string>): boolean {
  const normalized = pathname.split("?")[0];
  // Opened from My Workspace — gated by my_workspace (legacy planning_conflicts still honored)
  if (normalized === "/planning-conflicts") {
    return allowedKeys.has("my_workspace") || allowedKeys.has("planning_conflicts");
  }

  const page = PERMISSION_PAGES.find((p) => p.route === normalized);
  if (page) return isPageAllowed(page, allowedKeys);

  const myTeam = PERMISSION_PAGES.find((p) => p.key === "my_team.weekly_check_in");
  if (myTeam && normalized.startsWith(myTeam.route)) {
    return isPageAllowed(myTeam, allowedKeys);
  }

  const match = PERMISSION_PAGES.find((p) => normalized.startsWith(p.route + "/"));
  if (!match) return false;
  return isPageAllowed(match, allowedKeys);
}

function isPageAllowed(page: PermissionPage, allowedKeys: Set<string>): boolean {
  if (page.children?.length) {
    return page.children.some((c) => allowedKeys.has(c.key));
  }
  return allowedKeys.has(page.key);
}

export function getFirstAllowedRoute(allowedKeys: Set<string>, isSuperAdmin: boolean): string | null {
  if (isSuperAdmin) return "/cockpit";
  for (const page of PERMISSION_PAGES) {
    if (page.superAdminOnly) continue;
    if (page.menuVisible && isPageAllowed(page, allowedKeys)) {
      return page.route;
    }
  }
  return null;
}

export function getMenuNavItems(
  allowedKeys: Set<string>,
  isSuperAdmin: boolean
): { heading?: string; items: { key: string; to: string; label: string; badge?: string }[] }[] {
  return getPermissionGroups(isSuperAdmin)
    .map((group) => ({
      heading: group.heading,
      items: group.pages
        .filter((p) => p.menuVisible && (isSuperAdmin || isPageAllowed(p, allowedKeys)))
        .map((p) => ({
          key: p.key,
          to: p.route,
          label: p.label,
          badge: p.badge,
        })),
    }))
    .filter((g) => g.items.length > 0);
}
