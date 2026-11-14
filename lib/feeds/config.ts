import { FEED_ADAPTERS } from "./registry.ts";
import type { FeedSource } from "./types.ts";

/**
 * Parses FEED_URLS: whitespace-separated `network=url` entries, e.g.
 *   FEED_URLS="awin=https://productdata.awin.com/... webepartners=https://..."
 * Whitespace is the separator because feed URLs (e.g. Awin column lists) contain commas.
 * Error messages never include URLs: they often contain API keys.
 */
export function parseFeedSources(value: string): FeedSource[] {
  const entries = value.split(/\s+/).filter(Boolean);
  if (entries.length === 0) throw new Error("FEED_URLS is empty");

  return entries.map((entry, index) => {
    const separator = entry.indexOf("=");
    const network = entry.slice(0, separator).trim().toLowerCase();
    const url = entry.slice(separator + 1).trim();
    const position = `entry #${index + 1}`;

    if (separator <= 0) throw new Error(`FEED_URLS ${position}: expected "network=url"`);
    if (!FEED_ADAPTERS[network]) {
      throw new Error(
        `FEED_URLS ${position}: unknown network "${network}" (known: ${Object.keys(FEED_ADAPTERS).join(", ")})`,
      );
    }
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new Error(`FEED_URLS ${position}: invalid URL`);
    }
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      throw new Error(`FEED_URLS ${position}: URL must be http(s)`);
    }
    return { network, url };
  });
}

/** Safe label for logs: network + hostname only. */
export function describeSource(source: FeedSource, index: number): string {
  let host = "invalid-url";
  try {
    host = new URL(source.url).hostname;
  } catch {
    // keep placeholder
  }
  return `#${index + 1} ${source.network} (${host})`;
}
