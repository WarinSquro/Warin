import { DynamicModule, Global, Module } from "@nestjs/common";
import Redis from "ioredis";
import { RedisService } from "./redis.service";
import { REDIS_CLIENT, REDIS_OPTIONS, type RedisModuleOptions } from "./types";

@Global()
@Module({})
export class RedisModule {
  static forRoot(options: RedisModuleOptions = {}): DynamicModule {
    return {
      module: RedisModule,
      providers: [
        { provide: REDIS_OPTIONS, useValue: options },
        {
          provide: REDIS_CLIENT,
          useFactory: () => {
            const url = options.url ?? process.env.REDIS_URL ?? "redis://127.0.0.1:6379";
            return new Redis(url, options.options ?? {});
          },
        },
        RedisService,
      ],
      exports: [RedisService, REDIS_CLIENT],
    };
  }
}
