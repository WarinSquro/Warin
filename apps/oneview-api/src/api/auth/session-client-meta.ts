export type SessionClientMeta = {
  userAgent: string | null;
  ipAddress: string | null;
  deviceLabel: string | null;
  browserLabel: string | null;
};

/** Best-effort UA / IP labels for conflict UI — not used as auth authority. */
export function parseSessionClientMeta(
  userAgent: string | undefined | null,
  ipAddress: string | undefined | null
): SessionClientMeta {
  const ua = (userAgent ?? "").trim() || null;
  const ip = normalizeIp(ipAddress);

  return {
    userAgent: ua,
    ipAddress: ip,
    deviceLabel: ua ? detectDevice(ua) : null,
    browserLabel: ua ? detectBrowser(ua) : null,
  };
}

function normalizeIp(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const first = raw.split(",")[0]?.trim() ?? "";
  if (!first) return null;
  // Express may prefix IPv4-mapped IPv6
  if (first.startsWith("::ffff:")) return first.slice(7);
  return first;
}

function detectDevice(ua: string): string {
  if (/iPad/i.test(ua)) return "iPad";
  if (/iPhone/i.test(ua)) return "iPhone";
  if (/Android/i.test(ua)) return /Mobile/i.test(ua) ? "Android phone" : "Android tablet";
  if (/Windows NT/i.test(ua)) return "Windows PC";
  if (/Mac OS X/i.test(ua)) return "Mac";
  if (/CrOS/i.test(ua)) return "Chromebook";
  if (/Linux/i.test(ua)) return "Linux PC";
  return "Unknown device";
}

function detectBrowser(ua: string): string {
  if (/Edg\//i.test(ua)) return "Microsoft Edge";
  if (/OPR\/|Opera/i.test(ua)) return "Opera";
  if (/Firefox\//i.test(ua)) return "Firefox";
  if (/Chrome\//i.test(ua) && !/Edg\//i.test(ua)) return "Chrome";
  if (/Safari\//i.test(ua) && !/Chrome\//i.test(ua)) return "Safari";
  return "Unknown browser";
}
