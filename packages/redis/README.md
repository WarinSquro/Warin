# @oneview/redis

NestJS Redis module (`ioredis`) for cache, rate limits, and shared BullMQ connections.

```ts
import { RedisModule, RedisService } from "@oneview/redis";

RedisModule.forRoot({ url: process.env.REDIS_URL });
```
