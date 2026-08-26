import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, X } from "lucide-react";
import { TruncateText } from "../components/TruncateText";
import { useToast } from "../context/ToastContext";
import {
  actOnDecisionPoint,
  fetchDecisionPointDetail,
  fetchDecisionPointRaiseOptions,
  fetchDecisionPointSummary,
  fetchDecisionPointsMine,
  fetchDecisionPointsRequiringAction,
  raiseDecisionPoint,
  type DecisionPointActionType,
  type DecisionPointDetail,
  type DecisionPointListRow,
  type DecisionPointRaiseOptions,
  type DecisionPointStatus,
} from "../api/domain";

type Tab = "requiring" | "mine";

const STATUS_LABEL: Record<DecisionPointStatus, string> = {
  pending_ro_action: "Pending RO Action",
  escalated_pending_next_ro: "Escalated – Pending Next RO",
  acknowledged_closed: "Acknowledged & Closed",
  approved_closed: "Approved & Closed",
  rejected_closed: "Rejected & Closed",
  self_resolved_closed: "Self-Resolved & Closed",
};

const ACTION_LABEL: Record<DecisionPointActionType, string> = {
  raised: "Raised",
  acknowledged_close: "Acknowledge & Close",
  approved_close: "Approve & Close",
  rejected_close: "Reject & Close",
  recommend_escalate: "Recommend & Escalate",
  self_resolved: "Self-Resolved",
};

function statusBadgeClass(status: DecisionPointStatus): string {
  if (status === "pending_ro_action" || status === "escalated_pending_next_ro") {
    return "border-warning-border bg-warning-soft text-warning";
  }
  if (status === "approved_closed" || status === "acknowledged_closed") {
    return "border-success-border bg-success-soft text-success-fg";
  }
  if (status === "rejected_closed") {
    return "border-danger-border bg-danger-soft text-danger";
  }
  return "border-border bg-surface-alt text-muted";
}

