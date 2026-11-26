/**
 * Pool coverage: active products checked in the last 7 days per category x price band x recipient, the same as the
 * SQL view pool_coverage (supabase/migrations/20261129000000_product_pool.sql). Used by the demo database, the
 * nightly job and tests. Portable (no imports from the app).
 */
export const POOL_RECIPIENTS = ["dad", "mom", "girlfriend", "boyfriend", "friend", "boss", "grandparent"] as const;
export const POOL_BANDS = [
  { band: "do 50", band_order: 1, min: 0, max: 50 },
  { band: "50-100", band_order: 2, min: 50, max: 100 },
  { band: "100-200", band_order: 3, min: 100, max: 200 },
  { band: "200+", band_order: 4, min: 200, max: 1_000_000 },
] as const;
/** A cell is healthy with at least this many active products. */
export const POOL_HEALTHY_MIN = 8;
export const POOL_FRESH_MS = 7 * 86_400_000;

export type PoolCoverageRow = { category: string; band: string; band_order: number; recipient: string; active: number; healthy: boolean };

type CoverageProduct = {
  network: string;
  category: string | null;
  price_pln: number;
  recipients?: string[];
  status: string;
  last_check_at: string | null;
};

export function computeCoverage(products: CoverageProduct[], nowMs: number): PoolCoverageRow[] {
  const categories = [...new Set(products.filter((p) => p.network !== "demo" && p.category).map((p) => p.category as string))].sort();
  const fresh = products.filter(
    (p) => p.status === "active" && p.last_check_at !== null && nowMs - Date.parse(p.last_check_at) < POOL_FRESH_MS,
  );
  const rows: PoolCoverageRow[] = [];
  for (const category of categories) {
    for (const band of POOL_BANDS) {
      for (const recipient of POOL_RECIPIENTS) {
        const active = fresh.filter(
          (p) =>
            p.category === category &&
            p.price_pln > band.min &&
            p.price_pln <= band.max &&
            (!p.recipients?.length || p.recipients.includes(recipient)),
        ).length;
        rows.push({ category, band: band.band, band_order: band.band_order, recipient, active, healthy: active >= POOL_HEALTHY_MIN });
      }
    }
  }
  return rows;
}

/** The price band of a quiz budget (the quiz offers 50 / 100 / 200 / 500 zł). */
export function bandOfBudget(budget: number | null): string | null {
  if (budget === null) return null;
  return POOL_BANDS.find((band) => budget > band.min && budget <= band.max)?.band ?? "200+";
}

/** Price limits of a band, for prompts and for checking the price read from the page. */
export function bandLimits(band: string): { min: number; max: number } {
  const found = POOL_BANDS.find((item) => item.band === band);
  if (!found) throw new Error(`Unknown price band ${band}`);
  return { min: found.min, max: found.max === 1_000_000 ? 500 : found.max };
}
