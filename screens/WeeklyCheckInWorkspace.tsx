import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, History } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { WeeklyCheckInEvidencePanel } from "../components/WeeklyCheckInEvidencePanel";
import { WeeklyCheckInCompetencyRating } from "../components/WeeklyCheckInCompetencyRating";
import {
  WeeklyCheckInStatusPicker,
  WeeklyConfidencePicker,
  WeeklyRecognitionPicker,
} from "../components/WeeklyCheckInStatusPicker";
import { WeeklyCheckInWeekPicker } from "../components/WeeklyCheckInWeekPicker";
import { useEmployees } from "../context/EmployeesContext";
import { useMasters } from "../context/MastersContext";
import { useSettings } from "../context/SettingsContext";
import {
  MIN_REMARKS_LENGTH,
  addWeeks,
  formatWeekLabel,
  getCompetenciesForDepartment,
  getCurrentWeekStart,
  getWeeklyCheckInConfig,
  saveWeeklyCheckInConfig,
  validateSubmission,
  type ActionStatus,
  type Recognition,
  type WeeklyCheckInDraft,
  type WeeklyCheckInSubmission,
  type WeeklyConfidence,
  type WeeklyStatus,
} from "../data/weeklyCheckIn";
import { buildLiveWeeklyEvidence, mapApiWeeklySubmission } from "../api/liveViews";
import {
  fetchAllocations,
  fetchConfirmations,
  fetchWeeklyCheckInConfig,
  fetchWeeklySubmission,
  submitWeeklyCheckInApi,
} from "../api/domain";
import { useFocusFirstField } from "../hooks/useFocusFirstField";

