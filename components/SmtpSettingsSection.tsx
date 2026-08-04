import { useEffect, useState } from "react";
import { Eye, EyeOff, Mail, ShieldCheck } from "lucide-react";
import {
  fetchSmtpSettings,
  putSmtpSettings,
  sendSmtpTestEmail,
  testSmtpConnection,
  type SmtpSecurityType,
  type SmtpSettings,
  type SmtpSettingsPayload,
} from "../api/domain";

const SECURITY_OPTIONS: { value: SmtpSecurityType; label: string }[] = [
  { value: "none", label: "None" },
  { value: "ssl", label: "SSL" },
  { value: "tls", label: "TLS" },
  { value: "starttls", label: "STARTTLS" },
];

const fieldClass =
  "w-full rounded-md border border-border bg-surface px-3 py-1.5 text-[13px] text-foreground outline-none";

const emptyForm = (): SmtpSettings => ({
  host: "",
  port: 587,
  securityType: "starttls",
  senderName: "",
  senderEmail: "",
  username: "",
  password: "",
  passwordSet: false,
  authRequired: true,
  isConfigured: false,
});

function toPayload(form: SmtpSettings): SmtpSettingsPayload {
  return {
    host: form.host.trim(),
    port: Number(form.port) || 587,
    securityType: form.securityType,
    senderName: form.senderName.trim(),
    senderEmail: form.senderEmail.trim(),
    username: form.username.trim(),
    password: form.password.trim() || undefined,
    authRequired: form.authRequired,
  };
}

