/**
 * Pool warm-up: does a quiz combination (recipient + budget + main interest) get 5 good, checked products at once,
 * without AI? Same hard filters and ranking as the free catalog path (lib/picks/candidates.ts):
 *   in stock, price between 40 % and 100 % of the budget, fits the recipient, has the interest tag,
 *   ranked by shared tags and quiz fit (never by commission).
 * Counted products (agreed 27.11.2026): checked ones (status active) and, until they are checked, products from the
 * Webepartners feed (their price comes straight from the feed). Ceneo prices were typed by hand, so a Ceneo product
 * counts only after its page was checked.
 * Healthy = at least 15 candidates and a top 5 from at least 3 categories. Portable (relative imports, no Next.js).
 */
import type { ProductRow, WarmResultRow } from "../db.ts";
import { MIN_PRICE_SHARE, rankCandidates, type Candidate, type CandidateRow } from "../picks/candidates.ts";
import type { Repos } from "../services/db.ts";
import type { AllowedTag } from "../tags.ts";
import { comboKey, type WarmupCombo } from "./warmup-combos.ts";

export const HEALTHY_MIN_CANDIDATES = 15;
export const HEALTHY_MIN_CATEGORIES = 3;
export const WARM_PICKS = 5;
/** Feeds whose prices are trusted before the first page check. */
const TRUSTED_FEED_NETWORKS = new Set(["webepartners", "awin"]);

export function isWarmEligible(product: Pick<ProductRow, "status" | "network">): boolean {
  return product.status === "active" || (product.status === "pending" && TRUSTED_FEED_NETWORKS.has(product.network));
}

export type ComboHealth = {
  combo: WarmupCombo;
  key: string;
  candidates: number;
  top: Candidate[];
  /** Different categories / shops in the top 5. */
  categories: number;
  shops: number;
  /** Average ranking score of the top 5 (shared tags x 2 + lifestyle/gift-type fit). */
  avgScore: number;
  healthy: boolean;
};

function toRow(row: ProductRow): CandidateRow {
  return {
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
  };
}

/** Top N in ranking order, but at most 2 per category so the 5 picks are not all the same kind of thing. */
export function diversify(ranked: Candidate[], count = WARM_PICKS): Candidate[] {
  const picked: Candidate[] = [];
  const perCategory = new Map<string, number>();
  for (const maxPerCategory of [1, 2, Number.POSITIVE_INFINITY]) {
    for (const candidate of ranked) {
      if (picked.length >= count) return picked;
      if (picked.includes(candidate)) continue;
      const category = candidate.category ?? "inne";
      if ((perCategory.get(category) ?? 0) >= maxPerCategory) continue;
      picked.push(candidate);
      perCategory.set(category, (perCategory.get(category) ?? 0) + 1);
    }
  }
  return picked;
}

export async function scoreCombo(repos: Repos, combo: WarmupCombo): Promise<ComboHealth> {
  const rows = await repos.products.findCandidates({
    minPrice: Math.round(combo.budget * MIN_PRICE_SHARE * 100) / 100,
    maxPrice: combo.budget,
    anyOfTags: [combo.interest],
    recipient: combo.recipient,
    limit: 300,
  });
  const eligible = rows.filter(isWarmEligible).map(toRow);
  const tags = [combo.interest] as AllowedTag[];
  const ranked = rankCandidates(eligible, tags, [], { recipient: combo.recipient });
  const top = diversify(ranked);
  const scoreOf = (candidate: Candidate) => candidate.sharedTags.length * 2;
  const categories = new Set(top.map((candidate) => candidate.category ?? "inne")).size;
  return {
    combo,
    key: comboKey(combo),
    candidates: eligible.length,
    top,
    categories,
    shops: new Set(top.map((candidate) => candidate.merchant)).size,
    avgScore: top.length > 0 ? top.reduce((sum, candidate) => sum + scoreOf(candidate), 0) / top.length : 0,
    healthy: eligible.length >= HEALTHY_MIN_CANDIDATES && top.length >= WARM_PICKS && categories >= HEALTHY_MIN_CATEGORIES,
  };
}

const RECIPIENT_FOR: Record<WarmupCombo["recipient"], string> = {
  dad: "taty",
  mom: "mamy",
  girlfriend: "dziewczyny",
  boyfriend: "chłopaka",
  friend: "przyjaciela lub przyjaciółki",
  boss: "szefa lub szefowej",
  grandparent: "dziadka lub babci",
};

/** Template reason (no AI): the interest it fits and the budget it stays in. */
export function warmReason(combo: WarmupCombo, candidate: Candidate): string {
  const extra = candidate.tags.filter((tag) => tag !== combo.interest).slice(0, 2);
  const fits = extra.length > 0 ? `${combo.interest}, ${extra.join(", ")}` : combo.interest;
  return `Pasuje do zainteresowania: ${fits}. Mieści się w budżecie do ${combo.budget} zł.`;
}

export function warmSummary(combo: WarmupCombo): string {
  return `Sprawdzone prezenty dla ${RECIPIENT_FOR[combo.recipient]}, którego interesuje ${combo.interest}, w budżecie do ${combo.budget} zł.`;
}

