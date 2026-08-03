import { useEffect, useRef, useState, type KeyboardEvent, type MutableRefObject } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, Eye, EyeOff } from "lucide-react";
import { AuthLayout } from "../components/AuthLayout";
import { resetPinApi } from "../api/client";
import { useFocusFirstField } from "../hooks/useFocusFirstField";

export function ResetPin() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get("token")?.trim() ?? "";
  const [pin, setPin] = useState<string[]>(["", "", "", "", ""]);
  const [confirm, setConfirm] = useState<string[]>(["", "", "", "", ""]);
  const [showPin, setShowPin] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const pinRefs = useRef<(HTMLInputElement | null)[]>([]);
  const confirmRefs = useRef<(HTMLInputElement | null)[]>([]);
  const focusRef = useFocusFirstField<HTMLDivElement>(!!token && !done);

  useEffect(() => {
    if (!token) setError("Missing or invalid reset link. Request a new one.");
  }, [token]);

  const setDigit = (
    which: "pin" | "confirm",
    i: number,
    v: string,
    refs: MutableRefObject<(HTMLInputElement | null)[]>
  ) => {
    if (!/^\d?$/.test(v)) return;
    setError(null);
    const next = which === "pin" ? [...pin] : [...confirm];
    next[i] = v;
    if (which === "pin") setPin(next);
    else setConfirm(next);
    if (v && i < 4) refs.current[i + 1]?.focus();
  };

  const onKey = (
    which: "pin" | "confirm",
    i: number,
    e: KeyboardEvent<HTMLInputElement>,
    refs: MutableRefObject<(HTMLInputElement | null)[]>
  ) => {
    const arr = which === "pin" ? pin : confirm;
    if (e.key === "Backspace" && !arr[i] && i > 0) refs.current[i - 1]?.focus();
  };

  const pinValue = pin.join("");
  const confirmValue = confirm.join("");
  const canSubmit =
    !!token && pin.every((d) => d !== "") && confirm.every((d) => d !== "") && !loading;

  const submit = async () => {
    if (!canSubmit) return;
    if (pinValue !== confirmValue) {
      setError("PINs do not match.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await resetPinApi(token, pinValue);
      setDone(true);
      setTimeout(() => navigate("/login"), 1500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Reset failed. Request a new link.");
    } finally {
      setLoading(false);
    }
  };

  const digitInputs = (
    which: "pin" | "confirm",
    values: string[],
    refs: MutableRefObject<(HTMLInputElement | null)[]>,
    idPrefix: string
  ) => (
    <div className="flex gap-2">
      {values.map((d, i) => (
        <input
          key={`${idPrefix}-${i}`}
          id={`${idPrefix}-${i}`}
          ref={(el) => {
            refs.current[i] = el;
          }}
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={1}
          type={showPin ? "text" : "password"}
          value={d}
          onChange={(e) => setDigit(which, i, e.target.value.replace(/\D/g, "").slice(-1), refs)}
          onKeyDown={(e) => onKey(which, i, e, refs)}
          className="h-11 w-11 rounded-md border border-border bg-surface text-center text-[16px] font-semibold text-foreground outline-none focus:border-accent-line"
        />
      ))}
    </div>
  );

  if (done) {
    return (
      <AuthLayout>
        <div className="text-center">
          <div className="text-[20px] font-semibold text-foreground">PIN updated</div>
          <div className="mt-2 text-[13px] text-muted-foreground">Redirecting to sign in…</div>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <Link
        to="/login"
        className="mb-6 inline-flex items-center gap-1.5 text-[12px] text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Back to sign in
      </Link>

      <div className="mb-7">
        <div className="text-[20px] font-semibold text-foreground">Choose a new PIN</div>
        <div className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
          Enter a new 5-digit PIN. This link can be used once.
        </div>
      </div>

      <div ref={focusRef} className="flex flex-col gap-4">
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label className="text-[12px] font-medium text-foreground">New PIN</label>
            <button
              type="button"
              onClick={() => setShowPin((v) => !v)}
              className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
            >
              {showPin ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              {showPin ? "Hide" : "Show"}
            </button>
          </div>
          {digitInputs("pin", pin, pinRefs, "reset-pin")}
        </div>

        <div>
          <label className="mb-1.5 block text-[12px] font-medium text-foreground">Confirm PIN</label>
          {digitInputs("confirm", confirm, confirmRefs, "reset-confirm")}
        </div>

        {error && <div className="text-[12px] text-danger">{error}</div>}

        <button
          type="button"
          disabled={!canSubmit}
          onClick={() => void submit()}
          className={`rounded-md py-2.5 text-[13px] font-semibold ${
            canSubmit
              ? "bg-primary text-primary-foreground"
              : "cursor-not-allowed bg-surface-alt text-muted-foreground"
          }`}
        >
          {loading ? "Saving…" : "Save new PIN"}
        </button>
      </div>
    </AuthLayout>
  );
}
