import { useMemo, useState } from "react";
import { Info, X } from "lucide-react";
import { BillableSplitBar } from "./BillableSplitBar";
import { ProjectHealthBadge } from "./ProjectHealthBadge";
import type { DeptHealthRow } from "../data/cockpit";
import { useSettings } from "../context/SettingsContext";
import { withoutLowDemandPriority } from "../data/settings";

function hoursLoadStyle(bookedHours: number, capacityHours: number) {
  if (capacityHours <= 0) {
    return { bar: "bg-muted-foreground", track: "bg-border-soft", text: "text-muted-foreground" };
  }
  const ratio = bookedHours / capacityHours;
  if (ratio > 1) return { bar: "bg-danger", track: "bg-danger-soft", text: "text-danger" };
  if (ratio >= 0.9) return { bar: "bg-warning", track: "bg-border-soft", text: "text-warning" };
  if (ratio < 0.7) return { bar: "bg-muted-foreground", track: "bg-border-soft", text: "text-muted" };
  return { bar: "bg-success", track: "bg-border-soft", text: "text-success" };
}

interface CockpitDeptHealthListProps {
  rows: DeptHealthRow[];
  onRowClick?: (department: string) => void;
}

export function CockpitDeptHealthList({ rows, onRowClick }: CockpitDeptHealthListProps) {
  const { settings } = useSettings();
  const [helpOpen, setHelpOpen] = useState(false);
  const totalTeam = useMemo(
    () => rows.reduce((sum, row) => sum + row.peopleBooked + row.peopleFree, 0),
    [rows]
  );
  const bandLabels = withoutLowDemandPriority(settings.demandPriority);
  return (
    <div className="flex h-full flex-col rounded-lg border border-border bg-surface p-4 shadow-sm">
      <div className="flex items-baseline justify-between gap-2">
        <div className="flex items-center gap-1">
          <div className="text-[12px] font-medium text-muted-foreground">Department Health</div>
          <button
            type="button"
            onClick={() => setHelpOpen(true)}
            className="inline-flex cursor-pointer rounded p-0.5 text-muted-foreground hover:bg-surface-alt hover:text-primary"
            aria-label="How Department Health is calculated"
            title="How Department Health is calculated"
          >
            <Info className="h-3.5 w-3.5" />
          </button>
        </div>
        <span className="text-[12px] tabular-nums text-muted-foreground">
          Total Team {totalTeam}
        </span>
      </div>
      <ul className="mt-3 space-y-1">
        {rows.map((row, index) => {
          const load = hoursLoadStyle(row.bookedHours, row.capacityHours);
          const loadPct =
            row.capacityHours > 0
              ? Math.min((row.bookedHours / row.capacityHours) * 100, 100)
              : 0;
          const striped = index % 2 === 1;

          return (
            <li key={row.department}>
              <button
                type="button"
                onClick={() => onRowClick?.(row.department)}
                className={`flex w-full flex-col gap-2 rounded-md px-2 py-3 text-left transition ${
                  striped ? "bg-surface-alt hover:bg-border-soft/60" : "hover:bg-surface-alt"
                }`}
              >
                <div className="flex items-start justify-between gap-3 px-1">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="text-[13px] font-medium text-foreground">{row.department}</div>
                      <ProjectHealthBadge health={row.health} />
                      <span className="text-[11px] tabular-nums text-muted-foreground">
                        Score {row.score}
                      </span>
                    </div>
                    <div className="mt-0.5 text-[11px] text-muted-foreground">{row.detail}</div>
                  </div>
                  <div className="shrink-0 text-[11px] text-muted-foreground">
                    <span className="font-medium text-foreground">{row.peopleBooked}</span> booked
                    <span className="mx-1.5 text-border">·</span>
                    <span className="font-medium text-foreground">{row.peopleFree}</span> free
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 px-1">
                  <div className="min-w-0">
                    <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted">
                      Billable split
                    </div>
                    <BillableSplitBar
                      billablePct={row.billablePct}
                      nonBillablePct={row.nonBillablePct}
                    />
                  </div>

                  <div className="min-w-0">
                    <div className="mb-1 text-[10px] font-medium tracking-wide text-muted">
                      BOOKED vs CAPACITY
                    </div>
                    <div className="flex min-w-0 items-center gap-2">
                      <div className={`h-2 min-w-0 flex-1 overflow-hidden rounded-full ${load.track}`}>
                        <div
                          className={`h-full rounded-full ${load.bar}`}
                          style={{ width: `${loadPct}%` }}
                        />
                      </div>
                      <span className={`shrink-0 text-[10px] font-semibold tabular-nums ${load.text}`}>
                        {row.bookedHours}h / {row.capacityHours}h
                      </span>
                    </div>
                  </div>
                </div>
              </button>
            </li>
          );
        })}
      </ul>
      {helpOpen ? (
        <DepartmentHealthHelpModal
          bandLabels={bandLabels}
          onClose={() => setHelpOpen(false)}
        />
      ) : null}
    </div>
  );
}

