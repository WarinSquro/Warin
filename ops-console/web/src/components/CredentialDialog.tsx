import { useCallback, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Eye, EyeOff } from "lucide-react";

export function CredentialDialog({
  open,
  title,
  message,
  submitLabel = "Continue",
  onCancel,
  onSubmit,
}: {
  open: boolean;
  title: string;
  message?: string;
  submitLabel?: string;
  onCancel: () => void;
  /** Throw to keep dialog open and show error. */
  onSubmit: (userId: string, password: string) => void | Promise<void>;
}) {
  const [userId, setUserId] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!open || typeof document === "undefined") return null;

  const canSubmit = userId.trim().length > 0 && password.length > 0 && !busy;

  const submit = async () => {
    if (!canSubmit) {
      setError("Enter User Id and password");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSubmit(userId.trim(), password);
      setUserId("");
      setPassword("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Verification failed");
    } finally {
      setBusy(false);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ops-cred-title"
      onClick={() => {
        if (!busy) onCancel();
      }}
    >
      <div
        className="w-full max-w-md rounded-xl border border-border bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div id="ops-cred-title" className="text-[16px] font-semibold text-brand">
          {title}
        </div>
        {message && <div className="mt-2 text-[13px] text-muted">{message}</div>}

        <div className="mt-4 flex flex-col gap-3">
          <div>
            <label htmlFor="ops-cred-user" className="mb-1 block text-[12px] font-medium">
              User Id
            </label>
            <input
              id="ops-cred-user"
              autoFocus
              autoComplete="username"
              value={userId}
              onChange={(e) => {
                setUserId(e.target.value);
                setError(null);
              }}
              className="h-[42px] w-full rounded-md border border-brand-border/20 bg-white px-3 text-[13px] outline-none focus:border-brand-border focus:ring-2 focus:ring-brand-muted/25"
            />
          </div>
          <div>
            <label htmlFor="ops-cred-pass" className="mb-1 block text-[12px] font-medium">
              Password
            </label>
            <div className="relative">
              <input
                id="ops-cred-pass"
                type={show ? "text" : "password"}
                autoComplete="current-password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void submit();
                }}
                className="h-[42px] w-full rounded-md border border-brand-border/20 bg-white px-3 pr-10 text-[13px] outline-none focus:border-brand-border focus:ring-2 focus:ring-brand-muted/25"
              />
              <button
                type="button"
                className="absolute top-1/2 right-2 -translate-y-1/2 cursor-pointer p-1 text-muted"
                onClick={() => setShow((v) => !v)}
                aria-label={show ? "Hide password" : "Show password"}
              >
                {show ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>
          {error && <div className="text-[12px] text-danger">{error}</div>}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className="btn btn-ghost cursor-pointer" disabled={busy} onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary cursor-pointer"
            disabled={!canSubmit}
            onClick={() => void submit()}
          >
            {busy ? "Verifying…" : submitLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

type CredResult = { userId: string; password: string };

export function useCredentialPrompt() {
  const resolveRef = useRef<((value: CredResult | null) => void) | null>(null);
  const verifyRef = useRef<((userId: string, password: string) => Promise<void>) | null>(null);
  const [open, setOpen] = useState(false);
  const [meta, setMeta] = useState<{ title: string; message?: string; submitLabel?: string }>({
    title: "Confirm credentials",
  });

  const close = useCallback((value: CredResult | null) => {
    const resolve = resolveRef.current;
    resolveRef.current = null;
    verifyRef.current = null;
    setOpen(false);
    resolve?.(value);
  }, []);

  const promptCredentials = useCallback(
    (opts: {
      title: string;
      message?: string;
      submitLabel?: string;
      /** Server-side verify; throw to keep popup open with error. */
      verify?: (userId: string, password: string) => Promise<void>;
    }) =>
      new Promise<CredResult | null>((resolve) => {
        resolveRef.current?.(null);
        resolveRef.current = resolve;
        verifyRef.current = opts.verify ?? null;
        setMeta({ title: opts.title, message: opts.message, submitLabel: opts.submitLabel });
        setOpen(true);
      }),
    [],
  );

  const dialog = (
    <CredentialDialog
      open={open}
      title={meta.title}
      message={meta.message}
      submitLabel={meta.submitLabel}
      onCancel={() => close(null)}
      onSubmit={async (userId, password) => {
        if (verifyRef.current) {
          await verifyRef.current(userId, password);
        }
        close({ userId, password });
      }}
    />
  );

  return { promptCredentials, dialog };
}
