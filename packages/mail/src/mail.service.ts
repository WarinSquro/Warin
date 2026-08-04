import { Inject, Injectable, Logger } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import {
  MAIL_OPTIONS,
  SMTP_NOT_CONFIGURED_MESSAGE,
  formatMailFrom,
  nodemailerOptionsFromProduct,
  type MailModuleOptions,
  type ProductSmtpConfig,
  type SendMailInput,
  type SendMailResult,
  type SmtpOptions,
} from "./types";

export class SmtpNotConfiguredError extends Error {
  readonly code = "SMTP_NOT_CONFIGURED";

  constructor(message = SMTP_NOT_CONFIGURED_MESSAGE) {
    super(message);
    this.name = "SmtpNotConfiguredError";
  }
}

/**
 * Outbound mail for product features. Org SMTP from Settings (DB) is required.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: Transporter | null = null;
  private productConfig: ProductSmtpConfig | null = null;
  private activeFrom: string | null = null;

  constructor(@Inject(MAIL_OPTIONS) private readonly options: MailModuleOptions) {}

  applyProductConfig(config: ProductSmtpConfig | null): void {
    this.productConfig = config;
    this.transporter = null;
    this.activeFrom = config ? formatMailFrom(config.senderName, config.senderEmail) : null;
  }

  isProductConfigured(): boolean {
    const c = this.productConfig;
    if (!c?.host?.trim() || !c.senderEmail?.trim()) return false;
    if (c.authRequired && !c.username?.trim()) return false;
    if (c.authRequired && (c.password === undefined || c.password === null)) return false;
    return true;
  }

  assertProductConfigured(): void {
    if (!this.isProductConfigured()) {
      throw new SmtpNotConfiguredError();
    }
  }

  private buildTransport(smtp: SmtpOptions): Transporter {
    return nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port ?? 587,
      secure: smtp.secure ?? false,
      requireTLS: smtp.requireTls ?? false,
      auth: smtp.user ? { user: smtp.user, pass: smtp.pass ?? "" } : undefined,
    });
  }

  private getProductTransporter(): Transporter {
    this.assertProductConfigured();
    if (this.transporter) return this.transporter;
    const opts = nodemailerOptionsFromProduct(this.productConfig!);
    this.activeFrom = opts.from;
    this.transporter = this.buildTransport(opts);
    return this.transporter;
  }

  async verifyConnection(draft?: ProductSmtpConfig): Promise<void> {
    const cfg = draft ?? this.productConfig;
    if (!cfg?.host?.trim()) {
      throw new SmtpNotConfiguredError("SMTP host is required to test the connection.");
    }
    const opts = nodemailerOptionsFromProduct(cfg);
    const transport = this.buildTransport(opts);
    await transport.verify();
  }

  async send(input: SendMailInput): Promise<SendMailResult> {
    this.assertProductConfigured();
    const to = Array.isArray(input.to) ? input.to : [input.to];
    const id = randomUUID();
    const info = await this.getProductTransporter().sendMail({
      from: this.activeFrom ?? this.options.from ?? "noreply@warin.local",
      to: to.join(", "),
      subject: input.subject,
      text: input.text,
      html: input.html,
      headers: input.headers,
    });
    const accepted = (info.accepted ?? to).map(String);
    this.logger.log(`[mail:smtp] id=${id} messageId=${info.messageId} to=${accepted.join(",")}`);
    return { id: String(info.messageId ?? id), accepted, provider: "smtp" };
  }

  async sendWithConfig(cfg: ProductSmtpConfig, input: SendMailInput): Promise<SendMailResult> {
    const opts = nodemailerOptionsFromProduct(cfg);
    if (!opts.host) throw new SmtpNotConfiguredError("SMTP host is required.");
    const transport = this.buildTransport(opts);
    const to = Array.isArray(input.to) ? input.to : [input.to];
    const id = randomUUID();
    const info = await transport.sendMail({
      from: opts.from,
      to: to.join(", "),
      subject: input.subject,
      text: input.text,
      html: input.html,
      headers: input.headers,
    });
    const accepted = (info.accepted ?? to).map(String);
    this.logger.log(`[mail:smtp:test] id=${id} messageId=${info.messageId} to=${accepted.join(",")}`);
    return { id: String(info.messageId ?? id), accepted, provider: "smtp" };
  }
}
