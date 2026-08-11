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
   * Uses a short TTL cache so post-login request bursts do not each hit Postgres.
   * Cache is invalidated when access rights change (see AccessRightsController).
   */
  async validate(payload: JwtPayload): Promise<JwtPayload> {
    let id: bigint;
    try {
      id = BigInt(payload.sub);
    } catch {
      throw new UnauthorizedException();
    }

    const cached = this.sessionCache.get(payload.sub);
    if (cached) return cached;

    const employee = await this.prisma.employee.findFirst({
      where: { id, isDeleted: false, isActive: true },
      select: {
        id: true,
        email: true,
        hrmsId: true,
        isSuperAdmin: true,
        permissions: { select: { key: true } },
      },
    });
    if (!employee) throw new UnauthorizedException();

    const permissionKeys = employee.isSuperAdmin
      ? ["*"]
      : employee.permissions.map((p) => p.key);

    const next: JwtPayload = {
      sub: employee.id.toString(),
      email: employee.email,
      hrmsId: employee.hrmsId,
      isSuperAdmin: employee.isSuperAdmin,
      permissionKeys,
    };
    this.sessionCache.set(next);
    return next;
  }
}
