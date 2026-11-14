import { createHmac, timingSafeEqual } from "node:crypto";

import { getEnv } from "@/lib/env";

import type { SubscribeOccasion } from "./schema";

/**
 * Signed, stateless links for double opt-in and unsubscribe (HMAC-SHA256 with EMAIL_TOKEN_SECRET).
 * No extra database columns needed; the email itself is the subscriber key.
 */

export const CONFIRM_TOKEN_TTL_DAYS = 7;

type ConfirmPayload = { p: "confirm"; e: string; o: SubscribeOccasion[]; x: number };
type UnsubscribePayload = { p: "unsub"; e: string };
type Payload = ConfirmPayload | UnsubscribePayload;

function sign(data: string): string {
  return createHmac("sha256", getEnv().EMAIL_TOKEN_SECRET).update(data).digest("base64url");
}

function encode(payload: Payload): string {
  const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${data}.${sign(data)}`;
}

function decode(token: string | null | undefined): Payload | null {
  if (!token || token.length > 2000) return null;
  const [data, signature] = token.split(".");
  if (!data || !signature) return null;
  const expected = Buffer.from(sign(data));
  const received = Buffer.from(signature);
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) return null;
  try {
    return JSON.parse(Buffer.from(data, "base64url").toString("utf8")) as Payload;
  } catch {
    return null;
  }
}

export function createConfirmToken(email: string, occasions: SubscribeOccasion[]): string {
  const expires = Math.floor(Date.now() / 1000) + CONFIRM_TOKEN_TTL_DAYS * 24 * 3600;
  return encode({ p: "confirm", e: email, o: occasions, x: expires });
}

export function readConfirmToken(token: string | null | undefined): { email: string; occasions: SubscribeOccasion[] } | null {
  const payload = decode(token);
  if (!payload || payload.p !== "confirm") return null;
  if (payload.x < Math.floor(Date.now() / 1000)) return null;
  return { email: payload.e, occasions: payload.o };
}

/** Unsubscribe links never expire: they must work in every old email. */
export function createUnsubscribeToken(email: string): string {
  return encode({ p: "unsub", e: email });
}

export function readUnsubscribeToken(token: string | null | undefined): { email: string } | null {
  const payload = decode(token);
  return payload && payload.p === "unsub" ? { email: payload.e } : null;
}
