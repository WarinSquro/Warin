# @oneview/security

Argon2 hashing, AES-GCM helpers, HMAC search hashes, and masking — NestJS `SecurityModule`.

```ts
import { SecurityModule, HashingService } from "@oneview/security";

SecurityModule.forRoot({ hmacPepper: process.env.HMAC_PEPPER });

// inject HashingService → hash() / verify()
```
