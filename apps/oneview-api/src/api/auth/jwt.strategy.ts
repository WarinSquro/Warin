import { Injectable } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";

export type JwtPayload = {
  sub: string;
  email: string;
  hrmsId: string;
  isSuperAdmin: boolean;
  permissionKeys: string[];
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
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

  validate(payload: JwtPayload) {
    return payload;
  }
}