export function WeeklyCheckInWorkspace() {
  const { employeeId = "" } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const weekStart = searchParams.get("week") ?? getCurrentWeekStart();
  const navigate = useNavigate();
  const { currentEmployee, isSuperAdmin } = useAuth();
  const { employees, loading: employeesLoading } = useEmployees();
  const { departments } = useMasters();
  const { settings } = useSettings();
  const weekCapacity = Math.round(settings.workingHoursPerDay * settings.workingDays.length) || 40;

  // Route param and Employee.id are both HRMS ids (queue returns hrmsId as employeeId).
  const employee = employees.find((e) => e.id === employeeId);
  const [existing, setExisting] = useState<WeeklyCheckInSubmission | null>(null);
  const [previousSubmission, setPreviousSubmission] = useState<WeeklyCheckInSubmission | null>(null);
  const [evidence, setEvidence] = useState<WeeklyCheckInSubmission["evidence"] | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [configReady, setConfigReady] = useState(false);

  const viewOnly = !!existing;
  const reviewScrollRef = useRef<HTMLDivElement | null>(null);
  const reviewFocusRef = useFocusFirstField<HTMLDivElement>(!loading && !loadError && !!evidence && !viewOnly);

  // Scroll Review panel to top after focus (focus can scroll to bottom when first input is far down)
  useEffect(() => {
    if (loading || loadError || !evidence || viewOnly) return;
    const raf = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        reviewScrollRef.current?.scrollTo(0, 0);
      });
    });
    return () => window.cancelAnimationFrame(raf);
  }, [loading, loadError, evidence, viewOnly]);

  const dept = departments.find((d) => d.name === employee?.department);
  const deptConfigKey = dept ? dept.dbId ?? dept.id : "";
  const allComps = useMemo(
    () => (deptConfigKey && configReady ? getCompetenciesForDepartment(deptConfigKey) : []),
    [deptConfigKey, configReady]
  );
  const techComps = allComps.filter((c) => c.kind === "technical");
  const behComps = allComps.filter((c) => c.kind === "behavioural");

  const [technicalRatings, setTechnicalRatings] = useState<Record<string, number>>({});
  const [behaviouralRatings, setBehaviouralRatings] = useState<Record<string, number>>({});
  const [weeklyStatus, setWeeklyStatus] = useState<WeeklyStatus>("On Track");
  const [confidence, setConfidence] = useState<WeeklyConfidence>("Medium");
  const [roRemarks, setRoRemarks] = useState("");
  const [actionType, setActionType] = useState("None");
  const [actionNotes, setActionNotes] = useState("");
  const [recognition, setRecognition] = useState<Recognition>("None");
  const [previousActionStatus, setPreviousActionStatus] = useState<ActionStatus | undefined>();
  const [errors, setErrors] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [actionTypes, setActionTypes] = useState<string[]>(["None"]);

  const reviewerId = currentEmployee?.id ?? "";
  const isDirectReport =
    !!employee &&
    (isSuperAdmin || employee.resourceOwnerId === reviewerId);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const config = await fetchWeeklyCheckInConfig();
        if (cancelled) return;
        saveWeeklyCheckInConfig({
          competenciesByDepartment: config.competenciesByDepartment as never,
          rankingLevels: config.rankingLevels as never,
          actionTypes: config.actionTypes,
        });
        setActionTypes(config.actionTypes);
        setConfigReady(true);

        const [cur, prev, allocs, confs] = await Promise.all([
          fetchWeeklySubmission(employeeId, weekStart),
          fetchWeeklySubmission(employeeId, addWeeks(weekStart, -1)),
          fetchAllocations({ from: weekStart, to: addWeeks(weekStart, 1) }),
          fetchConfirmations({ from: weekStart, to: addWeeks(weekStart, 1) }),
        ]);
        if (cancelled) return;

        const mapped = cur ? mapApiWeeklySubmission(cur) : null;
        const prevMapped = prev ? mapApiWeeklySubmission(prev) : null;
        setExisting(mapped);
        setPreviousSubmission(prevMapped);

        if (mapped) {
          setTechnicalRatings(mapped.technicalRatings);
          setBehaviouralRatings(mapped.behaviouralRatings);
          setWeeklyStatus(mapped.weeklyStatus);
          setConfidence(mapped.confidence);
          setRoRemarks(mapped.roRemarks);
          setActionType(mapped.actionType);
          setActionNotes(mapped.actionNotes ?? "");
          setRecognition(mapped.recognition);
          setPreviousActionStatus(mapped.previousActionStatus);
          setEvidence(mapped.evidence);
        } else {
          setTechnicalRatings({});
          setBehaviouralRatings({});
          setWeeklyStatus("On Track");
          setConfidence("Medium");
          setRoRemarks("");
          setActionType("None");
          setActionNotes("");
          setRecognition("None");
          setPreviousActionStatus(
            prevMapped?.actionType && prevMapped.actionType !== "None" ? "Completed" : undefined
          );
          setEvidence(
            buildLiveWeeklyEvidence(employeeId, weekStart, allocs, confs, weekCapacity)
          );
        }
      } catch (e) {
        if (!cancelled) {
          setExisting(null);
          setEvidence(null);
          setLoadError(e instanceof Error ? e.message : "Could not load check-in data.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [employeeId, weekStart, weekCapacity]);

  if (!currentEmployee) {
    return (
      <div className="flex flex-1 items-center justify-center text-[13px] text-muted-foreground">
        Sign in to open weekly check-in.
      </div>
    );
  }

  if (employeesLoading && !employee) {
    return (
      <div className="flex flex-1 items-center justify-center text-[13px] text-muted-foreground">
        Loading employee…
      </div>
    );
  }

  if (!employee) {
    return (
      <div className="flex flex-1 items-center justify-center text-[13px] text-muted-foreground">
        Employee not found.
      </div>
    );
  }

  if (!isDirectReport && !viewOnly) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 text-[13px] text-muted-foreground">
        <p>You can only review direct reports (Resource Owner).</p>
        <Link to="/my-team/weekly-check-in" className="text-primary hover:underline">
          Back to queue
        </Link>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center text-[13px] text-muted-foreground">
        Loading check-in…
      </div>
    );
  }

  if (loadError || !evidence) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 text-[13px] text-muted-foreground">
        <p>{loadError ?? "Could not load check-in data."}</p>
        <Link to="/my-team/weekly-check-in" className="text-primary hover:underline">
          Back to queue
        </Link>
      </div>
    );
  }

  const handleSubmit = async () => {
    setSubmitting(true);
    setErrors([]);
    const draft: WeeklyCheckInDraft = {
      employeeId,
      resourceOwnerId: reviewerId,
      weekStart,
      technicalRatings,
      behaviouralRatings,
      weeklyStatus,
      confidence,
      roRemarks,
      actionType,
      actionNotes,
      previousActionStatus:
        previousActionStatus ??
        (previousSubmission?.actionType !== "None" ? "Completed" : undefined),
      recognition,
    };
    const validation = validateSubmission(draft, existing ?? undefined, deptConfigKey);
    if (!validation.valid) {
      setErrors(validation.errors);
      setSubmitting(false);
      return;
    }
    try {
      await submitWeeklyCheckInApi({
        employeeHrmsId: employeeId,
        weekStart,
        evidence,
        technicalRatings,
        behaviouralRatings,
        weeklyStatus,
        confidence,
        roRemarks,
        actionType,
        actionNotes: actionType !== "None" ? actionNotes : undefined,
        previousActionStatus: draft.previousActionStatus,
        recognition,
      });
      navigate(`/my-team/weekly-check-in?week=${weekStart}`);
    } catch (e) {
      setErrors([e instanceof Error ? e.message : "Submission failed."]);
    } finally {
      setSubmitting(false);
    }
  };

  const setWeek = (w: string) => setSearchParams({ week: w });

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-surface">
      <header className="flex h-14 flex-shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border bg-surface px-5">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate(`/my-team/weekly-check-in?week=${weekStart}`)}
            className="rounded-md p-1 text-muted-foreground hover:bg-surface-alt"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <div className="text-[15px] font-semibold text-foreground">{employee.name}</div>
            <div className="text-[12px] text-muted-foreground">
              {formatWeekLabel(weekStart)} · {employee.department}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <WeeklyCheckInWeekPicker weekStart={weekStart} onChange={setWeek} />
          <Link
            to={`/my-team/weekly-check-in/${employeeId}/history`}
            className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-[11px] text-foreground hover:bg-surface-alt"
          >
            <History className="h-3.5 w-3.5" />
            History
          </Link>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background p-5">
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-hidden lg:grid-cols-2">
          <section className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-surface shadow-sm">
            <h2 className="flex-shrink-0 border-b border-border-soft px-4 py-3 text-[12px] font-medium text-muted-foreground">
              Evidence
            </h2>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
              <WeeklyCheckInEvidencePanel
                evidence={evidence}
                previousSubmission={previousSubmission ?? undefined}
                frozen={viewOnly}
                previousActionStatus={previousActionStatus}
                onPreviousActionStatusChange={viewOnly ? undefined : setPreviousActionStatus}
                viewOnly={viewOnly}
              />
            </div>
          </section>

          <section className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-surface shadow-sm">
            <h2 className="flex-shrink-0 border-b border-border-soft px-4 py-3 text-[12px] font-medium text-muted-foreground">
              Review
            </h2>
            <div ref={(el) => { reviewFocusRef.current = el; reviewScrollRef.current = el; }} className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-4">
              {techComps.length === 0 && behComps.length === 0 ? (
                <div className="rounded-md border border-warning-border bg-warning-soft px-3 py-2 text-[12px] text-warning">
                  Competencies not configured for {employee.department}. Set them in Weekly Check-In
                  Config.
                </div>
              ) : (
                <WeeklyCheckInCompetencyRating
                  groups={[
                    {
                      title: "Technical",
                      competencies: techComps,
                      ratings: technicalRatings,
                      onChange: (id, value) =>
                        setTechnicalRatings((prev) => ({ ...prev, [id]: value })),
                    },
                    {
                      title: "Behavioural",
                      competencies: behComps,
                      ratings: behaviouralRatings,
                      onChange: (id, value) =>
                        setBehaviouralRatings((prev) => ({ ...prev, [id]: value })),
                    },
                  ]}
                  rankingLevels={getWeeklyCheckInConfig().rankingLevels}
                  disabled={viewOnly}
                />
              )}

              <div className="space-y-3">
                <WeeklyCheckInStatusPicker
                  value={weeklyStatus}
                  onChange={setWeeklyStatus}
                  disabled={viewOnly}
                />
                <WeeklyConfidencePicker
                  value={confidence}
                  onChange={setConfidence}
                  disabled={viewOnly}
                />
                <WeeklyRecognitionPicker
                  value={recognition}
                  onChange={setRecognition}
                  disabled={viewOnly}
                />
              </div>

              <div>
                <label className="mb-1 block text-[11px] font-medium text-muted">
                  RO remarks <span className="text-danger">*</span>
                  <span className="ml-1 font-normal text-muted-foreground">
                    (min {MIN_REMARKS_LENGTH})
                  </span>
                </label>
                <textarea
                  value={roRemarks}
                  disabled={viewOnly}
                  onChange={(e) => setRoRemarks(e.target.value)}
                  rows={4}
                  className="w-full rounded-md border border-border bg-surface px-3 py-2 text-[12px] text-foreground outline-none focus:border-accent-line disabled:bg-surface-alt"
                />
                <div className="mt-1 text-[10px] text-muted-foreground">{roRemarks.trim().length} chars</div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-muted">Action type</label>
                  <select
                    value={actionType}
                    disabled={viewOnly}
                    onChange={(e) => setActionType(e.target.value)}
                    className="w-full rounded-md border border-border bg-surface px-2.5 py-2 text-[12px] text-foreground outline-none focus:border-accent-line disabled:bg-surface-alt"
                  >
                    {actionTypes.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
                {actionType !== "None" && (
                  <div className="col-span-2">
                    <label className="mb-1 block text-[11px] font-medium text-muted">
                      Action notes (min {MIN_REMARKS_LENGTH})
                    </label>
                    <textarea
                      value={actionNotes}
                      disabled={viewOnly}
                      onChange={(e) => setActionNotes(e.target.value)}
                      rows={3}
                      className="w-full rounded-md border border-border bg-surface px-3 py-2 text-[12px] text-foreground outline-none focus:border-accent-line disabled:bg-surface-alt"
                    />
                  </div>
                )}
              </div>

              {errors.length > 0 && (
                <div className="rounded-md border border-danger-border bg-danger-soft px-3 py-2 text-[12px] text-danger">
                  {errors.map((e) => (
                    <div key={e}>{e}</div>
                  ))}
                </div>
              )}

              {!viewOnly && (
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => void handleSubmit()}
                  className="w-full rounded-md bg-primary py-2.5 text-[13px] font-semibold text-primary-foreground disabled:opacity-50"
                >
                  {submitting ? "Submitting…" : "Submit weekly check-in"}
                </button>
              )}
              {viewOnly && (
                <div className="rounded-md border border-success-border bg-success-soft px-3 py-2 text-center text-[12px] text-success">
                  Submitted {new Date(existing!.submittedAt).toLocaleString()}
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
