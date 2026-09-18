/** UI mask for Allowed IP: one or more IPv4/IPv6 values, comma-separated. */

const IPV4_MAX = 15; // 255.255.255.255
const IPV6_MAX = 45;
/** Enough for several IPv4 or a few IPv6 entries (DB VARCHAR(255)). */
export const ALLOWED_IP_INPUT_MAX_LENGTH = 255;

function maskOneIpSegment(raw: string): string {
  const leading = raw.match(/^\s*/)?.[0] ?? "";
  const v = raw.slice(leading.length);
  if (v.includes(":")) {
    return leading + v.replace(/[^0-9a-fA-F:.]/g, "").slice(0, IPV6_MAX);
  }

  const chars = v.replace(/[^\d.]/g, "");
  const trailingDot = chars.endsWith(".");
  const parts = chars.split(".");
  const octets: string[] = [];
  for (const part of parts) {
    if (octets.length >= 4) break;
    let oct = part.slice(0, 3);
    if (oct !== "" && Number(oct) > 255) {
      oct = oct.slice(0, 2);
      if (oct !== "" && Number(oct) > 255) oct = oct.slice(0, 1);
    }
    octets.push(oct);
    if (octets.length === 4) break;
  }
  if (octets.length === 0) return leading;
  let out = octets.join(".");
  if (trailingDot && octets.length < 4 && !out.endsWith(".")) out += ".";
  return leading + out.slice(0, IPV4_MAX);
}

/** Mask Allowed IP input; commas separate multiple addresses. */
export function maskIpAddress(raw: string): string {
  const v = raw.replace(/^\s+/, "");
  if (!v.includes(",")) {
    return maskOneIpSegment(v).slice(0, ALLOWED_IP_INPUT_MAX_LENGTH);
  }
  const trailingComma = v.endsWith(",");
  const segments = v.split(",");
  const masked = segments.map((seg) => maskOneIpSegment(seg));
  let out = masked.join(",");
  if (trailingComma && !out.endsWith(",")) out += ",";
  return out.slice(0, ALLOWED_IP_INPUT_MAX_LENGTH);
}
