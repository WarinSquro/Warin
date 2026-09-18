import { isIP } from "node:net";
import type { Request } from "express";

const IPV4_MAPPED = /^::ffff:/i;

/** Max distinct Allowed IPs stored per employee (comma-separated). */
export const ALLOWED_IP_MAX_COUNT = 10;

/** Strip brackets, IPv4-mapped prefix, and surrounding space. */
export function canonicalizeIp(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  let s = String(raw).trim();
  if (!s) return null;
  if (s.startsWith("[") && s.endsWith("]")) s = s.slice(1, -1);
  const zone = s.indexOf("%");
  if (zone >= 0) s = s.slice(0, zone);
  if (IPV4_MAPPED.test(s)) s = s.slice(s.toLowerCase().indexOf("ffff:") + 5);
  s = s.trim().toLowerCase();
  if (!s) return null;
  if (isIP(s) === 0) return null;
  return s;
}

/**
 * Empty/whitespace → null (no restriction).
 * One or more comma-separated IPv4/IPv6 → canonical comma list (deduped).
 * Any invalid segment → ok: false.
 */
export function parseAllowedIpInput(raw: unknown): { ok: true; value: string | null } | { ok: false } {
  if (raw == null) return { ok: true, value: null };
  if (typeof raw !== "string") return { ok: false };
  const trimmed = raw.trim();
  if (!trimmed) return { ok: true, value: null };

  const parts = trimmed
    .split(",")
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  if (parts.length === 0) return { ok: true, value: null };
  if (parts.length > ALLOWED_IP_MAX_COUNT) return { ok: false };

  const canonical: string[] = [];
  for (const part of parts) {
    const value = canonicalizeIp(part);
    if (!value) return { ok: false };
    if (!canonical.includes(value)) canonical.push(value);
  }
  return { ok: true, value: canonical.join(",") };
}

export function ipsMatch(allowed: string, actual: string): boolean {
  const a = canonicalizeIp(allowed);
  const b = canonicalizeIp(actual);
  if (!a || !b) return false;
  return a === b;
}

/** True when Allowed IP is empty, or request IP matches any configured address. */
export function isAllowedIpSatisfied(allowedIp: string | null | undefined, requestIp: string | null): boolean {
  if (allowedIp == null) return true;
  const raw = String(allowedIp).trim();
  if (!raw) return true;

  const configured = raw
    .split(",")
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  if (configured.length === 0) return true;

  const actual = canonicalizeIp(requestIp);
  if (!actual) return false;
  return configured.some((entry) => ipsMatch(entry, actual));
}

/**
 * Client IP from the TCP connection / trusted proxies only.
 * Requires Express `trust proxy` so `req.ip` is the address in front of private hops
 * (Compose nginx, host nginx). Do not read a client-supplied body field.
 */
export function requestClientIp(req: Request): string | null {
  return canonicalizeIp(req.ip ?? req.socket?.remoteAddress ?? null);
}
