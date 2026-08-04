import {
  BadRequestException,
  Injectable,
  Logger,
  OnModuleInit,
  ServiceUnavailableException,
} from "@nestjs/common";
import { CryptoService } from "@oneview/security";
import {
  MailService,
  SmtpNotConfiguredError,
  type ProductSmtpConfig,
  type SmtpSecurityType,
} from "@oneview/mail";
import type { SmtpSecurityType as PrismaSmtpSecurity } from "@prisma/client";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";

const CODE = "default";
const SALT = Buffer.from("warin-smtp-settings-v1", "utf8");

export type SmtpSettingsDto = {
  host: string;
  port: number;
  securityType: SmtpSecurityType;
  senderName: string;
  senderEmail: string;
  username: string;
  /** Always empty on read — use passwordSet */
  password: string;
  passwordSet: boolean;
  authRequired: boolean;
  isConfigured: boolean;
};

export type SmtpSettingsUpdateDto = {
  host: string;
  port: number;
  securityType: SmtpSecurityType;
  senderName: string;
  senderEmail: string;
  username?: string;
  /** Omit or empty = keep existing encrypted password */
  password?: string;
  authRequired: boolean;
};

@Injectable()
export class SmtpSettingsService implements OnModuleInit {
  private readonly logger = new Logger(SmtpSettingsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly mail: MailService
  ) {}

  async onModuleInit() {
    try {
      await this.reloadMailRuntime();
    } catch (e) {
      this.logger.warn(`SMTP runtime load skipped: ${e instanceof Error ? e.message : e}`);
    }
  }

  private encryptionKey(): Buffer {
    const passphrase =
      process.env.SMTP_ENCRYPTION_KEY?.trim() ||
      process.env.HMAC_PEPPER?.trim() ||
      "warin-dev-smtp-key-change-me";
    return this.crypto.deriveKey(passphrase, SALT);
  }

  private encryptPassword(plain: string): string {
    return this.crypto.encryptAesGcm(plain, this.encryptionKey());
  }

  private decryptPassword(payload: string | null | undefined): string | undefined {
    if (!payload) return undefined;
    try {
      return this.crypto.decryptAesGcm(payload, this.encryptionKey());
    } catch {
      this.logger.error("Failed to decrypt SMTP password — check SMTP_ENCRYPTION_KEY / HMAC_PEPPER");
      return undefined;
    }
  }

  private async ensureRow() {
    const existing = await this.prisma.smtpSettings.findFirst({
      where: { code: CODE, isDeleted: false },
    });
    if (existing) return existing;
    return this.prisma.smtpSettings.create({
      data: {
        code: CODE,
        host: "",
        port: 587,
        securityType: "starttls",
        senderName: "",
        senderEmail: "",
        username: "",
        authRequired: true,
        isConfigured: false,
        modifiedAt: new Date(),
      },
    });
  }

