import type { ClickRow, FreeSource, PriceVariant, PurchaseRow } from "@/lib/db";
import { AI_PRICES, usageCostUsd } from "@/lib/ai/cost";
import { getEnv } from "@/lib/env";
import type { ResultStatsRow } from "@/lib/services/db";
import { getRepos } from "@/lib/services/db";

export { AI_PRICES, usageCostUsd };
const FREE_STEPS = new Set(["profile", "picks", "free_web_search"]);
const PAID_STEPS = new Set(["web_search", "dedications"]);

export type Period = "dzis" | "7d" | "calosc";
export const PERIODS: { value: Period; label: string }[] = [
  { value: "dzis", label: "Dziś" },
  { value: "7d", label: "7 dni" },
  { value: "calosc", label: "Całość" },
];

const DIRECT = "(bezpośrednio)";

/** Start of the period: midnight in Europe/Warsaw, now − 7 days, or the beginning of time. */
export function periodStart(period: Period, now = new Date()): string {
  if (period === "calosc") return new Date(0).toISOString();
  if (period === "7d") return new Date(now.getTime() - 7 * 24 * 3600 * 1000).toISOString();
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Warsaw",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(now)
      .map((part) => [part.type, part.value]),
  );
  const wallClock = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute);
  const offset = Math.round((wallClock - now.getTime()) / 60000) * 60000;
  return new Date(Date.UTC(+parts.year, +parts.month - 1, +parts.day) - offset).toISOString();
}

const ratio = (a: number, b: number) => (b > 0 ? a / b : null);
const netRevenue = (purchases: PurchaseRow[]) =>
  purchases.filter((p) => p.status === "paid").reduce((sum, p) => sum + Number(p.amount_pln), 0);

export type PriceTestRow = {
  variant: PriceVariant;
  results: number;
  payments: number;
  conversion: number | null;
  revenuePer100Results: number | null;
  refundRate: number | null;
};

export type SourceRow = {
  source: string;
  starts: number;
  results: number;
  completion: number | null;
  clicks: number;
  payments: number;
  revenue: number;
  revenuePerResult: number | null;
};

/** AI spending since midnight (Warsaw), in PLN, from ai_usage (free and paid together). */
export async function todaySpendPln(): Promise<number> {
  const rows = await getRepos().aiUsage.listSince(periodStart("dzis"));
  return rows.reduce((sum, row) => sum + usageCostUsd(row), 0) * getEnv().USD_PLN_RATE;
}

export type FreeSourceCounts = Record<FreeSource | "unknown", number>;

export type AdminStats = {
  since: string;
  quizStarts: number;
  results: number;
  completion: number | null;
  clicks: number;
  clicksBySource: Record<ClickRow["source"], number>;
  clicksPerResult: number | null;
  topProducts: { productId: string; name: string; merchant: string; clicks: number }[];
  priceTest: PriceTestRow[];
  /** Where the free picks of the period's results came from. */
  freeSources: FreeSourceCounts;
  /** Result memory hits among results that needed picks (cache / (cache + fresh web search)). */
  cacheHitRate: number | null;
  /** Daily AI budget (DAILY_AI_BUDGET_PLN) and today's spending. */
  dailyBudget: { limitPln: number; spentPln: number; share: number };
  payments: number;
  refunds: number;
  revenue: number;
  revenuePerVisit: number | null;
  ai: {
    usdPlnRate: number;
    freeUsd: number;
    paidUsd: number;
    freePln: number;
    paidPln: number;
    paidSearches: number;
    avgPaidSearchPln: number | null;
    /** Free web searches (SOURCE_MODE=web): count, cost and average cost. */
    freeWebSearches: number;
    freeWebPln: number;
    avgFreeWebSearchPln: number | null;
    freeCostPerResultPln: number | null;
    tokens: { input: number; output: number };
    webSearches: number;
    webFetches: number;
  };
  sources: SourceRow[];
};

