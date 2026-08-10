import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import type { Request, Response, NextFunction } from "express";
import { config } from "./config.js";
import { appendAudit, loadStore, mutateStore } from "./store.js";

const COOKIE = "ops_session";

export function login(userId: string, password: string): { ok: true; token: string } | { ok: false; error: string } {
  const store = loadStore();
  if (userId !== store.auth.userId) {
    appendAudit(userId || "unknown", "login", "failed", { error: "Invalid credentials" });
    return { ok: false, error: "Invalid credentials" };
  }
  if (!bcrypt.compareSync(password, store.auth.passwordHash)) {
    appendAudit(userId, "login", "failed", { error: "Invalid credentials" });
    return { ok: false, error: "Invalid credentials" };
  }
  const token = crypto.randomBytes(32).toString("hex");
  const now = Date.now();
  mutateStore((s) => {
    s.sessions = s.sessions.filter((x) => new Date(x.expiresAt).getTime() > now);
    s.sessions.push({
      token,
      userId,
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + config.sessionTtlMs).toISOString(),
    });
  });
  appendAudit(userId, "login", "success");
  return { ok: true, token };
}

export function verifyCredentials(
  userId: string,
  password: string,
): { ok: true } | { ok: false; error: string } {
  const store = loadStore();
  if (!userId || userId !== store.auth.userId) {
    return { ok: false, error: "Invalid credentials" };
  }
  if (!password || !bcrypt.compareSync(password, store.auth.passwordHash)) {
    return { ok: false, error: "Invalid credentials" };
  }
  return { ok: true };
}

export function logout(token: string | undefined, userId: string) {
  if (token) {
    mutateStore((s) => {
      s.sessions = s.sessions.filter((x) => x.token !== token);
    });
  }
  appendAudit(userId || "unknown", "logout", "info");
}

export function sessionUser(token: string | undefined): string | null {
  if (!token) return null;
  const store = loadStore();
  const now = Date.now();
  const s = store.sessions.find((x) => x.token === token && new Date(x.expiresAt).getTime() > now);
  return s?.userId ?? null;
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies?.[COOKIE] as string | undefined;
  const user = sessionUser(token);
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  (req as Request & { opsUser: string; opsToken: string }).opsUser = user;
  (req as Request & { opsUser: string; opsToken: string }).opsToken = token!;
  next();
}

export function setSessionCookie(res: Response, token: string) {
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.OPS_COOKIE_SECURE === "1",
    maxAge: config.sessionTtlMs,
    path: "/",
  });
}

export function clearSessionCookie(res: Response) {
  res.clearCookie(COOKIE, { path: "/" });
}

export { COOKIE };