function DepartmentHealthHelpModal({
  bandLabels,
  onClose,
}: {
  bandLabels: string[];
  onClose: () => void;
}) {
  const critical = bandLabels[0] ?? "Critical";
  const high = bandLabels[1] ?? "High";
  const medium = bandLabels[2] ?? "Medium";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
      <div className="absolute inset-0 bg-brand/40" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="dept-health-help-title"
        className="relative z-10 flex max-h-[85vh] w-full max-w-[520px] flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-2xl"
      >
        <div className="flex flex-shrink-0 items-center justify-between border-b border-border-soft px-5 py-3.5">
          <div id="dept-health-help-title" className="text-[15px] font-semibold text-foreground">
            Department Health Score
          </div>
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer rounded p-1 text-muted-foreground hover:bg-surface-alt hover:text-foreground"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <p className="text-[12px] leading-relaxed text-muted-foreground">
            This score shows the department’s weekly operational health. It is not a KPI or employee
            performance score.
          </p>

          <div>
            <div className="text-[12px] font-semibold text-foreground">Score</div>
            <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
              Average of: Confirmation Discipline · Planning Accuracy · Utilization Health
            </p>
          </div>

          <div>
            <div className="text-[12px] font-semibold text-foreground">Components</div>
            <div className="mt-2 grid gap-2">
              <ComponentCard
                title="Confirmation Discipline"
                body="Confirmed days ÷ working days × 100"
              />
              <ComponentCard
                title="Planning Accuracy"
                body="min(Actual Hours, Planned Hours) ÷ Planned Hours × 100, capped at 100%"
              />
              <ComponentCard
                title="Utilization Health"
                body="Booked Hours ÷ Available Capacity × 100, then converted to a Health Score based on under/over-utilization"
              />
            </div>
          </div>

          <p className="text-[12px] leading-relaxed text-muted-foreground">
            Only available components are averaged. Resources on leave are excluded.
          </p>

          <div className="rounded-lg border border-border bg-surface-alt px-3.5 py-3">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Example
            </div>
            <p className="mt-1.5 text-[12px] font-medium leading-relaxed text-foreground">
              Confirmation 40 + Planning Accuracy 55 + Utilization Health 46 = 141 ÷ 3 = Health Score 47
            </p>
          </div>

          <div>
            <div className="text-[12px] font-semibold text-foreground">Health Bands</div>
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              <BandCard
                label={critical}
                range="Below 70"
                dot="bg-danger"
                text="text-danger"
                bubble="bg-danger-soft"
              />
              <BandCard
                label={high}
                range="70–79"
                dot="bg-warning"
                text="text-warning"
                bubble="bg-warning-soft"
              />
              <BandCard
                label={medium}
                range="80+"
                dot="bg-success"
                text="text-success"
                bubble="bg-success-soft"
              />
            </div>
          </div>
        </div>

        <div className="flex flex-shrink-0 justify-end border-t border-border-soft px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer rounded-md bg-primary px-3.5 py-1.5 text-[12px] font-medium text-primary-foreground hover:opacity-90"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function ComponentCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-lg border border-border px-3.5 py-2.5">
      <div className="text-[12px] font-medium text-foreground">{title}</div>
      <p className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">{body}</p>
    </div>
  );
}

function BandCard({
  label,
  range,
  dot,
  text,
  bubble,
}: {
  label: string;
  range: string;
  dot: string;
  text: string;
  bubble: string;
}) {
  return (
    <div className={`rounded-lg border border-border px-3 py-2.5 ${bubble}`}>
      <div className="flex items-center gap-1.5">
        <span className={`h-2 w-2 shrink-0 rounded-full ${dot}`} />
        <span className={`text-[12px] font-semibold ${text}`}>{label}</span>
      </div>
      <div className="mt-0.5 pl-3.5 text-[11px] tabular-nums text-muted-foreground">{range}</div>
    </div>
  );
}
