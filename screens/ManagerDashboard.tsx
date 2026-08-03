import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  UserPlus,
  UserMinus,
  CheckSquare,
  CalendarClock,
  ArrowRight,
} from "lucide-react";
import { MGR_KPIS, ACTION_ITEMS, TEAM_LOAD } from "../data/dashboard";
import type { ActionItem, Severity, TeamLoad } from "../data/dashboard";
import { UTIL_DEPARTMENTS, UTIL_ROWS } from "../data/utilization";
import { DepartmentSelect } from "../components/DepartmentSelect";

const ICONS = {
  overload: AlertTriangle,
  demand: UserPlus,
  idle: UserMinus,
  confirm: CheckSquare,
  rolloff: CalendarClock,
};

const SEV: Record<Severity, { dot: string; chipBg: string; chipText: string; label: string; iconBg: string; iconText: string }> = {
  high: { dot: "bg-danger", chipBg: "bg-danger-soft", chipText: "text-danger", label: "Action needed", iconBg: "bg-danger-soft", iconText: "text-danger" },
  medium: { dot: "bg-warning", chipBg: "bg-warning-soft", chipText: "text-warning", label: "Review", iconBg: "bg-warning-soft", iconText: "text-warning" },
  info: { dot: "bg-primary", chipBg: "bg-accent-soft", chipText: "text-primary", label: "Heads up", iconBg: "bg-accent-soft", iconText: "text-primary" },
};

const TONE: Record<TeamLoad["tone"], { bar: string; track: string; text: string; avatarBg: string; avatarText: string }> = {
  over: { bar: "bg-danger", track: "bg-danger-soft", text: "text-danger", avatarBg: "bg-danger-soft", avatarText: "text-danger" },
  optimal: { bar: "bg-success", track: "bg-border-soft", text: "text-success", avatarBg: "bg-success-soft", avatarText: "text-success-fg" },
  idle: { bar: "bg-muted-foreground", track: "bg-border-soft", text: "text-muted", avatarBg: "bg-surface-alt", avatarText: "text-muted" },
};

export function ManagerDashboard() {
  const navigate = useNavigate();
  const [selectedDepts, setSelectedDepts] = useState<string[]>(() => [...UTIL_DEPARTMENTS]);

  const deptCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const dept of UTIL_DEPARTMENTS) {
      counts[dept] = UTIL_ROWS.filter((r) => r.department === dept).length;
    }
    return counts;
  }, []);

  const visibleTeamSize = useMemo(
    () => selectedDepts.reduce((sum, dept) => sum + (deptCounts[dept] ?? 0), 0),
    [selectedDepts, deptCounts]
  );

  const filteredTeamLoad = useMemo(
    () => TEAM_LOAD.filter((p) => selectedDepts.includes(p.department)),
    [selectedDepts]
  );

  const deptSubtitle =
    selectedDepts.length === UTIL_DEPARTMENTS.length
      ? "All departments"
      : selectedDepts.length === 1
      ? selectedDepts[0]
      : `${selectedDepts.length} departments`;

  return (
    <>
      <header className="flex h-14 flex-shrink-0 items-center justify-between border-b border-border bg-surface px-5">
        <div>
          <div className="text-[15px] font-semibold tracking-tight text-foreground">Good morning, Anil</div>
          <div className="text-[12px] text-muted-foreground">
            {deptSubtitle} · {visibleTeamSize} people · Tuesday, Jan 6, 2026
          </div>
        </div>
        <DepartmentSelect
          departments={UTIL_DEPARTMENTS}
          selected={selectedDepts}
          onChange={setSelectedDepts}
          counts={deptCounts}
          align="end"
        />
      </header>

      <div className="flex flex-1 flex-col gap-4 overflow-y-auto bg-background p-5">
        {/* KPI row */}
        <div className="grid grid-cols-4 gap-3">
          <Kpi label="Team size" value={visibleTeamSize} sub="active this month" />
          <Kpi label="Avg utilization" value={`${MGR_KPIS.avgUtil}%`} delta={`▲ ${MGR_KPIS.utilDelta}%`} sub="billable basis" />
          <Kpi label="Open demand" value={MGR_KPIS.openDemand} sub="unfilled requests" accent="border-l-warning" valueClass="text-warning" />
          <Kpi label="Confirmed today" value={`${MGR_KPIS.confirmedToday}%`} sub="5 pending" accent="border-l-danger" valueClass="text-foreground" />
        </div>

        <div className="grid flex-1 grid-cols-[1.5fr_1fr] gap-4">
          {/* Action Centre */}
          <section className="flex flex-col overflow-hidden rounded-lg border border-border bg-surface">
            <div className="flex flex-shrink-0 items-center justify-between border-b border-border-soft px-4 py-3">
              <div className="text-[13px] font-semibold text-foreground">Action Centre</div>
              <div className="text-[11px] text-muted-foreground">{ACTION_ITEMS.length} items · sorted by priority</div>
            </div>
            <div className="flex flex-col">
              {ACTION_ITEMS.map((item) => (
                <ActionRow key={item.id} item={item} onGo={() => navigate(item.to)} />
              ))}
            </div>
          </section>

          {/* Team load snapshot */}
          <section className="flex flex-col overflow-hidden rounded-lg border border-border bg-surface">
            <div className="flex flex-shrink-0 items-center justify-between border-b border-border-soft px-4 py-3">
              <div className="text-[13px] font-semibold text-foreground">Team load</div>
              <button onClick={() => navigate("/utilization")} className="text-[11px] text-primary hover:underline">Full view →</button>
            </div>
            <div className="flex flex-col">
              {filteredTeamLoad.length === 0 ? (
                <div className="px-4 py-8 text-center text-[13px] text-muted-foreground">
                  No team members in the selected departments.
                </div>
              ) : (
                filteredTeamLoad.map((p) => <TeamRow key={p.id} p={p} />)
              )}
            </div>
            <div className="mt-auto flex-shrink-0 border-t border-border-soft px-4 py-2.5 text-[11px] text-muted-foreground">
              Showing {filteredTeamLoad.length} of {visibleTeamSize} ·{" "}
              <button onClick={() => navigate("/utilization")} className="text-primary hover:underline">
                see all
              </button>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}

