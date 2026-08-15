import { useEffect, useRef, useState, type ReactNode } from "react";
import { CalendarClock, History, AlertTriangle, X, ArrowRight } from "lucide-react";
import { ALL_DAYS, DEFAULT_SETTINGS, withoutLowDemandPriority } from "../data/settings";
import type { SettingsState, ImpactRow, CompanyOffDay, DateFormatPattern } from "../data/settings";
import { useSettings } from "../context/SettingsContext";
import {
  cancelSettingsSchedule,
  createSettingsSchedule,
  fetchAllocations,
  fetchEmployees,
  fetchSettings,
  fetchSettingsAudit,
  fetchSettingsSchedules,
  putSettings,
  type SettingsSchedule,
} from "../api/domain";
import { addDaysISO, buildUtilRowsFromEmployees, mondayISO } from "../api/liveViews";
import { weekCapacityHours } from "../data/planner";
import { todayISO, tomorrowISO } from "../utils/date";
import { DATE_FORMAT_OPTIONS, formatAppDate, formatAppDateTime } from "../utils/formatAppDate";
import { computeSettingsBandImpact } from "../utils/settingsImpact";
import { useFocusFirstField } from "../hooks/useFocusFirstField";
import type { SettingsAuditEntry } from "../utils/settingsAudit";
import { SmtpSettingsSection } from "../components/SmtpSettingsSection";
import { useToast } from "../context/ToastContext";
import { ConfirmDeleteDialog } from "../components/ConfirmDeleteDialog";
import { AppDateInput } from "../components/AppDateInput";
import { useAppDateFormat } from "../hooks/useAppDateFormat";
import { usePauseSharedDataSync, useSharedDataSync, MASTER_TXN_SYNC_INTERVAL_MS } from "../hooks/useSharedDataSync";

type ReviewSection = "utilization" | "planning" | "capacity" | "overallocation";

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
    dateFormat: s.dateFormat,
    demandPriority: s.demandPriority,
    companyOffDays: companyOffDays.map((d) => ({ date: d.date, label: d.label })),
  };
}

