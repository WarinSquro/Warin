import { Inject, Injectable, Logger } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import { MAIL_OPTIONS, type MailModuleOptions, type SendMailInput, type SendMailResult } from "./types";

/**
 * Facade for product apps (e.g. forgot-PIN).
 * SMTP is supported via nodemailer; BullMQ / RabbitMQ adapters can plug in later.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: Transporter | null = null;

  constructor(@Inject(MAIL_OPTIONS) private readonly options: MailModuleOptions) {}

  private getTransporter(): Transporter {
    if (this.transporter) return this.transporter;
    const smtp = this.options.smtp;
    if (!smtp?.host) {
      throw new Error("MAIL_SMTP_HOST is required when provider=smtp and dryRun=false");
    }
    this.transporter = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port ?? 587,
      secure: smtp.secure ?? false,
      auth: smtp.user ? { user: smtp.user, pass: smtp.pass ?? "" } : undefined,
    });
    return this.transporter;
  }

  async send(input: SendMailInput): Promise<SendMailResult> {
    const provider = this.options.provider ?? "console";
    const to = Array.isArray(input.to) ? input.to : [input.to];
    const id = randomUUID();
    const dryRun = this.options.dryRun === true || provider === "console";

    if (dryRun) {
      this.logger.log(
        `[mail:console] id=${id} to=${to.join(",")} subject=${input.subject} template=${input.template ?? "-"} text=${(input.text ?? "").slice(0, 200)}`
      );
      return { id, accepted: to, provider: "console" };
    }

    if (provider === "smtp") {
      const info = await this.getTransporter().sendMail({
        from: this.options.from ?? "noreply@oneview.local",
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

    throw new Error(
      `Mail provider "${provider}" is not fully wired yet. Use provider "smtp" or dryRun/console.`
    );
  }
}
