/**
 * Database service: one repository per table.
 * Implementations: Supabase (impl/db-real.ts) and a demo JSON file (impl/db-demo.ts).
 * The rest of the code uses only this interface via getRepos().
 * Shared with Node scripts: relative imports with `.ts` extensions only.
 */
import type {
  AiUsageRow,
  AllowedShopRow,
  ClickRow,
  Insert,
  ProductRow,
  PurchaseRow,
  QuizStartRow,
  ResultRow,
  SubscriberRow,
  Update,
} from "../db.ts";
import type { ProductUpsert } from "../feeds/normalize.ts";
import { isMockMode } from "../mode.ts";
import { createDemoRepos } from "./impl/db-demo.ts";
import { createRealRepos } from "./impl/db-real.ts";

export type ProductCandidateQuery = {
  minPrice: number;
  maxPrice: number;
  /** When set, products must share at least one of these tags. */
  anyOfTags?: readonly string[];
  /** Products with any of these tags are excluded. */
  noneOfTags?: readonly string[];
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
  /** In-stock products matching the query, ordered by commission_rate desc (nulls last). */
  findCandidates(query: ProductCandidateQuery): Promise<ProductRow[]>;
  getByIds(ids: readonly string[]): Promise<ProductRow[]>;
  getById(id: string): Promise<ProductRow | null>;
};

export type ResultStatsRow = Pick<ResultRow, "id" | "created_at" | "price_variant" | "paid_status" | "source">;

export type ResultsRepo = {
  create(row: Insert<"results">): Promise<ResultRow>;
  getById(id: string): Promise<ResultRow | null>;
  update(id: string, patch: Update<"results">): Promise<void>;
  /**
   * Atomically moves paid_status from "none" to "pending". Returns false when the result
   * was already paid (or is being paid), so one result can never be paid twice.
   */
  claimPayment(id: string): Promise<boolean>;
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
  getBySessionId(stripeSessionId: string): Promise<PurchaseRow | null>;
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

export type Repos = {
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
  repos ??= isMockMode() ? createDemoRepos() : createRealRepos();
  return repos;
}
