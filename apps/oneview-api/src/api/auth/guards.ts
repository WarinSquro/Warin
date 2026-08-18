import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { AuthGuard } from "@nestjs/passport";
import type { JwtPayload } from "./jwt.strategy";

export const IS_PUBLIC_KEY = "isPublic";
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export const PERMISSIONS_KEY = "permissions";
export const RequirePermissions = (...keys: string[]) => SetMetadata(PERMISSIONS_KEY, keys);

@Injectable()
export class JwtAuthGuard extends AuthGuard("jwt") {
  constructor(private reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;
    return super.canActivate(context);
  }

  handleRequest<T>(err: Error | null, user: T): T {
    if (err || !user) throw err || new UnauthorizedException();
    return user;
  }
}

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required?.length) return true;
    const req = context.switchToHttp().getRequest<{ user?: JwtPayload }>();
    const user = req.user;
    if (!user) throw new UnauthorizedException();
    if (user.isSuperAdmin || user.permissionKeys?.includes("*")) return true;
    const ok = required.some((k) => user.permissionKeys?.includes(k));
    if (!ok) throw new ForbiddenException("Missing required permission");
    return true;
  }
}

/** Restricts a handler/controller to `isSuperAdmin` (Administrator login). */
@Injectable()
export class SuperAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<{ user?: JwtPayload }>();
    if (!req.user) throw new UnauthorizedException();
    if (!req.user.isSuperAdmin) {
      throw new ForbiddenException("Administrator access required");
    }
    return true;
  }
}
