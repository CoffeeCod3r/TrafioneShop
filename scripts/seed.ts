/**
 * Loads the 50 sample products from data/sample-products.json.
 *
 *   npm run seed              # MOCK_MODE=true: demo file; MOCK_MODE=false: Supabase
 *   npm run seed -- --dry-run # print what would be written
 *
 * Safe to run repeatedly: upserts by (network, external_id).
 * In Supabase, relative demo links/images are made absolute with NEXT_PUBLIC_SITE_URL.
 */
import { parseArgs } from "node:util";

import sampleProducts from "../data/sample-products.json" with { type: "json" };
import type { ProductUpsert } from "../lib/feeds/normalize.ts";
import { isRealService } from "../lib/mode.ts";
import { getRepos } from "../lib/services/db.ts";

async function main() {
  const { values } = parseArgs({ options: { "dry-run": { type: "boolean", default: false } } });
  const mock = !isRealService("db");
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const absolute = (url: string) => (mock || !url.startsWith("/") ? url : `${siteUrl}${url}`);

  const rows: ProductUpsert[] = sampleProducts.map((product) => ({
    network: product.network,
    merchant: product.merchant,
    external_id: product.external_id,
    name: product.name,
    description: product.description,
    price_pln: product.price_pln,
    category: product.category,
    tags: product.tags,
    image_url: absolute(product.image_url),
    affiliate_url: absolute(product.affiliate_url),
    in_stock: product.in_stock,
  }));

  const tagCounts = new Map<string, number>();
  for (const row of rows) for (const tag of row.tags ?? []) tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
  console.log(`Sample products: ${rows.length}, distinct tags: ${tagCounts.size}`);

  if (values["dry-run"]) {
    console.table(rows.map((row) => ({ id: row.external_id, price: row.price_pln, tags: row.tags?.join(", ") })));
    return;
  }

  await getRepos().products.upsertMany(rows);
  console.log(`Upserted ${rows.length} products into ${mock ? "the demo database file" : "Supabase"}.`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
