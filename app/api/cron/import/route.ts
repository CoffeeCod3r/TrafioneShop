import { getEnv } from "@/lib/env";
import { runImport } from "@/lib/feeds/import";
import { formatImportStats } from "@/lib/feeds/report";
import { describeError, logEvent } from "@/lib/log";
import { recoverStuckPayments } from "@/lib/paid/recover";
import { hasCronSecret } from "@/lib/secret";
import { getRepos } from "@/lib/services/db";

// Node.js runtime and dynamic rendering are the defaults (cacheComponents forbids `runtime`/`dynamic` exports).
// Feeds can be large; Vercel caps this per plan.
export const maxDuration = 300;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Daily housekeeping: old rate-limit windows, sign-ups never confirmed within 7 days, stuck paid searches. */
async function cleanup() {
  const repos = getRepos();
  try {
    const rateLimits = await repos.rateLimits.deleteOlderThan(new Date(Date.now() - 2 * DAY_MS).toISOString());
    const subscribers = await repos.subscribers.deleteUnconfirmedOlderThan(new Date(Date.now() - 7 * DAY_MS).toISOString());
    const stuckPayments = await recoverStuckPayments();
    logEvent("cron.cleanup", { rateLimits, subscribers, stuckPayments });
  } catch (error) {
    logEvent("cron.cleanup_failed", describeError(error));
  }
}

/** Daily product feed import. Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. */
export async function GET(request: Request) {
  const env = getEnv();
  if (!hasCronSecret(request, env.CRON_SECRET)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  await cleanup();

  if (!env.FEED_URLS?.length) {
    // Demo mode without feeds: the catalog comes from data/sample-products.json.
    return Response.json({ skipped: "FEED_URLS not set" });
  }

  const stats = await runImport({
    sources: env.FEED_URLS,
    store: getRepos().products,
    log: (message) => console.log(`[import] ${message}`),
  });
  console.log(formatImportStats(stats));

  const allFailed = stats.totals.feeds > 0 && stats.totals.failedFeeds === stats.totals.feeds;
  return Response.json(stats, { status: allFailed ? 500 : 200 });
}
