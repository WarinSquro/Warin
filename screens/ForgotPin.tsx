import { useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { ArrowLeft, MailCheck } from "lucide-react";
import { AuthLayout } from "../components/AuthLayout";
import { forgotPinApi } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { useFocusFirstField } from "../hooks/useFocusFirstField";

export function ForgotPin() {
  const { isAuthenticated, getDefaultLandingRoute } = useAuth();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const focusRef = useFocusFirstField<HTMLDivElement>(!sent);

  if (isAuthenticated) {
    return <Navigate to={getDefaultLandingRoute()} replace />;
  }

  const send = async () => {
    if (!email.includes("@")) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      await forgotPinApi(email.trim().toLowerCase());
      setSent(true);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not send reset link.";
      setErrorMsg(msg);
      setSent(false);
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <AuthLayout>
        <div className="flex flex-col items-center text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-success-soft">
            <MailCheck className="h-6 w-6 text-success" />
          </div>
          <div className="mt-4 text-[20px] font-semibold text-foreground">Check your email</div>
          <div className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
            If an account exists for <span className="font-medium text-foreground">{email || "that address"}</span>, we've sent a link to reset your PIN. The link works once and expires in 30 minutes.
          </div>
          <div className="mt-5 w-full rounded-md border border-border-soft bg-surface-alt px-3.5 py-2.5 text-left text-[11px] leading-relaxed text-muted-foreground">
            Didn't get it? Check spam, or confirm the address is your registered work email. For security we don't reveal whether an account exists.
          </div>
          <button onClick={() => setSent(false)} className="mt-4 text-[12px] text-primary hover:underline">Use a different email</button>
        </div>
        <div className="mt-6 text-center">
          <Link to="/login" className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-3.5 w-3.5" /> Back to sign in
          </Link>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <Link to="/login" className="mb-6 inline-flex items-center gap-1.5 text-[12px] text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" /> Back to sign in
      </Link>

      <div className="mb-7">
        <div className="text-[20px] font-semibold text-foreground">Reset your PIN</div>
        <div className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
          Enter your registered email. PIN reset link will be sent to that.
        </div>
      </div>

      <div ref={focusRef} className="flex flex-col gap-4">
        <div>
          <label className="mb-1.5 block text-[12px] font-medium text-foreground">Work email</label>
          <input
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setErrorMsg(null);
            }}
            placeholder="name@acme.io"
            className="w-full rounded-md border border-border bg-surface px-3 py-2.5 text-[13px] text-foreground outline-none focus:border-accent-line"
          />
        </div>

        {errorMsg && (
          <div className="rounded-md border border-danger-border bg-danger-soft px-3 py-2 text-[12px] text-danger">
            {errorMsg}
          </div>
        )}

        <button
          onClick={() => void send()}
          disabled={!email.includes("@") || loading}
          className={`rounded-md py-2.5 text-[13px] font-semibold ${email.includes("@") && !loading ? "bg-primary text-primary-foreground" : "cursor-not-allowed bg-surface-alt text-muted-foreground"}`}
        >
          {loading ? "Sending…" : "Send reset link"}
        </button>
      </div>

      <div className="mt-6 text-[11px] leading-relaxed text-muted-foreground">
        The link is sent only to the email on file and can be used once. It expires 30 minutes after sending.
      </div>
    </AuthLayout>
  );
}
