import type { RedisOptions } from "ioredis";

export type RedisModuleOptions = {
  url?: string;
  options?: RedisOptions;
};

export const REDIS_OPTIONS = Symbol("REDIS_OPTIONS");
export const REDIS_CLIENT = Symbol("REDIS_CLIENT");
