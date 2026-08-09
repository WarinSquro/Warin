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
import { useToast } from "../context/ToastContext";

const SECURITY_OPTIONS: { value: SmtpSecurityType; label: string }[] = [
  { value: "none", label: "None" },
  { value: "ssl", label: "SSL" },
  { value: "tls", label: "TLS" },
  { value: "starttls", label: "STARTTLS" },
];

/** Inclusive bounds per product rule (never negative; not above 65536). */
const SMTP_PORT_MIN = 0;
const SMTP_PORT_MAX = 65536;

/** Same pattern as API `smtp-settings.service` sender email check. */
const EMAIL_FORMAT = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isValidEmail(value: string): boolean {
  return EMAIL_FORMAT.test(value.trim());
}

function clampSmtpPort(raw: number): number {
  if (!Number.isFinite(raw)) return 587;
  return Math.min(SMTP_PORT_MAX, Math.max(SMTP_PORT_MIN, Math.trunc(raw)));
}

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
  connectionVerified: false,
  lastConnectionTestAt: null,
});

function toPayload(form: SmtpSettings): SmtpSettingsPayload {
  return {
    host: form.host.trim(),
    port: clampSmtpPort(Number(form.port)),
    securityType: form.securityType,
    senderName: form.senderName.trim(),
    senderEmail: form.senderEmail.trim(),
    username: form.username.trim(),
    password: form.password.trim() || undefined,
    authRequired: form.authRequired,
  };
}

export function SmtpSettingsSection() {
  const toast = useToast();
  const [form, setForm] = useState<SmtpSettings>(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [sending, setSending] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [testTo, setTestTo] = useState("");
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [senderEmailInvalid, setSenderEmailInvalid] = useState(false);

  const patch = (p: Partial<SmtpSettings>) => {
    setForm((prev) => ({ ...prev, ...p }));
    setMessage(null);
    if (p.senderEmail !== undefined) setSenderEmailInvalid(false);
  };

  const validateSenderEmail = (): boolean => {
    const ok = isValidEmail(form.senderEmail);
    setSenderEmailInvalid(!ok);
    if (!ok) {
      const text = form.senderEmail.trim()
        ? "Sender Email Address must be a valid email format."
        : "Sender Email Address is required.";
      setMessage({ type: "err", text });
      toast.error(text);
    }
    return ok;
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
    if (!validateSenderEmail()) return;
    setSaving(true);
    setMessage(null);
    try {
      const saved = await putSmtpSettings(toPayload(form));
      setForm({ ...saved, password: "" });
      toast.updated();
    } catch (e) {
      setMessage({ type: "err", text: e instanceof Error ? e.message : "Save failed." });
    } finally {
      setSaving(false);
    }
  };

  const testConn = async () => {
    if (!validateSenderEmail()) return;
    setTesting(true);
    setMessage(null);
    try {
      const res = await testSmtpConnection(toPayload(form));
      const refreshed = await fetchSmtpSettings();
      setForm({ ...refreshed, password: form.password });
      toast.success(res.message);
    } catch (e) {
      setMessage({ type: "err", text: e instanceof Error ? e.message : "Connection test failed." });
    } finally {
      setTesting(false);
    }
  };

  const sendTest = async () => {
    if (!validateSenderEmail()) return;
    if (!isValidEmail(testTo)) {
      const text = "Test recipient must be a valid email format.";
      setMessage({ type: "err", text });
      toast.error(text);
      return;
    }
    setSending(true);
    setMessage(null);
    try {
      const res = await sendSmtpTestEmail({ ...toPayload(form), to: testTo.trim() });
      const refreshed = await fetchSmtpSettings();
      setForm({ ...refreshed, password: form.password });
      toast.success(res.message);
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
            Outbound email for Forgot PIN, welcome PIN, notifications, and other mail features.
            Password is encrypted at rest and never shown again.
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
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
          <div
            className={`text-[10px] font-medium ${
              form.connectionVerified ? "text-success-fg" : "text-muted-foreground"
            }`}
          >
            {form.connectionVerified
              ? "Connection tested — welcome emails enabled"
              : "Test connection to enable welcome PIN emails"}
          </div>
        </div>
      </div>

      <div className="mt-3.5 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="SMTP Host" required>
          <input
            value={form.host}
            onChange={(e) => patch({ host: e.target.value })}
            placeholder="smtp.example.com"
            className={fieldClass}
            autoComplete="off"
          />
        </Field>
        <Field label="SMTP Port" required>
          <input
            type="number"
            min={SMTP_PORT_MIN}
            max={SMTP_PORT_MAX}
            step={1}
            value={form.port}
            onChange={(e) => {
              const raw = e.target.value;
              if (raw === "") {
                patch({ port: SMTP_PORT_MIN });
                return;
              }
              const n = Number(raw);
              if (!Number.isFinite(n)) return;
              patch({ port: clampSmtpPort(n) });
            }}
            onBlur={() => patch({ port: clampSmtpPort(Number(form.port)) })}
            className={fieldClass}
          />
        </Field>
        <Field label="Security Type" required>
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
        <Field label="Authentication Required" required>
          <select
            value={form.authRequired ? "yes" : "no"}
            onChange={(e) => patch({ authRequired: e.target.value === "yes" })}
            className={fieldClass}
          >
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
        </Field>
        <Field label="Sender Name" required>
          <input
            value={form.senderName}
            onChange={(e) => patch({ senderName: e.target.value })}
            placeholder="Warin"
            className={fieldClass}
          />
        </Field>
        <Field label="Sender Email Address" required>
          <input
            type="email"
            value={form.senderEmail}
            onChange={(e) => patch({ senderEmail: e.target.value })}
            onBlur={() => {
              if (form.senderEmail.trim() && !isValidEmail(form.senderEmail)) {
                setSenderEmailInvalid(true);
              }
            }}
            placeholder="noreply@company.com"
            className={`${fieldClass} ${senderEmailInvalid ? "border-danger" : ""}`}
            aria-invalid={senderEmailInvalid}
          />
        </Field>
        {form.authRequired && (
          <>
            <Field label="Username" required>
              <input
                value={form.username}
                onChange={(e) => patch({ username: e.target.value })}
                className={fieldClass}
                autoComplete="off"
              />
            </Field>
            <Field
              label={form.passwordSet ? "Password (leave blank to keep current)" : "Password"}
              required={!form.passwordSet}
            >
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
            disabled={sending || !isValidEmail(testTo)}
            onClick={() => void sendTest()}
            className={`rounded-md px-3.5 py-1.5 text-[12px] font-medium ${
              isValidEmail(testTo) && !sending
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

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[12px] font-medium text-foreground">
        {label}
        {required ? <span className="text-danger"> *</span> : null}
      </span>
      {children}
    </label>
  );
}
