import { createHmac } from "node:crypto";

import { cookies } from "next/headers";

import { getEnv } from "@/lib/env";
import { getRepos } from "@/lib/services/db";

/**
 * Packs of 8 searches have no accounts: the buyer's browser holds a secret pack code in an
 * httpOnly cookie, and the same code is shown as a link (/pakiet/<code>) for other devices.
 * The code is an HMAC of the Stripe session id, so the return page can set the cookie
 * without waiting for the webhook, and it is useless until the webhook has created the pack.
 */
export const PACK_COOKIE = "pk";
const PACK_CODE = /^[A-Za-z0-9_-]{24}$/;
const SESSION_ID = /^(cs_(test|live)_[A-Za-z0-9]{10,200}|demo_cs_[0-9a-f-]{36})$/;

export function isValidSessionId(value: string): boolean {
  return SESSION_ID.test(value);
}

export function isValidPackCode(value: string): boolean {
  return PACK_CODE.test(value);
}

export function packCodeForSession(sessionId: string): string {
  return createHmac("sha256", getEnv().EMAIL_TOKEN_SECRET).update(`pack:${sessionId}`).digest("base64url").slice(0, 24);
}

export function packCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  };
}

export type PackInfo = { code: string; purchaseId: string; searchesLeft: number; searchesTotal: number };

/** The visitor's pack (from the cookie) or null. Only for server components and route handlers. */
export async function getPackFromCookies(): Promise<PackInfo | null> {
  const code = (await cookies()).get(PACK_COOKIE)?.value;
  if (!code || !isValidPackCode(code)) return null;
  const purchase = await getRepos().purchases.getByPackCode(code);
  if (!purchase || purchase.status !== "paid" || purchase.offer !== "pack8") return null;
  return { code, purchaseId: purchase.id, searchesLeft: purchase.searches_left, searchesTotal: purchase.searches_total };
}
