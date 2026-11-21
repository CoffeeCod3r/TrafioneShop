import { timingSafeEqual } from "node:crypto";

import { z } from "zod";

import { getEnv } from "@/lib/env";
import { describeError, logEvent } from "@/lib/log";
import { handleSearchFailure } from "@/lib/search/job";

const bodySchema = z.object({
  kind: z.enum(["free", "paid"]),
  resultId: z.uuid(),
  purchaseId: z.uuid().optional(),
  reason: z.string().max(100).default("error"),
});

function sameSecret(given: string | null, expected: string): boolean {
  if (!given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * POST /api/internal/search-failed – called by the Supabase Edge Function `run-search` when a search
 * did not deliver (header x-internal-secret = CRON_SECRET). Paid: refund or give the search back to
 * the pack. Free: finish the result from the catalog. Idempotent: a finished result is left alone.
 */
export async function POST(request: Request) {
  if (!sameSecret(request.headers.get("x-internal-secret"), getEnv().CRON_SECRET)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Bad request" }, { status: 400 });

  const { kind, resultId, purchaseId, reason } = parsed.data;
  try {
    await handleSearchFailure({ kind, resultId, purchaseId, count: 0, maxSearches: 0, maxFetches: 0 }, reason);
    return Response.json({ ok: true });
  } catch (error) {
    logEvent("search.failure_callback_failed", { kind, ...describeError(error) });
    return Response.json({ error: "Failed" }, { status: 500 });
  }
}
