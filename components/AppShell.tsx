import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  CalendarRange,
  CalendarClock,
  Activity,
  ClipboardCheck,
  FolderKanban,
  Boxes,
  UserPlus,
  Settings,
  ChevronUp,
  LogOut,
  UserCog,
  FileBarChart,
  TrendingUp,
  BarChart3,
  ShieldCheck,
  TableProperties,
  UsersRound,
  SlidersHorizontal,
  type LucideIcon,
} from "lucide-react";
import { ProductLogo } from "./ProductLogo";
import { useAuth } from "../context/AuthContext";
import { getMenuNavItems } from "../data/navConfig";

const NAV_ICONS: Record<string, LucideIcon> = {
  my_workspace: LayoutDashboard,
  planner: CalendarRange,
  availability: CalendarClock,
  utilization: Activity,
  confirmations: ClipboardCheck,
  "reports.deployment": FileBarChart,
  "reports.performance": TrendingUp,
  "reports.execution": BarChart3,
  "reports.daily_work": TableProperties,
  "my_team.weekly_check_in": UsersRound,
  "masters.weekly_check_in": SlidersHorizontal,
  projects: FolderKanban,
  masters: Boxes,
  employees: UserPlus,
  settings: Settings,
  access_rights: ShieldCheck,
};

export function AppShell({ children }: { children: ReactNode }) {
  const { isSuperAdmin, allowedKeys } = useAuth();
  const navGroups = getMenuNavItems(allowedKeys, isSuperAdmin);

  const exactMatchRoutes = useMemo(() => {
    const routes = navGroups.flatMap((g) => g.items.map((i) => i.to));
    const needEnd = new Set<string>();
    for (const route of routes) {
      for (const other of routes) {
        if (other !== route && other.startsWith(`${route}/`)) {
          needEnd.add(route);
          break;
        }
      }
    }
    return needEnd;
  }, [navGroups]);

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      <aside className="flex w-[236px] flex-shrink-0 flex-col bg-brand text-brand-fg">
        <div className="flex h-14 flex-shrink-0 items-center justify-center border-b border-brand-border bg-brand px-3">
          <ProductLogo variant="contrast" height={26} className="max-w-[176px]" />
        </div>

        <nav className="flex-1 overflow-y-auto px-2.5 py-3">
          {navGroups.map((group, gi) => (
            <div key={gi} className="mb-1">
              {group.heading && (
                <div className="px-3 pb-1.5 pt-4 text-[10px] font-semibold uppercase tracking-[0.09em] text-brand-muted">
                  {group.heading}
                </div>
              )}
              {group.items.map((item) => {
                const Icon = NAV_ICONS[item.key] ?? LayoutDashboard;
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={exactMatchRoutes.has(item.to)}
                    className={({ isActive }) =>
                      [
                        "mb-0.5 flex items-center gap-3 rounded-md border-l-[3px] py-2 pl-2.5 pr-3 text-[13px] transition-colors",
                        isActive
                          ? "border-white bg-white/10 font-semibold text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)]"
                          : "border-transparent text-brand-fg hover:bg-brand-active/60 hover:text-white",
                      ].join(" ")
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <Icon
                          className={`h-[15px] w-[15px] flex-shrink-0 ${isActive ? "text-white" : ""}`}
                          strokeWidth={isActive ? 2.25 : 2}
                        />
                        <span className="flex-1 truncate">{item.label}</span>
                        {item.badge && (
                          <span
                            className={`rounded-full px-1.5 py-px text-[10px] font-semibold text-white ${isActive ? "bg-primary" : "bg-warning"}`}
                          >
                            {item.badge}
                          </span>
                        )}
                      </>
                    )}
                  </NavLink>
                );
              })}
            </div>
          ))}
        </nav>

        <AccountFooter />
      </aside>

      <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">{children}</main>
    </div>
  );
}

function AccountFooter() {
  const navigate = useNavigate();
  const { signOut, currentEmployee, isSuperAdmin, allowedKeys } = useAuth();
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);

  const showSettings = isSuperAdmin || allowedKeys.has("settings");
  const showAccessRights = isSuperAdmin;

  const initials =
    currentEmployee?.name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .slice(0, 2) ?? "??";

  const closeAndNavigate = (path: string) => {
    setOpen(false);
    navigate(path);
  };

  return (
    <div className="relative border-t border-brand-border">
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute bottom-[calc(100%-4px)] left-3 right-3 z-20 overflow-hidden rounded-md border border-brand-border bg-brand-active py-1 shadow-2xl">
            <button
              type="button"
              onClick={() => closeAndNavigate("/account")}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-[12px] text-brand-fg hover:bg-brand-active/60 hover:text-white"
            >
              <UserCog className="h-[14px] w-[14px]" /> Profile
            </button>
            {showSettings && (
              <button
                onClick={() => closeAndNavigate("/settings")}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-[12px] text-brand-fg hover:bg-brand-active/60 hover:text-white"
              >
                <Settings className="h-[14px] w-[14px]" /> Settings
              </button>
            )}
            {showAccessRights && (
              <button
                onClick={() => closeAndNavigate("/access-rights")}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-[12px] text-brand-fg hover:bg-brand-active/60 hover:text-white"
              >
                <ShieldCheck className="h-[14px] w-[14px]" /> Access Rights
              </button>
            )}
            <div className="my-1 border-t border-brand-border" />
            <button
              onClick={() => {
                setOpen(false);
                setConfirm(true);
              }}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-[12px] text-[#f4a2a2] hover:bg-brand-active/60"
            >
              <LogOut className="h-[14px] w-[14px]" /> Log out
            </button>
          </div>
        </>
      )}

      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2.5 px-3.5 py-3 text-left hover:bg-brand-active/40"
      >
        <div className="flex h-[30px] w-[30px] items-center justify-center rounded-full bg-brand-border text-[12px] font-semibold text-white">
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[12px] font-medium text-white">
            {currentEmployee?.name ?? "Signed in"}
          </div>
        </div>
        <ChevronUp
          className={`h-4 w-4 text-brand-muted transition-transform ${open ? "" : "rotate-180"}`}
        />
      </button>

      {confirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
          <div className="absolute inset-0 bg-brand/50" onClick={() => setConfirm(false)} />
          <div className="relative z-10 w-full max-w-[360px] rounded-xl bg-surface p-5 text-center shadow-2xl">
            <div className="flex justify-center">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-danger-soft">
                <LogOut className="h-5 w-5 text-danger" />
              </div>
            </div>
            <div className="mt-3 text-[15px] font-semibold text-foreground">
              Are you sure you want to Log out ?
            </div>
            <div className="mt-5 flex gap-2">
              <button
                onClick={() => setConfirm(false)}
                className="flex-1 rounded-md border border-border py-2 text-[13px] text-foreground hover:bg-surface-alt"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  signOut();
                  navigate("/login");
                }}
                className="flex-1 rounded-md bg-danger py-2 text-[13px] font-medium text-white"
              >
                Log out
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
