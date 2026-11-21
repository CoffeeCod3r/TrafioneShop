import { getRepos } from "./services/db.ts";

/** Daily limits per hashed IP (or per hashed email for subscribeEmail). */
export const RATE_LIMITS = {
  analyzeWithPhoto: { key: "analyze:photo", limitPerDay: 3 },
  analyzeWithoutPhoto: { key: "analyze:text", limitPerDay: 20 },
  checkout: { key: "checkout", limitPerDay: 20 },
  /** Free web searches (SOURCE_MODE=web) per device and per IP; above it the result comes from the catalog. */
  freeWeb: { key: "free_web", limitPerDay: 3 },
  /** Using a search from a pack of 8. */
  redeem: { key: "redeem", limitPerDay: 40 },
  quizStart: { key: "quiz_start", limitPerDay: 40 },
  subscribe: { key: "subscribe", limitPerDay: 5 },
  /** Confirmation emails to one address, so nobody can flood someone else's inbox. */
  subscribeEmail: { key: "subscribe_email", limitPerDay: 2 },
  adminLogin: { key: "admin_login", limitPerDay: 10 },
} as const;

export type RateLimitName = keyof typeof RATE_LIMITS;

/** Start of the current UTC day (the daily window). */
export function dayWindowStart(now = new Date()): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
}

/**
 * Atomically consumes one unit of the limit. Returns false when the limit is reached.
 * Throws on database errors so callers can fail closed.
 */
export async function consumeRateLimit(name: RateLimitName, subject: string): Promise<boolean> {
  const { key, limitPerDay } = RATE_LIMITS[name];
  return getRepos().rateLimits.consume(`${key}:${subject}`, dayWindowStart(), limitPerDay);
}
