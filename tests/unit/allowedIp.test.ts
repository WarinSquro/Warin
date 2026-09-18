import { describe, expect, it } from "vitest";
import {
  canonicalizeIp,
  isAllowedIpSatisfied,
  parseAllowedIpInput,
} from "../../apps/oneview-api/src/api/auth/client-ip";
import { maskIpAddress } from "../../utils/ipAddressMask";

describe("parseAllowedIpInput", () => {
  it("treats empty or whitespace as no restriction", () => {
    expect(parseAllowedIpInput(null)).toEqual({ ok: true, value: null });
    expect(parseAllowedIpInput("")).toEqual({ ok: true, value: null });
    expect(parseAllowedIpInput("   ")).toEqual({ ok: true, value: null });
  });

  it("accepts IPv4 and IPv6", () => {
    expect(parseAllowedIpInput("203.0.113.10")).toEqual({ ok: true, value: "203.0.113.10" });
    expect(parseAllowedIpInput("  2001:db8::1  ").ok).toBe(true);
  });

  it("accepts comma-separated IPs and dedupes", () => {
    expect(parseAllowedIpInput("203.0.113.10, 198.51.100.20")).toEqual({
      ok: true,
      value: "203.0.113.10,198.51.100.20",
    });
    expect(parseAllowedIpInput("203.0.113.10,203.0.113.10")).toEqual({
      ok: true,
      value: "203.0.113.10",
    });
  });

  it("rejects invalid addresses or mixed invalid lists", () => {
    expect(parseAllowedIpInput("not-an-ip")).toEqual({ ok: false });
    expect(parseAllowedIpInput("999.1.1.1")).toEqual({ ok: false });
    expect(parseAllowedIpInput("1.2.3")).toEqual({ ok: false });
    expect(parseAllowedIpInput("203.0.113.10,not-an-ip")).toEqual({ ok: false });
  });
});

describe("isAllowedIpSatisfied", () => {
  it("allows any IP when Allowed IP is empty", () => {
    expect(isAllowedIpSatisfied(null, "203.0.113.10")).toBe(true);
    expect(isAllowedIpSatisfied("", "10.0.0.1")).toBe(true);
    expect(isAllowedIpSatisfied("  ", "10.0.0.1")).toBe(true);
  });

  it("allows login when the request IP matches", () => {
    expect(isAllowedIpSatisfied("203.0.113.10", "203.0.113.10")).toBe(true);
    expect(isAllowedIpSatisfied("::ffff:203.0.113.10", "203.0.113.10")).toBe(true);
  });

  it("allows login when request IP matches any of a comma-separated list", () => {
    expect(isAllowedIpSatisfied("203.0.113.10,198.51.100.20", "198.51.100.20")).toBe(true);
    expect(isAllowedIpSatisfied("203.0.113.10,198.51.100.20", "203.0.113.10")).toBe(true);
  });

  it("rejects login when the request IP does not match", () => {
    expect(isAllowedIpSatisfied("203.0.113.10", "198.51.100.20")).toBe(false);
    expect(isAllowedIpSatisfied("203.0.113.10", null)).toBe(false);
    expect(isAllowedIpSatisfied("203.0.113.10,198.51.100.20", "192.0.2.1")).toBe(false);
  });
});

describe("canonicalizeIp", () => {
  it("normalizes IPv4-mapped IPv6", () => {
    expect(canonicalizeIp("::ffff:192.0.2.1")).toBe("192.0.2.1");
  });
});

describe("maskIpAddress", () => {
  it("keeps IPv4 digits and dots", () => {
    expect(maskIpAddress("203.0.113.10")).toBe("203.0.113.10");
    expect(maskIpAddress("abc203.0.113.10")).toBe("203.0.113.10");
  });

  it("allows IPv6 characters after a colon", () => {
    expect(maskIpAddress("2001:db8::1")).toBe("2001:db8::1");
  });

  it("allows comma-separated IPv4 entries", () => {
    expect(maskIpAddress("203.0.113.10,198.51.100.20")).toBe("203.0.113.10,198.51.100.20");
    expect(maskIpAddress("203.0.113.10,")).toBe("203.0.113.10,");
  });
});