export async function getAdminStats(period: Period): Promise<AdminStats> {
  const since = periodStart(period);
  const repos = getRepos();
  const [results, clicks, purchases, usage, starts] = await Promise.all([
    repos.results.listForStats(since),
    repos.clicks.listSince(since),
    repos.purchases.listSince(since),
    repos.aiUsage.listSince(since),
    repos.quizStarts.listSince(since),
  ]);

  // Funnel
  const clicksBySource = { free: 0, share: 0, web: 0, "free-web": 0, "paid-web": 0, catalog: 0 } as Record<ClickRow["source"], number>;
  for (const click of clicks) clicksBySource[click.source]++;

  // Top 20 products by clicks
  const productClicks = new Map<string, number>();
  for (const click of clicks) if (click.product_id) productClicks.set(click.product_id, (productClicks.get(click.product_id) ?? 0) + 1);
  const topIds = [...productClicks.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20);
  const products = new Map((await repos.products.getByIds(topIds.map(([id]) => id))).map((p) => [p.id, p]));
  const topProducts = topIds.map(([productId, count]) => ({
    productId,
    name: products.get(productId)?.name ?? "(usunięty produkt)",
    merchant: products.get(productId)?.merchant ?? "",
    clicks: count,
  }));

  // Price test
  // One row per price seen in the period: legacy A/B prices (499 / 999 on results and purchases) and the
  // current offers (purchases: 499 single, 1499 pack of 10; 1299 / 1999 legacy pack of 8).
  const variants = [...new Set([...results.map((r) => r.price_variant), ...purchases.map((p) => p.price_variant)])]
    .filter((variant): variant is number => typeof variant === "number")
    .sort((a, b) => a - b);
  const priceTest: PriceTestRow[] = variants.map((variant) => {
    const variantResults = results.filter((r) => r.price_variant === variant).length;
    const variantPurchases = purchases.filter((p) => p.price_variant === variant);
    const refunded = variantPurchases.filter((p) => p.status === "refunded").length;
    const revenue = netRevenue(variantPurchases);
    return {
      variant,
      results: variantResults,
      payments: variantPurchases.length,
      conversion: ratio(variantPurchases.length, variantResults),
      revenuePer100Results: variantResults > 0 ? (revenue / variantResults) * 100 : null,
      refundRate: ratio(refunded, variantPurchases.length),
    };
  });

  // AI costs
  const rate = getEnv().USD_PLN_RATE;
  let freeUsd = 0;
  let paidUsd = 0;
  let freeWebUsd = 0;
  const paidSearchResults = new Set<string>();
  const freeWebResults = new Set<string>();
  for (const row of usage) {
    const cost = usageCostUsd(row);
    if (FREE_STEPS.has(row.step)) freeUsd += cost;
    if (PAID_STEPS.has(row.step)) paidUsd += cost;
    if (row.step === "web_search" && row.result_id) paidSearchResults.add(row.result_id);
    if (row.step === "free_web_search") {
      freeWebUsd += cost;
      if (row.result_id) freeWebResults.add(row.result_id);
    }
  }
  const freeSources = { web: 0, cache: 0, catalog: 0, catalog_budget: 0, catalog_device: 0, catalog_fallback: 0, unknown: 0 } as FreeSourceCounts;
  for (const result of results) freeSources[result.free_source ?? "unknown"]++;
  const spentPln = await todaySpendPln();
  const limitPln = getEnv().DAILY_AI_BUDGET_PLN;
  const revenue = netRevenue(purchases);

  return {
    since,
    quizStarts: starts.length,
    results: results.length,
    completion: ratio(results.length, starts.length),
    clicks: clicks.length,
    clicksBySource,
    clicksPerResult: ratio(clicks.length, results.length),
    topProducts,
    priceTest,
    freeSources,
    cacheHitRate: ratio(freeSources.cache, freeSources.cache + freeSources.web),
    dailyBudget: { limitPln, spentPln, share: spentPln / limitPln },
    payments: purchases.length,
    refunds: purchases.filter((p) => p.status === "refunded").length,
    revenue,
    revenuePerVisit: ratio(revenue, starts.length),
    ai: {
      usdPlnRate: rate,
      freeUsd,
      paidUsd,
      freePln: freeUsd * rate,
      paidPln: paidUsd * rate,
      paidSearches: paidSearchResults.size,
      avgPaidSearchPln: paidSearchResults.size > 0 ? (paidUsd * rate) / paidSearchResults.size : null,
      freeWebSearches: freeWebResults.size,
      freeWebPln: freeWebUsd * rate,
      avgFreeWebSearchPln: freeWebResults.size > 0 ? (freeWebUsd * rate) / freeWebResults.size : null,
      freeCostPerResultPln: results.length > 0 ? (freeUsd * rate) / results.length : null,
      tokens: {
        input: usage.reduce((sum, row) => sum + row.input_tokens, 0),
        output: usage.reduce((sum, row) => sum + row.output_tokens, 0),
      },
      webSearches: usage.reduce((sum, row) => sum + row.web_searches, 0),
      webFetches: usage.reduce((sum, row) => sum + row.web_fetches, 0),
    },
    sources: bySource(results, clicks, purchases, starts.map((s) => s.source)),
  };
}

function bySource(
  results: ResultStatsRow[],
  clicks: ClickRow[],
  purchases: PurchaseRow[],
  startSources: (string | null)[],
): SourceRow[] {
  const key = (source: string | null) => source ?? DIRECT;
  const resultSource = new Map(results.map((r) => [r.id, key(r.source)]));
  const rows = new Map<string, SourceRow>();
  const row = (source: string) => {
    let entry = rows.get(source);
    if (!entry) {
      entry = { source, starts: 0, results: 0, completion: null, clicks: 0, payments: 0, revenue: 0, revenuePerResult: null };
      rows.set(source, entry);
    }
    return entry;
  };

  for (const source of startSources) row(key(source)).starts++;
  for (const result of results) row(key(result.source)).results++;
  // Clicks/payments on results created before the period cannot be attributed here.
  for (const click of clicks) {
    const source = click.result_id ? resultSource.get(click.result_id) : undefined;
    row(source ?? "(wynik sprzed okresu)").clicks++;
  }
  for (const purchase of purchases) {
    const source = purchase.result_id ? resultSource.get(purchase.result_id) : undefined;
    const entry = row(source ?? "(wynik sprzed okresu)");
    entry.payments++;
    if (purchase.status === "paid") entry.revenue += Number(purchase.amount_pln);
  }

  return [...rows.values()]
    .map((entry) => ({
      ...entry,
      completion: ratio(entry.results, entry.starts),
      revenuePerResult: ratio(entry.revenue, entry.results),
    }))
    .sort((a, b) => b.revenue - a.revenue || b.clicks - a.clicks || b.results - a.results);
}
