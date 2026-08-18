import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { HashingService } from "@oneview/security";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { MailService, SmtpNotConfiguredError, SMTP_NOT_CONFIGURED_CODE } from "@oneview/mail";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";
import { SessionAuthCache } from "./session-auth.cache";
import { isAllowedIpSatisfied } from "./client-ip";
import type { SessionClientMeta } from "./session-client-meta";

const SESSION_CONFLICT_MESSAGE =
  "You are already logged in on another device or browser. Do you want to continue on this device? Continuing will log you out from all other active sessions.";

const LOGIN_CONTINUE_PURPOSE = "login_continue";
const LOGIN_CONTINUE_SECONDS = 120;

function serializeBigInt<T>(value: T): T {
  return JSON.parse(
    JSON.stringify(value, (_k, v) => (typeof v === "bigint" ? v.toString() : v))
  ) as T;
}

type EmployeeAuthRow = {
  id: bigint;
  email: string;
  hrmsId: string;
  name: string;
  isSuperAdmin: boolean;
  mustChangePin: boolean;
  departmentId: bigint | null;
  department: { name: string } | null;
  permissions: { key: string }[];
  pinHash: string;
  activeSessionId: string | null;
  allowedIp: string | null;
};

export type ExistingSessionInfo = {
  deviceName: string | null;
  browser: string | null;
  loginAt: string;
  lastActivityAt: string;
  ipAddress: string | null;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly hashing: HashingService,
    private readonly jwt: JwtService,
    private readonly mail: MailService,
    private readonly sessionCache: SessionAuthCache
  ) {}

  private hashToken(token: string) {
    return createHash("sha256").update(token).digest("hex");
  }

  private permissionKeysFor(employee: Pick<EmployeeAuthRow, "isSuperAdmin" | "permissions">) {
    return employee.isSuperAdmin ? ["*"] : employee.permissions.map((p) => p.key);
  }

  private assertAllowedClientIp(allowedIp: string | null | undefined, requestIp: string | null) {
    if (isAllowedIpSatisfied(allowedIp, requestIp)) return;
    throw new ForbiddenException({
      error: "IP_NOT_ALLOWED",
      message:
        "You cannot sign in from this network. Your current IP address is not allowed for this account. Contact your administrator.",
    });
  }

  private userPayload(employee: EmployeeAuthRow, permissionKeys: string[]) {
    return {
      id: employee.id.toString(),
      hrmsId: employee.hrmsId,
      name: employee.name,
      email: employee.email,
      isSuperAdmin: employee.isSuperAdmin,
      departmentId: employee.departmentId?.toString() ?? null,
      departmentName: employee.department?.name ?? null,
      permissionKeys: employee.isSuperAdmin ? permissionKeys : employee.permissions.map((p) => p.key),
      mustChangePin: employee.mustChangePin,
    };
  }

  private async signAccessToken(employee: EmployeeAuthRow, sessionId: string, permissionKeys: string[]) {
    return this.jwt.signAsync({
      sub: employee.id.toString(),
      email: employee.email,
      hrmsId: employee.hrmsId,
      isSuperAdmin: employee.isSuperAdmin,
      permissionKeys,
      sid: sessionId,
    });
  }

  private toExistingSessionInfo(row: {
    deviceLabel: string | null;
    browserLabel: string | null;
    createdAt: Date;
    lastSeenAt: Date;
    ipAddress: string | null;
  }): ExistingSessionInfo {
    return {
      deviceName: row.deviceLabel,
      browser: row.browserLabel,
      loginAt: row.createdAt.toISOString(),
      lastActivityAt: row.lastSeenAt.toISOString(),
      ipAddress: row.ipAddress,
    };
  }

  private async issueContinueToken(employeeId: bigint) {
    return this.jwt.signAsync(
      {
        purpose: LOGIN_CONTINUE_PURPOSE,
        sub: employeeId.toString(),
      },
      { expiresIn: LOGIN_CONTINUE_SECONDS }
    );
  }

  private async verifyContinueToken(continueToken: string): Promise<bigint> {
    let payload: { purpose?: string; sub?: string };
    try {
      payload = await this.jwt.verifyAsync(continueToken);
    } catch {
      throw new UnauthorizedException({
        error: "INVALID_CONTINUE_TOKEN",
        message: "Session confirmation expired. Please sign in again.",
      });
    }
    if (payload.purpose !== LOGIN_CONTINUE_PURPOSE || !payload.sub) {
      throw new UnauthorizedException({
        error: "INVALID_CONTINUE_TOKEN",
        message: "Session confirmation expired. Please sign in again.",
      });
    }
    try {
      return BigInt(payload.sub);
    } catch {
      throw new UnauthorizedException({
        error: "INVALID_CONTINUE_TOKEN",
        message: "Session confirmation expired. Please sign in again.",
      });
    }
  }

  /** Create the sole active session for an employee (revokes all prior refresh tokens). */
  private async createExclusiveSession(employee: EmployeeAuthRow, meta: SessionClientMeta) {
    const sessionId = randomUUID().replace(/-/g, "");
    const refreshRaw = randomBytes(48).toString("hex");
    const refreshDays = Number(process.env.JWT_REFRESH_DAYS ?? 7);
    const now = new Date();
    const expiresAt = new Date(Date.now() + refreshDays * 24 * 60 * 60 * 1000);
    const permissionKeys = this.permissionKeysFor(employee);

    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM employees WHERE id = ${employee.id} FOR UPDATE`;
      await tx.refreshToken.updateMany({
        where: { employeeId: employee.id, revokedAt: null },
        data: { revokedAt: now },
      });
      await tx.refreshToken.create({
        data: {
          employeeId: employee.id,
          sessionId,
          tokenHash: this.hashToken(refreshRaw),
          expiresAt,
          userAgent: meta.userAgent,
          ipAddress: meta.ipAddress,
          deviceLabel: meta.deviceLabel,
          browserLabel: meta.browserLabel,
          lastSeenAt: now,
        },
      });
      await tx.employee.update({
        where: { id: employee.id },
        data: { activeSessionId: sessionId },
      });
    });

    this.sessionCache.invalidate(employee.id);

    const accessToken = await this.signAccessToken(employee, sessionId, permissionKeys);
    return serializeBigInt({
      status: "ok" as const,
      accessToken,
      refreshToken: refreshRaw,
      expiresIn: Number(process.env.JWT_EXPIRES_SECONDS ?? 3600),
      user: this.userPayload(employee, permissionKeys),
    });
  }

  async login(email: string, pin: string, meta: SessionClientMeta) {
    const employee = await this.prisma.employee.findFirst({
      where: { email: email.trim().toLowerCase(), isDeleted: false, isActive: true },
      include: { permissions: true, department: true },
    });
    if (!employee) {
      throw new UnauthorizedException({ error: "INVALID_CREDENTIALS", message: "Invalid email or PIN" });
    }

    const ok = await this.hashing.verify(employee.pinHash, pin);
    if (!ok) {
      throw new UnauthorizedException({ error: "INVALID_CREDENTIALS", message: "Invalid email or PIN" });
    }

    this.assertAllowedClientIp(employee.allowedIp, meta.ipAddress);

    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM employees WHERE id = ${employee.id} FOR UPDATE`;

      const active = await tx.refreshToken.findFirst({
        where: {
          employeeId: employee.id,
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
        orderBy: { lastSeenAt: "desc" },
      });

      if (active) {
        const continueToken = await this.issueContinueToken(employee.id);
        return {
          status: "session_conflict" as const,
          message: SESSION_CONFLICT_MESSAGE,
          continueToken,
          existingSession: this.toExistingSessionInfo(active),
        };
      }

      // No active session — create inside the same locked transaction.
      const sessionId = randomUUID().replace(/-/g, "");
      const refreshRaw = randomBytes(48).toString("hex");
      const refreshDays = Number(process.env.JWT_REFRESH_DAYS ?? 7);
      const now = new Date();
      const permissionKeys = this.permissionKeysFor(employee);

      await tx.refreshToken.updateMany({
        where: { employeeId: employee.id, revokedAt: null },
        data: { revokedAt: now },
      });
      await tx.refreshToken.create({
        data: {
          employeeId: employee.id,
          sessionId,
          tokenHash: this.hashToken(refreshRaw),
          expiresAt: new Date(Date.now() + refreshDays * 24 * 60 * 60 * 1000),
          userAgent: meta.userAgent,
          ipAddress: meta.ipAddress,
          deviceLabel: meta.deviceLabel,
          browserLabel: meta.browserLabel,
          lastSeenAt: now,
        },
      });
      await tx.employee.update({
        where: { id: employee.id },
        data: { activeSessionId: sessionId },
      });

      this.sessionCache.invalidate(employee.id);

      const accessToken = await this.signAccessToken(employee, sessionId, permissionKeys);
      return serializeBigInt({
        status: "ok" as const,
        accessToken,
        refreshToken: refreshRaw,
        expiresIn: Number(process.env.JWT_EXPIRES_SECONDS ?? 3600),
        user: this.userPayload(employee, permissionKeys),
      });
    });
  }

  /** Accept takeover after session_conflict confirmation. */
  async continueLogin(continueToken: string, meta: SessionClientMeta) {
    const employeeId = await this.verifyContinueToken(continueToken);
    const employee = await this.prisma.employee.findFirst({
      where: { id: employeeId, isDeleted: false, isActive: true },
      include: { permissions: true, department: true },
    });
    if (!employee) {
      throw new UnauthorizedException({
        error: "INVALID_CONTINUE_TOKEN",
        message: "Session confirmation expired. Please sign in again.",
      });
    }
    this.assertAllowedClientIp(employee.allowedIp, meta.ipAddress);
    return this.createExclusiveSession(employee, meta);
  }

  private sessionRevokedElsewhere() {
    return new UnauthorizedException({
      error: "SESSION_REVOKED",
      message: "Your session ended because you signed in elsewhere. Please sign in again.",
    });
  }

  private sessionExpired() {
    return new UnauthorizedException({
      error: "SESSION_EXPIRED",
      message: "Your session has expired. Please sign in again.",
    });
  }

  async refreshTokens(refreshToken: string) {
    const hash = this.hashToken(refreshToken);
    const row = await this.prisma.refreshToken.findUnique({ where: { tokenHash: hash } });
    if (!row) throw this.sessionExpired();
    if (row.expiresAt < new Date()) throw this.sessionExpired();

    if (row.revokedAt) {
      const emp = await this.prisma.employee.findUnique({
        where: { id: row.employeeId },
        select: { activeSessionId: true },
      });
      if (emp?.activeSessionId && emp.activeSessionId !== row.sessionId) {
        throw this.sessionRevokedElsewhere();
      }
      throw this.sessionExpired();
    }

    const employee = await this.prisma.employee.findFirst({
      where: { id: row.employeeId, isDeleted: false, isActive: true },
      include: { permissions: true, department: true },
    });
    if (!employee) throw this.sessionExpired();

    if (!employee.activeSessionId || employee.activeSessionId !== row.sessionId) {
      await this.prisma.refreshToken.update({
        where: { id: row.id },
        data: { revokedAt: new Date() },
      });
      throw this.sessionRevokedElsewhere();
    }

    const now = new Date();
    await this.prisma.refreshToken.update({
      where: { id: row.id },
      data: { revokedAt: now },
    });

    const permissionKeys = this.permissionKeysFor(employee);
    const refreshRaw = randomBytes(48).toString("hex");
    const refreshDays = Number(process.env.JWT_REFRESH_DAYS ?? 7);
    await this.prisma.refreshToken.create({
      data: {
        employeeId: employee.id,
        sessionId: row.sessionId,
        tokenHash: this.hashToken(refreshRaw),
        expiresAt: new Date(Date.now() + refreshDays * 24 * 60 * 60 * 1000),
        userAgent: row.userAgent,
        ipAddress: row.ipAddress,
        deviceLabel: row.deviceLabel,
        browserLabel: row.browserLabel,
        lastSeenAt: now,
      },
    });

    const accessToken = await this.signAccessToken(employee, row.sessionId, permissionKeys);
    this.sessionCache.invalidate(employee.id);

    return {
      status: "ok" as const,
      accessToken,
      refreshToken: refreshRaw,
      expiresIn: Number(process.env.JWT_EXPIRES_SECONDS ?? 3600),
    };
  }

  async logout(refreshToken?: string) {
    if (!refreshToken) return { ok: true };
    const hash = this.hashToken(refreshToken);
    const row = await this.prisma.refreshToken.findUnique({ where: { tokenHash: hash } });
    if (!row || row.revokedAt) return { ok: true };

    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.refreshToken.update({
        where: { id: row.id },
        data: { revokedAt: now },
      });
      const emp = await tx.employee.findUnique({
        where: { id: row.employeeId },
        select: { activeSessionId: true },
      });
      if (emp?.activeSessionId === row.sessionId) {
        await tx.employee.update({
          where: { id: row.employeeId },
          data: { activeSessionId: null },
        });
      }
    });
    this.sessionCache.invalidate(row.employeeId);
    return { ok: true };
  }

  async me(employeeId: string) {
    const id = BigInt(employeeId);
    const employee = await this.prisma.employee.findFirst({
      where: { id, isDeleted: false },
      select: {
        id: true,
        hrmsId: true,
        name: true,
        email: true,
        isSuperAdmin: true,
        mustChangePin: true,
        department: { select: { name: true } },
        permissions: { select: { key: true } },
      },
    });
    if (!employee) throw new UnauthorizedException();
    return serializeBigInt({
      id: employee.id.toString(),
      hrmsId: employee.hrmsId,
      name: employee.name,
      email: employee.email,
      isSuperAdmin: employee.isSuperAdmin,
      departmentName: employee.department?.name ?? null,
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
