import { timingSafeEqual } from "node:crypto";

import { getDb } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { runImport } from "@/lib/feeds/import";
import { formatImportStats } from "@/lib/feeds/report";
import { supabaseProductStore } from "@/lib/feeds/store";

// Node.js runtime and dynamic rendering are the defaults (cacheComponents forbids `runtime`/`dynamic` exports).
// Feeds can be large; Vercel caps this per plan.
export const maxDuration = 300;

function isAuthorized(header: string | null, secret: string): boolean {
  if (!header) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const received = Buffer.from(header);
  return received.length === expected.length && timingSafeEqual(received, expected);
}

/** Daily product feed import. Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. */
export async function GET(request: Request) {
  const env = getEnv();
  if (!isAuthorized(request.headers.get("authorization"), env.CRON_SECRET)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const stats = await runImport({
    sources: env.FEED_URLS,
    store: supabaseProductStore(getDb()),
    log: (message) => console.log(`[import] ${message}`),
  });
  console.log(formatImportStats(stats));

  const allFailed = stats.totals.feeds > 0 && stats.totals.failedFeeds === stats.totals.feeds;
  return Response.json(stats, { status: allFailed ? 500 : 200 });
}
