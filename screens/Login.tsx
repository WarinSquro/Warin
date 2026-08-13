import { useEffect, useRef, useState } from "react";
import { useNavigate, Link, Navigate } from "react-router-dom";
import { Eye, EyeOff } from "lucide-react";
import { AuthLayout } from "../components/AuthLayout";
import { SessionConflictDialog } from "../components/SessionConflictDialog";
import { useAuth } from "../context/AuthContext";
import { LOGIN_NOTICE_KEY, type ExistingSessionInfo } from "../api/client";

export function Login() {
  const navigate = useNavigate();
  const { signInWithPin, continueSignIn, isAuthenticated, getDefaultLandingRoute } = useAuth();
  const [email, setEmail] = useState("");
  const [pin, setPin] = useState<string[]>(["", "", "", "", ""]);
  const [error, setError] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showPin, setShowPin] = useState(false);
  const [conflict, setConflict] = useState<{
    continueToken: string;
    existingSession: ExistingSessionInfo;
  } | null>(null);
  const [continuing, setContinuing] = useState(false);
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    try {
      const notice = sessionStorage.getItem(LOGIN_NOTICE_KEY);
      if (notice) {
        sessionStorage.removeItem(LOGIN_NOTICE_KEY);
        setError(true);
        setErrorMsg(notice);
      }
    } catch {
      /* ignore */
    }
  }, []);

  if (isAuthenticated) {
    return <Navigate to={getDefaultLandingRoute()} replace />;
  }

  const setDigit = (i: number, v: string) => {
    if (!/^\d?$/.test(v)) return;
    setError(false);
    setErrorMsg(null);
    const next = [...pin];
    next[i] = v;
    setPin(next);
    if (v && i < 4) refs.current[i + 1]?.focus();
  };

  const onKey = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !pin[i] && i > 0) refs.current[i - 1]?.focus();
  };

  const pinComplete = pin.every((d) => d !== "");
  const canSubmit = email.includes("@") && pinComplete && !loading;

  const submit = async () => {
    if (!canSubmit) {
      setError(true);
      return;
    }
    setLoading(true);
    setErrorMsg(null);
    try {
      const result = await signInWithPin(email.trim().toLowerCase(), pin.join(""));
      if (typeof result !== "string") {
        setConflict({
          continueToken: result.continueToken,
          existingSession: result.existingSession,
        });
        return;
      }
      navigate(result);
    } catch (e) {
      setError(true);
      setErrorMsg(e instanceof Error ? e.message : "Sign in failed");
    } finally {
      setLoading(false);
    }
  };

  const onConflictContinue = async () => {
    if (!conflict) return;
    setContinuing(true);
    try {
      const landing = await continueSignIn(conflict.continueToken);
      setConflict(null);
      navigate(landing);
    } catch (e) {
      setConflict(null);
      setError(true);
      setErrorMsg(e instanceof Error ? e.message : "Sign in failed");
    } finally {
      setContinuing(false);
    }
  };

  const onConflictCancel = () => {
    setConflict(null);
    setError(false);
    setErrorMsg(null);
  };

  return (
    <AuthLayout>
      <div className="mb-7">
        <div className="text-[20px] font-semibold text-brand">Sign in</div>
        <div className="mt-1 text-[13px] text-brand-muted">Enter your work email and 5-digit PIN.</div>
      </div>

      <div className="flex flex-col gap-4">
        <div>
          <label htmlFor="login-email" className="mb-1.5 block text-[12px] font-medium text-foreground">
            Work email
          </label>
          <input
            id="login-email"
            autoFocus
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setError(false);
            }}
            placeholder="name@acme.io"
            className="h-[42px] w-full rounded-md border border-brand-border/20 bg-white px-3 text-[13px] text-foreground outline-none focus:border-brand-border focus:ring-2 focus:ring-brand-muted/25"
          />
        </div>

        <div className="relative">
          <div className="mb-1.5">
            <label htmlFor="login-pin-0" className="text-[12px] font-medium text-foreground">
              PIN
            </label>
          </div>

          <div className="relative pr-[52px]">
            <div className="flex gap-2.5">
              {pin.map((d, i) => (
                <input
                  key={i}
                  id={i === 0 ? "login-pin-0" : undefined}
                  ref={(el) => (refs.current[i] = el)}
                  value={d}
                  type={showPin ? "text" : "password"}
                  inputMode="numeric"
                  maxLength={1}
                  onChange={(e) => setDigit(i, e.target.value)}
                  onKeyDown={(e) => onKey(i, e)}
                  className={`h-[42px] w-[42px] rounded-lg border text-center text-[18px] font-semibold text-foreground outline-none transition-colors focus:border-brand-border focus:ring-2 focus:ring-brand-muted/25 ${
                    d ? "border-brand-border/50" : ""
                  } ${
                    error ? "border-danger bg-danger-soft/40" : "border-brand-border/20 bg-white"
                  }`}
                />
              ))}
            </div>
          </div>

          <button
            type="button"
            onClick={() => void submit()}
            className={`mt-4 w-full cursor-pointer rounded-md py-2.5 text-[13px] font-semibold ${
              canSubmit
                ? "bg-primary text-primary-foreground hover:bg-brand-active"
                : "bg-brand/30 text-white/80"
            }`}
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>

          <button
            type="button"
            onClick={() => setShowPin((v) => !v)}
            aria-label={showPin ? "Hide PIN" : "Show PIN"}
            className="absolute right-0 top-6 flex h-[42px] w-[42px] flex-shrink-0 cursor-pointer items-center justify-center rounded-lg text-muted-foreground transition-colors hover:text-foreground"
          >
            {showPin ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>

          <Link
            to="/forgot-pin"
            className="absolute right-0 top-0 text-[12px] text-brand-muted hover:text-brand hover:underline"
          >
            Forgot PIN?
          </Link>

          {error && (
            <div className="mt-1.5 text-[11px] text-danger">
              {errorMsg ?? "Enter a valid email and complete 5-digit PIN."}
            </div>
          )}
        </div>
      </div>

      <div className="mt-6 text-center text-[11px] text-brand-muted">
        Internal use only · Access is provisioned by administrator.
      </div>

      <SessionConflictDialog
        open={Boolean(conflict)}
        existingSession={conflict?.existingSession ?? null}
        continuing={continuing}
        onContinue={() => void onConflictContinue()}
        onCancel={onConflictCancel}
      />
    </AuthLayout>
  );
}
