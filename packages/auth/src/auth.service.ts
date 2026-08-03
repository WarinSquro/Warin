import { Inject, Injectable } from "@nestjs/common";
import { AUTH_OPTIONS, type AuthModuleOptions, type AuthUser } from "./types";

/**
 * Auth facade. Keycloak JWT validation + auth-prisma persistence come next.
 * Product apps map roles → permission keys (e.g. OneView `navConfig`).
 */
@Injectable()
export class AuthService {
  constructor(@Inject(AUTH_OPTIONS) private readonly options: AuthModuleOptions) {}

  isBypass(): boolean {
    return this.options.bypass === true;
  }

  getKeycloakConfig() {
    return this.options.keycloak;
  }

  /** Placeholder — replace with JWT verify against Keycloak JWKS */
  async validateBearerToken(_token: string): Promise<AuthUser | null> {
    if (this.options.bypass) {
      return {
        id: "bypass",
        email: "admin@acme.io",
        name: "Bypass Admin",
        roles: ["super-admin"],
        permissionKeys: [],
      };
    }
    throw new Error("Keycloak JWT validation is not wired yet. Set AuthModule.forRoot({ bypass: true }) for local.");
  }
}
