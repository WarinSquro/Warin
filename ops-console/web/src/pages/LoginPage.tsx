import { useRef, useState } from "react";
import { Navigate } from "react-router-dom";
import { AuthLayout } from "../components/AuthLayout";
import { PinBoxes } from "../components/PinBoxes";
import { useAuth } from "../lib/auth";
import { useBusy } from "../lib/busy";

export function LoginPage() {
  const { userId, loading, login } = useAuth();
  const { busy, withBusy } = useBusy();
  const [uid, setUid] = useState("");
  const [pin, setPin] = useState<string[]>(["", "", "", "", ""]);
  const [error, setError] = useState<string | null>(null);
  const submitBtnRef = useRef<HTMLButtonElement | null>(null);

  if (!loading && userId) return <Navigate to="/" replace />;

  const pinValue = pin.join("");
  const pinComplete = pin.every((d) => d !== "");
  const canSubmit = uid.trim().length > 0 && pinComplete && !busy;

  const submit = async () => {
    if (!canSubmit) {
      setError("Enter User Id and 5-digit PIN");
      return;
    }
    setError(null);
    try {
      await withBusy(() => login(uid.trim(), pinValue));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign in failed");
    }
  };

  return (
    <AuthLayout>
      <div className="mb-7">
        <div className="text-[20px] font-semibold text-brand">Sign In for Backup/Deployment</div>
        <div className="mt-1 text-[13px] text-brand-muted">
          Protected operations console for production backups and deployments.
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <div>
          <label htmlFor="ops-user" className="mb-1.5 block text-[12px] font-medium text-foreground">
            User Id
          </label>
          <input
            id="ops-user"
            autoFocus
            autoComplete="username"
            value={uid}
            onChange={(e) => {
              setUid(e.target.value);
              setError(null);
            }}
            placeholder="User Id"
            className="h-[42px] w-full rounded-md border border-brand-border/20 bg-white px-3 text-[13px] text-foreground outline-none focus:border-brand-border focus:ring-2 focus:ring-brand-muted/25"
          />
        </div>

        <div>
          <label htmlFor="ops-pin-0" className="mb-1.5 block text-[12px] font-medium text-foreground">
            PIN
          </label>
          <PinBoxes
            pin={pin}
            error={Boolean(error)}
            disabled={busy}
            onChange={(next) => {
              setPin(next);
              setError(null);
            }}
            onComplete={() => submitBtnRef.current?.focus()}
          />
        </div>

        {error && <div className="text-[12px] text-danger">{error}</div>}

        <button
          ref={submitBtnRef}
          type="button"
          disabled={!canSubmit}
          onClick={() => void submit()}
          className={`mt-1 w-full rounded-md py-2.5 text-[13px] font-semibold outline-none focus:ring-2 focus:ring-brand-muted/25 cursor-pointer ${
            canSubmit
              ? "bg-primary text-primary-foreground hover:bg-brand-active"
              : "bg-brand/30 text-white/80"
          }`}
        >
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </div>
    </AuthLayout>
  );
}
