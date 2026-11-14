import type { ImportStats } from "./import.ts";

/** Human-readable import summary (no URLs, no secrets). */
export function formatImportStats(stats: ImportStats): string {
  const lines: string[] = [];
  lines.push(
    `Import ${stats.dryRun ? "(DRY RUN) " : ""}started ${stats.startedAt}, took ${(stats.durationMs / 1000).toFixed(1)} s`,
  );
  lines.push("");
  lines.push("Feeds:");
  for (const feed of stats.feeds) {
    const rejected = Object.entries(feed.rejected)
      .filter(([, count]) => count > 0)
      .map(([reason, count]) => `${reason}=${count}`)
      .join(", ");
    lines.push(
      `  ${feed.source}: ${feed.status.toUpperCase()}` +
        (feed.error ? ` (${feed.error})` : "") +
        ` | parsed ${feed.parsed}, accepted ${feed.accepted}, duplicates ${feed.duplicates}, upserted ${feed.upserted}` +
        (rejected ? ` | rejected: ${rejected}` : ""),
    );
  }
  lines.push("");
  lines.push("Networks:");
  for (const network of stats.networks) {
    lines.push(
      `  ${network.network}: in feed ${network.seen}, previously in stock ${network.previouslyInStock}, ` +
        `marked out of stock ${network.markedOutOfStock}` +
        (network.skippedReason ? ` | skipped: ${network.skippedReason}` : ""),
    );
  }
  const t = stats.totals;
  lines.push("");
  lines.push(
    `Totals: feeds ${t.feeds} (failed ${t.failedFeeds}), parsed ${t.parsed}, accepted ${t.accepted}, ` +
      `rejected ${t.rejected}, upserted ${t.upserted}, marked out of stock ${t.markedOutOfStock}`,
  );
  return lines.join("\n");
}
