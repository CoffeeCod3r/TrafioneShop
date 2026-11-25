/**
 * `catalog:tag`: gives interest tags to products that have none (new products from `catalog:build`), by the same
 * category/name rules as the feed import (lib/tags.ts). No AI.
 */
import type { Repos } from "../services/db.ts";
import { tagsForProduct } from "../tags.ts";

export type TagSummary = { checked: number; tagged: number; untaggable: number };

export async function tagProducts(repos: Repos, options: { ids?: string[]; dryRun?: boolean } = {}): Promise<TagSummary> {
  const candidates = options.ids
    ? await repos.products.getByIds(options.ids)
    : await repos.catalog
        .listForVerify({ onlyStale: false, staleBeforeIso: new Date().toISOString() })
        .then((list) => repos.products.getByIds(list.map((product) => product.id)));
  const summary: TagSummary = { checked: 0, tagged: 0, untaggable: 0 };
  for (const product of candidates) {
    if (product.tags.length > 0) continue;
    summary.checked += 1;
    const tags = tagsForProduct(product.category, product.name);
    if (tags.length === 0) {
      summary.untaggable += 1;
      continue;
    }
    if (!options.dryRun) await repos.products.setTags(product.id, tags);
    summary.tagged += 1;
  }
  return summary;
}
