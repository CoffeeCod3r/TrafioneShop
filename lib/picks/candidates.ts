import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, ProductRow } from "../db.ts";
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

const CANDIDATE_COLUMNS =
  "id, name, description, price_pln, merchant, category, tags, image_url, affiliate_url, commission_rate" as const;

type CandidateRow = Omit<Candidate, "sharedTags">;

/** Postgres array literal. Tags come from ALLOWED_TAGS, quoting handles Polish characters. */
function pgArray(values: readonly string[]): string {
  return `{${values.map((value) => `"${value.replace(/["\\]/g, "")}"`).join(",")}}`;
}

/** Sorts by number of shared tags, then commission_rate (desc, nulls last), then price (desc). */
export function rankCandidates(rows: CandidateRow[], tags: readonly AllowedTag[], avoid: readonly AllowedTag[]): Candidate[] {
  const wanted = new Set<string>(tags);
  const avoided = new Set<string>(avoid);
  return rows
    .filter((row) => !row.tags.some((tag) => avoided.has(tag)))
    .map((row) => ({ ...row, sharedTags: row.tags.filter((tag) => wanted.has(tag)) as AllowedTag[] }))
    .sort(
      (a, b) =>
        b.sharedTags.length - a.sharedTags.length ||
        (b.commission_rate ?? -1) - (a.commission_rate ?? -1) ||
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
  relaxed: "none" | "tags" | "tags_and_price";
};

/**
 * Up to 40 in-stock products priced 40–100% of the budget, sharing at least one tag and
 * having none of the avoided tags. With fewer than 10, the tag condition is dropped;
 * with fewer than 5, the lower price bound is dropped too.
 */
export async function selectCandidates(
  db: SupabaseClient<Database>,
  options: { budget: number; tags: readonly AllowedTag[]; avoid: readonly AllowedTag[] },
): Promise<CandidateSelection> {
  const { budget, tags, avoid } = options;

  async function fetchRows(minPrice: number, requireTags: boolean): Promise<CandidateRow[]> {
    let query = db
      .from("products")
      .select(CANDIDATE_COLUMNS)
      .eq("in_stock", true)
      .gte("price_pln", minPrice)
      .lte("price_pln", budget);
    if (requireTags && tags.length > 0) query = query.overlaps("tags", [...tags]);
    if (avoid.length > 0) query = query.not("tags", "ov", pgArray(avoid));
    const { data, error } = await query
      .order("commission_rate", { ascending: false, nullsFirst: false })
      .limit(FETCH_LIMIT);
    if (error) throw new Error(`Candidate query failed (${error.code ?? "unknown"})`);
    return data;
  }

  const minPrice = Math.round(budget * MIN_PRICE_SHARE * 100) / 100;
  let candidates = rankCandidates(await fetchRows(minPrice, true), tags, avoid).slice(0, MAX_CANDIDATES);
  if (candidates.length >= MIN_CANDIDATES_BEFORE_RELAXING) return { candidates, relaxed: "none" };

  candidates = mergeUnique(candidates, rankCandidates(await fetchRows(minPrice, false), tags, avoid), MAX_CANDIDATES);
  if (candidates.length >= PICKS_COUNT) return { candidates, relaxed: "tags" };

  candidates = mergeUnique(candidates, rankCandidates(await fetchRows(0, false), tags, avoid), MAX_CANDIDATES);
  return { candidates, relaxed: "tags_and_price" };
}