function ActionRow({ item, onGo }: { item: ActionItem; onGo: () => void }) {
  const sev = SEV[item.severity];
  const Icon = ICONS[item.icon];
  return (
    <div className="flex items-start gap-3 border-b border-border-soft px-4 py-3.5 last:border-b-0 hover:bg-surface-alt">
      <div className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md ${sev.iconBg}`}>
        <Icon className={`h-4 w-4 ${sev.iconText}`} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <div className="text-[13px] font-semibold text-foreground">{item.title}</div>
          <span className={`rounded-sm px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${sev.chipBg} ${sev.chipText}`}>{sev.label}</span>
        </div>
        <div className="mt-0.5 text-[12px] leading-snug text-muted-foreground">{item.detail}</div>
      </div>
      <button onClick={onGo} className="mt-0.5 inline-flex flex-shrink-0 items-center gap-1 rounded-md border border-accent-line px-2.5 py-1.5 text-[11px] font-medium text-primary hover:bg-accent-soft">
        {item.cta} <ArrowRight className="h-3 w-3" />
      </button>
    </div>
  );
}

function TeamRow({ p }: { p: TeamLoad }) {
  const t = TONE[p.tone];
  const w = Math.min(p.pct, 120) / 120 * 100;
  return (
    <div className="flex items-center gap-2.5 border-b border-border-soft px-4 py-2.5 last:border-b-0">
      <div className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-[10px] font-semibold ${t.avatarBg} ${t.avatarText}`}>{p.initials}</div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[12px] font-medium text-foreground">{p.name}</div>
        <div className={`mt-1 h-1.5 rounded-full ${t.track}`}>
          <div className={`h-full rounded-full ${t.bar}`} style={{ width: `${w}%` }} />
        </div>
      </div>
      <span className={`w-9 text-right text-[12px] font-semibold ${t.text}`}>{p.pct}%</span>
    </div>
  );
}

function Kpi({ label, value, sub, delta, accent, valueClass }: { label: string; value: string | number; sub?: string; delta?: string; accent?: string; valueClass?: string }) {
  return (
    <div className={`rounded-lg border border-border bg-surface px-3.5 py-3.5 ${accent ? `border-l-[3px] ${accent}` : ""}`}>
      <div className="mb-1.5 text-[11px] text-muted">{label}</div>
      <div className="flex items-baseline gap-1.5">
        <div className={`text-[23px] font-semibold ${valueClass ?? "text-foreground"}`}>{value}</div>
        {delta && <div className="text-[11px] text-success">{delta}</div>}
      </div>
      {sub && <div className="mt-0.5 text-[11px] text-muted-foreground">{sub}</div>}
    </div>
  );
}
