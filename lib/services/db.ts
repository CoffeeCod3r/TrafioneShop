/**
 * Database service: one repository per table.
 * Implementations: Supabase (impl/db-real.ts) and a demo JSON file (impl/db-demo.ts).
 * The rest of the code uses only this interface via getRepos().
 * Shared with Node scripts: relative imports with `.ts` extensions only.
 */
import type {
  AiUsageRow,
  AllowedShopRow,
  CatalogCheckRunRow,
  PoolCoverageRow,
  ClickRow,
  GuideProductRow,
  Insert,
  ProductRow,
  PurchaseRow,
  QuizStartRow,
  ResultRow,
  SubscriberRow,
  Update,
} from "../db.ts";
import type { ProductUpsert } from "../feeds/normalize.ts";
import type { DirectProductRow } from "../search/core.ts";
import { isRealService } from "../mode.ts";
import { createDemoRepos } from "./impl/db-demo.ts";
import { createRealRepos } from "./impl/db-real.ts";

export type ProductCandidateQuery = {
  minPrice: number;
  maxPrice: number;
  /** When set, products must share at least one of these tags. */
  anyOfTags?: readonly string[];
  /** Products with any of these tags are excluded. */
  noneOfTags?: readonly string[];
  /** Quiz recipient code: products for other recipients are left out (an empty list fits everyone). */
  recipient?: string;
  /** Exact category match (used for out-of-stock replacements). */
  category?: string;
  /** Product IDs to leave out. */
  excludeIds?: readonly string[];
  limit: number;
};

export type ProductsRepo = {
  upsertMany(rows: ProductUpsert[]): Promise<void>;
  listInStockExternalIds(network: string): Promise<string[]>;
  markOutOfStock(network: string, externalIds: string[]): Promise<void>;
  /** In-stock products matching the query, highest price first (never ordered by commission; fit is ranked in code). */
  findCandidates(query: ProductCandidateQuery): Promise<ProductRow[]>;
  getByIds(ids: readonly string[]): Promise<ProductRow[]>;
  getById(id: string): Promise<ProductRow | null>;
  /**
   * Saves products found by the web search (network "direct", commission_rate 0). One row per product
   * address: the same address updates price, check time and stock instead of creating a duplicate.
   */
  saveDirect(rows: DirectProductInput[]): Promise<ProductRow[]>;
};

export type DirectProductInput = DirectProductRow;

export type ResultStatsRow = Pick<ResultRow, "id" | "created_at" | "price_variant" | "paid_status" | "source" | "free_source">;

export type ResultsRepo = {
  create(row: Insert<"results">): Promise<ResultRow>;
  getById(id: string): Promise<ResultRow | null>;
  update(id: string, patch: Update<"results">): Promise<void>;
  /**
   * Atomically moves paid_status from "none" to "pending". Returns false when the result
   * was already paid (or is being paid), so one result can never be paid twice.
   */
  claimPayment(id: string): Promise<boolean>;
  /** A ready web-search result with this quiz hash created at or after `since` (result memory). */
  findCachedByHash(hash: string, since: string): Promise<ResultRow | null>;
  /** Admin stats: results created at or after `since`. */
  listForStats(since: string): Promise<ResultStatsRow[]>;
};

export type ClicksRepo = {
  create(row: Insert<"clicks">): Promise<ClickRow>;
  /** Admin stats. */
  listSince(since: string): Promise<ClickRow[]>;
};

export type QuizStartsRepo = {
  create(row: Insert<"quiz_starts">): Promise<void>;
  /** Admin stats. */
  listSince(since: string): Promise<QuizStartRow[]>;
};

export type PurchasesRepo = {
  /** Inserts unless a purchase with the same stripe_session_id exists (idempotent webhooks). */
  createIfNew(row: Insert<"purchases">): Promise<{ purchase: PurchaseRow; created: boolean }>;
  getById(id: string): Promise<PurchaseRow | null>;
  getBySessionId(stripeSessionId: string): Promise<PurchaseRow | null>;
  /** Pack lookup by its secret code (cookie / pack link). */
  getByPackCode(code: string): Promise<PurchaseRow | null>;
  /** Atomically uses one search of a paid pack. False when none is left. */
  consumeSearch(id: string): Promise<boolean>;
  /** Gives one search back (e.g. the search found too few verified products). */
  restoreSearch(id: string): Promise<void>;
  update(id: string, patch: Update<"purchases">): Promise<void>;
  listByResult(resultId: string): Promise<PurchaseRow[]>;
  /** Admin stats. */
  listSince(since: string): Promise<PurchaseRow[]>;
};

