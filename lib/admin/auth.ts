import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import { getEnv } from "@/lib/env";

export const ADMIN_COOKIE = "admin_session";
export const ADMIN_SESSION_SECONDS = 12 * 60 * 60;

/**
 * Session value "<expiresAt>.<hmac>". Keyed with ADMIN_SESSION_SECRET; without it (older deployments) with a key
 * derived from ADMIN_PASSWORD, so changing the password still logs everyone out.
 */
function sessionKey(): string {
  const env = getEnv();
  return env.ADMIN_SESSION_SECRET ? `admin-session:${env.ADMIN_SESSION_SECRET}` : `admin:${env.ADMIN_PASSWORD}`;
}

function sign(expiresAt: number): string {
  return createHmac("sha256", sessionKey()).update(String(expiresAt)).digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  // Hash first so lengths always match and nothing leaks through timing.
  const left = createHash("sha256").update(a).digest();
  const right = createHash("sha256").update(b).digest();
  return timingSafeEqual(left, right);
}

export function checkAdminPassword(password: string): boolean {
  return safeEqual(password, getEnv().ADMIN_PASSWORD);
}

export function createAdminSession(): string {
  const expiresAt = Math.floor(Date.now() / 1000) + ADMIN_SESSION_SECONDS;
  return `${expiresAt}.${sign(expiresAt)}`;
}

export function isValidAdminSession(value: string | undefined): boolean {
  if (!value) return false;
  if (value.length > 200) return false;
  const [expires, signature, extra] = value.split(".");
  const expiresAt = Number(expires);
  const now = Date.now() / 1000;
  // Never accept a session that claims to live longer than one session length.
  if (extra !== undefined || !Number.isInteger(expiresAt) || !signature || expiresAt < now || expiresAt > now + ADMIN_SESSION_SECONDS + 60) {
    return false;
  }
  return safeEqual(signature, sign(expiresAt));
}

/** The admin session cookie (httpOnly, SameSite=Strict, Secure outside local development). */
export function adminSessionCookie(value: string, maxAge: number): string {
  const secure = getEnv().NODE_ENV === "production" ? "; Secure" : "";
  return `${ADMIN_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure}`;
}

/**
 * CSRF guard for state-changing admin requests: the Origin header must be this site's origin.
 * Browsers always send Origin on POST/DELETE fetches; a missing one is refused.
 */
export function isSameOriginRequest(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  const allowed = new Set([new URL(request.url).origin]);
  const site = process.env.NEXT_PUBLIC_SITE_URL;
  if (site) {
    try {
      allowed.add(new URL(site).origin);
    } catch {
      // Ignore a malformed NEXT_PUBLIC_SITE_URL here; lib/env.ts reports it.
    }
  }
  return allowed.has(origin);
}
