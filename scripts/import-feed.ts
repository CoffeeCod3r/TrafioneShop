/**
 * Imports product feeds into the products table (Supabase, or the demo file when MOCK_MODE=true).
 *
 *   npm run import:feed                                   # all feeds from FEED_URLS
 *   npm run import:feed -- --dry-run                      # parse + validate only, no writes
 *   npm run import:feed -- --file scripts/fixtures/sample-awin.csv --network awin --dry-run
 */
import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";

import { parseFeedSources } from "../lib/feeds/config.ts";
import { decodeFeedBody } from "../lib/feeds/fetch.ts";
import { runImport } from "../lib/feeds/import.ts";
import { formatImportStats } from "../lib/feeds/report.ts";
import type { ProductStore } from "../lib/feeds/store.ts";
import type { FeedSource } from "../lib/feeds/types.ts";
import { isRealService } from "../lib/mode.ts";
import { getRepos } from "../lib/services/db.ts";

const { values } = parseArgs({
  options: {
    "dry-run": { type: "boolean", default: false },
    file: { type: "string" },
    network: { type: "string" },
  },
});

const dryRun = values["dry-run"] ?? false;

/** Store that only reports, for --dry-run without a database. */
const dryRunStore: ProductStore = {
  async upsertMany() {},
  async listInStockExternalIds() {
    return [];
  },
  async markOutOfStock() {},
};

async function main() {
  let sources: FeedSource[];
  let loadFeed: ((source: FeedSource) => Promise<string>) | undefined;

  if (values.file) {
    if (!values.network) throw new Error("--file requires --network (awin, webepartners, gmc)");
    const filePath = values.file;
    sources = parseFeedSources(`${values.network}=https://local.file/${encodeURIComponent(filePath)}`);
    loadFeed = async () => decodeFeedBody(new Uint8Array(await readFile(filePath)));
  } else {
    const feedUrls = process.env.FEED_URLS;
    if (!feedUrls) throw new Error("FEED_URLS is not set. Fill it in .env.local or use --file.");
    sources = parseFeedSources(feedUrls);
  }

  if (!dryRun) console.log(`Target: ${isRealService("db") ? "Supabase" : "demo database file (MOCK_MODE=true)"}`);
  const store = dryRun ? dryRunStore : getRepos().products;
  const stats = await runImport({ sources, store, loadFeed, dryRun, log: (message) => console.log(message) });

  console.log("");
  console.log(formatImportStats(stats));
  if (stats.totals.failedFeeds > 0) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
