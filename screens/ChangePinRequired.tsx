import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { AuthLayout } from "../components/AuthLayout";
import { changePinApi } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { useFocusFirstField } from "../hooks/useFocusFirstField";

/**
 * Forced PIN change after first login with a temporary welcome PIN.
 * Blocks app access until the temporary PIN is replaced.
 */
export function ChangePinRequired() {
  const navigate = useNavigate();
  const { mustChangePin, clearMustChangePin, getDefaultLandingRoute, isAuthenticated, signOut } =
    useAuth();
  const focusRef = useFocusFirstField<HTMLDivElement>();
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  if (!mustChangePin) {
    return <Navigate to={getDefaultLandingRoute()} replace />;
  }

  const ready =
    /^\d{5}$/.test(currentPin) &&
    /^\d{5}$/.test(newPin) &&
    /^\d{5}$/.test(confirmPin) &&
    !saving;

  const submit = async () => {
    if (!ready) return;
    if (newPin !== confirmPin) {
      setError("New PIN and confirmation do not match.");
      return;
    }
    if (newPin === currentPin) {
      setError("New PIN must be different from the temporary PIN.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await changePinApi(currentPin, newPin);
      clearMustChangePin();
      navigate(getDefaultLandingRoute(), { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update PIN");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AuthLayout>
      <div ref={focusRef} className="mb-7">
        <div className="text-[20px] font-semibold text-brand">Change your PIN</div>
        <div className="mt-1 text-[13px] text-brand-muted">
          Enter the temporary PIN from your welcome email, then choose a new 5-digit PIN before
          continuing.
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <PinField
          label="Current temporary PIN"
          value={currentPin}
          onChange={(v) => {
            setCurrentPin(v);
            setError(null);
          }}
          autoComplete="current-password"
        />
        <PinField
          label="New PIN"
          value={newPin}
          onChange={(v) => {
            setNewPin(v);
            setError(null);
          }}
          autoComplete="new-password"
        />
        <PinField
          label="Confirm new PIN"
          value={confirmPin}
          onChange={(v) => {
            setConfirmPin(v);
            setError(null);
          }}
          autoComplete="new-password"
        />
        {error && <div className="text-[12px] text-danger">{error}</div>}
        <button
          type="button"
          disabled={!ready}
          onClick={() => void submit()}
          className={`h-[42px] w-full rounded-md text-[13px] font-medium ${
            ready
              ? "bg-brand text-white hover:opacity-95"
              : "cursor-not-allowed bg-brand-muted/30 text-brand-muted"
          }`}
        >
          {saving ? "Saving…" : "Save new PIN & continue"}
        </button>
        <button
          type="button"
          onClick={() => {
            signOut();
            navigate("/login", { replace: true });
          }}
          className="text-[12px] text-brand-muted underline-offset-2 hover:underline"
        >
          Sign out
        </button>
      </div>
    </AuthLayout>
  );
}

function PinField({
  label,
  value,
  onChange,
  autoComplete,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete?: string;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[12px] font-medium text-foreground">{label}</span>
      <input
        type="password"
        inputMode="numeric"
        maxLength={5}
        autoComplete={autoComplete}
        value={value}
        onChange={(e) => {
          const v = e.target.value.replace(/\D/g, "").slice(0, 5);
          onChange(v);
        }}
        className="h-[42px] w-full rounded-md border border-brand-border/20 bg-white px-3 font-mono text-[13px] tracking-widest text-foreground outline-none focus:border-brand-border focus:ring-2 focus:ring-brand-muted/25"
        placeholder="•••••"
      />
    </label>
  );
}
