const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3001/api/v1";

export type ApiError = { error: { code: string; message: string } };

export const SESSION_EXPIRED_EVENT = "oneview:session-expired";
/** Fired when an API returns 403 — clients should re-sync permission keys from /auth/me. */
export const PERMISSIONS_STALE_EVENT = "oneview:permissions-stale";
/** sessionStorage key for a one-shot message shown on the Login screen after forced sign-out. */
export const LOGIN_NOTICE_KEY = "oneview_login_notice";

const SESSION_ELSEWHERE_NOTICE =
  "Your session ended because you signed in elsewhere. Please sign in again.";

function getAccessToken(): string | null {
  try {
    return sessionStorage.getItem("oneview_access_token");
  } catch {
    return null;
  }
}

function getRefreshToken(): string | null {
  try {
    return sessionStorage.getItem("oneview_refresh_token");
  } catch {
    return null;
  }
}

export function setTokens(accessToken: string, refreshToken?: string) {
  sessionStorage.setItem("oneview_access_token", accessToken);
  if (refreshToken) sessionStorage.setItem("oneview_refresh_token", refreshToken);
}

export function clearTokens() {
  sessionStorage.removeItem("oneview_access_token");
  sessionStorage.removeItem("oneview_refresh_token");
  sessionStorage.removeItem("oneview_session_email");
}

function notifySessionExpired() {
  try {
    window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT));
  } catch {
    /* ignore */
  }
}

function notifyPermissionsStale() {
  try {
    window.dispatchEvent(new CustomEvent(PERMISSIONS_STALE_EVENT));
  } catch {
    /* ignore */
  }
}

function setLoginNotice(message: string) {
  try {
    sessionStorage.setItem(LOGIN_NOTICE_KEY, message);
  } catch {
    /* ignore */
  }
}

let refreshInFlight: Promise<boolean> | null = null;

async function tryRefreshAccessToken(): Promise<boolean> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    const refreshToken = getRefreshToken();
    if (!refreshToken) return false;
    try {
      const res = await fetch(`${API_BASE.replace(/\/$/, "")}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken }),
      });
      if (!res.ok) {
        let code = "";
        let message = "";
        try {
          const body = (await res.json()) as ApiError;
          code = body?.error?.code ?? "";
          message = body?.error?.message ?? "";
        } catch {
          /* ignore */
        }
        if (code === "SESSION_REVOKED" || /signed in elsewhere/i.test(message)) {
          setLoginNotice(SESSION_ELSEWHERE_NOTICE);
        } else if (message) {
          setLoginNotice(message);
        }
        return false;
      }
      const body = (await res.json()) as LoginOkResponse;
      setTokens(body.accessToken, body.refreshToken);
      return true;
    } catch {
      return false;
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

export async function apiFetch<T>(path: string, init: RequestInit = {}, allowRetry = true): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  const token = getAccessToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(`${API_BASE.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`, {
    ...init,
    headers,
  });

  if (res.status === 401 && allowRetry && !path.includes("/auth/login") && !path.includes("/auth/refresh")) {
    const refreshed = await tryRefreshAccessToken();
    if (refreshed) {
      return apiFetch<T>(path, init, false);
    }
    clearTokens();
    notifySessionExpired();
  }

  if (res.status === 403 && !path.includes("/auth/")) {
    notifyPermissionsStale();
  }

  if (!res.ok) {
    let body: ApiError | undefined;
    try {
      body = (await res.json()) as ApiError;
    } catch {
      /* ignore */
    }
    if (
      res.status === 401 &&
      (body?.error?.code === "SESSION_REVOKED" || /signed in elsewhere/i.test(body?.error?.message ?? ""))
    ) {
      setLoginNotice(SESSION_ELSEWHERE_NOTICE);
    }
    throw new Error(body?.error?.message ?? `API ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  if (!text.trim()) return null as T;
  return JSON.parse(text) as T;
}

export async function apiFetchBlob(path: string, allowRetry = true): Promise<Blob> {
  const headers = new Headers();
  const token = getAccessToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(`${API_BASE.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`, {
    headers,
  });

  if (res.status === 401 && allowRetry && !path.includes("/auth/login") && !path.includes("/auth/refresh")) {
    const refreshed = await tryRefreshAccessToken();
    if (refreshed) {
      return apiFetchBlob(path, false);
    }
    clearTokens();
    notifySessionExpired();
  }

  if (res.status === 403 && !path.includes("/auth/")) {
    notifyPermissionsStale();
  }

  if (!res.ok) {
    let message = `API ${res.status}`;
    try {
      const body = (await res.json()) as ApiError;
      if (body?.error?.message) message = body.error.message;
    } catch {
      /* ignore */
    }
    throw new Error(message);
  }
  return res.blob();
}

export type ExistingSessionInfo = {
  deviceName: string | null;
  browser: string | null;
  loginAt: string;
  lastActivityAt: string;
  ipAddress: string | null;
};

export type LoginOkResponse = {
  status?: "ok";
  accessToken: string;
  expiresIn: number;
  refreshToken: string;
  user: {
    id: string;
    hrmsId: string;
    name: string;
    email: string;
    isSuperAdmin: boolean;
    permissionKeys: string[];
    departmentName?: string | null;
    mustChangePin?: boolean;
  };
};

export type LoginConflictResponse = {
  status: "session_conflict";
  message: string;
  continueToken: string;
  existingSession: ExistingSessionInfo;
};

export type LoginResponse = LoginOkResponse | LoginConflictResponse;

export function loginApi(email: string, pin: string) {
  return apiFetch<LoginResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, pin }),
  });
}

export function continueLoginApi(continueToken: string) {
  return apiFetch<LoginOkResponse>("/auth/login/continue", {
    method: "POST",
    body: JSON.stringify({ continueToken }),
  });
}

export async function logoutApi() {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return;
  try {
    await fetch(`${API_BASE.replace(/\/$/, "")}/auth/logout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });
  } catch {
    /* best-effort server revoke */
  }
}

export function meApi() {
  return apiFetch<LoginOkResponse["user"]>("/auth/me");
}

export function forgotPinApi(email: string) {
  return apiFetch<{ message: string }>("/auth/forgot-pin", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export function resetPinApi(token: string, pin: string) {
  return apiFetch<{ ok: boolean }>("/auth/reset-pin", {
    method: "POST",
    body: JSON.stringify({ token, pin }),
  });
}

export function changePinApi(currentPin: string, newPin: string) {
  return apiFetch<{ ok: boolean; message: string }>("/auth/change-pin", {
    method: "POST",
    body: JSON.stringify({ currentPin, newPin }),
  });
}

export function verifyPinApi(pin: string) {
  return apiFetch<{ ok: boolean }>("/auth/verify-pin", {
    method: "POST",
    body: JSON.stringify({ pin }),
  });
}