function StatusBadge({ status }: { status: DecisionPointStatus }) {
  return (
    <span
      className={`inline-flex max-w-full truncate rounded-sm border px-1.5 py-0.5 text-[10px] font-semibold ${statusBadgeClass(status)}`}
      title={STATUS_LABEL[status]}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

function formatShortDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso.length <= 10 ? `${iso}T00:00:00` : iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function DecisionPoints() {
  const [tab, setTab] = useState<Tab>("requiring");
  const [mine, setMine] = useState<DecisionPointListRow[]>([]);
  const [requiring, setRequiring] = useState<DecisionPointListRow[]>([]);
  const [counts, setCounts] = useState({ mine: 0, requiring: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [raiseOpen, setRaiseOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [summary, mineRows, reqRows] = await Promise.all([
        fetchDecisionPointSummary(),
        fetchDecisionPointsMine(),
        fetchDecisionPointsRequiringAction(),
      ]);
      setCounts(summary);
      setMine(mineRows);
      setRequiring(reqRows);
      if (summary.requiring === 0 && summary.mine > 0 && tab === "requiring") {
        // keep tab; empty state is fine
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load Decision Points");
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const rows = tab === "requiring" ? requiring : mine;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <header className="flex h-14 flex-shrink-0 items-center justify-between border-b border-border bg-surface px-5">
        <div>
          <div className="text-[15px] font-semibold tracking-tight text-foreground">Decision Points</div>
          <div className="text-[12px] text-muted-foreground">
            My Team · formal points through the Resource Owner hierarchy
          </div>
        </div>
        <button
          type="button"
          onClick={() => setRaiseOpen(true)}
          className="flex cursor-pointer items-center gap-1.5 rounded-md bg-brand px-3.5 py-1.5 text-[12px] font-medium text-white hover:opacity-95"
        >
          <Plus className="h-3.5 w-3.5" /> Raise Point
        </button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden bg-background p-5">
        {error && <div className="flex-shrink-0 text-[12px] text-danger">{error}</div>}

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border bg-surface">
          <div className="flex flex-shrink-0 items-center gap-1 border-b border-border-soft px-4 py-2.5">
            <div className="flex overflow-hidden rounded-md border border-border text-[12px]">
              {(
                [
                  ["requiring", `Requiring my action ${counts.requiring}`],
                  ["mine", `Raised by me ${counts.mine}`],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setTab(id)}
                  className={`cursor-pointer px-3.5 py-1.5 ${
                    tab === id ? "bg-brand font-medium text-white" : "text-muted hover:bg-surface-alt"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-auto">
            {loading ? (
              <div className="px-4 py-10 text-center text-[12px] text-muted-foreground">Loading…</div>
            ) : rows.length === 0 ? (
              <div className="px-4 py-10 text-center text-[12px] text-muted-foreground">
                {tab === "requiring" ? "No points requiring your action." : "You have not raised any points."}
              </div>
            ) : tab === "requiring" ? (
              <table className="w-full min-w-[960px] border-separate border-spacing-0 text-left text-[12px]">
                <thead>
                  <tr className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                    {[
                      "Point ID",
                      "Raised",
                      "Raised By",
                      "Type",
                      "Subject",
                      "Work / Project",
                      "Previous RO",
                      "Level",
                      "Pending Since",
                    ].map((h) => (
                      <th
                        key={h}
                        className="sticky top-0 z-10 border-b border-border-soft bg-surface-alt px-3 py-2.5 font-semibold"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr
                      key={r.id}
                      onClick={() => setDetailId(r.id)}
                      className="cursor-pointer hover:bg-surface-alt/60"
                    >
                      <td className="border-b border-border-soft px-3 py-2.5 font-semibold text-foreground">
                        {r.pointCode}
                      </td>
                      <td className="border-b border-border-soft px-3 py-2.5 text-muted-foreground">
                        {formatShortDate(r.raisedDate)}
                      </td>
                      <td className="border-b border-border-soft px-3 py-2.5">{r.raisedByName ?? "—"}</td>
                      <td className="border-b border-border-soft px-3 py-2.5">{r.typeName}</td>
                      <td className="max-w-[220px] border-b border-border-soft px-3 py-2.5">
                        <TruncateText text={r.subject} className="block truncate" />
                      </td>
                      <td className="max-w-[180px] border-b border-border-soft px-3 py-2.5 text-muted-foreground">
                        <TruncateText text={r.workReference ?? "—"} className="block truncate" />
                      </td>
                      <td className="border-b border-border-soft px-3 py-2.5 text-muted-foreground">
                        {r.previousOwnerName ?? "—"}
                      </td>
                      <td className="border-b border-border-soft px-3 py-2.5">
                        <span className="rounded-sm bg-surface-alt px-1.5 py-0.5 text-[10px] font-semibold text-muted">
                          L{r.escalationLevel || 1}
                        </span>
                      </td>
                      <td className="border-b border-border-soft px-3 py-2.5 text-muted-foreground">
                        {formatShortDate(r.pendingSince)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <table className="w-full min-w-[960px] border-separate border-spacing-0 text-left text-[12px]">
                <thead>
                  <tr className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                    {[
                      "Point ID",
                      "Date",
                      "Type",
                      "Subject",
                      "Work Reference",
                      "Current With",
                      "Status",
                      "Last Action",
                      "Final Decision By",
                    ].map((h) => (
                      <th
                        key={h}
                        className="sticky top-0 z-10 border-b border-border-soft bg-surface-alt px-3 py-2.5 font-semibold"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr
                      key={r.id}
                      onClick={() => setDetailId(r.id)}
                      className="cursor-pointer hover:bg-surface-alt/60"
                    >
                      <td className="border-b border-border-soft px-3 py-2.5 font-semibold text-foreground">
                        {r.pointCode}
                      </td>
                      <td className="border-b border-border-soft px-3 py-2.5 text-muted-foreground">
                        {formatShortDate(r.raisedDate)}
                      </td>
                      <td className="border-b border-border-soft px-3 py-2.5">{r.typeName}</td>
                      <td className="max-w-[220px] border-b border-border-soft px-3 py-2.5">
                        <TruncateText text={r.subject} className="block truncate" />
                      </td>
                      <td className="max-w-[180px] border-b border-border-soft px-3 py-2.5 text-muted-foreground">
                        <TruncateText text={r.workReference ?? "—"} className="block truncate" />
                      </td>
                      <td className="border-b border-border-soft px-3 py-2.5">
                        {r.currentWithName ?? "—"}
                      </td>
                      <td className="border-b border-border-soft px-3 py-2.5">
                        <StatusBadge status={r.status} />
                      </td>
                      <td className="border-b border-border-soft px-3 py-2.5 text-muted-foreground">
                        {formatShortDate(r.lastActionDate)}
                      </td>
                      <td className="border-b border-border-soft px-3 py-2.5">
                        {r.finalDecisionByName ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {raiseOpen && (
        <RaisePointDrawer
          onClose={() => setRaiseOpen(false)}
          onCreated={async () => {
            setRaiseOpen(false);
            await reload();
            setTab("mine");
          }}
        />
      )}
      {detailId && (
        <PointDetailDrawer
          id={detailId}
          onClose={() => setDetailId(null)}
          onChanged={async () => {
            await reload();
          }}
        />
      )}
    </div>
  );
}

function RaisePointDrawer({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => Promise<void>;
}) {
  const toast = useToast();
  const [opts, setOpts] = useState<DecisionPointRaiseOptions | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [typeId, setTypeId] = useState("");
  const [subject, setSubject] = useState("");
  const [remarks, setRemarks] = useState("");
  const [allocationId, setAllocationId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void fetchDecisionPointRaiseOptions()
      .then((o) => {
        if (cancelled) return;
        setOpts(o);
        if (o.types[0]) setTypeId(o.types[0].id);
      })
      .catch((e) => toast.error(e instanceof Error ? e.message : "Failed to load raise options"))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [toast]);

  const selectedType = useMemo(
    () => opts?.types.find((t) => t.id === typeId) ?? null,
    [opts, typeId]
  );
  const allocationRequired = selectedType?.allocationRequirement === "required";

  useEffect(() => {
    if (!allocationRequired) return;
    if (allocationId) return;
    const first = opts?.allocations[0]?.id;
    if (first) setAllocationId(first);
  }, [allocationRequired, allocationId, opts]);

  const canSubmit =
    !!typeId &&
    subject.trim().length > 0 &&
    remarks.trim().length > 0 &&
    (!allocationRequired || !!allocationId) &&
    !!opts?.hasResourceOwner;

  const submit = async () => {
    if (!canSubmit || saving) return;
    setSaving(true);
    try {
      await raiseDecisionPoint({
        typeId,
        subject: subject.trim(),
        remarks: remarks.trim(),
        allocationId: allocationId,
      });
      toast.created();
      await onCreated();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to raise Point");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40">
      <div onClick={() => !saving && onClose()} className="absolute inset-0 bg-brand/30" aria-hidden />
      <div className="absolute right-0 top-0 flex h-full w-[440px] flex-col bg-surface shadow-2xl">
        <div className="flex flex-shrink-0 items-center justify-between border-b border-border-soft px-5 py-4">
          <div className="text-[15px] font-semibold text-foreground">Raise Point</div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="cursor-pointer text-muted-foreground hover:text-foreground disabled:opacity-40"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 py-4">
          {loading || !opts ? (
            <div className="text-[12px] text-muted-foreground">Loading…</div>
          ) : (
            <>
              {!opts.hasResourceOwner && (
                <div className="rounded-md border border-warning-border bg-warning-soft px-3 py-2 text-[12px] text-warning">
                  You have no Resource Owner assigned. A Point cannot be raised.
                </div>
              )}
              <div>
                <div className="mb-1.5 text-[12px] font-medium text-foreground">
                  Point Type <span className="text-danger">*</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {opts.types.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      disabled={saving}
                      onClick={() => {
                        setTypeId(t.id);
                        if (t.allocationRequirement !== "required") setAllocationId(null);
                      }}
                      className={`cursor-pointer rounded-md border px-2.5 py-1.5 text-[12px] disabled:opacity-50 ${
                        typeId === t.id
                          ? "border-brand bg-brand font-medium text-white"
                          : "border-border bg-surface text-foreground hover:bg-surface-alt"
                      }`}
                    >
                      {t.name}
                    </button>
                  ))}
                </div>
                {selectedType?.description && (
                  <div className="mt-1.5 text-[11px] text-muted-foreground">{selectedType.description}</div>
                )}
              </div>
              <div>
                <div className="mb-1.5 text-[12px] font-medium text-foreground">
                  Subject / Point Title <span className="text-danger">*</span>
                </div>
                <input
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  disabled={saving}
                  maxLength={200}
                  placeholder="Short title for the point"
                  className="w-full rounded-md border border-border bg-surface px-3 py-2 text-[13px] outline-none focus:border-accent-line disabled:opacity-60"
                />
              </div>
              <div>
                <div className="mb-1.5 text-[12px] font-medium text-foreground">
                  Remarks / Comments <span className="text-danger">*</span>
                </div>
                <textarea
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  disabled={saving}
                  rows={4}
                  placeholder="State the point clearly for the record…"
                  className="w-full resize-y rounded-md border border-border bg-surface px-3 py-2 text-[13px] outline-none focus:border-accent-line disabled:opacity-60"
                />
              </div>
              <div>
                <div className="mb-1.5 flex items-center gap-2 text-[12px] font-medium text-foreground">
                  Work Allocation
                  {allocationRequired && (
                    <span className="rounded-sm bg-warning-soft px-1.5 py-0.5 text-[10px] font-semibold text-warning">
                      Required for {selectedType?.name}
                    </span>
                  )}
                  {!allocationRequired && <span className="text-[11px] font-normal text-muted-foreground">optional</span>}
                </div>
                <div className="flex flex-col gap-1.5">
                  {!allocationRequired && (
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => setAllocationId(null)}
                      className={`cursor-pointer rounded-md border px-3 py-2 text-left text-[12px] ${
                        allocationId == null
                          ? "border-brand bg-surface"
                          : "border-border hover:bg-surface-alt"
                      }`}
                    >
                      None — not linked to an allocation
                    </button>
                  )}
                  {opts.allocations.length === 0 ? (
                    <div className="rounded-md border border-border-soft bg-surface-alt px-3 py-2 text-[12px] text-muted-foreground">
                      No active allocations for planning today.
                    </div>
                  ) : (
                    opts.allocations.map((a) => (
                      <button
                        key={a.id}
                        type="button"
                        disabled={saving}
                        onClick={() => setAllocationId(a.id)}
                        className={`flex cursor-pointer items-center justify-between gap-2 rounded-md border px-3 py-2 text-left text-[12px] ${
                          allocationId === a.id
                            ? "border-brand bg-surface"
                            : "border-border hover:bg-surface-alt"
                        }`}
                      >
                        <span className="min-w-0 truncate">{a.label}</span>
                        <span className="shrink-0 rounded-sm bg-surface-alt px-1.5 py-0.5 text-[10px] font-semibold text-muted">
                          Active
                        </span>
                      </button>
                    ))
                  )}
                </div>
              </div>
            </>
          )}
        </div>
        <div className="flex flex-shrink-0 gap-2 border-t border-border-soft px-5 py-3.5">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="flex-1 cursor-pointer rounded-md border border-border py-2 text-[13px] text-foreground hover:bg-surface-alt disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={!canSubmit || saving}
            className="flex-1 cursor-pointer rounded-md bg-brand py-2 text-[13px] font-medium text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            {saving ? "Submitting…" : "Submit Point"}
          </button>
        </div>
      </div>
    </div>
  );
}

function PointDetailDrawer({
  id,
  onClose,
  onChanged,
}: {
  id: string;
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const toast = useToast();
  const [detail, setDetail] = useState<DecisionPointDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [remarks, setRemarks] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setDetail(await fetchDecisionPointDetail(id));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load Point");
      onClose();
    } finally {
      setLoading(false);
    }
  }, [id, onClose, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const runAction = async (action: DecisionPointActionType) => {
    if (!remarks.trim() || saving) return;
    setSaving(true);
    try {
      await actOnDecisionPoint(id, { action, remarks: remarks.trim() });
      toast.updated();
      await onChanged();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Action failed");
    } finally {
      setSaving(false);
    }
  };

  const p = detail?.permissions;
  const showActions = !!p && (p.canActAsRo || p.canSelfResolve);

  return (
    <div className="fixed inset-0 z-40">
      <div onClick={() => !saving && onClose()} className="absolute inset-0 bg-brand/30" aria-hidden />
      <div className="absolute right-0 top-0 flex h-full w-[440px] flex-col bg-surface shadow-2xl">
        <div className="flex flex-shrink-0 items-start justify-between gap-3 border-b border-border-soft px-5 py-4">
          <div className="min-w-0">
            <div className="text-[15px] font-semibold text-foreground">
              {detail?.pointCode ?? "…"}
            </div>
            <div className="mt-0.5 text-[12px] text-muted-foreground">
              <TruncateText text={detail?.subject ?? ""} className="block truncate" />
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {detail && (
              <span className="rounded-sm bg-surface-alt px-1.5 py-0.5 text-[10px] font-semibold text-muted">
                L{detail.escalationLevel || 1}
              </span>
            )}
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="cursor-pointer text-muted-foreground hover:text-foreground disabled:opacity-40"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 py-4">
          {loading || !detail ? (
            <div className="text-[12px] text-muted-foreground">Loading…</div>
          ) : (
            <>
              <section className="rounded-md border border-border-soft p-3">
                <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted">Point</div>
                <dl className="grid grid-cols-[100px_1fr] gap-y-1.5 text-[12px]">
                  <dt className="text-muted-foreground">Type</dt>
                  <dd>{detail.type.name}</dd>
                  <dt className="text-muted-foreground">Raised By</dt>
                  <dd>{detail.raisedBy.name}</dd>
                  <dt className="text-muted-foreground">Raised On</dt>
                  <dd>{formatShortDate(detail.raisedDate)}</dd>
                  <dt className="text-muted-foreground">Status</dt>
                  <dd>
                    <StatusBadge status={detail.status} />
                  </dd>
                  <dt className="text-muted-foreground">Description</dt>
                  <dd className="whitespace-pre-wrap text-foreground">{detail.remarks}</dd>
                </dl>
              </section>

              {detail.workContext && (
                <section className="rounded-md border border-border-soft p-3">
                  <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted">
                    Work Context
                  </div>
                  <dl className="grid grid-cols-[100px_1fr] gap-y-1.5 text-[12px]">
                    <dt className="text-muted-foreground">Project</dt>
                    <dd>{detail.workContext.projectName}</dd>
                    <dt className="text-muted-foreground">Activity</dt>
                    <dd>{detail.workContext.activityName}</dd>
                    <dt className="text-muted-foreground">Planned hours</dt>
                    <dd>{detail.workContext.plannedHours}h</dd>
                    <dt className="text-muted-foreground">Resource</dt>
                    <dd>{detail.workContext.resourceName}</dd>
                  </dl>
                </section>
              )}

              <section className="rounded-md border border-border-soft p-3">
                <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted">
                  Decision Trail
                </div>
                <div className="flex flex-col gap-2">
                  {detail.trail.map((a, idx) => (
                    <div key={a.id}>
                      {idx > 0 && (
                        <div className="mb-1 text-center text-[11px] text-muted-foreground">↓</div>
                      )}
                      <div className="rounded-md bg-surface-alt/60 px-2.5 py-2">
                        <div className="flex flex-wrap items-baseline justify-between gap-1 text-[12px]">
                          <span className="font-medium text-foreground">
                            {ACTION_LABEL[a.actionType]} · {a.performedByName}
                          </span>
                          <span className="text-[11px] text-muted-foreground">
                            {formatShortDate(a.createdAt)}
                            {a.nextOwnerName ? ` → ${a.nextOwnerName}` : ""}
                          </span>
                        </div>
                        <div className="mt-1 whitespace-pre-wrap text-[12px] text-muted-foreground">
                          {a.remarks}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              {showActions && (
                <section className="flex flex-col gap-3">
                  <div>
                    <div className="mb-1.5 text-[12px] font-medium text-foreground">
                      Remarks / Comments <span className="text-danger">*</span>
                    </div>
                    <textarea
                      value={remarks}
                      onChange={(e) => setRemarks(e.target.value)}
                      disabled={saving}
                      rows={3}
                      placeholder="Record your rationale before taking an action…"
                      className="w-full resize-y rounded-md border border-border bg-surface px-3 py-2 text-[13px] outline-none focus:border-accent-line disabled:opacity-60"
                    />
                  </div>
                  {p?.canActAsRo && (
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        disabled={saving || !remarks.trim()}
                        onClick={() => void runAction("acknowledged_close")}
                        className="cursor-pointer rounded-md border border-border bg-surface px-2 py-2 text-[12px] font-medium text-foreground hover:bg-surface-alt disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Acknowledge & Close
                      </button>
                      <button
                        type="button"
                        disabled={saving || !remarks.trim()}
                        onClick={() => void runAction("approved_close")}
                        className="cursor-pointer rounded-md bg-brand px-2 py-2 text-[12px] font-medium text-white disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Approve & Close
                      </button>
                      <button
                        type="button"
                        disabled={saving || !remarks.trim()}
                        onClick={() => void runAction("rejected_close")}
                        className="cursor-pointer rounded-md border border-danger-border bg-danger-soft px-2 py-2 text-[12px] font-medium text-danger disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Reject & Close
                      </button>
                      <button
                        type="button"
                        disabled={saving || !remarks.trim() || !p.canEscalate}
                        title={
                          p.canEscalate
                            ? undefined
                            : "You are at the top of the hierarchy. Escalate is unavailable."
                        }
                        onClick={() => void runAction("recommend_escalate")}
                        className="cursor-pointer rounded-md border border-border bg-surface px-2 py-2 text-[12px] font-medium text-foreground hover:bg-surface-alt disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Recommend & Escalate
                      </button>
                    </div>
                  )}
                  {p?.canActAsRo && !p.canEscalate && (
                    <div className="text-[11px] text-muted-foreground">
                      You are at the top of the hierarchy. Escalate is unavailable — close with
                      Acknowledge, Approve, or Reject.
                    </div>
                  )}
                  {p?.canSelfResolve && (
                    <button
                      type="button"
                      disabled={saving || !remarks.trim()}
                      onClick={() => void runAction("self_resolved")}
                      className="w-full cursor-pointer rounded-md border border-border bg-surface py-2 text-[12px] font-medium text-foreground hover:bg-surface-alt disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Self-Resolve & Close
                    </button>
                  )}
                </section>
              )}
            </>
          )}
        </div>

        <div className="flex flex-shrink-0 border-t border-border-soft px-5 py-3.5">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="w-full cursor-pointer rounded-md border border-border py-2 text-[13px] text-foreground hover:bg-surface-alt disabled:opacity-40"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
