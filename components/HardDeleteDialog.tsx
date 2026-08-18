import { useEffect, useRef, useState } from "react";
import { Trash2, Eye, EyeOff } from "lucide-react";
import { useFocusFirstField } from "../hooks/useFocusFirstField";
import { credentialsEmailMatches } from "../utils/hardDeleteCredentials";

export function HardDeleteButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="cursor-pointer text-[11px] text-danger hover:underline"
    >
      Hard Delete
    </button>
  );
}

export function HardDeleteDialog({
  open,
  recordName,
  entityLabel,
  confirming = false,
  error,
  expectedEmail,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  recordName: string;
  entityLabel: string;
  confirming?: boolean;
  error?: string | null;
  expectedEmail?: string | null;
  onCancel: () => void;
  onConfirm: (email: string, pin: string) => void;
}) {
  const [email, setEmail] = useState("");
  const [pin, setPin] = useState<string[]>(["", "", "", "", ""]);
  const [showPin, setShowPin] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const pinRefs = useRef<(HTMLInputElement | null)[]>([]);
  const focusRef = useFocusFirstField<HTMLDivElement>(open);

  useEffect(() => {
    if (!open) return;
    setEmail("");
    setPin(["", "", "", "", ""]);
    setShowPin(false);
    setLocalError(null);
  }, [open]);

  if (!open) return null;

  const pinComplete = pin.every((d) => d !== "");
  const canSubmit = email.includes("@") && pinComplete && !confirming;

  const setDigit = (i: number, v: string) => {
    if (!/^\d?$/.test(v)) return;
    setLocalError(null);
    const next = [...pin];
    next[i] = v;
    setPin(next);
    if (v && i < 4) pinRefs.current[i + 1]?.focus();
  };

  const onPinKey = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !pin[i] && i > 0) pinRefs.current[i - 1]?.focus();
  };

  const submit = () => {
    if (!canSubmit) {
      setLocalError("Enter your work email and 5-digit PIN.");
      return;
    }
    const emailNorm = email.trim().toLowerCase();
    if (expectedEmail && !credentialsEmailMatches(expectedEmail, emailNorm)) {
      setLocalError("Invalid login credentials");
      return;
    }
    onConfirm(emailNorm, pin.join(""));
  };

  const message = error ?? localError;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
      <div className="absolute inset-0 bg-brand/50" onClick={confirming ? undefined : onCancel} aria-hidden />
      <div
        ref={focusRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="hard-delete-title"
        aria-describedby="hard-delete-desc"
        className="relative z-10 w-full max-w-[400px] rounded-xl bg-surface p-5 shadow-2xl"
      >
        <div className="flex justify-center">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-danger-soft">
            <Trash2 className="h-5 w-5 text-danger" />
          </div>
        </div>
        <div id="hard-delete-title" className="mt-3 text-center text-[15px] font-semibold text-foreground">
          Hard Delete {entityLabel}
        </div>
        <div id="hard-delete-desc" className="mt-1.5 text-center text-[13px] text-muted-foreground">
          Permanently delete <span className="font-medium text-foreground">{recordName}</span> and
          related records from the database. This cannot be undone. Re-enter your admin login to
          continue.
        </div>

        <div className="mt-4 flex flex-col gap-3">
          <div>
            <label htmlFor="hard-delete-email" className="mb-1.5 block text-[12px] font-medium text-foreground">
              Work email
            </label>
            <input
              id="hard-delete-email"
              type="email"
              autoComplete="off"
              value={email}
              disabled={confirming}
              onChange={(e) => {
                setEmail(e.target.value);
                setLocalError(null);
              }}
              placeholder="name@acme.io"
              className="h-[42px] w-full rounded-md border border-border bg-white px-3 text-[13px] text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-60"
            />
          </div>
          <div className="relative">
            <label htmlFor="hard-delete-pin-0" className="mb-1.5 block text-[12px] font-medium text-foreground">
              PIN
            </label>
            <div className="relative pr-[52px]">
              <div className="flex gap-2">
                {pin.map((d, i) => (
                  <input
                    key={i}
                    id={i === 0 ? "hard-delete-pin-0" : undefined}
                    ref={(el) => {
                      pinRefs.current[i] = el;
                    }}
                    value={d}
                    type={showPin ? "text" : "password"}
                    inputMode="numeric"
                    maxLength={1}
                    disabled={confirming}
                    onChange={(e) => setDigit(i, e.target.value)}
                    onKeyDown={(e) => onPinKey(i, e)}
                    className={`h-[42px] w-[42px] rounded-lg border text-center text-[18px] font-semibold text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-60 ${
                      message ? "border-danger bg-danger-soft/40" : "border-border bg-white"
                    }`}
                  />
                ))}
              </div>
              <button
                type="button"
                onClick={() => setShowPin((v) => !v)}
                className="absolute right-0 top-1/2 flex h-9 w-9 -translate-y-1/2 cursor-pointer items-center justify-center text-muted-foreground hover:text-foreground"
                aria-label={showPin ? "Hide PIN" : "Show PIN"}
              >
                {showPin ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          {message ? (
            <div className="text-[12px] text-danger" role="alert">
              {message}
            </div>
          ) : null}
        </div>

        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={confirming}
            className="flex-1 cursor-pointer rounded-md border border-border py-2 text-[13px] text-foreground hover:bg-surface-alt disabled:cursor-not-allowed disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!canSubmit}
            className="flex-1 cursor-pointer rounded-md bg-danger py-2 text-[13px] font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {confirming ? "Deleting…" : "Hard Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}
