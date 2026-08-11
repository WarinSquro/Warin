import { Injectable, UnauthorizedException } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";

export type JwtPayload = {
  sub: string;
  email: string;
  hrmsId: string;
  isSuperAdmin: boolean;
  permissionKeys: string[];
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly prisma: PrismaService) {
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
   * Re-load active employee + permission keys from DB on every authenticated request
   * so access-rights revokes take effect immediately (JWT claims alone are not trusted).
   */
  async validate(payload: JwtPayload): Promise<JwtPayload> {
    let id: bigint;
    try {
      id = BigInt(payload.sub);
    } catch {
      throw new UnauthorizedException();
    }

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

    return {
      sub: employee.id.toString(),
      email: employee.email,
      hrmsId: employee.hrmsId,
      isSuperAdmin: employee.isSuperAdmin,
      permissionKeys,
    };
  }
}
