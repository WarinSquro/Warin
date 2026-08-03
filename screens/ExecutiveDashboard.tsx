import { Link } from "react-router-dom";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  BarChart,
  Bar,
} from "recharts";
import { TrendingUp, AlertTriangle, UserPlus } from "lucide-react";
import {
  EXEC_KPIS,
  UTIL_TREND,
  DEPT_CAPACITY,
  RISK_SIGNALS,
  HIRING_SIGNALS,
} from "../data/executive";
import type { RiskLevel, RiskSignal, HiringSignal } from "../data/executive";

// concrete hex for recharts (matches index.css tokens)
const C = {
  primary: "#152F39",
  primarySoft: "#c7d2fe",
  brand: "#152F39",
  success: "#16a34a",
  successSoft: "#dcfce7",
  warning: "#b45309",
  danger: "#dc2626",
  grid: "#eef0f3",
  muted: "#9ca3af",
  axis: "#6b7280",
};

const LEVEL: Record<RiskLevel, { dot: string; chip: string; text: string }> = {
  high: { dot: "bg-danger", chip: "bg-danger-soft", text: "text-danger" },
  medium: { dot: "bg-warning", chip: "bg-warning-soft", text: "text-warning" },
  low: { dot: "bg-success", chip: "bg-success-soft", text: "text-success" },
};

