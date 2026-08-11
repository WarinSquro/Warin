import { Injectable } from "@nestjs/common";
import type { JwtPayload } from "./jwt.strategy";

type CacheEntry = {
  payload: JwtPayload;
  expiresAt: number;
};

/**
 * Short-lived in-process cache for JWT validate() results.
 * Avoids a permissions DB round-trip on every authenticated API call (login burst,
 * SSE, polls). Access-rights updates must call invalidate(employeeId).
 */
@Injectable()
export class SessionAuthCache {
  private readonly ttlMs = Math.max(
    500,
    Number(process.env.SESSION_AUTH_CACHE_MS ?? 5_000)
  );
  private readonly bySub = new Map<string, CacheEntry>();

  get(sub: string): JwtPayload | null {
    const hit = this.bySub.get(sub);
    if (!hit) return null;
    if (Date.now() > hit.expiresAt) {
      this.bySub.delete(sub);
      return null;
    }
    return hit.payload;
  }

  set(payload: JwtPayload): void {
    this.bySub.set(payload.sub, {
      payload,
      expiresAt: Date.now() + this.ttlMs,
    });
  }

  invalidate(subOrEmployeeId: string | bigint): void {
    this.bySub.delete(String(subOrEmployeeId));
  }

  invalidateAll(): void {
    this.bySub.clear();
  }
}
