import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "./db.ts";

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
export async function consumeRateLimit(
  db: SupabaseClient<Database>,
  name: RateLimitName,
  subject: string,
): Promise<boolean> {
  const { key, limitPerDay } = RATE_LIMITS[name];
  const { data, error } = await db.rpc("consume_rate_limit", {
    p_key: `${key}:${subject}`,
    p_window_start: dayWindowStart(),
    p_limit: limitPerDay,
  });
  if (error) throw new Error(`Rate limit check failed (${error.code ?? "unknown"})`);
  return data === true;
}
