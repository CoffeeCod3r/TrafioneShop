import { getRepos } from "./services/db.ts";

export const RATE_LIMITS = {
  analyzeWithPhoto: { key: "analyze:photo", limitPerDay: 3 },
  analyzeWithoutPhoto: { key: "analyze:text", limitPerDay: 20 },
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