export function ExecutiveDashboard() {
  return (
    <>
      <header className="flex h-14 flex-shrink-0 items-center justify-between border-b border-border bg-surface px-5">
        <div>
          <Link
            to="/cockpit"
            className="mb-0.5 inline-block text-[11px] text-muted-foreground hover:text-primary"
          >
            ← My Workspace
          </Link>
          <div className="text-[15px] font-semibold tracking-tight text-foreground">Organization Overview</div>
          <div className="text-[12px] text-muted-foreground">Company-wide · last 12 weeks · read-only</div>
        </div>
        <div className="flex items-center gap-2">
          <button className="rounded-md border border-border px-3 py-1.5 text-[12px] text-foreground hover:bg-surface-alt">Last 12 weeks ▾</button>
          <button className="rounded-md border border-border px-3 py-1.5 text-[12px] text-foreground hover:bg-surface-alt">Export</button>
        </div>
      </header>

      <div className="flex flex-1 flex-col gap-4 overflow-y-auto bg-background p-5">
        {/* KPI strip */}
        <div className="grid grid-cols-5 gap-3">
          <Kpi label="Headcount" value={EXEC_KPIS.headcount} sub="active" />
          <Kpi label="Avg utilization" value={`${EXEC_KPIS.avgUtil}%`} delta={`▲ ${EXEC_KPIS.utilDelta}%`} sub="vs target 80%" />
          <Kpi label="Billable ratio" value={`${EXEC_KPIS.billablePct}%`} sub="of capacity" />
          <Kpi label="Open demand" value={EXEC_KPIS.openDemand} sub="unfilled" accent="border-l-warning" valueClass="text-warning" />
          <Kpi label="On bench" value={EXEC_KPIS.benchCount} sub="<70% util" accent="border-l-danger" valueClass="text-danger" />
        </div>

        {/* Charts row */}
        <div className="grid grid-cols-[1.5fr_1fr] gap-4">
          <ChartCard title="Utilization trend" caption="Org-wide % against 80% target">
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={UTIL_TREND} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                <defs>
                  <linearGradient id="utilFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={C.primary} stopOpacity={0.18} />
                    <stop offset="100%" stopColor={C.primary} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={C.grid} vertical={false} />
                <XAxis dataKey="week" tick={{ fontSize: 11, fill: C.axis }} axisLine={false} tickLine={false} />
                <YAxis domain={[60, 90]} tick={{ fontSize: 11, fill: C.axis }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb" }} />
                <Area type="monotone" dataKey="util" stroke={C.primary} strokeWidth={2} fill="url(#utilFill)" name="Utilization %" />
                <Line type="monotone" dataKey="target" stroke={C.muted} strokeWidth={1.5} strokeDasharray="4 4" dot={false} name="Target" />
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Capacity by department" caption="People booked vs free">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={DEPT_CAPACITY} margin={{ top: 8, right: 8, left: -18, bottom: 0 }} barCategoryGap="28%">
                <CartesianGrid strokeDasharray="3 3" stroke={C.grid} vertical={false} />
                <XAxis dataKey="dept" tick={{ fontSize: 10, fill: C.axis }} axisLine={false} tickLine={false} interval={0} />
                <YAxis tick={{ fontSize: 11, fill: C.axis }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb" }} cursor={{ fill: "#fafafa" }} />
                <Bar dataKey="booked" stackId="a" fill={C.brand} name="Booked" radius={[0, 0, 0, 0]} />
                <Bar dataKey="free" stackId="a" fill={C.successSoft} name="Free" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>

        {/* Risk & hiring */}
        <div className="grid grid-cols-[1.5fr_1fr] gap-4">
          <section className="flex flex-col overflow-hidden rounded-lg border border-border bg-surface">
            <div className="flex flex-shrink-0 items-center gap-2 border-b border-border-soft px-4 py-3">
              <AlertTriangle className="h-4 w-4 text-warning" />
              <div className="text-[13px] font-semibold text-foreground">Risk signals</div>
            </div>
            {RISK_SIGNALS.map((r) => <RiskRow key={r.id} r={r} />)}
          </section>

          <section className="flex flex-col overflow-hidden rounded-lg border border-border bg-surface">
            <div className="flex flex-shrink-0 items-center gap-2 border-b border-border-soft px-4 py-3">
              <UserPlus className="h-4 w-4 text-primary" />
              <div className="text-[13px] font-semibold text-foreground">Hiring signals</div>
            </div>
            {HIRING_SIGNALS.map((h) => <HiringRow key={h.id} h={h} />)}
            <div className="mt-auto flex-shrink-0 border-t border-border-soft px-4 py-2.5 text-[11px] text-muted-foreground">
              Derived from sustained overload + unfilled demand.
            </div>
          </section>
        </div>
      </div>
    </>
  );
}

function RiskRow({ r }: { r: RiskSignal }) {
  const lv = LEVEL[r.level];
  return (
    <div className="flex items-start gap-3 border-b border-border-soft px-4 py-3 last:border-b-0">
      <span className={`mt-1.5 h-2 w-2 flex-shrink-0 rounded-full ${lv.dot}`} />
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <div className="text-[13px] font-medium text-foreground">{r.title}</div>
          <span className={`rounded-sm px-1.5 py-0.5 text-[9px] font-semibold uppercase ${lv.chip} ${lv.text}`}>{r.level}</span>
        </div>
        <div className="mt-0.5 text-[12px] leading-snug text-muted-foreground">{r.detail}</div>
      </div>
    </div>
  );
}

function HiringRow({ h }: { h: HiringSignal }) {
  const lv = LEVEL[h.urgency];
  return (
    <div className="flex items-center justify-between border-b border-border-soft px-4 py-3 last:border-b-0">
      <div>
        <div className="text-[13px] font-medium text-foreground">{h.skills.join(" · ")}</div>
        <div className="text-[11px] text-muted-foreground">{h.dept}</div>
      </div>
      <div className="flex items-center gap-2">
        <span className={`text-[12px] font-semibold ${lv.text}`}>{h.gap}</span>
        <span className={`h-2 w-2 rounded-full ${lv.dot}`} />
      </div>
    </div>
  );
}

function ChartCard({ title, caption, children }: { title: string; caption: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="mb-3 flex items-center gap-2">
        <TrendingUp className="h-3.5 w-3.5 text-muted-foreground" />
        <div>
          <div className="text-[13px] font-semibold text-foreground">{title}</div>
          <div className="text-[11px] text-muted-foreground">{caption}</div>
        </div>
      </div>
      {children}
    </div>
  );
}

function Kpi({ label, value, sub, delta, accent, valueClass }: { label: string; value: string | number; sub?: string; delta?: string; accent?: string; valueClass?: string }) {
  return (
    <div className={`rounded-lg border border-border bg-surface px-3.5 py-3.5 ${accent ? `border-l-[3px] ${accent}` : ""}`}>
      <div className="mb-1.5 text-[11px] text-muted">{label}</div>
      <div className="flex items-baseline gap-1.5">
        <div className={`text-[22px] font-semibold ${valueClass ?? "text-foreground"}`}>{value}</div>
        {delta && <div className="text-[11px] text-success">{delta}</div>}
      </div>
      {sub && <div className="mt-0.5 text-[11px] text-muted-foreground">{sub}</div>}
    </div>
  );
}
