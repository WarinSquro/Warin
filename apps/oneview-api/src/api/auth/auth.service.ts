import { BadRequestException, Injectable, ServiceUnavailableException, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { HashingService } from "@oneview/security";
import { createHash, randomBytes } from "node:crypto";
import { MailService, SmtpNotConfiguredError, SMTP_NOT_CONFIGURED_CODE } from "@oneview/mail";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";

function serializeBigInt<T>(value: T): T {
  return JSON.parse(
    JSON.stringify(value, (_k, v) => (typeof v === "bigint" ? v.toString() : v))
  ) as T;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly hashing: HashingService,
    private readonly jwt: JwtService,
    private readonly mail: MailService
  ) {}

  private hashToken(token: string) {
    return createHash("sha256").update(token).digest("hex");
  }

  async login(email: string, pin: string) {
    const employee = await this.prisma.employee.findFirst({
      where: { email: email.trim().toLowerCase(), isDeleted: false, isActive: true },
      include: { permissions: true, department: true },
    });
    if (!employee) throw new UnauthorizedException({ error: "INVALID_CREDENTIALS", message: "Invalid email or PIN" });

    const ok = await this.hashing.verify(employee.pinHash, pin);
    if (!ok) throw new UnauthorizedException({ error: "INVALID_CREDENTIALS", message: "Invalid email or PIN" });

    const permissionKeys = employee.isSuperAdmin
      ? ["*"]
      : employee.permissions.map((p) => p.key);

    const accessToken = await this.jwt.signAsync({
      sub: employee.id.toString(),
      email: employee.email,
      hrmsId: employee.hrmsId,
      isSuperAdmin: employee.isSuperAdmin,
      permissionKeys,
    });

    const refreshRaw = randomBytes(48).toString("hex");
    const refreshDays = Number(process.env.JWT_REFRESH_DAYS ?? 7);
    await this.prisma.refreshToken.create({
      data: {
        employeeId: employee.id,
        tokenHash: this.hashToken(refreshRaw),
        expiresAt: new Date(Date.now() + refreshDays * 24 * 60 * 60 * 1000),
      },
    });

    return serializeBigInt({
      accessToken,
      refreshToken: refreshRaw,
      expiresIn: Number(process.env.JWT_EXPIRES_SECONDS ?? 3600),
      user: {
        id: employee.id.toString(),
        hrmsId: employee.hrmsId,
        name: employee.name,
        email: employee.email,
        isSuperAdmin: employee.isSuperAdmin,
        departmentId: employee.departmentId?.toString() ?? null,
        departmentName: employee.department?.name ?? null,
        permissionKeys: employee.isSuperAdmin ? permissionKeys : employee.permissions.map((p) => p.key),
        mustChangePin: employee.mustChangePin,
      },
    });
  }

  async refreshTokens(refreshToken: string) {
    const hash = this.hashToken(refreshToken);
    const row = await this.prisma.refreshToken.findUnique({ where: { tokenHash: hash } });
    if (!row || row.revokedAt || row.expiresAt < new Date()) {
      throw new UnauthorizedException("Invalid refresh token");
    }
    const employee = await this.prisma.employee.findFirst({
      where: { id: row.employeeId, isDeleted: false, isActive: true },
      include: { permissions: true, department: true },
    });
    if (!employee) throw new UnauthorizedException("Invalid refresh token");

    await this.prisma.refreshToken.update({ where: { id: row.id }, data: { revokedAt: new Date() } });

    const permissionKeys = employee.isSuperAdmin ? ["*"] : employee.permissions.map((p) => p.key);
    const accessToken = await this.jwt.signAsync({
      sub: employee.id.toString(),
      email: employee.email,
      hrmsId: employee.hrmsId,
      isSuperAdmin: employee.isSuperAdmin,
      permissionKeys,
    });
    const refreshRaw = randomBytes(48).toString("hex");
    const refreshDays = Number(process.env.JWT_REFRESH_DAYS ?? 7);
    await this.prisma.refreshToken.create({
      data: {
        employeeId: employee.id,
        tokenHash: this.hashToken(refreshRaw),
        expiresAt: new Date(Date.now() + refreshDays * 24 * 60 * 60 * 1000),
      },
    });

    return {
      accessToken,
      refreshToken: refreshRaw,
      expiresIn: Number(process.env.JWT_EXPIRES_SECONDS ?? 3600),
    };
  }

  async logout(refreshToken?: string) {
    if (!refreshToken) return { ok: true };
    const hash = this.hashToken(refreshToken);
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: hash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return { ok: true };
  }

  async me(employeeId: string) {
    const id = BigInt(employeeId);
    const employee = await this.prisma.employee.findFirst({
      where: { id, isDeleted: false },
      include: { permissions: true, department: true, skills: { include: { skill: true } } },
    });
    if (!employee) throw new UnauthorizedException();
    return serializeBigInt({
      id: employee.id.toString(),
      hrmsId: employee.hrmsId,
      name: employee.name,
      email: employee.email,
      isSuperAdmin: employee.isSuperAdmin,
      departmentName: employee.department?.name ?? null,
      skills: employee.skills.map((s) => s.skill.name),
      permissionKeys: employee.isSuperAdmin ? ["*"] : employee.permissions.map((p) => p.key),
      mustChangePin: employee.mustChangePin,
    });
  }

  async forgotPin(email: string) {
    if (!this.mail.isProductConfigured()) {
      throw new ServiceUnavailableException({
        error: SMTP_NOT_CONFIGURED_CODE,
        message:
          "Email is not configured yet. Ask an administrator to set up SMTP under Settings → SMTP Settings.",
      });
    }

    const employee = await this.prisma.employee.findFirst({
      where: { email: email.trim().toLowerCase(), isDeleted: false },
    });
    // Always generic success when SMTP is configured (anti-enumeration)
    if (employee) {
      const raw = randomBytes(32).toString("hex");
      const expiresMinutes = 30;
      await this.prisma.pinResetToken.create({
        data: {
          employeeId: employee.id,
          tokenHash: this.hashToken(raw),
          expiresAt: new Date(Date.now() + expiresMinutes * 60 * 1000),
        },
      });
      const appUrl = (process.env.APP_PUBLIC_URL ?? "http://127.0.0.1:5173").replace(/\/$/, "");
      const resetUrl = `${appUrl}/reset-pin?token=${encodeURIComponent(raw)}`;
      const text = [
        `Hi ${employee.name},`,
        "",
        "We received a request to reset your Warin PIN.",
        `Open this link within ${expiresMinutes} minutes (one-time use):`,
        resetUrl,
        "",
        "If you did not request this, you can ignore this email.",
      ].join("\n");
      const html = `
        <p>Hi ${employee.name},</p>
        <p>We received a request to reset your Warin PIN.</p>
        <p><a href="${resetUrl}">Reset your PIN</a></p>
        <p style="color:#666;font-size:13px">This link works once and expires in ${expiresMinutes} minutes.</p>
        <p style="color:#666;font-size:13px">If you did not request this, you can ignore this email.</p>
      `;
      try {
        await this.mail.send({
          to: employee.email,
          subject: "Warin PIN reset",
          text,
          html,
          template: "forgot-pin",
          context: { token: raw, name: employee.name, resetUrl },
        });
      } catch (e) {
        if (e instanceof SmtpNotConfiguredError) {
          throw new ServiceUnavailableException({
            error: SMTP_NOT_CONFIGURED_CODE,
            message: e.message,
          });
        }
        const detail = e instanceof Error ? e.message : "Mail send failed";
        throw new ServiceUnavailableException(`Failed to send reset email: ${detail}`);
      }
    }
    return { message: "If the email exists, a reset link has been sent." };
  }

  async resetPin(token: string, pin: string) {
    const hash = this.hashToken(token);
    const row = await this.prisma.pinResetToken.findFirst({
      where: { tokenHash: hash, usedAt: null, expiresAt: { gt: new Date() } },
    });
    if (!row) throw new UnauthorizedException("Invalid or expired reset token");
    const pinHash = await this.hashing.hash(pin);
    await this.prisma.$transaction([
      this.prisma.employee.update({
        where: { id: row.employeeId },
        data: {
          pinHash,
          mustChangePin: false,
          firstLoginCompletedAt: new Date(),
        },
      }),
      this.prisma.pinResetToken.update({ where: { id: row.id }, data: { usedAt: new Date() } }),
    ]);
    return { message: "PIN updated successfully." };
  }

  /** Authenticated user changes their own PIN (Account Settings / first login). */
  async changePin(employeeId: string, currentPin: string, newPin: string) {
    await this.verifyCurrentPin(employeeId, currentPin);

    if (currentPin === newPin) {
      throw new BadRequestException("New PIN must be different from the current PIN");
    }

    const employee = await this.prisma.employee.findFirst({
      where: { id: BigInt(employeeId), isDeleted: false, isActive: true },
    });
    if (!employee) throw new UnauthorizedException();

    const pinHash = await this.hashing.hash(newPin);
    await this.prisma.employee.update({
      where: { id: employee.id },
      data: {
        pinHash,
        mustChangePin: false,
        firstLoginCompletedAt: employee.firstLoginCompletedAt ?? new Date(),
      },
    });
    return { ok: true, message: "PIN updated successfully.", mustChangePin: false };
  }

  /** Verify the signed-in user's current PIN without changing it. */
  async verifyCurrentPin(employeeId: string, pin: string) {
    const employee = await this.prisma.employee.findFirst({
      where: { id: BigInt(employeeId), isDeleted: false, isActive: true },
    });
    if (!employee) throw new UnauthorizedException();

    const ok = await this.hashing.verify(employee.pinHash, pin);
    if (!ok) {
      throw new BadRequestException("Current PIN do not match.");
    }
    return { ok: true };
  }
}
