# OneView npm workspaces monorepo

Platform packages live under `packages/*`. Product apps will live under `apps/*`. The React SPA remains at the **repo root** for now.

## Workspaces

```
OneView/
├── package.json          # workspaces root + web app scripts
├── packages/
│   ├── security/         # @oneview/security
│   ├── redis/            # @oneview/redis
│   ├── storage/          # @oneview/storage
│   ├── mail/             # @oneview/mail
│   └── auth/             # @oneview/auth
├── apps/                 # Nest APIs / demos (see apps/README.md)
├── prisma/               # OneView domain DB (product)
└── …                     # React UI (root)
```

## Packages

| Package | Purpose |
|---------|---------|
| `@oneview/security` | Argon2 hashing, AES helpers, HMAC search hash, masking |
| `@oneview/redis` | Redis connection Nest module |
| `@oneview/storage` | Filesystem (default), S3, Azure Blob |
| `@oneview/mail` | Mail send facade (SMTP / BullMQ / RabbitMQ providers — stub → full) |
| `@oneview/auth` | Keycloak OIDC / JWT / RBAC facade (stub → full) |

## Commands

```bash
npm install                          # links all workspaces
npm run packages:build               # build every package with a build script
npm run packages:build:storage       # build one package
npm run dev                          # React UI (root)
```

## Consume from a Nest app

```ts
import { SecurityModule } from "@oneview/security";
import { StorageModule } from "@oneview/storage";

@Module({
  imports: [
    SecurityModule.forRoot({}),
    StorageModule.forRoot({ provider: "filesystem", filesystem: { rootDir: "./data/files" } }),
  ],
})
export class AppModule {}
```

In that app’s `package.json`:

```json
{
  "dependencies": {
    "@oneview/security": "*",
    "@oneview/storage": "*"
  }
}
```

## Build order (suggested)

1. security → redis → storage  
2. mail (uses redis + optional storage)  
3. auth (uses security)  
4. oneview-api app  

## Publishing (later)

Packages are private workspace packages today. To publish to a private npm registry, set `"publishConfig"` and run `npm publish -w @oneview/security` after `npm run build`.
