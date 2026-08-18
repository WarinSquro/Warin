import { isIP } from "node:net";
import type { Request } from "express";

const IPV4_MAPPED = /^::ffff:/i;

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

/** Empty/whitespace → null (no restriction). Invalid → null via `ok: false`. */
export function parseAllowedIpInput(raw: unknown): { ok: true; value: string | null } | { ok: false } {
  if (raw == null) return { ok: true, value: null };
  if (typeof raw !== "string") return { ok: false };
  const trimmed = raw.trim();
  if (!trimmed) return { ok: true, value: null };
  const value = canonicalizeIp(trimmed);
  if (!value) return { ok: false };
  return { ok: true, value };
}

export function ipsMatch(allowed: string, actual: string): boolean {
  const a = canonicalizeIp(allowed);
  const b = canonicalizeIp(actual);
  if (!a || !b) return false;
  return a === b;
}

export function isAllowedIpSatisfied(allowedIp: string | null | undefined, requestIp: string | null): boolean {
  const configured = canonicalizeIp(allowedIp);
  if (!configured) return true;
  return ipsMatch(configured, requestIp ?? "");
}

/**
 * Client IP from the TCP connection / trusted proxies only.
 * Requires Express `trust proxy` so `req.ip` is the address in front of private hops
 * (Compose nginx, host nginx). Do not read a client-supplied body field.
 */
export function requestClientIp(req: Request): string | null {
  return canonicalizeIp(req.ip ?? req.socket?.remoteAddress ?? null);
}
