import type { CatalogCheckRunRow, ProductRow } from "../../db.ts";
import type { CheckableProduct, PoolCoverageRow, Repos } from "../db.ts";
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
  /** Views are not in the typed Database schema: read them through an untyped handle. */
  const views = () => getSupabase() as unknown as { from(view: string): ReturnType<ReturnType<typeof getSupabase>["from"]> };

  return {
    catalog: {
      async listCheckable() {
        // Every product that is not gone (broken) and not a demo row; out_of_stock ones are checked again, they may
        // come back. Paged, because PostgREST returns at most 1000 rows per request.
        const columns = "id, name, url, affiliate_url, price_pln, network, category, failed_checks, in_stock, status, last_check_at";
        const page = 1000;
        const all: CheckableProduct[] = [];
        for (let from = 0; ; from += page) {
          const { data, error } = await db()
            .from("products")
            .select(columns)
            .neq("status", "broken")
            .neq("network", "demo")
            .order("id")
            .range(from, from + page - 1);
          if (error) fail("Loading products to check", error);
          all.push(...(data as CheckableProduct[]));
          if (data.length < page) break;
        }
        return all;
      },
      async applyCheck(productId, patch, history) {
        const { error } = await db().from("products").update(patch).eq("id", productId);
        if (error) fail("Saving product check", error);
        if (history) {
          const { error: historyError } = await db().from("price_history").insert({ product_id: productId, ...history });
          if (historyError) fail("Saving price history", historyError);
        }
      },
      async createRun(startedBy, kind = "check") {
        const { data, error } = await db().from("catalog_check_runs").insert({ started_by: startedBy, kind }).select("*").single();
        if (error) fail("Creating check run", error);
        return data as CatalogCheckRunRow;
      },
      async getRun(id) {
        const { data, error } = await db().from("catalog_check_runs").select("*").eq("id", id).maybeSingle();
        if (error) fail("Loading check run", error);
        return data as CatalogCheckRunRow | null;
      },
      async updateRun(id, patch) {
        const { error } = await db().from("catalog_check_runs").update(patch).eq("id", id);
        if (error) fail("Updating check run", error);
      },
      async recentRuns(limit) {
        const { data, error } = await db().from("catalog_check_runs").select("*").order("started_at", { ascending: false }).limit(limit);
        if (error) fail("Loading check runs", error);
        return data as CatalogCheckRunRow[];
      },
      async countProducts() {
        const available = await db().from("products").select("id", { count: "exact", head: true }).eq("in_stock", true);
        const unavailable = await db().from("products").select("id", { count: "exact", head: true }).eq("in_stock", false);
        if (available.error) fail("Counting products", available.error);
        if (unavailable.error) fail("Counting products", unavailable.error);
        return { available: available.count ?? 0, unavailable: unavailable.count ?? 0 };
      },
      async poolCoverage() {
        const { data, error } = await views().from("pool_coverage").select("*").order("category").order("band_order").order("recipient");
        if (error) fail("Loading pool coverage", error);
        return ((data ?? []) as PoolCoverageRow[]).map((row) => ({ ...row, active: Number(row.active) }));
      },
      async poolStatusCounts() {
        const { data, error } = await views().from("pool_status_counts").select("*");
        if (error) fail("Loading pool counts", error);
        return Object.fromEntries(((data ?? []) as { status: string; products: number }[]).map((row) => [row.status, Number(row.products)]));
      },
      async demandSince(isoDate) {
        const { data, error } = await db().from("results").select("recipient, budget_pln").gte("created_at", isoDate).limit(5000);
        if (error) fail("Loading demand", error);
        return data;
      },
      async saveBuilt(rows) {
        if (rows.length === 0) return 0;
        const { data, error } = await db()
          .from("products")
          .upsert(
            rows.map((row) => ({
              ...row,
              network: "direct",
              description: null,
              image_url: null,
              affiliate_url: row.url,
              commission_rate: 0,
              in_stock: true,
              status: "active" as const,
              source: "catalog_build" as const,
              failed_checks: 0,
              last_check_at: row.checked_at,
              last_check_result: "ok",
              price_checked: row.price_pln,
            })),
            { onConflict: "network,external_id" },
          )
          .select("id");
        if (error) fail("Saving built products", error);
        return data.length;
      },
      async listUntagged(limit) {
        const { data, error } = await db()
          .from("products")
          .select("id, name, category, price_pln, merchant")
          .in("status", ["active", "pending"])
          .neq("network", "demo")
          .or("tags.eq.{},gift_types.eq.{}")
          .limit(limit);
        if (error) fail("Loading untagged products", error);
        return data;
      },
      async updateTags(productId, patch) {
        const { error } = await db().from("products").update(patch).eq("id", productId);
        if (error) fail("Saving product tags", error);
      },
    },

    guides: {
      async listProducts(slug) {
        const { data: links, error } = await db()
          .from("guide_products")
          .select("*")
          .eq("guide_slug", slug)
          .order("position");
        if (error) fail("Loading guide products", error);
        if (links.length === 0) return [];
        const { data: products, error: productsError } = await db()
          .from("products")
          .select("*")
          .in("id", links.map((link) => link.product_id));
        if (productsError) fail("Loading guide products", productsError);
        const byId = new Map(products.map((product) => [product.id, product]));
        return links.flatMap((link) => {
          const product = byId.get(link.product_id);
          return product?.in_stock
            ? [{ position: link.position, reason: link.reason, refreshedAt: link.refreshed_at, product }]
            : [];
        });
      },
      async replaceProducts(slug, rows) {
        const refreshedAt = new Date().toISOString();
        // Insert first, then drop the rows that are not part of the new list: a failure in between never leaves a guide empty.
        if (rows.length > 0) {
          const { error } = await db()
            .from("guide_products")
            .upsert(
              rows.map((row) => ({ ...row, guide_slug: slug, refreshed_at: refreshedAt })),
              { onConflict: "guide_slug,product_id" },
            );
          if (error) fail("Saving guide products", error);
        }
        const keep = rows.map((row) => row.product_id);
        let remove = db().from("guide_products").delete().eq("guide_slug", slug);
        if (keep.length > 0) remove = remove.not("product_id", "in", `(${keep.join(",")})`);
        const { error: deleteError } = await remove;
        if (deleteError) fail("Cleaning guide products", deleteError);
      },
    },

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
      async findCandidates({ minPrice, maxPrice, anyOfTags, noneOfTags, recipient, category, excludeIds, freshWithinDays, limit }) {
        let query = db()
          .from("products")
          .select("*")
          .eq("in_stock", true)
          .gte("price_pln", minPrice)
          .lte("price_pln", maxPrice);
        if (anyOfTags && anyOfTags.length > 0) query = query.overlaps("tags", [...anyOfTags]);
        if (noneOfTags && noneOfTags.length > 0) query = query.not("tags", "ov", pgArray(noneOfTags));
        if (recipient) query = query.or(`recipients.eq.{},recipients.cs.{${recipient}}`);
        if (category) query = query.eq("category", category);
        if (freshWithinDays !== undefined) {
          query = query.eq("status", "active").gte("last_check_at", new Date(Date.now() - freshWithinDays * 86_400_000).toISOString());
        }
        if (excludeIds && excludeIds.length > 0) query = query.not("id", "in", `(${excludeIds.join(",")})`);
        const { data, error } = await query.order("price_pln", { ascending: false }).limit(limit);
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
            rows.map((row) => ({ ...row, network: "direct", commission_rate: 0, in_stock: true, status: "active", source: "web_search", last_check_at: row.checked_at, price_checked: row.price_pln })),
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
