/**
 * Database row types. They mirror supabase/migrations and are shared by both
 * implementations of the db service (lib/services/db.ts): Supabase and the demo JSON file.
 * Once the project is linked you can replace them with `supabase gen types typescript`.
 * Type-only module: safe to import from Node scripts.
 */

// ---------------------------------------------------------------------------
// Shared value types
// ---------------------------------------------------------------------------

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

/** Price in grosze (499 = 4.99 PLN). On purchases: the amount actually charged. */
export type PriceVariant = number;
/** Paid offers: one web search, a pack of 10 searches (10 recipients), or the legacy pack of 8. */
export type PurchaseOffer = "single" | "pack10" | "pack8";
export type PaidStatus = "none" | "pending" | "searching" | "ready" | "refunded";
/** Outbound click sources. "free"/"web" are legacy values; new clicks use free-web, paid-web, catalog (or share). */
export type ClickSource = "free" | "web" | "share" | "free-web" | "paid-web" | "catalog";
/** Free result state: "searching" while the web search runs in the background. */
export type SearchStatus = "searching" | "ready";
/** Where the free picks came from. */
export type FreeSource = "web" | "cache" | "catalog" | "catalog_budget" | "catalog_device" | "catalog_fallback";
export type PurchaseStatus = "paid" | "refunded";
export type AiUsageStep = "profile" | "picks" | "web_search" | "dedications" | "free_web_search" | "catalog_build" | "catalog_tag";
export type ProductStatus = "active" | "pending" | "out_of_stock" | "broken";
export type ProductSource = "catalog_build" | "feed" | "web_search" | "manual";

// ---------------------------------------------------------------------------
// Row types
// ---------------------------------------------------------------------------

export type ProductRow = {
  id: string;
  network: string;
  merchant: string;
  external_id: string;
  name: string;
  description: string | null;
  /** numeric is returned as number by PostgREST */
  price_pln: number;
  category: string | null;
  tags: string[];
  image_url: string | null;
  affiliate_url: string;
  commission_rate: number | null;
  in_stock: boolean;
  updated_at: string;
  /** Plain product page address (products found on the web). affiliate_url is where /go leads. */
  url: string | null;
  /** When price and availability were last checked on the shop's page (web products). */
  checked_at: string | null;
  /** Consecutive failed checks (timeout, 5xx, block); 2 in a row take the product out of stock. */
  failed_checks: number;
  last_check_at: string | null;
  /** Result of the last check (see supabase/migrations/20261126000000_catalog_check.sql). */
  last_check_result: string | null;
  /**
   * Pool status (supabase/migrations/20261129000000_product_pool.sql). In the database a trigger keeps
   * in_stock = status in ('active', 'pending'); code that writes one of them should write both.
   */
  status: ProductStatus;
  source: ProductSource;
  /** Price read from the shop page in the last successful check. */
  price_checked: number | null;
  /** Address after redirects in the last check. */
  final_url: string | null;
  /**
   * Quiz answers the product fits (codes from lib/quiz/schema.ts, see
   * supabase/migrations/20261128000000_product_quiz_fit.sql). Empty or missing = fits any answer.
   * recipients excludes other recipients ("none" = children's item, never shown); the other two only rank.
   */
  recipients?: string[];
  gift_types?: string[];
  lifestyles?: string[];
};

export type PriceHistoryRow = {
  id: string;
  product_id: string;
  old_price: number;
  new_price: number;
  checked_at: string;
};

export type CatalogCheckRunRow = {
  id: string;
  started_by: "cron" | "manual";
  started_at: string;
  finished_at: string | null;
  status: "running" | "completed" | "partial" | "failed";
  total: number;
  processed: number;
  cursor: string | null;
  ok: number;
  price_changes: number;
  became_unavailable: number;
  skipped_robots: number;
  unverified: number;
  errors: number;
  /** { "shop.pl": { "timeout": 2 } } */
  failures: Record<string, Record<string, number>>;
  guides_incomplete: string[];
  /** check = one verification run; nightly = the whole night (verify + AI top-up + tags). */
  kind: "check" | "nightly" | "warmup";
  /** Products the AI top-up added to the pool. */
  added: number;
  ai_cost_usd: number;
  /** Nightly report details: verifyRunId, cells, budgetExceeded, pool counts. */
  details: Record<string, unknown>;
};

export type ResultRow = {
  id: string;
  created_at: string;
  recipient: string | null;
  budget_pln: number | null;
  occasion: string | null;
  answers: Json;
  style_profile: string | null;
  tags: string[];
  avoid: string[];
  product_ids: string[];
  reasons: Json;
  ref_code: string | null;
  price_variant: PriceVariant | null;
  paid_status: PaidStatus;
  web_picks: Json | null;
  dedications: Json | null;
  /** utm_source or "ref:<ref_code>" (see lib/attribution.ts). */
  source: string | null;
  /** 2–3 sentences: which pick fits best and why. */
  pick_summary: string | null;
  search_status: SearchStatus;
  free_source: FreeSource | null;
  /** Salted hash of the quiz answers (no photo). Set on results that came from a web search. */
  quiz_hash: string | null;
  search_started_at: string | null;
};

