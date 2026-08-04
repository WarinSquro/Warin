import { useEffect, useState } from "react";
import { CalendarClock, History, AlertTriangle, X, ArrowRight } from "lucide-react";
import { ALL_DAYS } from "../data/settings";
import type { SettingsState, ImpactRow, CompanyOffDay } from "../data/settings";
import { useSettings } from "../context/SettingsContext";
import {
  cancelSettingsSchedule,
  createSettingsSchedule,
  fetchSettingsAudit,
  fetchSettingsSchedules,
  putSettings,
  type SettingsSchedule,
} from "../api/domain";
import { tomorrowISO } from "../utils/date";
import { useFocusFirstField } from "../hooks/useFocusFirstField";
import type { SettingsAuditEntry } from "../utils/settingsAudit";
import { SmtpSettingsSection } from "../components/SmtpSettingsSection";

const IMPACT_PREVIEW: ImpactRow[] = [];

function settingsPutBody(s: SettingsState, companyOffDays = s.companyOffDays) {
  return {
    idleBelow: s.bands.idleBelow,
    optimalTo: s.bands.optimalTo,
    excellent: s.metricBands.excellent,
    good: s.metricBands.good,
    needsAttention: s.metricBands.needsAttention,
    capacityBasis: s.capacityBasis,
    overallocationLimit: s.overallocationLimit,
    workingHoursPerDay: s.workingHoursPerDay,
    workingDays: s.workingDays,
    companyOffDays: companyOffDays.map((d) => ({ date: d.date, label: d.label })),
  };
}

