import {
  CanActivate,
  ExecutionContext,
  Injectable,
  SetMetadata,
  UnauthorizedException,
  applyDecorators,
  UseGuards,
} from "@nestjs/common";
import { AuthService } from "./auth.service";

export const IS_PUBLIC_KEY = "oneview_auth_is_public";
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export const PERMISSIONS_KEY = "oneview_auth_permissions";
export const RequirePermissions = (...keys: string[]) => SetMetadata(PERMISSIONS_KEY, keys);

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<{
      headers: Record<string, string | undefined>;
      user?: unknown;
    }>();

    if (this.auth.isBypass()) {
      req.user = await this.auth.validateBearerToken("bypass");
      return true;
    }

    const header = req.headers.authorization ?? "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : undefined;
    if (!token) throw new UnauthorizedException("Missing Bearer token");

    const user = await this.auth.validateBearerToken(token);
    if (!user) throw new UnauthorizedException("Invalid token");
    req.user = user;
    return true;
  }
}

/** Convenience: @Auth() on controllers once JWT is live */
export function Auth() {
  return applyDecorators(UseGuards(JwtAuthGuard));
}
