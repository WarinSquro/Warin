export type MailProvider = "smtp" | "bullmq" | "rabbitmq" | "console";

export type SmtpSecurityType = "none" | "ssl" | "tls" | "starttls";

export type SendMailInput = {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  template?: string;
  context?: Record<string, unknown>;
  headers?: Record<string, string>;
};

export type SendMailResult = {
  id: string;
  accepted: string[];
  provider: MailProvider;
};

export type SmtpOptions = {
  host: string;
  port?: number;
  secure?: boolean;
  /** STARTTLS / require TLS upgrade */
  requireTls?: boolean;
  user?: string;
  pass?: string;
};

/** Runtime product SMTP from Settings (DB) — preferred over env when set. */
export type ProductSmtpConfig = {
  host: string;
  port: number;
  securityType: SmtpSecurityType;
  senderName: string;
  senderEmail: string;
  username?: string;
  password?: string;
  authRequired: boolean;
};

export type MailModuleOptions = {
  provider?: MailProvider;
  from?: string;
  /** When true, log instead of sending (local fallback) */
  dryRun?: boolean;
  smtp?: SmtpOptions;
};

export const MAIL_OPTIONS = Symbol("MAIL_OPTIONS");

export const SMTP_NOT_CONFIGURED_CODE = "SMTP_NOT_CONFIGURED";
export const SMTP_NOT_CONFIGURED_MESSAGE =
  "Email is not configured yet. Ask an administrator to set up SMTP under Settings → SMTP Settings.";

export function formatMailFrom(senderName: string, senderEmail: string): string {
  const email = senderEmail.trim();
  const name = senderName.trim();
  if (!email) return "noreply@warin.local";
  if (!name) return email;
  const safe = name.replace(/"/g, "");
  return `"${safe}" <${email}>`;
}

export function nodemailerOptionsFromProduct(cfg: ProductSmtpConfig): SmtpOptions & { from: string } {
  const security = cfg.securityType;
  const secure = security === "ssl";
  const requireTls = security === "starttls" || security === "tls";
  return {
    host: cfg.host.trim(),
    port: cfg.port,
    secure,
    requireTls: requireTls && !secure,
    user: cfg.authRequired ? cfg.username?.trim() || undefined : undefined,
    pass: cfg.authRequired ? cfg.password ?? "" : undefined,
    from: formatMailFrom(cfg.senderName, cfg.senderEmail),
  };
}
