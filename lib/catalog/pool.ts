/**
 * The product pool: rules for which products free results may use, and the coverage grid
 * (category x price range x recipient) the nightly job keeps healthy. Pure functions, no I/O.
 * The SQL view `pool_coverage` (migration 20261129000000_product_pool.sql) mirrors computeCoverage().
 * Shared with Node scripts: relative imports with `.ts` extensions only.
 */
import { ILLUSTRATION_CATEGORIES, normalizeCategory } from "../illustrations.ts";
import { RECIPIENT_OPTIONS } from "../quiz/schema.ts";

/** A product is shown for free only when its last verification is younger than this. */
export const POOL_MAX_AGE_DAYS = 7;
/** Healthy cell: at least this many active products. */
export const POOL_MIN_PER_CELL = 8;

export const PRICE_BUCKETS = [
  { id: "do-50", label: "do 50 zł", min: 0, max: 50 },
  { id: "50-100", label: "50–100 zł", min: 50, max: 100 },
  { id: "100-200", label: "100–200 zł", min: 100, max: 200 },
  { id: "200+", label: "200 zł i więcej", min: 200, max: null },
] as const;
export type PriceBucketId = (typeof PRICE_BUCKETS)[number]["id"];

export const POOL_CATEGORIES = ILLUSTRATION_CATEGORIES;
export const POOL_RECIPIENTS = RECIPIENT_OPTIONS.map((option) => option.value) as string[];

export type ProductStatus = "active" | "out_of_stock" | "broken" | "pending";

/** The pool category of a raw product category ("Kuchnia > Akcesoria" -> "kuchnia"), or null outside the grid. */
export function poolCategory(raw: string | null | undefined): string | null {
  const folded = normalizeCategory(raw);
  const alias: Record<string, string> = { zywnosc: "jedzenie", zabawki: "gry", turystyka: "podroze" };
  const category = alias[folded] ?? folded;
  return (POOL_CATEGORIES as readonly string[]).includes(category) ? category : null;
}

/** Price ranges: up to 50 (inclusive), over 50 up to 100, over 100 up to 200, over 200. */
export function priceBucket(price: number): PriceBucketId {
  if (price <= 50) return "do-50";
  if (price <= 100) return "50-100";
  if (price <= 200) return "100-200";
  return "200+";
}

/** ISO time before which a verification is too old for free results. */
export function poolCutoffIso(now: number = Date.now()): string {
  return new Date(now - POOL_MAX_AGE_DAYS * 86_400_000).toISOString();
}

type PoolProduct = {
  network?: string;
  status?: string | null;
  last_checked_at?: string | null;
  category: string | null;
  price_pln: number;
  recipients?: string[] | null;
};

/**
 * Whether a product may be used for free results (demo products have no shop page to verify, so the demo database
 * treats them as always fresh; see db-demo.ts).
 */
export function isPoolFresh(product: Pick<PoolProduct, "status" | "last_checked_at">, now: number = Date.now()): boolean {
  if (product.status !== "active" || !product.last_checked_at) return false;
  return Date.parse(product.last_checked_at) >= now - POOL_MAX_AGE_DAYS * 86_400_000;
}

export type CoverageCell = { category: string; price_bucket: PriceBucketId; recipient: string; active_count: number };

/** Same result as the SQL view: one row per category x price range x recipient, including empty cells. */
export function computeCoverage(products: readonly PoolProduct[], now: number = Date.now()): CoverageCell[] {
  const counts = new Map<string, number>();
  for (const product of products) {
    if (!isPoolFresh(product, now)) continue;
    const category = poolCategory(product.category);
    if (!category) continue;
    const bucket = priceBucket(product.price_pln);
    const recipients = product.recipients?.length ? product.recipients : POOL_RECIPIENTS;
    for (const recipient of recipients) {
      const key = `${category}|${bucket}|${recipient}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  const cells: CoverageCell[] = [];
  for (const category of POOL_CATEGORIES) {
    for (const bucket of PRICE_BUCKETS) {
      for (const recipient of POOL_RECIPIENTS) {
        cells.push({ category, price_bucket: bucket.id, recipient, active_count: counts.get(`${category}|${bucket.id}|${recipient}`) ?? 0 });
      }
    }
  }
  return cells;
}

export function belowThreshold(cells: readonly CoverageCell[], threshold: number = POOL_MIN_PER_CELL): CoverageCell[] {
  return cells.filter((cell) => cell.active_count < threshold);
}

export const cellKey = (cell: Pick<CoverageCell, "category" | "price_bucket" | "recipient">) =>
  `${cell.category}|${cell.price_bucket}|${cell.recipient}`;