export function Settings() {
  const { settings: s, setSettings, patchSettings, refresh, loading } = useSettings();
  const toast = useToast();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [reviewSection, setReviewSection] = useState<ReviewSection | null>(null);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [auditLog, setAuditLog] = useState<SettingsAuditEntry[]>([]);
  const [scheduled, setScheduled] = useState<SettingsSchedule[]>([]);
  const [pendingCancelScheduleId, setPendingCancelScheduleId] = useState<string | null>(null);
  /** Last persisted snapshot per Review & Save card — null until settings hydrate from API. */
  const [committedBands, setCommittedBands] = useState<SettingsState["bands"] | null>(null);
  const [committedMetricBands, setCommittedMetricBands] = useState<SettingsState["metricBands"] | null>(
    null
  );
  const [committedCapacityBasis, setCommittedCapacityBasis] = useState<
    SettingsState["capacityBasis"] | null
  >(null);
  const [committedOverallocationLimit, setCommittedOverallocationLimit] = useState<number | null>(
    null
  );
  const [committedWorking, setCommittedWorking] = useState<{
    workingHoursPerDay: number;
    workingDays: string[];
  } | null>(null);
  const [savingWorkingCalendar, setSavingWorkingCalendar] = useState(false);
  const [committedDateFormat, setCommittedDateFormat] = useState<string | null>(null);
  const [savingDateFormat, setSavingDateFormat] = useState(false);
  const baselinedRef = useRef(false);

  const utilizationDirty =
    committedBands != null &&
    (s.bands.idleBelow !== committedBands.idleBelow ||
      s.bands.optimalTo !== committedBands.optimalTo);
  const planningDirty =
    committedMetricBands != null &&
    (s.metricBands.excellent !== committedMetricBands.excellent ||
      s.metricBands.good !== committedMetricBands.good ||
      s.metricBands.needsAttention !== committedMetricBands.needsAttention);
  const capacityDirty =
    committedCapacityBasis != null && s.capacityBasis !== committedCapacityBasis;
  const overallocationDirty =
    committedOverallocationLimit != null &&
    s.overallocationLimit !== committedOverallocationLimit;

  const workingCalendarDirty =
    committedWorking != null &&
    (s.workingHoursPerDay !== committedWorking.workingHoursPerDay ||
      [...s.workingDays].sort().join(",") !== [...committedWorking.workingDays].sort().join(","));

  const dateFormatValue = s.dateFormat ?? DEFAULT_SETTINGS.dateFormat;
  const dateFormatDirty =
    committedDateFormat != null && dateFormatValue !== committedDateFormat;

  const anyReviewDirty =
    utilizationDirty || planningDirty || capacityDirty || overallocationDirty;

  usePauseSharedDataSync(anyReviewDirty || workingCalendarDirty || dateFormatDirty);
  useSharedDataSync(!(anyReviewDirty || workingCalendarDirty || dateFormatDirty), () => refresh(), {
    resources: ["settings"],
    intervalMs: MASTER_TXN_SYNC_INTERVAL_MS,
  });

  const syncCommittedFrom = (src: SettingsState) => {
    setCommittedBands({ ...src.bands });
    setCommittedMetricBands({ ...src.metricBands });
    setCommittedCapacityBasis(src.capacityBasis);
    setCommittedOverallocationLimit(src.overallocationLimit);
    setCommittedWorking({
      workingHoursPerDay: src.workingHoursPerDay,
      workingDays: [...src.workingDays],
    });
    setCommittedDateFormat(src.dateFormat ?? DEFAULT_SETTINGS.dateFormat);
  };

  // After API hydrate (and whenever a full load finishes), set baselines so Save stays disabled until edit.
  useEffect(() => {
    if (loading) {
      baselinedRef.current = false;
      return;
    }
    if (!baselinedRef.current) {
      syncCommittedFrom(s);
      baselinedRef.current = true;
    }
  }, [loading, s]);

  // Silent SSE/focus refresh: adopt server values only when this page has no local edits.
  useEffect(() => {
    if (!baselinedRef.current || loading) return;
    if (anyReviewDirty || workingCalendarDirty || dateFormatDirty) return;
    syncCommittedFrom(s);
  }, [
    loading,
    anyReviewDirty,
    workingCalendarDirty,
    dateFormatDirty,
    s,
  ]);

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
  };
  const patchBands = (p: Partial<SettingsState["bands"]>) => {
    setSettings((prev) => {
      let idleBelow = prev.bands.idleBelow;
      let optimalTo = prev.bands.optimalTo;
      const OPTIMAL_MAX = 125;

      if (p.optimalTo !== undefined && Number.isFinite(p.optimalTo)) {
        // Optimal must stay strictly above Idle (and at least 1 so Idle can be 0); max matches band preview scale.
        optimalTo = Math.max(1, Math.min(OPTIMAL_MAX, p.optimalTo));
        if (idleBelow >= optimalTo) idleBelow = Math.max(0, optimalTo - 1);
      }
      if (p.idleBelow !== undefined && Number.isFinite(p.idleBelow)) {
        // Idle below: 0 … Optimal−1 (values may not be equal).
        idleBelow = Math.max(0, Math.min(optimalTo - 1, p.idleBelow));
      }

      return { ...prev, bands: { ...prev.bands, idleBelow, optimalTo } };
    });
  };
  const patchMetricBandsDirty = (p: Partial<SettingsState["metricBands"]>) => {
    setSettings((prev) => {
      let excellent = prev.metricBands.excellent;
      let good = prev.metricBands.good;
      let needsAttention = prev.metricBands.needsAttention;

      const clampPct = (n: number) => Math.max(0, Math.min(100, Math.trunc(n)));

      if (p.excellent !== undefined && Number.isFinite(p.excellent)) {
        excellent = clampPct(p.excellent);
        // Excellent must be strictly greater than Good.
        if (excellent <= good) {
          good = Math.max(1, excellent - 1);
          if (good <= needsAttention) needsAttention = Math.max(1, good - 1);
        }
      }
      if (p.good !== undefined && Number.isFinite(p.good)) {
        good = clampPct(p.good);
        if (good >= excellent) excellent = Math.min(100, good + 1);
        if (good <= needsAttention) needsAttention = Math.max(1, good - 1);
      }
      if (p.needsAttention !== undefined && Number.isFinite(p.needsAttention)) {
        needsAttention = clampPct(p.needsAttention);
        if (needsAttention >= good) {
          good = Math.min(100, needsAttention + 1);
          if (good >= excellent) excellent = Math.min(100, good + 1);
        }
      }

      // Keep strict order: 1 ≤ Needs Attention < Good < Excellent ≤ 100
      needsAttention = Math.max(1, clampPct(needsAttention));
      good = Math.max(needsAttention + 1, Math.min(99, good));
      excellent = Math.max(good + 1, Math.min(100, excellent));
      needsAttention = Math.max(1, Math.min(good - 1, needsAttention));

      return { ...prev, metricBands: { excellent, good, needsAttention } };
    });
  };
  const toggleDay = (d: string) => {
    if (s.workingDays.includes(d)) {
      if (s.workingDays.length <= 1) {
        toast.error("Select at least one working day.");
        return;
      }
      patchSettings({ workingDays: s.workingDays.filter((x) => x !== d) });
      return;
    }
    patchSettings({ workingDays: [...s.workingDays, d] });
  };

  const persistSettings = async (next: SettingsState) => {
    await putSettings(settingsPutBody(next));
    await refresh();
    try {
      await reloadAuditAndSchedules();
    } catch {
      /* keep prior rail if audit refresh fails; settings already saved */
    }
    setSaveError("");
  };

  const mergeSectionOnto = (base: SettingsState, section: ReviewSection): SettingsState => {
    if (section === "utilization") return { ...base, bands: { ...s.bands } };
    if (section === "planning") return { ...base, metricBands: { ...s.metricBands } };
    if (section === "capacity") return { ...base, capacityBasis: s.capacityBasis };
    return { ...base, overallocationLimit: s.overallocationLimit };
  };

  const handleSave = async (when: "now" | "future", scheduledDate: string) => {
    if (!reviewSection) return;
    setSaving(true);
    setSaveError("");
    const section = reviewSection;
    const draftSnapshot = {
      bands: { ...s.bands },
      metricBands: { ...s.metricBands },
      capacityBasis: s.capacityBasis,
      overallocationLimit: s.overallocationLimit,
    };
    const keep = {
      utilization: utilizationDirty && section !== "utilization",
      planning: planningDirty && section !== "planning",
      capacity: capacityDirty && section !== "capacity",
      overallocation: overallocationDirty && section !== "overallocation",
    };
    try {
      const latest = await fetchSettings();
      const merged = mergeSectionOnto(latest, section);
      if (when === "future") {
        await createSettingsSchedule({
          ...settingsPutBody(merged),
          effectiveDate: scheduledDate,
        });
        toast.created();
      } else {
        await putSettings(settingsPutBody(merged));
        toast.updated();
      }
      await refresh();
      await reloadAuditAndSchedules();
      // Restore other cards' unsaved drafts after refresh
      const restore: Partial<SettingsState> = {};
      if (keep.utilization) restore.bands = draftSnapshot.bands;
      if (keep.planning) restore.metricBands = draftSnapshot.metricBands;
      if (keep.capacity) restore.capacityBasis = draftSnapshot.capacityBasis;
      if (keep.overallocation) restore.overallocationLimit = draftSnapshot.overallocationLimit;
      if (Object.keys(restore).length) patchSettings(restore);
      if (when === "now") {
        if (section === "utilization") setCommittedBands(draftSnapshot.bands);
        if (section === "planning") setCommittedMetricBands(draftSnapshot.metricBands);
        if (section === "capacity") setCommittedCapacityBasis(draftSnapshot.capacityBasis);
        if (section === "overallocation") {
          setCommittedOverallocationLimit(draftSnapshot.overallocationLimit);
        }
      }
      setConfirmOpen(false);
      setReviewSection(null);
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
      setPendingCancelScheduleId(null);
      toast.deleted();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Could not cancel schedule.");
    } finally {
      setSaving(false);
    }
  };

  const handleCalendarOffDaysChange = async (
    companyOffDays: CompanyOffDay[],
    notify?: "created" | "deleted"
  ) => {
    const next = { ...s, companyOffDays };
    patchSettings({ companyOffDays });
    setSaving(true);
    setSaveError("");
    try {
      await persistSettings(next);
      if (notify === "created") toast.created();
      if (notify === "deleted") toast.deleted();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Could not save calendar.");
    } finally {
      setSaving(false);
    }
  };

  /** Working calendar has its own Save — does not toggle Review & Save dirty state. */
  const handleSaveWorkingCalendar = async () => {
    if (!workingCalendarDirty || savingWorkingCalendar) return;
    setSavingWorkingCalendar(true);
    setSaveError("");
    try {
      const latest = await fetchSettings();
      const nextHours = s.workingHoursPerDay;
      const nextDays = [...s.workingDays];
      await putSettings(
        settingsPutBody({
          ...latest,
          workingHoursPerDay: nextHours,
          workingDays: nextDays,
        })
      );
      patchSettings({ workingHoursPerDay: nextHours, workingDays: nextDays });
      setCommittedWorking({ workingHoursPerDay: nextHours, workingDays: nextDays });
      await reloadAuditAndSchedules();
      toast.updated();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Could not save working calendar.");
    } finally {
      setSavingWorkingCalendar(false);
    }
  };

  /** Date format has its own Save — does not toggle Review & Save dirty state. */
  const handleSaveDateFormat = async () => {
    if (!dateFormatDirty || savingDateFormat) return;
    setSavingDateFormat(true);
    setSaveError("");
    try {
      const latest = await fetchSettings();
      const nextFormat = s.dateFormat ?? DEFAULT_SETTINGS.dateFormat;
      await putSettings(settingsPutBody({ ...latest, dateFormat: nextFormat }));
      patchSettings({ dateFormat: nextFormat });
      setCommittedDateFormat(nextFormat);
      await reloadAuditAndSchedules();
      toast.updated();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Could not save date format.");
    } finally {
      setSavingDateFormat(false);
    }
  };

  const reviewSaveAction = (section: ReviewSection, sectionDirty: boolean) => (
    <div className="flex shrink-0 items-center gap-2.5">
      {sectionDirty && !saveError ? (
        <span className="text-[12px] text-warning">Unsaved changes</span>
      ) : null}
      <button
        type="button"
        disabled={!sectionDirty || saving}
        onClick={() => {
          setReviewSection(section);
          setConfirmOpen(true);
        }}
        className={`shrink-0 cursor-pointer rounded-md px-3.5 py-1.5 text-[12px] font-medium ${
          sectionDirty && !saving
            ? "bg-primary text-primary-foreground hover:opacity-90"
            : "cursor-not-allowed bg-surface-alt text-muted-foreground"
        }`}
      >
        Review & Save
      </button>
    </div>
  );

  return (
    <>
      <header className="flex h-14 flex-shrink-0 items-center justify-between border-b border-border bg-surface px-5">
        <div>
          <div className="text-[15px] font-semibold tracking-tight text-foreground">System Parameters</div>
          <div className="text-[12px] text-muted-foreground">Admin · applies org-wide · changes are effective-dated & logged</div>
        </div>
        <div className="flex items-center gap-2">
          {saveError && (
            <span className="max-w-[280px] truncate text-[12px] text-danger" title={saveError}>
              {saveError}
            </span>
          )}
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
                onClick={() => setPendingCancelScheduleId(scheduled[0].id)}
                className="flex-shrink-0 rounded-md border border-accent-line px-2.5 py-1 text-[11px] font-medium text-primary hover:bg-surface disabled:opacity-60"
              >
                Cancel
              </button>
            </div>
          )}

          {/* Utilization bands */}
          <Card
            title="Utilization bands"
            desc="Thresholds that classify people as idle, optimal, or overloaded across Utilization & dashboards."
            action={reviewSaveAction("utilization", utilizationDirty)}
          >
            <div className="flex items-end gap-6">
              <NumField
                label="Idle below"
                value={s.bands.idleBelow}
                suffix="%"
                required
                integer
                min={0}
                max={Math.max(0, s.bands.optimalTo - 1)}
                onChange={(v) => patchBands({ idleBelow: v })}
              />
              <NumField
                label="Optimal up to"
                value={s.bands.optimalTo}
                suffix="%"
                required
                integer
                min={s.bands.idleBelow + 1}
                max={125}
                onChange={(v) => patchBands({ optimalTo: v })}
              />
            </div>
            <BandPreview idle={s.bands.idleBelow} optimal={s.bands.optimalTo} />
          </Card>

          {/* Planning & confirmation bands */}
          <Card
            title="Planning & confirmation bands"
            desc="Status chip thresholds on the Resource Deployment Report — Excellent, Good, Needs Attention."
            action={reviewSaveAction("planning", planningDirty)}
          >
            <div className="flex flex-wrap items-end gap-6">
              <NumField
                label="Excellent from"
                value={s.metricBands.excellent}
                suffix="%"
                required
                integer
                min={s.metricBands.good + 1}
                max={100}
                onChange={(v) => patchMetricBandsDirty({ excellent: v })}
              />
              <NumField
                label="Good from"
                value={s.metricBands.good}
                suffix="%"
                required
                integer
                min={s.metricBands.needsAttention + 1}
                max={s.metricBands.excellent - 1}
                onChange={(v) => patchMetricBandsDirty({ good: v })}
              />
              <NumField
                label="Needs attention from"
                value={s.metricBands.needsAttention}
                suffix="%"
                required
                integer
                min={1}
                max={s.metricBands.good - 1}
                onChange={(v) => patchMetricBandsDirty({ needsAttention: v })}
              />
            </div>
            <div className="mt-2 text-[11px] text-muted-foreground">
              ≥{s.metricBands.excellent}% Excellent · ≥{s.metricBands.good}% Good · ≤
              {s.metricBands.needsAttention}% Needs Attention
            </div>
          </Card>

          {/* Capacity basis */}
          <Card
            title="Capacity basis"
            desc="What utilization is measured against. Billable excludes internal/meeting activities so they don't misclassify people as idle."
            action={reviewSaveAction("capacity", capacityDirty)}
          >
            <div className="flex gap-2">
              <Segment
                active={s.capacityBasis === "billable"}
                onClick={() => patch({ capacityBasis: "billable" })}
                label="Billable / project-eligible"
                hint="Recommended"
              />
              <Segment
                active={s.capacityBasis === "total"}
                onClick={() => patch({ capacityBasis: "total" })}
                label="Total hours"
                hint="All logged time"
              />
            </div>
          </Card>

          {/* Overallocation limit */}
          <Card
            title="Overallocation guardrail"
            desc="Allocations beyond capacity warn and require a reason. Beyond this ceiling, saving is hard-blocked."
            action={reviewSaveAction("overallocation", overallocationDirty)}
          >
            <div className="flex items-center gap-4">
              <input
                type="range"
                min={100}
                max={150}
                step={5}
                value={s.overallocationLimit}
                onChange={(e) => patch({ overallocationLimit: Number(e.target.value) })}
                className="flex-1 accent-primary"
              />
              <div className="w-20 rounded-md border border-border bg-surface px-3 py-1.5 text-center text-[13px] font-semibold text-foreground">
                {s.overallocationLimit}%
              </div>
            </div>
            <div className="text-[11px] text-muted-foreground">
              100–{s.overallocationLimit}%: warn + reason (logged) · above {s.overallocationLimit}%: blocked
            </div>
          </Card>

          {/* Working calendar — Save on title (right); Calendar bottom-right */}
          <Card
            title="Working calendar"
            desc="Defines capacity per person and which days count toward confirmation compliance."
            action={
              <button
                type="button"
                disabled={!workingCalendarDirty || savingWorkingCalendar}
                onClick={() => void handleSaveWorkingCalendar()}
                className={`cursor-pointer rounded-md px-3 py-1.5 text-[12px] font-medium disabled:cursor-not-allowed ${
                  workingCalendarDirty && !savingWorkingCalendar
                    ? "bg-primary text-primary-foreground hover:opacity-90"
                    : "bg-surface-alt text-muted-foreground"
                }`}
              >
                {savingWorkingCalendar ? "Saving…" : "Save"}
              </button>
            }
          >
            <div className="flex items-end gap-6">
              <NumField
                label="Hours per day"
                value={s.workingHoursPerDay}
                suffix="h"
                required
                step={0.1}
                min={0.1}
                max={15}
                maxIntDigits={2}
                maxFracDigits={1}
                onChange={(v) => patchSettings({ workingHoursPerDay: v })}
              />
              <div>
                <div className="mb-1.5 text-[12px] font-medium text-foreground">
                  Working days <span className="text-danger">*</span>
                </div>
                <div className="flex gap-1.5">
                  {ALL_DAYS.map((d) => {
                    const on = s.workingDays.includes(d);
                    return (
                      <button
                        key={d}
                        type="button"
                        onClick={() => toggleDay(d)}
                        className={`h-9 w-11 cursor-pointer rounded-md border text-[12px] font-medium ${
                          on
                            ? "border-primary bg-accent-soft text-primary"
                            : "border-border text-muted-foreground hover:bg-surface-alt"
                        }`}
                      >
                        {d}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
            <div className="flex items-center justify-between gap-3">
              <div className="text-[11px] text-muted-foreground">
                Weekly capacity per person:{" "}
                <b className="text-foreground">
                  {Number((s.workingHoursPerDay * s.workingDays.length).toFixed(1))}h
                </b>{" "}
                ({s.workingDays.length} days × {s.workingHoursPerDay}h)
              </div>
              <button
                type="button"
                onClick={() => setCalendarOpen(true)}
                className="shrink-0 cursor-pointer rounded-md border border-accent-line bg-accent-soft px-3 py-1.5 text-[12px] font-medium text-primary hover:bg-accent-soft/80"
              >
                Calendar
              </button>
            </div>
          </Card>

          <Card
            title="Date Format"
            desc="How dates are shown across tables, forms, reports, calendars, and exports."
            action={
              <button
                type="button"
                disabled={!dateFormatDirty || savingDateFormat}
                onClick={() => void handleSaveDateFormat()}
                className={`shrink-0 cursor-pointer rounded-md px-3 py-1.5 text-[12px] font-medium disabled:cursor-not-allowed ${
                  dateFormatDirty && !savingDateFormat
                    ? "bg-primary text-primary-foreground hover:opacity-90"
                    : "bg-surface-alt text-muted-foreground"
                }`}
              >
                {savingDateFormat ? "Saving…" : "Save"}
              </button>
            }
          >
            <div className="max-w-xs">
              <label className="mb-1.5 block text-[12px] font-medium text-foreground">
                Display format <span className="text-danger">*</span>
              </label>
              <select
                value={dateFormatValue}
                onChange={(e) =>
                  patchSettings({ dateFormat: e.target.value as DateFormatPattern })
                }
                className="w-full cursor-pointer rounded-md border border-border bg-surface px-3 py-2 text-[13px] text-foreground outline-none focus:border-accent-line"
              >
                {DATE_FORMAT_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <div className="mt-2 text-[11px] text-muted-foreground">
                Example: {formatAppDateTime(`${tomorrowISO()}T15:45:00`, dateFormatValue)}
              </div>
            </div>
          </Card>

          {/* Demand priorities */}
          <Card
            title="Demand priority order"
            desc={
              <>
                How open demand is ranked in the Planner and dashboards.
                <div className="mt-0.5">
                  Project Health Critical → demand CRITICAL; Need Attention → HIGH; Healthy → MEDIUM
                </div>
              </>
            }
          >
            <div className="flex items-center gap-2">
              {withoutLowDemandPriority(s.demandPriority).map((p, i, list) => (
                <div key={p} className="flex items-center gap-2">
                  <span className="rounded-md border border-border bg-surface px-2.5 py-1.5 text-[12px] text-foreground">
                    {i + 1}. {p}
                  </span>
                  {i < list.length - 1 && (
                    <span className="text-muted-foreground">→</span>
                  )}
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

      {confirmOpen &&
        reviewSection &&
        committedBands &&
        committedMetricBands &&
        committedCapacityBasis != null &&
        committedOverallocationLimit != null && (
        <ImpactModal
          section={reviewSection}
          draft={s}
          committedBands={committedBands}
          committedMetricBands={committedMetricBands}
          committedCapacityBasis={committedCapacityBasis}
          committedOverallocationLimit={committedOverallocationLimit}
          onClose={() => {
            setConfirmOpen(false);
            setReviewSection(null);
          }}
          onSave={(when, scheduledDate) => {
            void handleSave(when, scheduledDate);
          }}
          saving={saving}
        />
      )}
      {calendarOpen && (
        <CompanyCalendarModal
          offDays={s.companyOffDays}
          dateFormat={s.dateFormat}
          saving={saving}
          error={saveError}
          onClose={() => setCalendarOpen(false)}
          onChange={(companyOffDays, notify) => {
            void handleCalendarOffDaysChange(companyOffDays, notify);
          }}
        />
      )}
      <ConfirmDeleteDialog
        open={pendingCancelScheduleId != null}
        confirming={saving}
        onCancel={() => {
          if (!saving) setPendingCancelScheduleId(null);
        }}
        onConfirm={() => {
          if (pendingCancelScheduleId) void handleCancelSchedule(pendingCancelScheduleId);
        }}
      />
    </>
  );
}

function formatScheduleDate(iso: string, pattern: DateFormatPattern) {
  if (!iso) return "Select date";
  return formatAppDate(iso, pattern);
}

function ImpactModal({
  section,
  draft,
  committedBands,
  committedMetricBands,
  committedCapacityBasis,
  committedOverallocationLimit,
  onClose,
  onSave,
  saving,
}: {
  section: ReviewSection;
  draft: SettingsState;
  committedBands: SettingsState["bands"];
  committedMetricBands: SettingsState["metricBands"];
  committedCapacityBasis: SettingsState["capacityBasis"];
  committedOverallocationLimit: number;
  onClose: () => void;
  onSave: (when: "now" | "future", scheduledDate: string) => void;
  saving?: boolean;
}) {
  const [when, setWhen] = useState<"now" | "future">("now");
  const [scheduledDate, setScheduledDate] = useState(tomorrowISO());
  const [impactRows, setImpactRows] = useState<ImpactRow[]>([]);
  const [impactSummary, setImpactSummary] = useState("Calculating impact…");
  const [impactLoading, setImpactLoading] = useState(section === "utilization");
  const [changeLines, setChangeLines] = useState<string[]>([]);
  const focusRef = useFocusFirstField<HTMLDivElement>(when === "future");
  const minDate = tomorrowISO();

  const sectionTitle =
    section === "utilization"
      ? "Utilization bands"
      : section === "planning"
        ? "Planning & confirmation bands"
        : section === "capacity"
          ? "Capacity basis"
          : "Overallocation guardrail";

  useEffect(() => {
    if (section === "utilization") {
      let cancelled = false;
      setImpactLoading(true);
      void (async () => {
        try {
          const weekStart = mondayISO();
          const weekEnd = addDaysISO(weekStart, 6);
          const offDays = draft.companyOffDays.map((d) => d.date.slice(0, 10));
          const [employees, allocations] = await Promise.all([
            fetchEmployees(),
            fetchAllocations({ from: weekStart, to: weekEnd }),
          ]);
          if (cancelled) return;
          const weekCapacity =
            weekCapacityHours(weekStart, {
              workingDays: draft.workingDays,
              companyOffDays: offDays,
              workingHoursPerDay: draft.workingHoursPerDay,
            }) ||
            Math.round(draft.workingHoursPerDay * draft.workingDays.length) ||
            40;
          const rows = buildUtilRowsFromEmployees(
            employees,
            weekCapacity,
            allocations,
            offDays
          );
          const impact = computeSettingsBandImpact(
            rows.map((r) => r.pct),
            committedBands,
            draft.bands
          );
          setImpactRows(impact.rows);
          setImpactSummary(impact.summary);
          const lines: string[] = [];
          if (committedBands.idleBelow !== draft.bands.idleBelow) {
            lines.push(`Idle below ${committedBands.idleBelow}% → ${draft.bands.idleBelow}%`);
          }
          if (committedBands.optimalTo !== draft.bands.optimalTo) {
            lines.push(`Optimal up to ${committedBands.optimalTo}% → ${draft.bands.optimalTo}%`);
          }
          setChangeLines(lines);
        } catch {
          if (!cancelled) {
            setImpactRows([]);
            setImpactSummary(
              "Could not load live utilization — band impact could not be calculated. You can still save."
            );
            setChangeLines([
              `Idle below ${committedBands.idleBelow}% → ${draft.bands.idleBelow}%`,
              `Optimal up to ${committedBands.optimalTo}% → ${draft.bands.optimalTo}%`,
            ]);
          }
        } finally {
          if (!cancelled) setImpactLoading(false);
        }
      })();
      return () => {
        cancelled = true;
      };
    }

    setImpactLoading(false);
    setImpactRows([]);
    if (section === "planning") {
      const lines: string[] = [];
      if (committedMetricBands.excellent !== draft.metricBands.excellent) {
        lines.push(
          `Excellent from ${committedMetricBands.excellent}% → ${draft.metricBands.excellent}%`
        );
      }
      if (committedMetricBands.good !== draft.metricBands.good) {
        lines.push(`Good from ${committedMetricBands.good}% → ${draft.metricBands.good}%`);
      }
      if (committedMetricBands.needsAttention !== draft.metricBands.needsAttention) {
        lines.push(
          `Needs attention from ${committedMetricBands.needsAttention}% → ${draft.metricBands.needsAttention}%`
        );
      }
      setChangeLines(lines);
      setImpactSummary(
        lines.length
          ? "These thresholds update status chips on the Resource Deployment Report. Historical chips keep their original labels when you schedule for later."
          : "No planning-band values changed."
      );
      return;
    }
    if (section === "capacity") {
      const before =
        committedCapacityBasis === "billable" ? "Billable / project-eligible" : "Total hours";
      const after =
        draft.capacityBasis === "billable" ? "Billable / project-eligible" : "Total hours";
      setChangeLines([`Capacity basis ${before} → ${after}`]);
      setImpactSummary(
        "Utilization & dashboards will measure against the new capacity basis. Past periods keep their original classification basis when scheduled for later."
      );
      return;
    }
    setChangeLines([
      `Overallocation limit ${committedOverallocationLimit}% → ${draft.overallocationLimit}%`,
    ]);
    setImpactSummary(
      `Planner saves warn between 100% and ${draft.overallocationLimit}%, and block above ${draft.overallocationLimit}%. Existing allocations are not changed by this save.`
    );
  }, [
    section,
    committedBands,
    committedMetricBands,
    committedCapacityBasis,
    committedOverallocationLimit,
    draft.bands,
    draft.metricBands,
    draft.capacityBasis,
    draft.overallocationLimit,
    draft.companyOffDays,
    draft.workingDays,
    draft.workingHoursPerDay,
  ]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
      <div onClick={onClose} className="absolute inset-0 bg-brand/40" />
      <div ref={focusRef} className="relative z-10 flex w-full max-w-[540px] flex-col overflow-hidden rounded-xl bg-surface shadow-2xl">
        <div className="flex flex-shrink-0 items-center justify-between border-b border-border-soft px-5 py-4">
          <div>
            <div className="text-[15px] font-semibold text-foreground">Review impact before saving</div>
            <div className="mt-0.5 text-[12px] text-muted-foreground">{sectionTitle}</div>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>

        <div className="flex flex-col gap-4 px-5 py-4">
          <div className="flex items-start gap-2.5 rounded-md border border-warning-border bg-warning-soft/50 px-3.5 py-2.5">
            <AlertTriangle className="h-4 w-4 flex-shrink-0 text-warning" />
            <div className="text-[12px] text-foreground">
              {impactLoading ? "Calculating impact…" : impactSummary}
            </div>
          </div>

          {changeLines.length > 0 && (
            <div>
              <div className="mb-2 text-[12px] font-semibold text-foreground">Values in this card</div>
              <ul className="overflow-hidden rounded-md border border-border-soft">
                {changeLines.map((line) => (
                  <li
                    key={line}
                    className="border-b border-border-soft px-3 py-2 text-[12px] text-foreground last:border-b-0"
                  >
                    {line}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {section === "utilization" && (
            <div>
              <div className="mb-2 text-[12px] font-semibold text-foreground">People per band</div>
              <div className="overflow-hidden rounded-md border border-border-soft">
                {impactLoading ? (
                  <div className="py-4 text-center text-[12px] text-muted-foreground">Loading live utilization…</div>
                ) : impactRows.length === 0 ? (
                  <div className="py-4 text-center text-[12px] text-muted-foreground">
                    No band-shift preview available
                  </div>
                ) : (
                  impactRows.map((r) => <ImpactRowView key={r.band} r={r} />)
                )}
              </div>
            </div>
          )}

          <div>
            <div className="mb-2 text-[12px] font-semibold text-foreground">When should this take effect?</div>
            <div className="flex gap-2">
              <EffOpt active={when === "now"} onClick={() => setWhen("now")} label="Immediately" hint="Applies now" />
              <EffOpt
                active={when === "future"}
                onClick={() => setWhen("future")}
                label="Schedule for later"
                hint={formatScheduleDate(scheduledDate, draft.dateFormat)}
              />
            </div>
            {when === "future" && (
              <div className="mt-2.5">
                <label className="mb-1.5 block text-[11px] font-medium text-foreground">Effective date</label>
                <AppDateInput
                  min={minDate}
                  value={scheduledDate}
                  onChange={(v) => setScheduledDate(v || minDate)}
                  inputClassName="focus:border-accent-line"
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
              className="cursor-pointer rounded-md bg-primary px-3.5 py-2 text-[12px] font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? "Saving…" : when === "now" ? "Save & apply" : "Schedule change"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function formatOffDayDate(iso: string, pattern: DateFormatPattern) {
  const formatted = formatAppDate(iso, pattern);
  if (formatted === "—") return iso;
  const [y, m, d] = iso.split("-").map(Number);
  const weekday = new Date(y, m - 1, d).toLocaleDateString("en-US", { weekday: "short" });
  return `${weekday}, ${formatted}`;
}

function CompanyCalendarModal({
  offDays,
  dateFormat,
  saving,
  error: persistError,
  onClose,
  onChange,
}: {
  offDays: CompanyOffDay[];
  dateFormat: DateFormatPattern;
  saving?: boolean;
  error?: string;
  onClose: () => void;
  onChange: (days: CompanyOffDay[], notify?: "created" | "deleted") => void;
}) {
  const OFF_DAY_LABEL_MAX = 50;
  const minOffDayDate = todayISO();
  const [date, setDate] = useState("");
  const [label, setLabel] = useState("");
  const [error, setError] = useState("");
  const [pendingRemoveId, setPendingRemoveId] = useState<string | null>(null);
  const focusRef = useFocusFirstField<HTMLDivElement>();

  const sorted = [...offDays].sort((a, b) => a.date.localeCompare(b.date));

  const addOffDay = () => {
    if (!date) {
      setError("Select a date.");
      return;
    }
    if (date < minOffDayDate) {
      setError("Past dates cannot be added as holidays.");
      return;
    }
    if (!label.trim()) {
      setError("Enter a label for this off day.");
      return;
    }
    if (label.trim().length > OFF_DAY_LABEL_MAX) {
      setError(`Label must be ${OFF_DAY_LABEL_MAX} characters or fewer.`);
      return;
    }
    if (offDays.some((d) => d.date === date)) {
      setError("This date is already marked as an off day.");
      return;
    }
    onChange(
      [
        ...offDays,
        { id: `off${Date.now()}`, date, label: label.trim() },
      ],
      "created"
    );
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

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden px-5 py-4">
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="mb-2 flex-shrink-0 text-[12px] font-semibold text-foreground">Off days</div>
            <div className="min-h-[14rem] flex-1 overflow-y-auto rounded-md border border-border-soft">
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
                      <div className="text-[11px] text-muted-foreground">
                        {formatOffDayDate(day.date, dateFormat)}
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => setPendingRemoveId(day.id)}
                      className="flex-shrink-0 cursor-pointer text-[11px] text-muted-foreground hover:text-danger hover:underline disabled:opacity-50"
                    >
                      Remove
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="flex-shrink-0 rounded-md border border-border-soft bg-surface-alt px-3.5 py-3">
            <div className="mb-2.5 text-[12px] font-semibold text-foreground">Add off day</div>
            <div className="flex flex-col gap-2.5">
              <div className="flex flex-col gap-2.5 sm:flex-row sm:items-end sm:gap-3">
                <div className="w-full flex-shrink-0 sm:w-[10.5rem]">
                  <label className="mb-1.5 block text-[11px] font-medium text-foreground">
                    Date <span className="text-danger">*</span>
                  </label>
                  <AppDateInput
                    value={date}
                    min={minOffDayDate}
                    disabled={saving}
                    onChange={(next) => {
                      if (next && next < minOffDayDate) {
                        setError("Past dates cannot be added as holidays.");
                        return;
                      }
                      setDate(next);
                      setError("");
                    }}
                    inputClassName="cursor-pointer focus:border-accent-line disabled:cursor-not-allowed disabled:opacity-50"
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <label className="text-[11px] font-medium text-foreground">
                      Label <span className="text-danger">*</span>
                    </label>
                    <span className="text-[10px] text-muted-foreground tabular-nums">
                      {label.length}/{OFF_DAY_LABEL_MAX}
                    </span>
                  </div>
                  <input
                    type="text"
                    value={label}
                    maxLength={OFF_DAY_LABEL_MAX}
                    disabled={saving}
                    onChange={(e) => {
                      setLabel(e.target.value.slice(0, OFF_DAY_LABEL_MAX));
                      setError("");
                    }}
                    placeholder="e.g. Company holiday"
                    className="w-full rounded-md border border-border bg-surface px-3 py-2 text-[13px] text-foreground outline-none focus:border-accent-line placeholder:text-muted-foreground disabled:opacity-50"
                  />
                </div>
              </div>
              {(error || persistError) && (
                <div className="text-[11px] text-danger">{error || persistError}</div>
              )}
              <button
                type="button"
                disabled={saving}
                onClick={addOffDay}
                className="self-start cursor-pointer rounded-md bg-primary px-3.5 py-2 text-[12px] font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
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
      <ConfirmDeleteDialog
        open={pendingRemoveId != null}
        confirming={!!saving}
        onCancel={() => {
          if (!saving) setPendingRemoveId(null);
        }}
        onConfirm={() => {
          if (!pendingRemoveId) return;
          const id = pendingRemoveId;
          setPendingRemoveId(null);
          onChange(
            offDays.filter((d) => d.id !== id),
            "deleted"
          );
        }}
      />
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
  const { formatDateTime } = useAppDateFormat();
  return (
    <div className="border-b border-border-soft px-4 py-3 last:border-b-0">
      <div className="text-[12px] text-foreground">{a.what}</div>
      <div className="mt-0.5 text-[11px] text-muted-foreground">
        {a.who} · {formatDateTime(a.when)}
      </div>
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
  desc: ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface px-4 py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[13px] font-semibold text-foreground">{title}</div>
          <div className="mt-0.5 text-[12px] leading-snug text-muted-foreground">{desc}</div>
        </div>
        {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
      </div>
      <div className="mt-3.5 flex flex-col gap-3">{children}</div>
    </div>
  );
}

function NumField({
  label,
  value,
  suffix,
  step,
  min,
  max,
  integer,
  required,
  maxIntDigits,
  maxFracDigits,
  onChange,
}: {
  label: string;
  value: number;
  suffix: string;
  step?: number;
  min?: number;
  max?: number;
  /** When true, only whole numbers; empty while editing does not force 0 (avoids "01"). */
  integer?: boolean;
  required?: boolean;
  /** Max digits before decimal (hours format). */
  maxIntDigits?: number;
  /** Max digits after decimal (hours format). */
  maxFracDigits?: number;
  onChange: (v: number) => void;
}) {
  const [text, setText] = useState<string | null>(null);
  const decimalMode = maxIntDigits != null || maxFracDigits != null;
  const intDigits = maxIntDigits ?? 2;
  const fracDigits = maxFracDigits ?? 1;

  const clamp = (n: number) => {
    let next = integer ? Math.trunc(n) : n;
    if (decimalMode && fracDigits >= 0) {
      const factor = 10 ** fracDigits;
      next = Math.round(next * factor) / factor;
    }
    if (min != null) next = Math.max(min, next);
    if (max != null) next = Math.min(max, next);
    return next;
  };

  const formatCommitted = (n: number) => {
    if (integer) return String(Math.trunc(n));
    if (decimalMode) return String(Number(n.toFixed(fracDigits)));
    return String(n);
  };

  const shown = text !== null ? text : formatCommitted(value);

  const commitDraft = (raw: string | null) => {
    setText(null);
    if (raw === null) return;
    if (raw.trim() === "" || raw === "." || !Number.isFinite(Number(raw))) {
      onChange(clamp(min ?? 0));
      return;
    }
    onChange(clamp(Number(raw)));
  };

  return (
    <div>
      <div className="mb-1.5 text-[12px] font-medium text-foreground">
        {label}
        {required ? <span className="text-danger"> *</span> : null}
      </div>
      <div className="flex items-center gap-1.5">
        <input
          type="text"
          inputMode={integer ? "numeric" : "decimal"}
          value={shown}
          onFocus={() => setText(formatCommitted(value))}
          onKeyDown={(e) => {
            if (e.key === "ArrowUp" || e.key === "ArrowDown") {
              e.preventDefault();
              const delta =
                (e.key === "ArrowUp" ? 1 : -1) * (integer ? 1 : step ?? (decimalMode ? 0.1 : 1));
              const base =
                text !== null && text !== "" && Number.isFinite(Number(text)) ? Number(text) : value;
              const next = clamp(base + delta);
              setText(formatCommitted(next));
              onChange(next);
              return;
            }
            if (integer && ["e", "E", "+", "-", ".", ","].includes(e.key)) {
              e.preventDefault();
            }
            if (decimalMode && ["e", "E", "+", "-"].includes(e.key)) {
              e.preventDefault();
            }
          }}
          onChange={(e) => {
            const raw = e.target.value;

            if (integer) {
              if (raw === "") {
                setText("");
                return;
              }
              if (!/^\d+$/.test(raw)) return;
              // Strip leading zeros so clearing "10" then typing "1" never becomes "01".
              const n = parseInt(raw, 10);
              if (!Number.isFinite(n)) return;
              setText(String(n));
              onChange(clamp(n));
              return;
            }

            if (decimalMode) {
              if (raw === "" || raw === ".") {
                setText(raw);
                return;
              }
              const m = raw.match(/^(\d*)(?:\.(\d*))?$/);
              if (!m) return;
              let intPart = m[1] ?? "";
              const fracPart = m[2];
              if (intPart.length > 1) intPart = String(parseInt(intPart, 10));
              if (intPart.length > intDigits) return;
              if (fracPart != null && fracPart.length > fracDigits) return;
              const normalized =
                fracPart != null ? `${intPart}.${fracPart}` : intPart.includes(".") ? intPart : intPart;
              // Preserve trailing decimal while typing (e.g. "8.").
              const display =
                raw.endsWith(".") && fracPart == null ? `${intPart}.` : normalized;
              if (intPart === "" && fracPart == null && !raw.endsWith(".")) return;
              setText(display);
              if (display.endsWith(".") || display === "") return;
              const n = Number(display);
              if (Number.isFinite(n)) onChange(clamp(n));
              return;
            }

            const n = Number(raw);
            if (!Number.isFinite(n)) return;
            onChange(clamp(n));
          }}
          onBlur={() => commitDraft(text)}
          className="w-20 rounded-md border border-border bg-surface px-3 py-1.5 text-[13px] text-foreground outline-none focus:border-accent-line"
        />
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
