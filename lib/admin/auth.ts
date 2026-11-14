import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import { getEnv } from "@/lib/env";

export const ADMIN_COOKIE = "admin_session";
export const ADMIN_SESSION_SECONDS = 12 * 60 * 60;

/** Session value "<expiresAt>.<hmac>" keyed with ADMIN_PASSWORD, so changing the password logs everyone out. */
function sign(expiresAt: number): string {
  return createHmac("sha256", `admin:${getEnv().ADMIN_PASSWORD}`).update(String(expiresAt)).digest("base64url");
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
  const [expires, signature] = value.split(".");
  const expiresAt = Number(expires);
  if (!Number.isInteger(expiresAt) || !signature || expiresAt < Date.now() / 1000) return false;
  return safeEqual(signature, sign(expiresAt));
}
