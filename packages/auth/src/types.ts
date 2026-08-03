export type KeycloakAuthOptions = {
  url: string;
  realm: string;
  clientId: string;
  /** Audience / client for JWT validation */
  audience?: string;
};

export type AuthModuleOptions = {
  keycloak?: KeycloakAuthOptions;
  /** When true, guards are no-ops (local UI + mock until Keycloak is up) */
  bypass?: boolean;
};

export type AuthUser = {
  id: string;
  email?: string;
  name?: string;
  roles: string[];
  /** Application permission keys (e.g. OneView navConfig keys) — filled by product layer */
  permissionKeys?: string[];
};

export const AUTH_OPTIONS = Symbol("AUTH_OPTIONS");
