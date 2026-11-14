import { awinAdapter } from "./awin.ts";
import { googleMerchantAdapter } from "./google-merchant.ts";
import type { FeedAdapter } from "./types.ts";
import { webepartnersAdapter } from "./webepartners.ts";

/**
 * Network name (as used in FEED_URLS and products.network) → adapter.
 * To add a network: create lib/feeds/<network>.ts and register it here.
 */
export const FEED_ADAPTERS: Record<string, FeedAdapter> = {
  awin: awinAdapter,
  webepartners: webepartnersAdapter,
  // Generic Google Merchant XML from a shop we partner with directly.
  gmc: googleMerchantAdapter("gmc"),
};

export function getAdapter(network: string): FeedAdapter {
  const adapter = FEED_ADAPTERS[network];
  if (!adapter) {
    throw new Error(
      `Unknown feed network "${network}". Known: ${Object.keys(FEED_ADAPTERS).join(", ")}`,
    );
  }
  return adapter;
}