  private computeConfigured(input: {
    host: string;
    senderEmail: string;
    authRequired: boolean;
    username: string;
    hasPassword: boolean;
  }): boolean {
    if (!input.host.trim() || !input.senderEmail.trim()) return false;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.senderEmail.trim())) return false;
    if (input.authRequired) {
      if (!input.username.trim() || !input.hasPassword) return false;
    }
    return true;
  }

  private toProductConfig(
    row: {
      host: string;
      port: number;
      securityType: PrismaSmtpSecurity;
      senderName: string;
      senderEmail: string;
      username: string;
      passwordEncrypted: string | null;
      authRequired: boolean;
    },
    passwordOverride?: string
  ): ProductSmtpConfig | null {
    const password =
      passwordOverride !== undefined
        ? passwordOverride
        : this.decryptPassword(row.passwordEncrypted);
    const cfg: ProductSmtpConfig = {
      host: row.host,
      port: row.port,
      securityType: row.securityType as SmtpSecurityType,
      senderName: row.senderName,
      senderEmail: row.senderEmail,
      username: row.username,
      password,
      authRequired: row.authRequired,
    };
    if (!row.host.trim() || !row.senderEmail.trim()) return null;
    if (row.authRequired && password === undefined) return null;
    return cfg;
  }

  async reloadMailRuntime(): Promise<void> {
    const row = await this.ensureRow();
    if (!row.isConfigured) {
      this.mail.applyProductConfig(null);
      return;
    }
    const cfg = this.toProductConfig(row);
    this.mail.applyProductConfig(cfg);
  }

  async getPublic(): Promise<SmtpSettingsDto> {
    const row = await this.ensureRow();
    return {
      host: row.host,
      port: row.port,
      securityType: row.securityType as SmtpSecurityType,
      senderName: row.senderName,
      senderEmail: row.senderEmail,
      username: row.username,
      password: "",
      passwordSet: Boolean(row.passwordEncrypted),
      authRequired: row.authRequired,
      isConfigured: row.isConfigured,
    };
  }

  private validateUpdate(dto: SmtpSettingsUpdateDto, passwordSet: boolean) {
    if (!dto.host?.trim()) throw new BadRequestException("SMTP Host is required.");
    if (!dto.port || dto.port < 1 || dto.port > 65535) {
      throw new BadRequestException("SMTP Port must be between 1 and 65535.");
    }
    const allowed: SmtpSecurityType[] = ["none", "ssl", "tls", "starttls"];
    if (!allowed.includes(dto.securityType)) {
      throw new BadRequestException("Security Type must be None, SSL, TLS, or STARTTLS.");
    }
    if (!dto.senderName?.trim()) throw new BadRequestException("Sender Name is required.");
    if (!dto.senderEmail?.trim()) throw new BadRequestException("Sender Email is required.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(dto.senderEmail.trim())) {
      throw new BadRequestException("Sender Email Address is invalid.");
    }
    if (dto.authRequired) {
      if (!dto.username?.trim()) throw new BadRequestException("Username is required when authentication is enabled.");
      const incoming = dto.password?.trim() ?? "";
      if (!incoming && !passwordSet) {
        throw new BadRequestException("Password is required when authentication is enabled.");
      }
    }
  }

  async update(dto: SmtpSettingsUpdateDto, actorId?: bigint): Promise<SmtpSettingsDto> {
    const row = await this.ensureRow();
    this.validateUpdate(dto, Boolean(row.passwordEncrypted));

    let passwordEncrypted = row.passwordEncrypted;
    const incoming = dto.password?.trim() ?? "";
    if (incoming) {
      passwordEncrypted = this.encryptPassword(incoming);
    } else if (!dto.authRequired) {
      passwordEncrypted = null;
    }

    const hasPassword = Boolean(passwordEncrypted);
    const isConfigured = this.computeConfigured({
      host: dto.host,
      senderEmail: dto.senderEmail,
      authRequired: dto.authRequired,
      username: dto.username ?? "",
      hasPassword: dto.authRequired ? hasPassword : true,
    });

    const updated = await this.prisma.smtpSettings.update({
      where: { id: row.id },
      data: {
        host: dto.host.trim(),
        port: dto.port,
        securityType: dto.securityType as PrismaSmtpSecurity,
        senderName: dto.senderName.trim(),
        senderEmail: dto.senderEmail.trim().toLowerCase(),
        username: (dto.username ?? "").trim(),
        passwordEncrypted,
        authRequired: dto.authRequired,
        isConfigured,
        modifiedBy: actorId ?? null,
        version: { increment: 1 },
      },
    });

    await this.reloadMailRuntime();
    return this.getPublic();
  }

  private mergeDraft(dto: SmtpSettingsUpdateDto, rowPasswordEncrypted: string | null): ProductSmtpConfig {
    const incoming = dto.password?.trim() ?? "";
    let password: string | undefined;
    if (incoming) password = incoming;
    else if (dto.authRequired) password = this.decryptPassword(rowPasswordEncrypted);
    else password = undefined;

    return {
      host: dto.host.trim(),
      port: dto.port,
      securityType: dto.securityType,
      senderName: dto.senderName.trim(),
      senderEmail: dto.senderEmail.trim(),
      username: (dto.username ?? "").trim(),
      password,
      authRequired: dto.authRequired,
    };
  }

  async testConnection(dto: SmtpSettingsUpdateDto): Promise<{ ok: true; message: string }> {
    const row = await this.ensureRow();
    this.validateUpdate(dto, Boolean(row.passwordEncrypted));
    const cfg = this.mergeDraft(dto, row.passwordEncrypted);
    try {
      await this.mail.verifyConnection(cfg);
      return { ok: true, message: "SMTP connection successful." };
    } catch (e) {
      if (e instanceof SmtpNotConfiguredError) {
        throw new BadRequestException(e.message);
      }
      const detail = e instanceof Error ? e.message : "Connection failed";
      throw new ServiceUnavailableException(`SMTP connection failed: ${detail}`);
    }
  }

  async sendTestEmail(
    dto: SmtpSettingsUpdateDto & { to: string }
  ): Promise<{ ok: true; message: string }> {
    const to = dto.to?.trim().toLowerCase() ?? "";
    if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
      throw new BadRequestException("Enter a valid recipient email address.");
    }
    const row = await this.ensureRow();
    this.validateUpdate(dto, Boolean(row.passwordEncrypted));
    const cfg = this.mergeDraft(dto, row.passwordEncrypted);
    try {
      await this.mail.sendWithConfig(cfg, {
        to,
        subject: "Warin SMTP test",
        text: "This is a test email from Warin SMTP Settings. Your configuration works.",
        html: "<p>This is a test email from <strong>Warin SMTP Settings</strong>.</p><p>Your configuration works.</p>",
        template: "smtp-test",
      });
      return { ok: true, message: `Test email sent to ${to}.` };
    } catch (e) {
      if (e instanceof SmtpNotConfiguredError) {
        throw new BadRequestException(e.message);
      }
      const detail = e instanceof Error ? e.message : "Send failed";
      throw new ServiceUnavailableException(`Failed to send test email: ${detail}`);
    }
  }
}