export function Settings() {
  const { settings: s, setSettings, patchSettings, patchMetricBands, refresh } = useSettings();
  const [dirty, setDirty] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [auditLog, setAuditLog] = useState<SettingsAuditEntry[]>([]);
  const [scheduled, setScheduled] = useState<SettingsSchedule[]>([]);

  const reloadAuditAndSchedules = async () => {
    const [entries, schedules] = await Promise.all([
      fetchSettingsAudit().catch(() => [] as SettingsAuditEntry[]),
      fetchSettingsSchedules().catch(() => [] as SettingsSchedule[]),
    ]);
    setAuditLog(entries);
    setScheduled(schedules);
  };

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [entries, schedules] = await Promise.all([
          fetchSettingsAudit().catch(() => [] as SettingsAuditEntry[]),
          fetchSettingsSchedules().catch(() => [] as SettingsSchedule[]),
        ]);
        if (!cancelled) {
          setAuditLog(entries);
          setScheduled(schedules);
        }
      } catch {
        if (!cancelled) {
          setAuditLog([]);
          setScheduled([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const patch = (p: Partial<SettingsState>) => {
    patchSettings(p);
    setDirty(true);
  };
  const patchBands = (p: Partial<SettingsState["bands"]>) => {
    setSettings((prev) => ({ ...prev, bands: { ...prev.bands, ...p } }));
    setDirty(true);
  };
  const patchMetricBandsDirty = (p: Partial<SettingsState["metricBands"]>) => {
    patchMetricBands(p);
    setDirty(true);
  };
  const toggleDay = (d: string) =>
    patch({ workingDays: s.workingDays.includes(d) ? s.workingDays.filter((x) => x !== d) : [...s.workingDays, d] });

  const persistSettings = async (next: SettingsState) => {
    await putSettings(settingsPutBody(next));
    await refresh();
    try {
      await reloadAuditAndSchedules();
    } catch {
      /* keep prior rail if audit refresh fails; settings already saved */
    }
    setDirty(false);
    setSaveError("");
  };

  const handleSave = async (when: "now" | "future", scheduledDate: string) => {
    setSaving(true);
    setSaveError("");
    try {
      if (when === "future") {
        await createSettingsSchedule({
          ...settingsPutBody(s),
          effectiveDate: scheduledDate,
        });
        await refresh();
        await reloadAuditAndSchedules();
        setDirty(false);
      } else {
        await persistSettings(s);
      }
      setConfirmOpen(false);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  };

  const handleCancelSchedule = async (id: string) => {
    setSaving(true);
    setSaveError("");
    try {
      await cancelSettingsSchedule(id);
      await reloadAuditAndSchedules();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Could not cancel schedule.");
    } finally {
      setSaving(false);
    }
  };

  const handleCalendarOffDaysChange = async (companyOffDays: CompanyOffDay[]) => {
    const next = { ...s, companyOffDays };
    patchSettings({ companyOffDays });
    setDirty(true);
    setSaving(true);
    setSaveError("");
    try {
      await persistSettings(next);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Could not save calendar.");
      setDirty(true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <header className="flex h-14 flex-shrink-0 items-center justify-between border-b border-border bg-surface px-5">
        <div>
          <div className="text-[15px] font-semibold tracking-tight text-foreground">System Parameters</div>
          <div className="text-[12px] text-muted-foreground">Admin · applies org-wide · changes are effective-dated & logged</div>
        </div>
        <div className="flex items-center gap-2">
          {saveError && <span className="max-w-[240px] truncate text-[12px] text-danger" title={saveError}>{saveError}</span>}
          {dirty && !saveError && <span className="text-[12px] text-warning">Unsaved changes</span>}
          <button onClick={() => { void refresh(); setDirty(false); setSaveError(""); }} className="rounded-md border border-border px-3 py-1.5 text-[12px] text-foreground hover:bg-surface-alt">Reset</button>
          <button disabled={!dirty || saving} onClick={() => setConfirmOpen(true)} className={`rounded-md px-3.5 py-1.5 text-[12px] font-medium ${dirty && !saving ? "bg-primary text-primary-foreground" : "cursor-not-allowed bg-surface-alt text-muted-foreground"}`}>
            Review & save
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden bg-background">
        <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-5">
          {scheduled[0] && (
            <div className="flex items-center gap-2.5 rounded-md border border-accent-line bg-accent-soft px-3.5 py-2.5">
              <CalendarClock className="h-4 w-4 flex-shrink-0 text-primary" />
              <div className="flex-1 text-[12px] text-accent-softfg">
                <b>{scheduled.length} scheduled change:</b> {scheduled[0].changeSummary}, effective {scheduled[0].effectiveLabel}. Current values stay in effect until then.
              </div>
              <button
                type="button"
                disabled={saving}
                onClick={() => void handleCancelSchedule(scheduled[0].id)}
                className="flex-shrink-0 rounded-md border border-accent-line px-2.5 py-1 text-[11px] font-medium text-primary hover:bg-surface disabled:opacity-60"
              >
                Cancel
              </button>
            </div>
          )}

          {/* Utilization bands */}
          <Card title="Utilization bands" desc="Thresholds that classify people as idle, optimal, or overloaded across Utilization & dashboards.">
            <div className="flex items-end gap-6">
              <NumField label="Idle below" value={s.bands.idleBelow} suffix="%" onChange={(v) => patchBands({ idleBelow: v })} />
              <NumField label="Optimal up to" value={s.bands.optimalTo} suffix="%" onChange={(v) => patchBands({ optimalTo: v })} />
            </div>
            <BandPreview idle={s.bands.idleBelow} optimal={s.bands.optimalTo} />
          </Card>

          {/* Planning & confirmation bands */}
          <Card
            title="Planning & confirmation bands"
            desc="Status chip thresholds on the Resource Deployment Report — Excellent, Good, Needs Attention, Critical."
          >
            <div className="flex flex-wrap items-end gap-6">
              <NumField
                label="Excellent from"
                value={s.metricBands.excellent}
                suffix="%"
                onChange={(v) => patchMetricBandsDirty({ excellent: v })}
              />
              <NumField
                label="Good from"
                value={s.metricBands.good}
                suffix="%"
                onChange={(v) => patchMetricBandsDirty({ good: v })}
              />
              <NumField
                label="Needs attention from"
                value={s.metricBands.needsAttention}
                suffix="%"
                onChange={(v) => patchMetricBandsDirty({ needsAttention: v })}
              />
            </div>
            <div className="mt-2 text-[11px] text-muted-foreground">
              ≥{s.metricBands.excellent}% Excellent · ≥{s.metricBands.good}% Good · ≥{s.metricBands.needsAttention}% Needs Attention · below Critical
            </div>
          </Card>

          {/* Capacity basis */}
          <Card title="Capacity basis" desc="What utilization is measured against. Billable excludes internal/meeting activities so they don't misclassify people as idle.">
            <div className="flex gap-2">
              <Segment active={s.capacityBasis === "billable"} onClick={() => patch({ capacityBasis: "billable" })} label="Billable / project-eligible" hint="Recommended" />
              <Segment active={s.capacityBasis === "total"} onClick={() => patch({ capacityBasis: "total" })} label="Total hours" hint="All logged time" />
            </div>
          </Card>

          {/* Overallocation limit */}
          <Card title="Overallocation guardrail" desc="Allocations beyond capacity warn and require a reason. Beyond this ceiling, saving is hard-blocked.">
            <div className="flex items-center gap-4">
              <input type="range" min={100} max={150} step={5} value={s.overallocationLimit} onChange={(e) => patch({ overallocationLimit: Number(e.target.value) })} className="flex-1 accent-primary" />
              <div className="w-20 rounded-md border border-border bg-surface px-3 py-1.5 text-center text-[13px] font-semibold text-foreground">{s.overallocationLimit}%</div>
            </div>
            <div className="text-[11px] text-muted-foreground">100–{s.overallocationLimit}%: warn + reason (logged) · above {s.overallocationLimit}%: blocked</div>
          </Card>

          {/* Working calendar */}
          <Card
            title="Working calendar"
            desc="Defines capacity per person and which days count toward confirmation compliance."
            action={
              <button
                type="button"
                onClick={() => setCalendarOpen(true)}
                className="flex-shrink-0 rounded-md border border-accent-line bg-accent-soft px-3 py-1.5 text-[12px] font-medium text-primary hover:bg-accent-soft/80"
              >
                {saving ? "Saving…" : "Calendar"}
              </button>
            }
          >
            <div className="flex items-end gap-6">
              <NumField label="Hours per day" value={s.workingHoursPerDay} suffix="h" step={0.5} onChange={(v) => patch({ workingHoursPerDay: v })} />
              <div>
                <div className="mb-1.5 text-[12px] font-medium text-foreground">Working days</div>
                <div className="flex gap-1.5">
                  {ALL_DAYS.map((d) => {
                    const on = s.workingDays.includes(d);
                    return (
                      <button key={d} onClick={() => toggleDay(d)} className={`h-9 w-11 rounded-md border text-[12px] font-medium ${on ? "border-primary bg-accent-soft text-primary" : "border-border text-muted-foreground hover:bg-surface-alt"}`}>
                        {d}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
            <div className="text-[11px] text-muted-foreground">Weekly capacity per person: <b className="text-foreground">{s.workingHoursPerDay * s.workingDays.length}h</b> ({s.workingDays.length} days × {s.workingHoursPerDay}h)</div>
          </Card>

          {/* Demand priorities */}
          <Card title="Demand priority order" desc="How open demand is ranked in the Planner and dashboards.">
            <div className="flex items-center gap-2">
              {s.demandPriority.map((p, i) => (
                <div key={p} className="flex items-center gap-2">
                  <span className="rounded-md border border-border bg-surface px-2.5 py-1.5 text-[12px] text-foreground">{i + 1}. {p}</span>
                  {i < s.demandPriority.length - 1 && <span className="text-muted-foreground">→</span>}
                </div>
              ))}
            </div>
          </Card>

          <SmtpSettingsSection />
        </div>

        {/* Audit rail */}
        <aside className="flex w-[300px] flex-shrink-0 flex-col border-l border-border bg-surface">
          <div className="flex flex-shrink-0 items-center gap-2 border-b border-border-soft px-4 py-3">
            <History className="h-4 w-4 text-muted-foreground" />
            <div className="text-[13px] font-semibold text-foreground">Change history</div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {auditLog.length === 0 ? (
              <div className="px-4 py-8 text-center text-[12px] text-muted-foreground">No changes recorded yet</div>
            ) : (
              auditLog.map((a) => <AuditRow key={a.id} a={a} />)
            )}
          </div>
          <div className="flex-shrink-0 border-t border-border-soft px-4 py-2.5 text-[11px] text-muted-foreground">
            Every parameter change is recorded with who, what, and when. History is never overwritten.
          </div>
        </aside>
      </div>

      {confirmOpen && (
        <ImpactModal
          onClose={() => setConfirmOpen(false)}
          onSave={(when, scheduledDate) => {
            void handleSave(when, scheduledDate);
          }}
          saving={saving}
        />
      )}
      {calendarOpen && (
        <CompanyCalendarModal
          offDays={s.companyOffDays}
          saving={saving}
          error={saveError}
          onClose={() => setCalendarOpen(false)}
          onChange={(companyOffDays) => {
            void handleCalendarOffDaysChange(companyOffDays);
          }}
        />
      )}
    </>
  );
}

function formatScheduleDate(iso: string) {
  if (!iso) return "Select date";
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function ImpactModal({
  onClose,
  onSave,
  saving,
}: {
  onClose: () => void;
  onSave: (when: "now" | "future", scheduledDate: string) => void;
  saving?: boolean;
}) {
  const [when, setWhen] = useState<"now" | "future">("now");
  const [scheduledDate, setScheduledDate] = useState(tomorrowISO());
  const focusRef = useFocusFirstField<HTMLDivElement>(when === "future");
  const minDate = tomorrowISO();
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
      <div onClick={onClose} className="absolute inset-0 bg-brand/40" />
      <div ref={focusRef} className="relative z-10 flex w-full max-w-[540px] flex-col overflow-hidden rounded-xl bg-surface shadow-2xl">
        <div className="flex flex-shrink-0 items-center justify-between border-b border-border-soft px-5 py-4">
          <div className="text-[15px] font-semibold text-foreground">Review impact before saving</div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>

        <div className="flex flex-col gap-4 px-5 py-4">
          <div className="flex items-start gap-2.5 rounded-md border border-warning-border bg-warning-soft/50 px-3.5 py-2.5">
            <AlertTriangle className="h-4 w-4 flex-shrink-0 text-warning" />
            <div className="text-[12px] text-foreground">Raising the optimal floor reclassifies <b>8 people</b> from Optimal into Idle. No hours change — only how they're labelled.</div>
          </div>

          <div>
            <div className="mb-2 text-[12px] font-semibold text-foreground">People per band</div>
            <div className="overflow-hidden rounded-md border border-border-soft">
              {IMPACT_PREVIEW.length === 0 ? (
                <div className="py-4 text-center text-[12px] text-muted-foreground">
                  No band-shift preview · live utilization not calculated yet
                </div>
              ) : (
                IMPACT_PREVIEW.map((r) => <ImpactRowView key={r.band} r={r} />)
              )}
            </div>
          </div>

          <div>
            <div className="mb-2 text-[12px] font-semibold text-foreground">When should this take effect?</div>
            <div className="flex gap-2">
              <EffOpt active={when === "now"} onClick={() => setWhen("now")} label="Immediately" hint="Applies now" />
              <EffOpt
                active={when === "future"}
                onClick={() => setWhen("future")}
                label="Schedule for later"
                hint={formatScheduleDate(scheduledDate)}
              />
            </div>
            {when === "future" && (
              <div className="mt-2.5">
                <label className="mb-1.5 block text-[11px] font-medium text-foreground">Effective date</label>
                <input
                  type="date"
                  min={minDate}
                  value={scheduledDate}
                  onChange={(e) => setScheduledDate(e.target.value || minDate)}
                  className="w-full rounded-md border border-border bg-surface px-3 py-2 text-[13px] text-foreground outline-none focus:border-accent-line [color-scheme:light]"
                />
              </div>
            )}
            <div className="mt-2 text-[11px] text-muted-foreground">
              {when === "future"
                ? "A scheduled-change banner will show on Utilization & dashboards until the effective date. Past reporting is unaffected."
                : "Effective-dated from today — historical utilization keeps its original band labels."}
            </div>
          </div>
        </div>

        <div className="flex flex-shrink-0 items-center justify-between border-t border-border-soft px-5 py-3.5">
          <div className="text-[11px] text-muted-foreground">This change will be logged to history.</div>
          <div className="flex gap-2">
            <button onClick={onClose} className="rounded-md border border-border px-3.5 py-2 text-[12px] text-foreground hover:bg-surface-alt">Cancel</button>
            <button
              disabled={saving || (when === "future" && !scheduledDate)}
              onClick={() => onSave(when, scheduledDate)}
              className="flex items-center gap-1.5 rounded-md bg-primary px-3.5 py-2 text-[12px] font-medium text-primary-foreground disabled:opacity-60"
            >
              {saving ? "Saving…" : when === "now" ? "Save & apply" : "Schedule change"}
              {!saving && <ArrowRight className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function formatOffDayDate(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function CompanyCalendarModal({
  offDays,
  saving,
  error: persistError,
  onClose,
  onChange,
}: {
  offDays: CompanyOffDay[];
  saving?: boolean;
  error?: string;
  onClose: () => void;
  onChange: (days: CompanyOffDay[]) => void;
}) {
  const [date, setDate] = useState("");
  const [label, setLabel] = useState("");
  const [error, setError] = useState("");
  const focusRef = useFocusFirstField<HTMLDivElement>();

  const sorted = [...offDays].sort((a, b) => a.date.localeCompare(b.date));

  const addOffDay = () => {
    if (!date) {
      setError("Select a date.");
      return;
    }
    if (!label.trim()) {
      setError("Enter a label for this off day.");
      return;
    }
    if (offDays.some((d) => d.date === date)) {
      setError("This date is already marked as an off day.");
      return;
    }
    onChange([
      ...offDays,
      { id: `off${Date.now()}`, date, label: label.trim() },
    ]);
    setDate("");
    setLabel("");
    setError("");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
      <div onClick={saving ? undefined : onClose} className="absolute inset-0 bg-brand/40" aria-hidden />
      <div ref={focusRef} className="relative z-10 flex max-h-[85vh] w-full max-w-[560px] flex-col overflow-hidden rounded-xl bg-surface shadow-2xl">
        <div className="flex flex-shrink-0 items-center justify-between border-b border-border-soft px-5 py-4">
          <div>
            <div className="text-[15px] font-semibold text-foreground">Company calendar</div>
            <div className="mt-0.5 text-[12px] text-muted-foreground">
              Off days save to the database as soon as you add or remove them.
            </div>
          </div>
          <button type="button" disabled={saving} onClick={onClose} className="text-muted-foreground hover:text-foreground disabled:opacity-50">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 py-4">
          <div>
            <div className="mb-2 text-[12px] font-semibold text-foreground">Off days</div>
            <div className="overflow-hidden rounded-md border border-border-soft">
              {sorted.length === 0 ? (
                <div className="px-4 py-8 text-center text-[12px] text-muted-foreground">
                  No company off days entered yet.
                </div>
              ) : (
                sorted.map((day) => (
                  <div
                    key={day.id}
                    className="flex items-center justify-between gap-3 border-b border-border-soft px-3.5 py-2.5 last:border-b-0"
                  >
                    <div className="min-w-0">
                      <div className="text-[12px] font-medium text-foreground">{day.label}</div>
                      <div className="text-[11px] text-muted-foreground">{formatOffDayDate(day.date)}</div>
                    </div>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => onChange(offDays.filter((d) => d.id !== day.id))}
                      className="flex-shrink-0 text-[11px] text-muted-foreground hover:text-danger hover:underline disabled:opacity-50"
                    >
                      Remove
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="rounded-md border border-border-soft bg-surface-alt px-3.5 py-3">
            <div className="mb-2.5 text-[12px] font-semibold text-foreground">Add off day</div>
            <div className="flex flex-col gap-2.5">
              <div>
                <label className="mb-1.5 block text-[11px] font-medium text-foreground">Date</label>
                <input
                  type="date"
                  value={date}
                  disabled={saving}
                  onChange={(e) => {
                    setDate(e.target.value);
                    setError("");
                  }}
                  className="w-full rounded-md border border-border bg-surface px-3 py-2 text-[13px] text-foreground outline-none focus:border-accent-line [color-scheme:light] disabled:opacity-50"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-[11px] font-medium text-foreground">Label</label>
                <input
                  type="text"
                  value={label}
                  disabled={saving}
                  onChange={(e) => {
                    setLabel(e.target.value);
                    setError("");
                  }}
                  placeholder="e.g. Company holiday"
                  className="w-full rounded-md border border-border bg-surface px-3 py-2 text-[13px] text-foreground outline-none focus:border-accent-line placeholder:text-muted-foreground disabled:opacity-50"
                />
              </div>
              {(error || persistError) && (
                <div className="text-[11px] text-danger">{error || persistError}</div>
              )}
              <button
                type="button"
                disabled={saving}
                onClick={addOffDay}
                className="self-start rounded-md bg-primary px-3.5 py-2 text-[12px] font-medium text-primary-foreground disabled:opacity-50"
              >
                {saving ? "Saving…" : "Add off day"}
              </button>
            </div>
          </div>
        </div>

        <div className="flex flex-shrink-0 items-center justify-end border-t border-border-soft px-5 py-3.5">
          <button
            type="button"
            disabled={saving}
            onClick={onClose}
            className="rounded-md bg-primary px-3.5 py-2 text-[12px] font-medium text-primary-foreground disabled:opacity-50"
          >
            {saving ? "Saving…" : "Done"}
          </button>
        </div>
      </div>
    </div>
  );
}

function BandPreview({ idle, optimal }: { idle: number; optimal: number }) {
  const maxScale = 125;
  const idleWidth = (idle / maxScale) * 100;
  const optimalWidth = ((optimal - idle) / maxScale) * 100;
  const overloadedWidth = ((maxScale - optimal) / maxScale) * 100;
  const axisTicks = [0, 25, 50, 75, 100, 125];
  const tickPercents = [25, 50, 75, 100];

  return (
    <div>
      <div className="relative h-6">
        <div className="flex h-full overflow-hidden rounded-md text-[10px] font-medium text-white">
          <div className="flex items-center justify-center bg-muted-foreground" style={{ width: `${idleWidth}%` }}>
            Idle
          </div>
          <div className="flex items-center justify-center bg-success" style={{ width: `${optimalWidth}%` }}>
            Optimal
          </div>
          <div className="flex items-center justify-center bg-danger" style={{ width: `${overloadedWidth}%` }}>
            Overloaded
          </div>
        </div>
        {tickPercents.map((pct) => (
          <div
            key={pct}
            className="pointer-events-none absolute top-0 bottom-0 z-10 w-px bg-accent-line"
            style={{ left: `${(pct / maxScale) * 100}%` }}
          />
        ))}
      </div>
      <div className="relative mt-1 h-[15px] text-[10px] text-muted-foreground">
        {axisTicks.map((pct) => (
          <span
            key={pct}
            className="absolute top-0 whitespace-nowrap"
            style={{
              left: `${(pct / maxScale) * 100}%`,
              transform:
                pct === 0 ? "none" : pct === maxScale ? "translateX(-100%)" : "translateX(-50%)",
            }}
          >
            {pct}%
          </span>
        ))}
      </div>
    </div>
  );
}

function ImpactRowView({ r }: { r: ImpactRow }) {
  const delta = r.after - r.before;
  const tone = { danger: "text-danger", success: "text-success", muted: "text-muted" }[r.tone];
  const dot = { danger: "bg-danger", success: "bg-success", muted: "bg-muted-foreground" }[r.tone];
  return (
    <div className="flex items-center gap-3 border-b border-border-soft px-3.5 py-2.5 last:border-b-0">
      <span className={`h-2 w-2 rounded-full ${dot}`} />
      <div className={`flex-1 text-[12px] font-medium ${tone}`}>{r.band}</div>
      <div className="text-[12px] text-muted-foreground">{r.before}</div>
      <ArrowRight className="h-3 w-3 text-muted-foreground" />
      <div className="w-8 text-[12px] font-semibold text-foreground">{r.after}</div>
      <div className={`w-10 text-right text-[11px] ${delta > 0 ? "text-warning" : delta < 0 ? "text-muted-foreground" : "text-muted-foreground"}`}>
        {delta > 0 ? `+${delta}` : delta < 0 ? delta : "—"}
      </div>
    </div>
  );
}

function AuditRow({ a }: { a: SettingsAuditEntry }) {
  return (
    <div className="border-b border-border-soft px-4 py-3 last:border-b-0">
      <div className="text-[12px] text-foreground">{a.what}</div>
      <div className="mt-0.5 text-[11px] text-muted-foreground">{a.who} · {a.when}</div>
    </div>
  );
}

function Card({
  title,
  desc,
  action,
  children,
}: {
  title: string;
  desc: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface px-4 py-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[13px] font-semibold text-foreground">{title}</div>
          <div className="mt-0.5 text-[12px] leading-snug text-muted-foreground">{desc}</div>
        </div>
        {action}
      </div>
      <div className="mt-3.5 flex flex-col gap-3">{children}</div>
    </div>
  );
}

function NumField({ label, value, suffix, step, onChange }: { label: string; value: number; suffix: string; step?: number; onChange: (v: number) => void }) {
  return (
    <div>
      <div className="mb-1.5 text-[12px] font-medium text-foreground">{label}</div>
      <div className="flex items-center gap-1.5">
        <input type="number" step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-20 rounded-md border border-border bg-surface px-3 py-1.5 text-[13px] text-foreground outline-none focus:border-accent-line" />
        <span className="text-[12px] text-muted-foreground">{suffix}</span>
      </div>
    </div>
  );
}

function Segment({ active, onClick, label, hint }: { active: boolean; onClick: () => void; label: string; hint: string }) {
  return (
    <button onClick={onClick} className={`flex-1 rounded-md border px-3.5 py-2.5 text-left ${active ? "border-primary bg-accent-soft" : "border-border hover:bg-surface-alt"}`}>
      <div className={`text-[13px] font-medium ${active ? "text-primary" : "text-foreground"}`}>{label}</div>
      <div className="text-[11px] text-muted-foreground">{hint}</div>
    </button>
  );
}

function EffOpt({ active, onClick, label, hint }: { active: boolean; onClick: () => void; label: string; hint: string }) {
  return (
    <button onClick={onClick} className={`flex-1 rounded-md border px-3.5 py-2.5 text-left ${active ? "border-primary bg-accent-soft" : "border-border hover:bg-surface-alt"}`}>
      <div className={`text-[13px] font-medium ${active ? "text-primary" : "text-foreground"}`}>{label}</div>
      <div className="text-[11px] text-muted-foreground">{hint}</div>
    </button>
  );
}
