/** POC email-snap payload stored in `projects.approved_by_snap` (TEXT). */

export type ApprovalSnapPayload = {
  name: string;
  dataUrl: string | null;
};

type StoredJson = { name?: string; dataUrl?: string };

/** Encode filename + data URL for persistence. */
export function encodeApprovalSnap(name: string, dataUrl: string): string {
  return JSON.stringify({
    name: name.trim() || "Email snap",
    dataUrl,
  });
}

/**
 * Decode DB / API value.
 * Supports: JSON `{ name, dataUrl }`, raw `data:image/…`, or legacy filename-only.
 */
export function decodeApprovalSnap(raw?: string | null): ApprovalSnapPayload {
  if (!raw?.trim()) return { name: "", dataUrl: null };
  const t = raw.trim();

  if (t.startsWith("data:image/")) {
    return { name: "Email snap", dataUrl: t };
  }

  if (t.startsWith("{")) {
    try {
      const o = JSON.parse(t) as StoredJson;
      if (typeof o.dataUrl === "string" && o.dataUrl.startsWith("data:")) {
        return {
          name: (o.name?.trim() || "Email snap"),
          dataUrl: o.dataUrl,
        };
      }
    } catch {
      /* treat as plain text */
    }
  }

  return { name: t, dataUrl: null };
}

export function isApprovalSnapComplete(payload: ApprovalSnapPayload): boolean {
  return Boolean(payload.dataUrl?.startsWith("data:") || payload.name.trim());
}
