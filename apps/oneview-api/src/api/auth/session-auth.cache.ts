import { Injectable } from "@nestjs/common";
import type { JwtPayload } from "./jwt.strategy";

type CacheEntry = {
  payload: JwtPayload;
  activeSessionId: string;
  expiresAt: number;
};

/**
 * Short-lived in-process cache for JWT validate() results.
 * Avoids a permissions DB round-trip on every authenticated API call (login burst,
 * SSE, polls). Access-rights updates and session takeovers must call invalidate(employeeId).
 */
@Injectable()
export class SessionAuthCache {
  private readonly ttlMs = Math.max(
    500,
    Number(process.env.SESSION_AUTH_CACHE_MS ?? 5_000)
  );
  private readonly bySub = new Map<string, CacheEntry>();

  /** @deprecated Prefer getSession — kept for call sites that only need invalidate. */
  get(sub: string): JwtPayload | null {
    const hit = this.bySub.get(sub);
    if (!hit) return null;
    if (Date.now() > hit.expiresAt) {
      this.bySub.delete(sub);
      return null;
    }
    return hit.payload;
  }

  getSession(sub: string, sid: string): JwtPayload | null {
    const hit = this.bySub.get(sub);
    if (!hit) return null;
    if (Date.now() > hit.expiresAt) {
      this.bySub.delete(sub);
      return null;
    }
    if (hit.activeSessionId !== sid || hit.payload.sid !== sid) {
      this.bySub.delete(sub);
      return null;
    }
    return hit.payload;
  }

  /** @deprecated Prefer setSession */
  set(payload: JwtPayload): void {
    if (!payload.sid) return;
    this.setSession(payload, payload.sid);
  }

  setSession(payload: JwtPayload, activeSessionId: string): void {
    this.bySub.set(payload.sub, {
      payload,
      activeSessionId,
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