/** The combinations to warm up: the most frequent real ones when there is enough data, else the starter list. */
export async function warmupCombos(repos: Repos, starter: WarmupCombo[], max = 40): Promise<{ combos: WarmupCombo[]; source: "results" | "starter" }> {
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const recent = await repos.catalog.demandSince(since);
  if (recent.length < 200) return { combos: starter.slice(0, max), source: "starter" };
  // Every interest of a quiz counts as one combination (recipient + budget + that interest).
  const counts = new Map<string, { combo: WarmupCombo; count: number }>();
  for (const row of recent) {
    if (!row.recipient || !row.budget_pln) continue;
    for (const interest of row.interests ?? []) {
      const combo = { recipient: row.recipient, budget: row.budget_pln, interest } as WarmupCombo;
      const key = comboKey(combo);
      counts.set(key, { combo, count: (counts.get(key)?.count ?? 0) + 1 });
    }
  }
  const ranked = [...counts.values()].sort((a, b) => b.count - a.count).map((entry) => entry.combo);
  return { combos: ranked.slice(0, max), source: "results" };
}

// ---------------------------------------------------------------------------
// Filling the gaps (npm run catalog:warmup)
// ---------------------------------------------------------------------------

/** Category given to a warm-up product when the AI names none (it usually does, from POOL_CATEGORIES). */
const INTEREST_CATEGORY: Record<string, string> = {
  kawa: "kawa-herbata",
  herbata: "kawa-herbata",
  gotowanie: "kuchnia",
  pieczenie: "kuchnia",
  słodycze: "kuchnia",
  ogród: "dom",
  rośliny: "dom",
  relaks: "dom",
  świece: "dom",
  uroda: "uroda",
  biżuteria: "uroda",
  książki: "ksiazki",
  majsterkowanie: "hobby",
  wędkarstwo: "outdoor",
  sport: "sport",
  joga: "sport",
  gadżety: "technologia",
  technologia: "technologia",
  gry: "gry",
  planszówki: "gry",
  puzzle: "gry",
  koty: "inne",
  psy: "inne",
};

const RECIPIENT_QUERY: Record<WarmupCombo["recipient"], string> = {
  dad: "dla taty",
  mom: "dla mamy",
  girlfriend: "dla dziewczyny",
  boyfriend: "dla chłopaka",
  friend: "dla przyjaciółki",
  boss: "dla szefa",
  grandparent: "dla babci",
};

/** 3 search hints from a template, no AI. */
export function queriesFor(combo: WarmupCombo): string[] {
  return [
    `prezent ${RECIPIENT_QUERY[combo.recipient]} do ${combo.budget} zł ${combo.interest}`,
    `${combo.interest} prezent ${RECIPIENT_QUERY[combo.recipient]}`,
    `${combo.interest} zestaw prezentowy do ${combo.budget} zł`,
  ];
}

/** The top-up "cell" of a combination for lib/catalog-build (prices 40-100 % of the budget). */
export function comboCell(combo: WarmupCombo, health: Pick<ComboHealth, "candidates">) {
  return {
    category: INTEREST_CATEGORY[combo.interest] ?? "inne",
    band: combo.budget <= 50 ? "do 50" : combo.budget <= 100 ? "50-100" : combo.budget <= 200 ? "100-200" : "200+",
    recipient: combo.recipient,
    active: health.candidates,
    demand: 0,
    interest: combo.interest,
    queries: queriesFor(combo),
    min: Math.round(combo.budget * MIN_PRICE_SHARE * 100) / 100,
    max: combo.budget,
  };
}

/**
 * Products that would count for a combination once checked (status pending, not trusted from a feed, e.g. Ceneo):
 * checking them first may make the combination healthy without any AI.
 */
export async function productsToVerify(repos: Repos, combos: WarmupCombo[]): Promise<string[]> {
  const ids = new Set<string>();
  for (const combo of combos) {
    const rows = await repos.products.findCandidates({
      minPrice: Math.round(combo.budget * MIN_PRICE_SHARE * 100) / 100,
      maxPrice: combo.budget,
      anyOfTags: [combo.interest],
      recipient: combo.recipient,
      limit: 300,
    });
    for (const row of rows) if (row.status === "pending" && !isWarmEligible(row)) ids.add(row.id);
  }
  return [...ids];
}

// ---------------------------------------------------------------------------
// Ready results (warm_results), refreshed by catalog:warmup and every night
// ---------------------------------------------------------------------------

export const WARM_RESULT_HOURS = 24;

/** The warm_results row of a combination: its top 5 with template reasons when healthy, else no products. */
export function toWarmRow(health: ComboHealth, nowMs = Date.now()): WarmResultRow {
  return {
    combo_key: health.key,
    recipient: health.combo.recipient,
    budget: health.combo.budget,
    interest: health.combo.interest,
    product_ids: health.healthy ? health.top.map((candidate) => candidate.id) : [],
    reasons: health.healthy ? Object.fromEntries(health.top.map((candidate) => [candidate.id, warmReason(health.combo, candidate)])) : {},
    summary: health.healthy ? warmSummary(health.combo) : null,
    candidates: health.candidates,
    categories: health.categories,
    healthy: health.healthy,
    refreshed_at: new Date(nowMs).toISOString(),
    expires_at: new Date(nowMs + WARM_RESULT_HOURS * 3_600_000).toISOString(),
  };
}

/** Scores every combination again and stores the ready results (no AI). Returns how many are healthy. */
export async function refreshWarmResults(repos: Repos, combos: WarmupCombo[]): Promise<{ healthy: number; total: number; rows: WarmResultRow[] }> {
  const rows: WarmResultRow[] = [];
  for (const combo of combos) rows.push(toWarmRow(await scoreCombo(repos, combo)));
  await repos.catalog.saveWarmResults(rows);
  return { healthy: rows.filter((row) => row.healthy).length, total: rows.length, rows };
}
