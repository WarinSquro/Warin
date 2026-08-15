import { MonitorSmartphone } from "lucide-react";
import { useEffect, useRef } from "react";
import { useAppDateFormat } from "../hooks/useAppDateFormat";
import type { ExistingSessionInfo } from "../api/client";

/**
 * Confirm replacing an existing active login session (single-session policy).
 */
export function SessionConflictDialog({
  open,
  existingSession,
  continuing = false,
  onContinue,
  onCancel,
}: {
  open: boolean;
  existingSession: ExistingSessionInfo | null;
  continuing?: boolean;
  onContinue: () => void;
  onCancel: () => void;
}) {
  const { formatDateTime } = useAppDateFormat();
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const raf = window.requestAnimationFrame(() => cancelRef.current?.focus());
    return () => window.cancelAnimationFrame(raf);
  }, [open]);

  if (!open) return null;

  const rows: { label: string; value: string }[] = [];
  if (existingSession?.deviceName) rows.push({ label: "Device", value: existingSession.deviceName });
  if (existingSession?.browser) rows.push({ label: "Browser", value: existingSession.browser });
  if (existingSession?.loginAt) {
    rows.push({ label: "Login", value: formatDateTime(existingSession.loginAt) });
  }
  if (existingSession?.lastActivityAt) {
    rows.push({ label: "Last activity", value: formatDateTime(existingSession.lastActivityAt) });
  }
  if (existingSession?.ipAddress) {
    rows.push({ label: "IP address", value: existingSession.ipAddress });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
      <div className="absolute inset-0 bg-brand/50" onClick={onCancel} aria-hidden />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="session-conflict-title"
        aria-describedby="session-conflict-desc"
        className="relative z-10 w-full max-w-[420px] rounded-xl bg-surface p-5 text-left shadow-2xl"
      >
        <div className="flex justify-center">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-warning-soft">
            <MonitorSmartphone className="h-5 w-5 text-warning" />
          </div>
        </div>
        <div id="session-conflict-title" className="mt-3 text-center text-[15px] font-semibold text-foreground">
          Already signed in elsewhere
        </div>
        <div id="session-conflict-desc" className="mt-1.5 text-center text-[13px] text-muted-foreground">
          You are already logged in on another device or browser. Do you want to continue on this device?
          Continuing will log you out from all other active sessions.
        </div>

        {rows.length > 0 && (
          <dl className="mt-4 space-y-1.5 rounded-md border border-border-soft bg-surface-alt px-3 py-2.5 text-[12px]">
            {rows.map((r) => (
              <div key={r.label} className="flex justify-between gap-3">
                <dt className="text-muted-foreground">{r.label}</dt>
                <dd className="min-w-0 truncate text-right font-medium text-foreground" title={r.value}>
                  {r.value}
                </dd>
              </div>
            ))}
          </dl>
        )}

        <div className="mt-5 flex gap-2">
          <button
            ref={cancelRef}
            type="button"
            autoFocus
            onClick={onCancel}
            disabled={continuing}
            className="flex-1 cursor-pointer rounded-md border border-border py-2 text-[13px] text-foreground hover:bg-surface-alt disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onContinue}
            disabled={continuing}
            className="flex-1 cursor-pointer rounded-md bg-primary py-2 text-[13px] font-medium text-primary-foreground hover:bg-brand-active disabled:opacity-60"
          >
            {continuing ? "Continuing…" : "Yes, Continue"}
          </button>
        </div>
      </div>
    </div>
  );
}
