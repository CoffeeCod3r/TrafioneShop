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
/**
 * Pool strict mode (POOL_STRICT=true): free results use only products with status 'active' checked in the last
 * 7 days. Off by default until the nightly check has gone through the whole pool, or the free catalog path would
 * run empty.
 */
export const POOL_FRESH_DAYS = 7;
const poolStrict = () => /^(1|true|yes|on)$/i.test(process.env.POOL_STRICT ?? "");

export type Candidate = Pick<
  ProductRow,
  "id" | "name" | "description" | "price_pln" | "merchant" | "category" | "tags" | "image_url" | "affiliate_url" | "commission_rate" | "network"
> & { sharedTags: AllowedTag[] };

type CandidateRow = Omit<Candidate, "sharedTags"> & Pick<ProductRow, "gift_types" | "lifestyles">;

/** Quiz answers beyond the interests that the catalog is matched on (codes from lib/quiz/schema.ts). */
export type QuizFit = { recipient?: string; lifestyle?: string; giftType?: string };

/** The quiz fit from saved or submitted answers. */
export function quizFit(answers: { recipient: string; lifestyle: string; giftType: string }): QuizFit {
  return { recipient: answers.recipient, lifestyle: answers.lifestyle, giftType: answers.giftType };
}

/** 1 point each when the product is tagged with the chosen lifestyle or gift type. */
function fitScore(row: CandidateRow, fit: QuizFit): number {
  let score = 0;
  if (fit.lifestyle && row.lifestyles?.includes(fit.lifestyle)) score += 1;
  if (fit.giftType && row.gift_types?.includes(fit.giftType)) score += 1;
  return score;
}

/**
 * Sorts by shared tags (weight 2) plus the lifestyle and gift-type fit (1 each), then price (desc).
 * The recipient is already filtered in the query. The commission never influences the order.
 */
export function rankCandidates(
  rows: CandidateRow[],
  tags: readonly AllowedTag[],
  avoid: readonly AllowedTag[],
  fit: QuizFit = {},
): Candidate[] {
  const wanted = new Set<string>(tags);
  const avoided = new Set<string>(avoid);
  return rows
    .filter((row) => !row.tags.some((tag) => avoided.has(tag)))
    .map((row) => {
      const sharedTags = row.tags.filter((tag) => wanted.has(tag)) as AllowedTag[];
      return { candidate: { ...row, sharedTags }, score: sharedTags.length * 2 + fitScore(row, fit) };
    })
    .sort((a, b) => b.score - a.score || b.candidate.price_pln - a.candidate.price_pln)
    .map(({ candidate }) => candidate);
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
  /** Recipient, lifestyle and gift type from the quiz; products for another recipient are never returned. */
  fit?: QuizFit;
}): Promise<CandidateSelection> {
  const { budget, tags, avoid, fit = {} } = options;
  const products = getRepos().products;

  async function fetchRows(minPrice: number, requireTags: boolean): Promise<CandidateRow[]> {
    const rows = await products.findCandidates({
      minPrice,
      maxPrice: budget,
      anyOfTags: requireTags ? tags : undefined,
      noneOfTags: avoid,
      recipient: fit.recipient,
      freshWithinDays: poolStrict() ? POOL_FRESH_DAYS : undefined,
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
      network: row.network,
      gift_types: row.gift_types,
      lifestyles: row.lifestyles,
    }));
  }

  const minPrice = Math.round(budget * MIN_PRICE_SHARE * 100) / 100;
  let candidates = rankCandidates(await fetchRows(minPrice, true), tags, avoid, fit).slice(0, MAX_CANDIDATES);
  if (candidates.length >= MIN_CANDIDATES_BEFORE_RELAXING) return { candidates, relaxed: "none" };

  // 1. Drop the price floor first: a cheaper gift on topic beats an off-topic one.
  candidates = mergeUnique(candidates, rankCandidates(await fetchRows(0, true), tags, avoid, fit), MAX_CANDIDATES);
  if (candidates.length >= MIN_CANDIDATES_BEFORE_RELAXING) return { candidates, relaxed: "price" };

  // 2. Still too few: drop the tag condition (on-topic products stay first because of the ranking).
  candidates = mergeUnique(candidates, rankCandidates(await fetchRows(minPrice, false), tags, avoid, fit), MAX_CANDIDATES);
  if (candidates.length >= PICKS_COUNT) return { candidates, relaxed: "tags" };

  candidates = mergeUnique(candidates, rankCandidates(await fetchRows(0, false), tags, avoid, fit), MAX_CANDIDATES);
  return { candidates, relaxed: "tags_and_price" };
}
