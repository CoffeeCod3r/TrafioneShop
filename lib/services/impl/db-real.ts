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

/** Fetches every row of a paginated query (PostgREST returns max 1000 rows per request). */
async function fetchAll<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { code?: string } | null }>, action: string): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1);
    if (error) fail(action, error);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) return rows;
  }
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
      async findCandidates({ minPrice, maxPrice, anyOfTags, noneOfTags, category, excludeIds, limit }) {
        let query = db()
          .from("products")
          .select("*")
          .eq("in_stock", true)
          .gte("price_pln", minPrice)
          .lte("price_pln", maxPrice);
        if (anyOfTags && anyOfTags.length > 0) query = query.overlaps("tags", [...anyOfTags]);
        if (noneOfTags && noneOfTags.length > 0) query = query.not("tags", "ov", pgArray(noneOfTags));
        if (category) query = query.eq("category", category);
        if (excludeIds && excludeIds.length > 0) query = query.not("id", "in", `(${excludeIds.join(",")})`);
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
      async saveDirect(rows) {
        if (rows.length === 0) return [];
        const { data, error } = await db()
          .from("products")
          .upsert(
            rows.map((row) => ({ ...row, network: "direct", commission_rate: 0, in_stock: true })),
            { onConflict: "network,external_id" },
          )
          .select("*");
        if (error) fail("Saving web products", error);
        return data;
      },
    },

    results: {
      async findCachedByHash(hash, since) {
        const { data, error } = await db()
          .from("results")
          .select("*")
          .eq("quiz_hash", hash)
          .eq("search_status", "ready")
          .gte("created_at", since)
          .order("created_at", { ascending: false })
          .limit(1);
        if (error) fail("Result memory lookup", error);
        return data[0] ?? null;
      },
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
      async claimPayment(id) {
        const { data, error } = await db()
          .from("results")
          .update({ paid_status: "pending" })
          .eq("id", id)
          .eq("paid_status", "none")
          .select("id");
        if (error) fail("Claiming payment", error);
        return data.length === 1;
      },
      listForStats(since) {
        return fetchAll(
          (from, to) =>
            db()
              .from("results")
              .select("id, created_at, price_variant, paid_status, source, free_source")
              .gte("created_at", since)
              .order("created_at")
              .range(from, to),
          "Loading results stats",
        );
      },
    },

    clicks: {
      async create(row) {
        const { data, error } = await db().from("clicks").insert(row).select("*").single();
        if (error) fail("Saving click", error);
        return data;
      },
      listSince(since) {
        return fetchAll(
          (from, to) => db().from("clicks").select("*").gte("created_at", since).order("created_at").range(from, to),
          "Loading clicks",
        );
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
      async getById(id) {
        const { data, error } = await db().from("purchases").select("*").eq("id", id).maybeSingle();
        if (error) fail("Loading purchase", error);
        return data;
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
      async getByPackCode(code) {
        const { data, error } = await db().from("purchases").select("*").eq("pack_code", code).maybeSingle();
        if (error) fail("Loading pack", error);
        return data;
      },
      async consumeSearch(id) {
        const { data, error } = await db().rpc("consume_pack_search", { p_id: id });
        if (error) fail("Using pack search", error);
        return data === true;
      },
      async restoreSearch(id) {
        const { error } = await db().rpc("restore_pack_search", { p_id: id });
        if (error) fail("Restoring pack search", error);
      },
      async update(id, patch) {
        const { error } = await db().from("purchases").update(patch).eq("id", id);
        if (error) fail("Updating purchase", error);
      },
      async listByResult(resultId) {
        const { data, error } = await db().from("purchases").select("*").eq("result_id", resultId);
        if (error) fail("Loading purchases", error);
        return data;
      },
      listSince(since) {
        return fetchAll(
          (from, to) => db().from("purchases").select("*").gte("created_at", since).order("created_at").range(from, to),
          "Loading purchases",
        );
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
      async getByEmail(email) {
        const { data, error } = await db().from("subscribers").select("*").eq("email", email.toLowerCase()).maybeSingle();
        if (error) fail("Loading subscriber", error);
        return data;
      },
      async updateByEmail(email, patch) {
        const { error } = await db().from("subscribers").update(patch).eq("email", email.toLowerCase());
        if (error) fail("Updating subscriber", error);
      },
      async deleteByEmail(email) {
        const { data, error } = await db().from("subscribers").delete().eq("email", email.toLowerCase()).select("id");
        if (error) fail("Deleting subscriber", error);
        return data.length > 0;
      },
      async deleteUnconfirmedOlderThan(isoDate) {
        const { data, error } = await db()
          .from("subscribers")
          .delete()
          .is("confirmed_at", null)
          .lt("consent_at", isoDate)
          .select("id");
        if (error) fail("Cleaning subscribers", error);
        return data.length;
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
      listSince(since) {
        return fetchAll(
          (from, to) => db().from("ai_usage").select("*").gte("created_at", since).order("created_at").range(from, to),
          "Loading AI usage",
        );
      },
    },

    quizStarts: {
      async create(row) {
        const { error } = await db().from("quiz_starts").insert(row);
        if (error) fail("Saving quiz start", error);
      },
      listSince(since) {
        return fetchAll(
          (from, to) => db().from("quiz_starts").select("*").gte("created_at", since).order("created_at").range(from, to),
          "Loading quiz starts",
        );
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
      async deleteOlderThan(isoDate) {
        const { data, error } = await db().from("rate_limits").delete().lt("window_start", isoDate).select("key");
        if (error) fail("Cleaning rate limits", error);
        return data.length;
      },
    },
  };
}
