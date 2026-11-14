import { parseCsvRecords } from "./csv.ts";
import { hostnameOf } from "./google-merchant.ts";
import type { FeedAdapter, RawProduct } from "./types.ts";

/**
 * Awin product feed (CSV). Column names follow Awin's standard feed fields.
 * Check them against a real feed export before going live.
 */
export const awinAdapter: FeedAdapter = {
  network: "awin",
  parse(body, context) {
    return parseCsvRecords(body).map((row) => {
      const stock = (row.in_stock || row.stock_status || "").toLowerCase();
      return {
        externalId: row.aw_product_id || row.merchant_product_id,
        name: row.product_name,
        description: row.description || row.product_short_description,
        price: row.search_price || row.store_price || row.display_price,
        currency: row.currency,
        category: row.merchant_category || row.category_name,
        imageUrl: row.merchant_image_url || row.large_image || row.aw_image_url,
        url: row.aw_deep_link,
        merchant: row.merchant_name || hostnameOf(context.sourceUrl),
        inStock: stock === "" ? true : !["0", "no", "false", "out of stock", "outofstock"].includes(stock),
      } satisfies RawProduct;
    });
  },
};
