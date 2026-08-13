import { Injectable, UnauthorizedException } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";
import { SessionAuthCache } from "./session-auth.cache";

export type JwtPayload = {
  sub: string;
  email: string;
  hrmsId: string;
  isSuperAdmin: boolean;
  permissionKeys: string[];
  /** Active login session id — must match employees.active_session_id. */
  sid: string;
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessionCache: SessionAuthCache
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        // EventSource cannot set Authorization; SSE uses ?access_token=
        ExtractJwt.fromUrlQueryParameter("access_token"),
      ]),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET ?? "warin-dev-jwt-secret-change-me",
    });
  }

  /**
   * Resolve live employee + permission keys for authorization.
   * Rejects JWTs whose session id is no longer the employee's sole active session.
   */
  async validate(payload: JwtPayload): Promise<JwtPayload> {
    if (!payload?.sid || !payload?.sub) {
      throw new UnauthorizedException({
        error: "SESSION_REVOKED",
        message: "Your session ended because you signed in elsewhere. Please sign in again.",
      });
    }

    let id: bigint;
    try {
      id = BigInt(payload.sub);
    } catch {
      throw new UnauthorizedException();
    }

    const cached = this.sessionCache.getSession(payload.sub, payload.sid);
    if (cached) {
      void this.touchLastSeen(id, payload.sid);
      return cached;
    }

    const employee = await this.prisma.employee.findFirst({
      where: { id, isDeleted: false, isActive: true },
      select: {
        id: true,
        email: true,
        hrmsId: true,
        isSuperAdmin: true,
        activeSessionId: true,
        permissions: { select: { key: true } },
      },
    });
    if (!employee) throw new UnauthorizedException();

    if (!employee.activeSessionId || employee.activeSessionId !== payload.sid) {
      this.sessionCache.invalidate(payload.sub);
      throw new UnauthorizedException({
        error: "SESSION_REVOKED",
        message: "Your session ended because you signed in elsewhere. Please sign in again.",
      });
    }

    const permissionKeys = employee.isSuperAdmin
      ? ["*"]
      : employee.permissions.map((p) => p.key);

    const next: JwtPayload = {
      sub: employee.id.toString(),
      email: employee.email,
      hrmsId: employee.hrmsId,
      isSuperAdmin: employee.isSuperAdmin,
      permissionKeys,
      sid: payload.sid,
    };
    this.sessionCache.setSession(next, employee.activeSessionId);
    void this.touchLastSeen(id, payload.sid);
    return next;
  }

  private async touchLastSeen(employeeId: bigint, sessionId: string) {
    try {
      await this.prisma.refreshToken.updateMany({
        where: {
          employeeId,
          sessionId,
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
        data: { lastSeenAt: new Date() },
      });
    } catch {
      /* ignore */
    }
  }
}
