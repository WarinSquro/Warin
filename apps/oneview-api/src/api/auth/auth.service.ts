import { BadRequestException, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { HashingService } from "@oneview/security";
import { createHash, randomBytes } from "node:crypto";
import { MailService } from "@oneview/mail";
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
    });
  }

  async forgotPin(email: string) {
    const employee = await this.prisma.employee.findFirst({
      where: { email: email.trim().toLowerCase(), isDeleted: false },
    });
    // Always generic success
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
        "We received a request to reset your OneView PIN.",
        `Open this link within ${expiresMinutes} minutes (one-time use):`,
        resetUrl,
        "",
        "If you did not request this, you can ignore this email.",
      ].join("\n");
      const html = `
        <p>Hi ${employee.name},</p>
        <p>We received a request to reset your OneView PIN.</p>
        <p><a href="${resetUrl}">Reset your PIN</a></p>
        <p style="color:#666;font-size:13px">This link works once and expires in ${expiresMinutes} minutes.</p>
        <p style="color:#666;font-size:13px">If you did not request this, you can ignore this email.</p>
      `;
      await this.mail.send({
        to: employee.email,
        subject: "OneView PIN reset",
        text,
        html,
        template: "forgot-pin",
        context: { token: raw, name: employee.name, resetUrl },
      });
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
      this.prisma.employee.update({ where: { id: row.employeeId }, data: { pinHash } }),
      this.prisma.pinResetToken.update({ where: { id: row.id }, data: { usedAt: new Date() } }),
    ]);
    return { message: "PIN updated successfully." };
  }

  /** Authenticated user changes their own PIN (Account Settings). */
  async changePin(employeeId: string, currentPin: string, newPin: string) {
    if (currentPin === newPin) {
      throw new BadRequestException("New PIN must be different from the current PIN");
    }
    const employee = await this.prisma.employee.findFirst({
      where: { id: BigInt(employeeId), isDeleted: false, isActive: true },
    });
    if (!employee) throw new UnauthorizedException();

    const ok = await this.hashing.verify(employee.pinHash, currentPin);
    if (!ok) {
      throw new UnauthorizedException({
        error: "INVALID_PIN",
        message: "Current PIN is incorrect",
      });
    }

    const pinHash = await this.hashing.hash(newPin);
    await this.prisma.employee.update({
      where: { id: employee.id },
      data: { pinHash },
    });
    return { ok: true, message: "PIN updated successfully." };
  }
}
