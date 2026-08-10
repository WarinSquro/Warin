import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Navigate } from "react-router-dom";
import { AuthLayout } from "../components/AuthLayout";
import { useAuth } from "../lib/auth";

export function LoginPage() {
  const { userId, loading, login } = useAuth();
  const [uid, setUid] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!loading && userId) return <Navigate to="/" replace />;

  const canSubmit = uid.trim().length > 0 && password.length > 0 && !busy;

  const submit = async () => {
    if (!canSubmit) {
      setError("Enter User Id and password");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await login(uid.trim(), password);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign in failed");
    } finally {
      setBusy(false);
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
          <label htmlFor="ops-pass" className="mb-1.5 block text-[12px] font-medium text-foreground">
            Password
          </label>
          <div className="relative">
            <input
              id="ops-pass"
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
              placeholder="Password"
              className={`h-[42px] w-full rounded-md border bg-white px-3 pr-10 text-[13px] text-foreground outline-none focus:border-brand-border focus:ring-2 focus:ring-brand-muted/25 ${
                error ? "border-danger" : "border-brand-border/20"
              }`}
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

        <button
          type="button"
          disabled={!canSubmit}
          onClick={() => void submit()}
          className={`mt-1 w-full rounded-md py-2.5 text-[13px] font-semibold cursor-pointer ${
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