export type SubscribersRepo = {
  upsertByEmail(row: Insert<"subscribers">): Promise<SubscriberRow>;
  getByEmail(email: string): Promise<SubscriberRow | null>;
  updateByEmail(email: string, patch: Update<"subscribers">): Promise<void>;
  /** Unsubscribe: removes the record entirely. Returns false when nothing was deleted. */
  deleteByEmail(email: string): Promise<boolean>;
  /** Housekeeping: drops sign-ups that were never confirmed. Returns the number removed. */
  deleteUnconfirmedOlderThan(isoDate: string): Promise<number>;
};

export type AllowedShopsRepo = {
  listActive(): Promise<AllowedShopRow[]>;
};

export type AiUsageRepo = {
  createMany(rows: Insert<"ai_usage">[]): Promise<void>;
  /** For the admin panel. */
  listSince(since: string): Promise<AiUsageRow[]>;
};

export type RateLimitsRepo = {
  /** Atomically consumes one unit; false when the limit is reached. */
  consume(key: string, windowStart: string, limit: number): Promise<boolean>;
  /** Housekeeping: removes old windows. Returns the number removed. */
  deleteOlderThan(isoDate: string): Promise<number>;
};

/** A product of a gift guide with the reason written for that guide. */
export type GuideProduct = {
  position: number;
  reason: string;
  refreshedAt: string;
  product: ProductRow;
};

export type GuidesRepo = {
  /** In-stock products of one guide in display order (empty when the guide was never refreshed). */
  listProducts(slug: string): Promise<GuideProduct[]>;
  /** Replaces all products of a guide at once (the weekly refresh). */
  replaceProducts(slug: string, rows: Pick<GuideProductRow, "product_id" | "position" | "reason">[]): Promise<void>;
};

/** A product the weekly check looks at: in stock, and found by the web search (direct) or used in a guide. */
export type CheckableProduct = Pick<
  ProductRow,
  "id" | "name" | "url" | "affiliate_url" | "price_pln" | "network" | "category" | "failed_checks" | "in_stock"
>;

export type ProductCheckPatch = {
  price_pln?: number;
  checked_at?: string;
  in_stock?: boolean;
  failed_checks: number;
  last_check_at: string;
  last_check_result: string;
};

/** Weekly check of links and prices (lib/catalog-check). Never touches ai_usage. */
export type CatalogRepo = {
  listCheckable(): Promise<CheckableProduct[]>;
  /** Writes the outcome of one check; `history` (old and new price) is stored when the price moved by more than 20 %. */
  applyCheck(productId: string, patch: ProductCheckPatch, history?: { old_price: number; new_price: number }): Promise<void>;
  createRun(startedBy: CatalogCheckRunRow["started_by"]): Promise<CatalogCheckRunRow>;
  getRun(id: string): Promise<CatalogCheckRunRow | null>;
  updateRun(id: string, patch: Partial<CatalogCheckRunRow>): Promise<void>;
  recentRuns(limit: number): Promise<CatalogCheckRunRow[]>;
  /** Admin: products in stock and not in stock. */
  countProducts(): Promise<{ available: number; unavailable: number }>;
  /** The product pool: active products verified in the last 7 days per category x price range x recipient (SQL view pool_coverage). */
  poolCoverage(): Promise<PoolCoverageRow[]>;
  /** Pool size by status (`stale_active`: active but verified more than 7 days ago, so not shown). */
  poolCounts(): Promise<{ active: number; broken: number; out_of_stock: number; pending: number; stale_active: number }>;
};

export type Repos = {
  catalog: CatalogRepo;
  guides: GuidesRepo;
  results: ResultsRepo;
  products: ProductsRepo;
  clicks: ClicksRepo;
  purchases: PurchasesRepo;
  subscribers: SubscribersRepo;
  allowedShops: AllowedShopsRepo;
  aiUsage: AiUsageRepo;
  rateLimits: RateLimitsRepo;
  quizStarts: QuizStartsRepo;
};

let repos: Repos | undefined;

export function getRepos(): Repos {
  if (typeof window !== "undefined") throw new Error("Database repositories are server-only");
  repos ??= isRealService("db") ? createRealRepos() : createDemoRepos();
  return repos;
}
