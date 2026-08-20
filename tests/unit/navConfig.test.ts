import { describe, expect, it } from "vitest";
import {
  getAssignedAccessTree,
  getFirstAllowedRoute,
  getPermissionKeyForPath,
  isRouteAllowed,
  PERMISSION_PAGES,
} from "../../data/navConfig";
import { isSuperAdminEmail, SUPER_ADMIN_EMAIL } from "../../data/accessRights";
import { EMPLOYEES } from "../../data/employees";

describe("navConfig", () => {
  it("maps /cockpit to my_workspace permission key", () => {
    expect(getPermissionKeyForPath("/cockpit")).toBe("my_workspace");
  });

  it("maps report paths to report keys", () => {
    expect(getPermissionKeyForPath("/reports/deployment")).toBe("reports.deployment");
    expect(getPermissionKeyForPath("/reports/workday-summary")).toBe("reports.workday_summary");
  });

  it("allows planner when key is present", () => {
    expect(isRouteAllowed("/planner", new Set(["planner"]))).toBe(true);
    expect(isRouteAllowed("/planner", new Set(["availability"]))).toBe(false);
  });

  it("sends super admin to cockpit as first route", () => {
    expect(getFirstAllowedRoute(new Set(), true)).toBe("/cockpit");
  });

  it("returns first menu-visible allowed route for normal users", () => {
    expect(getFirstAllowedRoute(new Set(["utilization"]), false)).toBe("/utilization");
  });

  it("keeps permission pages non-empty with unique keys", () => {
    expect(PERMISSION_PAGES.length).toBeGreaterThan(5);
    const keys = PERMISSION_PAGES.map((p) => p.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("always lists Profile under Account; Settings only when granted", () => {
    const withoutSettings = getAssignedAccessTree(new Set(["planner"]));
    const account = withoutSettings.find((g) => g.heading === "Account");
    expect(account?.pages.map((p) => p.key)).toEqual(["account"]);
    expect(withoutSettings.some((g) => g.pages.some((p) => p.key === "settings"))).toBe(false);

    const withSettings = getAssignedAccessTree(new Set(["planner", "settings"]));
    const accountWithSettings = withSettings.find((g) => g.heading === "Account");
    expect(accountWithSettings?.pages.map((p) => p.key)).toEqual(["account", "settings"]);
    expect(withSettings.some((g) => g.heading === "Setup" && g.pages.some((p) => p.key === "settings"))).toBe(
      false
    );
  });
});

describe("accessRights / employees seed consistency", () => {
  it("recognizes super admin email", () => {
    expect(isSuperAdminEmail(SUPER_ADMIN_EMAIL)).toBe(true);
    expect(isSuperAdminEmail("Admin@Acme.io")).toBe(true);
    expect(isSuperAdminEmail("ravi.sharma@acme.io")).toBe(false);
  });

  it("includes admin employee in mock roster", () => {
    expect(EMPLOYEES.some((e) => e.email === SUPER_ADMIN_EMAIL)).toBe(true);
  });
});