export type QuizStartRow = {
  id: string;
  created_at: string;
  source: string | null;
};

export type AllowedShopRow = {
  id: string;
  domain: string;
  name: string;
  active: boolean;
  has_affiliate: boolean;
  /** Contains a `{url}` placeholder for the product URL. */
  deeplink_template: string | null;
  network: string | null;
};

export type ClickRow = {
  id: string;
  created_at: string;
  result_id: string | null;
  product_id: string | null;
  url: string;
  source: ClickSource;
};

export type PurchaseRow = {
  id: string;
  created_at: string;
  result_id: string | null;
  stripe_session_id: string;
  payment_intent_id: string | null;
  amount_pln: number;
  price_variant: PriceVariant;
  status: PurchaseStatus;
  offer: PurchaseOffer;
  searches_total: number;
  /** Searches still available to use on other results (the first one is used at purchase). */
  searches_left: number;
  /** Secret pack code (packs only), derived from the Stripe session. */
  pack_code: string | null;
};

export type GuideProductRow = {
  guide_slug: string;
  product_id: string;
  position: number;
  /** Short "why this is a good choice", written for this guide. */
  reason: string;
  refreshed_at: string;
};

export type SubscriberRow = {
  id: string;
  email: string;
  consent_at: string;
  confirmed_at: string | null;
  occasions: string[];
};

export type RateLimitRow = {
  key: string;
  window_start: string;
  count: number;
};

export type AiUsageRow = {
  id: string;
  created_at: string;
  result_id: string | null;
  step: AiUsageStep;
  model: string;
  input_tokens: number;
  output_tokens: number;
  web_searches: number;
  web_fetches: number;
};

// ---------------------------------------------------------------------------
// Database type in the shape supabase-js expects
// ---------------------------------------------------------------------------

/** Makes columns with a database default optional on insert. */
type WithDefaults<Row, DefaultKeys extends keyof Row> = Omit<Row, DefaultKeys> &
  Partial<Pick<Row, DefaultKeys>>;

type NullableKeys<Row> = {
  [K in keyof Row]-?: null extends Row[K] ? K : never;
}[keyof Row];

type TableDef<Row, DefaultKeys extends keyof Row> = {
  Row: Row;
  Insert: WithDefaults<Row, DefaultKeys | NullableKeys<Row>>;
  Update: Partial<Row>;
  Relationships: [];
};

export type Database = {
  public: {
    Tables: {
      products: TableDef<ProductRow, "id" | "tags" | "in_stock" | "updated_at" | "failed_checks" | "status" | "source" | "price_checked" | "final_url">;
      price_history: TableDef<PriceHistoryRow, "id" | "checked_at">;
      catalog_check_runs: TableDef<
        CatalogCheckRunRow,
        | "id"
        | "started_by"
        | "started_at"
        | "status"
        | "total"
        | "processed"
        | "ok"
        | "price_changes"
        | "became_unavailable"
        | "skipped_robots"
        | "unverified"
        | "errors"
        | "failures"
        | "guides_incomplete"
        | "kind"
        | "added"
        | "ai_cost_usd"
        | "details"
      >;
      results: TableDef<
        ResultRow,
        "id" | "created_at" | "answers" | "tags" | "avoid" | "product_ids" | "reasons" | "paid_status" | "search_status"
      >;
      quiz_starts: TableDef<QuizStartRow, "id" | "created_at">;
      allowed_shops: TableDef<AllowedShopRow, "id" | "active" | "has_affiliate">;
      clicks: TableDef<ClickRow, "id" | "created_at">;
      purchases: TableDef<PurchaseRow, "id" | "created_at" | "status" | "offer" | "searches_total" | "searches_left">;
      subscribers: TableDef<SubscriberRow, "id" | "consent_at" | "occasions">;
      guide_products: TableDef<GuideProductRow, "refreshed_at">;
      rate_limits: TableDef<RateLimitRow, "count">;
      ai_usage: TableDef<
        AiUsageRow,
        "id" | "created_at" | "input_tokens" | "output_tokens" | "web_searches" | "web_fetches"
      >;
    };
    Views: Record<never, never>;
    Functions: {
      consume_rate_limit: {
        Args: { p_key: string; p_window_start: string; p_limit: number };
        Returns: boolean;
      };
      consume_pack_search: { Args: { p_id: string }; Returns: boolean };
      restore_pack_search: { Args: { p_id: string }; Returns: undefined };
    };
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
  };
};

export type TableName = keyof Database["public"]["Tables"];
export type Row<T extends TableName> = Database["public"]["Tables"][T]["Row"];
export type Insert<T extends TableName> = Database["public"]["Tables"][T]["Insert"];
export type Update<T extends TableName> = Database["public"]["Tables"][T]["Update"];
