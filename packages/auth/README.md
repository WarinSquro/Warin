# @oneview/auth

Keycloak OIDC + JWT guards + hooks for **application-managed RBAC**.

| Piece | Status |
|-------|--------|
| `AuthModule.forRoot` | Scaffold |
| `JwtAuthGuard` / `@Public` / `@RequirePermissions` | Scaffold |
| `bypass: true` | Local stub user |
| Keycloak JWKS validation | Planned |
| auth-prisma persistence | Planned |

Product apps (OneView) still own permission keys (`navConfig`) and map them after identity is established.
