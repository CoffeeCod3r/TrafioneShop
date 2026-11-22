import type { ProductRow } from "../db.ts";
import { getRepos } from "../services/db.ts";
import type { AllowedTag } from "../tags.ts";

export const MAX_CANDIDATES = 40;
export const MIN_CANDIDATES_BEFORE_RELAXING = 10;
export const PICKS_COUNT = 5;
/** Lower price bound as a share of the budget. */
export const MIN_PRICE_SHARE = 0.4;
/** How many rows to fetch per query before ranking in code. */
const FETCH_LIMIT = 300;

export type Candidate = Pick<
  ProductRow,
  "id" | "name" | "description" | "price_pln" | "merchant" | "category" | "tags" | "image_url" | "affiliate_url" | "commission_rate"
> & { sharedTags: AllowedTag[] };

type CandidateRow = Omit<Candidate, "sharedTags">;

/** Sorts by number of shared tags, then price (desc). The commission never influences the order. */
export function rankCandidates(rows: CandidateRow[], tags: readonly AllowedTag[], avoid: readonly AllowedTag[]): Candidate[] {
  const wanted = new Set<string>(tags);
  const avoided = new Set<string>(avoid);
  return rows
    .filter((row) => !row.tags.some((tag) => avoided.has(tag)))
    .map((row) => ({ ...row, sharedTags: row.tags.filter((tag) => wanted.has(tag)) as AllowedTag[] }))
    .sort(
      (a, b) =>
        b.sharedTags.length - a.sharedTags.length ||
        b.price_pln - a.price_pln,
    );
}

function mergeUnique(primary: Candidate[], extra: Candidate[], limit: number): Candidate[] {
  const seen = new Set(primary.map((item) => item.id));
  const merged = [...primary];
  for (const item of extra) {
    if (merged.length >= limit) break;
    if (!seen.has(item.id)) {
      merged.push(item);
      seen.add(item.id);
    }
  }
  return merged.slice(0, limit);
}

export type CandidateSelection = {
  candidates: Candidate[];
  /** Which conditions had to be relaxed to find enough products. */
  relaxed: "none" | "price" | "tags" | "tags_and_price";
};

/**
 * Up to 40 in-stock products priced 40–100% of the budget, sharing at least one tag and
 * having none of the avoided tags. With fewer than 10, the lower price bound is dropped first,
 * then the tag condition (on-topic products still rank first), and finally both.
 */
export async function selectCandidates(options: {
  budget: number;
  tags: readonly AllowedTag[];
  avoid: readonly AllowedTag[];
}): Promise<CandidateSelection> {
  const { budget, tags, avoid } = options;
  const products = getRepos().products;

  async function fetchRows(minPrice: number, requireTags: boolean): Promise<CandidateRow[]> {
    const rows = await products.findCandidates({
      minPrice,
      maxPrice: budget,
      anyOfTags: requireTags ? tags : undefined,
      noneOfTags: avoid,
      limit: FETCH_LIMIT,
    });
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      price_pln: row.price_pln,
      merchant: row.merchant,
      category: row.category,
      tags: row.tags,
      image_url: row.image_url,
      affiliate_url: row.affiliate_url,
      commission_rate: row.commission_rate,
    }));
  }

  const minPrice = Math.round(budget * MIN_PRICE_SHARE * 100) / 100;
  let candidates = rankCandidates(await fetchRows(minPrice, true), tags, avoid).slice(0, MAX_CANDIDATES);
  if (candidates.length >= MIN_CANDIDATES_BEFORE_RELAXING) return { candidates, relaxed: "none" };

  // 1. Drop the price floor first: a cheaper gift on topic beats an off-topic one.
  candidates = mergeUnique(candidates, rankCandidates(await fetchRows(0, true), tags, avoid), MAX_CANDIDATES);
  if (candidates.length >= MIN_CANDIDATES_BEFORE_RELAXING) return { candidates, relaxed: "price" };

  // 2. Still too few: drop the tag condition (on-topic products stay first because of the ranking).
  candidates = mergeUnique(candidates, rankCandidates(await fetchRows(minPrice, false), tags, avoid), MAX_CANDIDATES);
  if (candidates.length >= PICKS_COUNT) return { candidates, relaxed: "tags" };

  candidates = mergeUnique(candidates, rankCandidates(await fetchRows(0, false), tags, avoid), MAX_CANDIDATES);
  return { candidates, relaxed: "tags_and_price" };
}
