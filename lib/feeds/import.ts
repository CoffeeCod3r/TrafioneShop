import { describeSource } from "./config.ts";
import { fetchFeed } from "./fetch.ts";
import { hostnameOf } from "./google-merchant.ts";
import {
  normalizeProduct,
  REJECT_REASONS,
  type ProductUpsert,
  type RejectReason,
} from "./normalize.ts";
import { getAdapter } from "./registry.ts";
import type { ProductStore } from "./store.ts";
import type { FeedSource } from "./types.ts";

/**
 * Safety net: if a network's feed suddenly has far fewer products than we have in stock,
 * the feed is probably broken. Skip marking products out of stock instead of hiding the catalog.
 */
export const MIN_SEEN_RATIO = 0.5;
export const MIN_PREVIOUS_FOR_RATIO_CHECK = 20;

export type FeedStats = {
  source: string;
  network: string;
  status: "ok" | "failed";
  error?: string;
  parsed: number;
  accepted: number;
  duplicates: number;
  rejected: Record<RejectReason, number>;
  upserted: number;
};

export type NetworkStats = {
  network: string;
  previouslyInStock: number;
  seen: number;
  markedOutOfStock: number;
  skippedReason?: string;
};

export type ImportStats = {
  startedAt: string;
  durationMs: number;
  dryRun: boolean;
  feeds: FeedStats[];
  networks: NetworkStats[];
  totals: {
    feeds: number;
    failedFeeds: number;
    parsed: number;
    accepted: number;
    rejected: number;
    upserted: number;
    markedOutOfStock: number;
  };
};

export type RunImportOptions = {
  sources: FeedSource[];
  store: ProductStore;
  /** Returns the feed text. Defaults to downloading the URL. */
  loadFeed?: (source: FeedSource) => Promise<string>;
  dryRun?: boolean;
  log?: (message: string) => void;
};

function emptyRejected(): Record<RejectReason, number> {
  return Object.fromEntries(REJECT_REASONS.map((reason) => [reason, 0])) as Record<RejectReason, number>;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function runImport({
  sources,
  store,
  loadFeed = (source) => fetchFeed(source.url),
  dryRun = false,
  log = () => {},
}: RunImportOptions): Promise<ImportStats> {
  const started = Date.now();
  const feeds: FeedStats[] = [];
  const seenByNetwork = new Map<string, Set<string>>();
  const failedNetworks = new Set<string>();

  for (const [index, source] of sources.entries()) {
    const label = describeSource(source, index);
    const stats: FeedStats = {
      source: label,
      network: source.network,
      status: "ok",
      parsed: 0,
      accepted: 0,
      duplicates: 0,
      rejected: emptyRejected(),
      upserted: 0,
    };
    feeds.push(stats);
    const seen = seenByNetwork.get(source.network) ?? new Set<string>();
    seenByNetwork.set(source.network, seen);

    try {
      log(`Feed ${label}: downloading`);
      const adapter = getAdapter(source.network);
      const body = await loadFeed(source);
      const rawProducts = adapter.parse(body, { sourceUrl: source.url });
      stats.parsed = rawProducts.length;

      const byExternalId = new Map<string, ProductUpsert>();
      const fallbackMerchant = hostnameOf(source.url);
      for (const raw of rawProducts) {
        const result = normalizeProduct(raw, source.network, fallbackMerchant);
        if (!result.ok) {
          stats.rejected[result.reason]++;
          // Rejected products count as "not in the feed" and get marked out of stock.
          continue;
        }
        if (byExternalId.has(result.product.external_id)) stats.duplicates++;
        byExternalId.set(result.product.external_id, result.product);
      }

      const rows = [...byExternalId.values()];
      stats.accepted = rows.length;
      for (const row of rows) if (row.in_stock !== false) seen.add(row.external_id);

      if (!dryRun && rows.length > 0) await store.upsertMany(rows);
      stats.upserted = dryRun ? 0 : rows.length;
      log(`Feed ${label}: parsed ${stats.parsed}, accepted ${stats.accepted}`);
    } catch (error) {
      stats.status = "failed";
      stats.error = errorMessage(error);
      failedNetworks.add(source.network);
      log(`Feed ${label}: FAILED – ${stats.error}`);
    }
  }

  const networks: NetworkStats[] = [];
  for (const [network, seen] of seenByNetwork) {
    const stats: NetworkStats = { network, previouslyInStock: 0, seen: seen.size, markedOutOfStock: 0 };
    networks.push(stats);

    if (failedNetworks.has(network)) {
      stats.skippedReason = "a feed for this network failed";
      continue;
    }
    if (seen.size === 0) {
      stats.skippedReason = "no in-stock products in feed";
      continue;
    }

    try {
      const previous = await store.listInStockExternalIds(network);
      stats.previouslyInStock = previous.length;

      if (previous.length >= MIN_PREVIOUS_FOR_RATIO_CHECK && seen.size < previous.length * MIN_SEEN_RATIO) {
        stats.skippedReason = `feed has only ${seen.size} of ${previous.length} in-stock products (safety check)`;
        continue;
      }

      const missing = previous.filter((externalId) => !seen.has(externalId));
      if (!dryRun && missing.length > 0) await store.markOutOfStock(network, missing);
      stats.markedOutOfStock = missing.length;
    } catch (error) {
      stats.skippedReason = `stale check failed: ${errorMessage(error)}`;
    }
  }

  const sum = (pick: (feed: FeedStats) => number) => feeds.reduce((total, feed) => total + pick(feed), 0);
  return {
    startedAt: new Date(started).toISOString(),
    durationMs: Date.now() - started,
    dryRun,
    feeds,
    networks,
    totals: {
      feeds: feeds.length,
      failedFeeds: feeds.filter((feed) => feed.status === "failed").length,
      parsed: sum((feed) => feed.parsed),
      accepted: sum((feed) => feed.accepted),
      rejected: sum((feed) => Object.values(feed.rejected).reduce((a, b) => a + b, 0)),
      upserted: sum((feed) => feed.upserted),
      markedOutOfStock: networks.reduce((total, network) => total + network.markedOutOfStock, 0),
    },
  };
}
