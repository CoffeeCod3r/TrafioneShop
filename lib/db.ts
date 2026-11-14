import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { getEnv } from "@/lib/env";

/**
 * Server-only Supabase client using the service role key (bypasses RLS).
 * Never import this file from client components.
 *
 * Types below mirror supabase/migrations. Once the project is linked you can
 * replace them with `supabase gen types typescript`.
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

/** Price variant in grosze: 499 = 4.99 PLN, 999 = 9.99 PLN. */
export type PriceVariant = 499 | 999;
export type PaidStatus = "none" | "pending" | "searching" | "ready" | "refunded";
export type ClickSource = "free" | "web" | "share";
export type PurchaseStatus = "paid" | "refunded";
export type AiUsageStep = "profile" | "picks" | "web_search" | "dedications";

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
      products: TableDef<ProductRow, "id" | "tags" | "in_stock" | "updated_at">;
      results: TableDef<
        ResultRow,
        "id" | "created_at" | "answers" | "tags" | "avoid" | "product_ids" | "reasons" | "paid_status"
      >;
      allowed_shops: TableDef<AllowedShopRow, "id" | "active" | "has_affiliate">;
      clicks: TableDef<ClickRow, "id" | "created_at">;
      purchases: TableDef<PurchaseRow, "id" | "created_at" | "status">;
      subscribers: TableDef<SubscriberRow, "id" | "consent_at" | "occasions">;
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
    };
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
  };
};

export type TableName = keyof Database["public"]["Tables"];
export type Row<T extends TableName> = Database["public"]["Tables"][T]["Row"];
export type Insert<T extends TableName> = Database["public"]["Tables"][T]["Insert"];
export type Update<T extends TableName> = Database["public"]["Tables"][T]["Update"];

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

let client: SupabaseClient<Database> | undefined;

export function getDb(): SupabaseClient<Database> {
  if (typeof window !== "undefined") {
    throw new Error("lib/db.ts must not be imported in client code");
  }
  if (client) return client;

  const env = getEnv();
  client = createClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return client;
}
