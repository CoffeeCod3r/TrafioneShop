import { createHmac } from "node:crypto";

import { todaySpendPln } from "@/lib/admin/stats";
import type { ResultRow } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { normalizeDescription, type QuizAnswers } from "@/lib/quiz/schema";
import { consumeRateLimit } from "@/lib/rate-limit";
import { hashIp } from "@/lib/request";
import { getRepos } from "@/lib/services/db";

/** The same quiz gets the same ready products for this long, without a new web search. */
export const RESULT_MEMORY_HOURS = 24;
export const DEVICE_COOKIE = "dv";

const collapse = (value: string) => value.toLowerCase().replace(/\s+/g, " ").trim();

/**
 * Salted hash of the quiz answers: the key of the result memory. The photo is never part of it.
 * With a photo, the style-profile tags (derived from the photo) are mixed in, so two different people
 * with the same quiz answers do not get each other's results.
 */
export function quizHash(answers: QuizAnswers, photoTags: readonly string[] | null): string {
  const normalized = {
    r: answers.recipient,
    b: answers.budget,
    o: answers.occasion,
    i: [...answers.interests].sort(),
    l: answers.lifestyle,
    g: answers.giftType,
    w: collapse(answers.ownedItems ?? ""),
    // The description changes what is searched for, so it is part of the key (lowercase, no punctuation).
    d: normalizeDescription(answers.description ?? ""),
    t: photoTags ? [...photoTags].sort() : null,
  };
  return createHmac("sha256", getEnv().IP_HASH_SALT).update(`quiz:${JSON.stringify(normalized)}`).digest("hex");
}

/** A ready web-search result for this quiz from the last 24 hours, if any. */
export function findRememberedResult(hash: string): Promise<ResultRow | null> {
  const since = new Date(Date.now() - RESULT_MEMORY_HOURS * 3600 * 1000).toISOString();
  return getRepos().results.findCachedByHash(hash, since);
}

/** True when the daily AI budget is used up: free results then come from the catalog, paid searches go on. */
export async function isDailyBudgetExceeded(): Promise<boolean> {
  return (await todaySpendPln()) >= getEnv().DAILY_AI_BUDGET_PLN;
}

/**
 * At most 3 free web searches per day per device (cookie) and per IP address.
 * Returns false when either limit is used up; the result then comes from the catalog.
 */
export async function consumeFreeWebSlot(ip: string, deviceId: string): Promise<boolean> {
  const salt = getEnv().IP_HASH_SALT;
  const byDevice = await consumeRateLimit("freeWeb", `dev:${hashIp(deviceId, salt)}`);
  const byIp = await consumeRateLimit("freeWeb", `ip:${hashIp(ip, salt)}`);
  return byDevice && byIp;
}
