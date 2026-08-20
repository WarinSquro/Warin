export async function api<T = unknown>(
  path: string,
  opts?: RequestInit & { json?: unknown },
): Promise<T> {
  const headers: Record<string, string> = {
    ...(opts?.headers as Record<string, string>),
  };
  let body = opts?.body;
  if (opts?.json !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(opts.json);
  }
  const res = await fetch(`/api/ops${path}`, {
    ...opts,
    headers,
    body,
    credentials: "include",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || res.statusText || "Request failed");
  }
  return data as T;
}

/** Multipart upload (do not set Content-Type — browser sets boundary). */
export async function apiForm<T = unknown>(path: string, form: FormData): Promise<T> {
  const res = await fetch(`/api/ops${path}`, {
    method: "POST",
    body: form,
    credentials: "include",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || res.statusText || "Request failed");
  }
  return data as T;
}

export function formatBytes(n?: number) {
  if (n == null || Number.isNaN(n)) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function formatWhen(iso?: string) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}
