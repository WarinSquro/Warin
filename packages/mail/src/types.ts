export type MailProvider = "smtp" | "bullmq" | "rabbitmq" | "console";

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
  user?: string;
  pass?: string;
};

export type MailModuleOptions = {
  provider?: MailProvider;
  from?: string;
  /** When true, log instead of sending (local fallback) */
  dryRun?: boolean;
  smtp?: SmtpOptions;
};

export const MAIL_OPTIONS = Symbol("MAIL_OPTIONS");
