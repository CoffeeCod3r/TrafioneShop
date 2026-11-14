import type { ProductRow } from "../../db.ts";
import type { Repos } from "../db.ts";
import { getSupabase } from "./supabase.ts";

const UPSERT_CHUNK = 500;
const PAGE_SIZE = 1000;
const UPDATE_CHUNK = 200;

function fail(action: string, error: { code?: string } | null): never {
  throw new Error(`${action} failed (${error?.code ?? "unknown"})`);
}

/** Postgres array literal. Values are ALLOWED_TAGS; quoting handles Polish characters. */
function pgArray(values: readonly string[]): string {
  return `{${values.map((value) => `"${value.replace(/["\\]/g, "")}"`).join(",")}}`;
}

/** Supabase implementation of the repositories (tables from supabase/migrations). */
export function createRealRepos(): Repos {
  const db = () => getSupabase();

  return {
    products: {
      async upsertMany(rows) {
        for (let i = 0; i < rows.length; i += UPSERT_CHUNK) {
          const { error } = await db()
            .from("products")
            .upsert(rows.slice(i, i + UPSERT_CHUNK), { onConflict: "network,external_id" });
          if (error) fail("Product upsert", error);
        }
      },
      async listInStockExternalIds(network) {
        const ids: string[] = [];
        for (let from = 0; ; from += PAGE_SIZE) {
          const { data, error } = await db()
            .from("products")
            .select("external_id")
            .eq("network", network)
            .eq("in_stock", true)
            .order("external_id")
            .range(from, from + PAGE_SIZE - 1);
          if (error) fail("Listing products", error);
          ids.push(...data.map((row) => row.external_id));
          if (data.length < PAGE_SIZE) return ids;
        }
      },
      async markOutOfStock(network, externalIds) {
        for (let i = 0; i < externalIds.length; i += UPDATE_CHUNK) {
          const { error } = await db()
            .from("products")
            .update({ in_stock: false })
            .eq("network", network)
            .in("external_id", externalIds.slice(i, i + UPDATE_CHUNK));
          if (error) fail("Marking out of stock", error);
        }
      },
      async findCandidates({ minPrice, maxPrice, anyOfTags, noneOfTags, limit }) {
        let query = db()
          .from("products")
          .select("*")
          .eq("in_stock", true)
          .gte("price_pln", minPrice)
          .lte("price_pln", maxPrice);
        if (anyOfTags && anyOfTags.length > 0) query = query.overlaps("tags", [...anyOfTags]);
        if (noneOfTags && noneOfTags.length > 0) query = query.not("tags", "ov", pgArray(noneOfTags));
        const { data, error } = await query.order("commission_rate", { ascending: false, nullsFirst: false }).limit(limit);
        if (error) fail("Candidate query", error);
        return data;
      },
      async getByIds(ids) {
        if (ids.length === 0) return [];
        const { data, error } = await db().from("products").select("*").in("id", [...ids]);
        if (error) fail("Loading products", error);
        return data;
      },
      async getById(id) {
        const { data, error } = await db().from("products").select("*").eq("id", id).maybeSingle();
        if (error) fail("Loading product", error);
        return data as ProductRow | null;
      },
    },

    results: {
      async create(row) {
        const { data, error } = await db().from("results").insert(row).select("*").single();
        if (error) {
          const wrapped = new Error(`Saving result failed (${error.code ?? "unknown"})`) as Error & { code?: string };
          wrapped.code = error.code;
          throw wrapped;
        }
        return data;
      },
      async getById(id) {
        const { data, error } = await db().from("results").select("*").eq("id", id).maybeSingle();
        if (error) fail("Loading result", error);
        return data;
      },
      async update(id, patch) {
        const { error } = await db().from("results").update(patch).eq("id", id);
        if (error) fail("Updating result", error);
      },
    },

    clicks: {
      async create(row) {
        const { data, error } = await db().from("clicks").insert(row).select("*").single();
        if (error) fail("Saving click", error);
        return data;
      },
    },

    purchases: {
      async createIfNew(row) {
        const { data, error } = await db()
          .from("purchases")
          .upsert(row, { onConflict: "stripe_session_id", ignoreDuplicates: true })
          .select("*");
        if (error) fail("Saving purchase", error);
        if (data.length > 0) return { purchase: data[0], created: true };
        const existing = await this.getBySessionId(row.stripe_session_id);
        if (!existing) fail("Loading purchase", null);
        return { purchase: existing, created: false };
      },
      async getBySessionId(stripeSessionId) {
        const { data, error } = await db()
          .from("purchases")
          .select("*")
          .eq("stripe_session_id", stripeSessionId)
          .maybeSingle();
        if (error) fail("Loading purchase", error);
        return data;
      },
      async update(id, patch) {
        const { error } = await db().from("purchases").update(patch).eq("id", id);
        if (error) fail("Updating purchase", error);
      },
    },

    subscribers: {
      async upsertByEmail(row) {
        const { data, error } = await db()
          .from("subscribers")
          .upsert({ ...row, email: row.email.toLowerCase() }, { onConflict: "email" })
          .select("*")
          .single();
        if (error) fail("Saving subscriber", error);
        return data;
      },
    },

    allowedShops: {
      async listActive() {
        const { data, error } = await db().from("allowed_shops").select("*").eq("active", true);
        if (error) fail("Loading allowed shops", error);
        return data;
      },
    },

    aiUsage: {
      async createMany(rows) {
        if (rows.length === 0) return;
        const { error } = await db().from("ai_usage").insert(rows);
        if (error) fail("Saving AI usage", error);
      },
      async listSince(since) {
        const { data, error } = await db()
          .from("ai_usage")
          .select("*")
          .gte("created_at", since)
          .order("created_at", { ascending: false })
          .limit(5000);
        if (error) fail("Loading AI usage", error);
        return data;
      },
    },

    rateLimits: {
      async consume(key, windowStart, limit) {
        const { data, error } = await db().rpc("consume_rate_limit", {
          p_key: key,
          p_window_start: windowStart,
          p_limit: limit,
        });
        if (error) fail("Rate limit check", error);
        return data === true;
      },
    },
  };
}
