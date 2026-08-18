/** UI mask for Allowed IP: IPv4 dotted octets, or IPv6 when the value contains `:`. */

const IPV4_MAX = 15; // 255.255.255.255
const IPV6_MAX = 45;

export function maskIpAddress(raw: string): string {
  const v = raw.replace(/^\s+/, "");
  if (v.includes(":")) {
    return v.replace(/[^0-9a-fA-F:.]/g, "").slice(0, IPV6_MAX);
  }

  const chars = v.replace(/[^\d.]/g, "");
  const trailingDot = chars.endsWith(".");
  const parts = chars.split(".").filter((_, i, arr) => i < arr.length);
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
  if (octets.length === 0) return "";
  let out = octets.join(".");
  if (trailingDot && octets.length < 4 && !out.endsWith(".")) out += ".";
  return out.slice(0, IPV4_MAX);
}