export function SmtpSettingsSection() {
  const [form, setForm] = useState<SmtpSettings>(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [sending, setSending] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [testTo, setTestTo] = useState("");
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const patch = (p: Partial<SmtpSettings>) => {
    setForm((prev) => ({ ...prev, ...p }));
    setMessage(null);
  };

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        const row = await fetchSmtpSettings();
        if (!cancelled) setForm({ ...row, password: "" });
      } catch (e) {
        if (!cancelled) {
          setMessage({
            type: "err",
            text: e instanceof Error ? e.message : "Could not load SMTP settings.",
          });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const save = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const saved = await putSmtpSettings(toPayload(form));
      setForm({ ...saved, password: "" });
      setMessage({ type: "ok", text: "SMTP settings saved." });
    } catch (e) {
      setMessage({ type: "err", text: e instanceof Error ? e.message : "Save failed." });
    } finally {
      setSaving(false);
    }
  };

  const testConn = async () => {
    setTesting(true);
    setMessage(null);
    try {
      const res = await testSmtpConnection(toPayload(form));
      setMessage({ type: "ok", text: res.message });
    } catch (e) {
      setMessage({ type: "err", text: e instanceof Error ? e.message : "Connection test failed." });
    } finally {
      setTesting(false);
    }
  };

  const sendTest = async () => {
    setSending(true);
    setMessage(null);
    try {
      const res = await sendSmtpTestEmail({ ...toPayload(form), to: testTo.trim() });
      setMessage({ type: "ok", text: res.message });
    } catch (e) {
      setMessage({ type: "err", text: e instanceof Error ? e.message : "Test email failed." });
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <div className="rounded-lg border border-border bg-surface px-4 py-4 text-[12px] text-muted-foreground">
        Loading SMTP settings…
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-surface px-4 py-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-[13px] font-semibold text-foreground">
            <Mail className="h-4 w-4 text-primary" />
            SMTP Settings
          </div>
          <div className="mt-0.5 text-[12px] leading-snug text-muted-foreground">
            Outbound email for Forgot PIN, notifications, and other mail features. Password is
            encrypted at rest and never shown again.
          </div>
        </div>
        <div
          className={`flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium ${
            form.isConfigured
              ? "bg-success-soft text-success-fg"
              : "bg-warning-soft text-warning"
          }`}
        >
          <ShieldCheck className="h-3.5 w-3.5" />
          {form.isConfigured ? "Configured" : "Not configured"}
        </div>
      </div>

      <div className="mt-3.5 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="SMTP Host">
          <input
            value={form.host}
            onChange={(e) => patch({ host: e.target.value })}
            placeholder="smtp.example.com"
            className={fieldClass}
            autoComplete="off"
          />
        </Field>
        <Field label="SMTP Port">
          <input
            type="number"
            min={1}
            max={65535}
            value={form.port}
            onChange={(e) => patch({ port: Number(e.target.value) })}
            className={fieldClass}
          />
        </Field>
        <Field label="Security Type">
          <select
            value={form.securityType}
            onChange={(e) => patch({ securityType: e.target.value as SmtpSecurityType })}
            className={fieldClass}
          >
            {SECURITY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Authentication Required">
          <select
            value={form.authRequired ? "yes" : "no"}
            onChange={(e) => patch({ authRequired: e.target.value === "yes" })}
            className={fieldClass}
          >
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
        </Field>
        <Field label="Sender Name">
          <input
            value={form.senderName}
            onChange={(e) => patch({ senderName: e.target.value })}
            placeholder="Warin"
            className={fieldClass}
          />
        </Field>
        <Field label="Sender Email Address">
          <input
            type="email"
            value={form.senderEmail}
            onChange={(e) => patch({ senderEmail: e.target.value })}
            placeholder="noreply@company.com"
            className={fieldClass}
          />
        </Field>
        {form.authRequired && (
          <>
            <Field label="Username">
              <input
                value={form.username}
                onChange={(e) => patch({ username: e.target.value })}
                className={fieldClass}
                autoComplete="off"
              />
            </Field>
            <Field label={form.passwordSet ? "Password (leave blank to keep current)" : "Password"}>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={form.password}
                  onChange={(e) => patch({ password: e.target.value })}
                  placeholder={form.passwordSet ? "••••••••" : ""}
                  className={`${fieldClass} pr-9`}
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </Field>
          </>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={saving}
          onClick={() => void save()}
          className="rounded-md bg-primary px-3.5 py-1.5 text-[12px] font-medium text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save Settings"}
        </button>
        <button
          type="button"
          disabled={testing || saving}
          onClick={() => void testConn()}
          className="rounded-md border border-border px-3.5 py-1.5 text-[12px] text-foreground hover:bg-surface-alt disabled:cursor-not-allowed disabled:opacity-60"
        >
          {testing ? "Testing…" : "Test SMTP Connection"}
        </button>
      </div>

      <div className="mt-4 rounded-md border border-border-soft bg-surface-alt/60 p-3">
        <div className="text-[12px] font-medium text-foreground">Send Test Email</div>
        <div className="mt-0.5 text-[11px] text-muted-foreground">
          Uses the values above (include password in the form if auth is required and not yet saved).
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input
            type="email"
            value={testTo}
            onChange={(e) => setTestTo(e.target.value)}
            placeholder="recipient@example.com"
            className={`${fieldClass} min-w-[220px] flex-1`}
          />
          <button
            type="button"
            disabled={sending || !testTo.includes("@")}
            onClick={() => void sendTest()}
            className={`rounded-md px-3.5 py-1.5 text-[12px] font-medium ${
              testTo.includes("@") && !sending
                ? "border border-border text-foreground hover:bg-surface"
                : "cursor-not-allowed bg-surface text-muted-foreground"
            }`}
          >
            {sending ? "Sending…" : "Send Test Email"}
          </button>
        </div>
      </div>

      {message && (
        <div
          className={`mt-3 rounded-md px-3 py-2 text-[12px] ${
            message.type === "ok"
              ? "border border-success-border bg-success-soft text-success-fg"
              : "border border-danger-border bg-danger-soft text-danger"
          }`}
        >
          {message.text}
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[12px] font-medium text-foreground">{label}</span>
      {children}
    </label>
  );
}
