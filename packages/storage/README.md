# @oneview/storage

Provider-agnostic file storage for org hosts.

| Provider | Status |
|----------|--------|
| `filesystem` (default) | Implemented |
| `s3` | Config + stub (SDK next) |
| `azure` | Config + stub (SDK next) |

```ts
import { StorageModule, StorageService } from "@oneview/storage";

StorageModule.forRoot({
  provider: "filesystem",
  filesystem: { rootDir: "./data/files" },
});

// await storage.put("org/1/uploads/a.pdf", buffer, { contentType: "application/pdf" });
```

Persist **keys** in PostgreSQL — not file bytes.
