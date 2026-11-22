// Supabase Edge Function `check-links` (Deno): the weekly check of product links and prices. NO AI, no web search.
//
//   POST /functions/v1/check-links   (header x-internal-secret = CRON_SECRET; deployed with verify_jwt=false)
//   body: { trigger?: "cron" | "manual", runId?: string }
//
// Started by pg_cron (Sunday 03:00 Polish time, see the cron migration) and by the "Sprawdź linki teraz" button in
// /admin. It answers 202 at once and works in the background in batches of ~100 s (Edge Function time limit): when a
// batch uses up its time it calls itself again with the same runId and the run continues from the saved cursor.
// The whole run is cut off after 20 minutes (the run is then "partial" and the rest waits for the next week).
// The rules and the page reading are the same portable modules the app and the tests use (lib/catalog-check/*,
// copied to _shared/lib by `npm run edge:sync`).
//
// Secrets: CRON_SECRET, SITE_URL (to refresh the guide pages afterwards). SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are provided.

import { createClient } from "npm:@supabase/supabase-js@2";

import { MAX_RUN_MS, runCatalogCheck, type CheckStore } from "../_shared/lib/catalog-check/runner.ts";

declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (request: Request) => Response | Promise<Response>): void;
};
declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void };

const BATCH_MS = 100_000;
const MIN_GUIDE_PRODUCTS = 6;
const COLUMNS = "id, name, url, affiliate_url, price_pln, network, category, failed_checks, in_stock";

function env(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing secret ${name}`);
  return value;
}

function log(event: string, data: Record<string, unknown> = {}) {
  console.log(JSON.stringify({ event, ...data }));
}

// deno-lint-ignore no-explicit-any
function createStore(db: any): CheckStore {
  const check = (action: string, error: { code?: string } | null) => {
    if (error) throw new Error(`${action} failed (${error.code ?? "unknown"})`);
  };
  return {
    async listProducts() {
      const { data: direct, error } = await db.from("products").select(COLUMNS).eq("in_stock", true).eq("network", "direct");
      check("Loading products", error);
      const { data: links, error: linksError } = await db.from("guide_products").select("product_id");
      check("Loading guide products", linksError);
      const known = new Set((direct ?? []).map((product: { id: string }) => product.id));
      const extraIds = [...new Set((links ?? []).map((link: { product_id: string }) => link.product_id))].filter(
        (id) => !known.has(id),
      );
      let extra: unknown[] = [];
      if (extraIds.length > 0) {
        const { data, error: extraError } = await db.from("products").select(COLUMNS).eq("in_stock", true).in("id", extraIds);
        check("Loading guide products", extraError);
        extra = data ?? [];
      }
      return [...(direct ?? []), ...extra];
    },
    async listShopDomains() {
      const { data, error } = await db.from("allowed_shops").select("domain").eq("active", true);
      check("Loading shops", error);
      return (data ?? []).map((row: { domain: string }) => row.domain);
    },
    async applyCheck(productId, patch, history) {
      const { error } = await db.from("products").update(patch).eq("id", productId);
      check("Saving product check", error);
      if (history) {
        const { error: historyError } = await db.from("price_history").insert({ product_id: productId, ...history });
        check("Saving price history", historyError);
      }
    },
    async getRun(id) {
      const { data, error } = await db.from("catalog_check_runs").select("*").eq("id", id).maybeSingle();
      check("Loading run", error);
      return data;
    },
    async updateRun(id, patch) {
      const { error } = await db.from("catalog_check_runs").update(patch).eq("id", id);
      check("Saving run", error);
    },
  };
}

/** Guides that have fewer than 6 available products of their own (the pages top them up from the catalog pool). */
async function incompleteGuides(db: any): Promise<string[]> { // deno-lint-ignore no-explicit-any
  const { data, error } = await db.from("guide_products").select("guide_slug, products(in_stock)");
  if (error) return [];
  const available = new Map<string, number>();
  for (const row of data ?? []) {
    const stock = Array.isArray(row.products) ? row.products[0]?.in_stock : row.products?.in_stock;
    available.set(row.guide_slug, (available.get(row.guide_slug) ?? 0) + (stock ? 1 : 0));
  }
  return [...available.entries()].filter(([, count]) => count < MIN_GUIDE_PRODUCTS).map(([slug]) => slug).sort();
}

async function selfCall(runId: string): Promise<void> {
  const url = `${env("SUPABASE_URL")}/functions/v1/check-links`;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${env("SUPABASE_SERVICE_ROLE_KEY")}`,
          "x-internal-secret": env("CRON_SECRET"),
        },
        body: JSON.stringify({ runId }),
        signal: AbortSignal.timeout(20_000),
      });
      if (response.ok) return;
      log("check_links.chain_status", { status: response.status, attempt });
    } catch (error) {
      log("check_links.chain_error", { attempt, message: error instanceof Error ? error.message.slice(0, 100) : "unknown" });
    }
    await new Promise((resolve) => setTimeout(resolve, attempt * 3000));
  }
  throw new Error("Could not continue the run");
}

async function refreshGuidePages(): Promise<void> {
  const site = Deno.env.get("SITE_URL");
  if (!site) return;
  try {
    await fetch(`${site.replace(/\/$/, "")}/api/revalidate-guides`, {
      method: "POST",
      headers: { "x-internal-secret": env("CRON_SECRET") },
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    // The guide pages also refresh on their own.
  }
}

// deno-lint-ignore no-explicit-any
async function work(db: any, runId: string): Promise<void> {
  const store = createStore(db);
  try {
    const result = await runCatalogCheck(store, {
      runId,
      budgetMs: BATCH_MS,
      maxRunMs: MAX_RUN_MS,
      deps: {
        fetch: (url, init) => fetch(url, init),
        isAllowedHost: () => false, // replaced by the runner with the allowed shops
      },
      log: (message) => log("check_links.item", { message }),
    });
    if (result.status === "paused") {
      await selfCall(runId);
      return;
    }
    await store.updateRun(runId, { guides_incomplete: await incompleteGuides(db) });
    await refreshGuidePages();
    log("check_links.finished", { runId, status: result.status, processed: result.processed });
  } catch (error) {
    log("check_links.crashed", { runId, message: error instanceof Error ? error.message.slice(0, 100) : "unknown" });
    await store.updateRun(runId, { status: "failed", finished_at: new Date().toISOString() }).catch(() => undefined);
  }
}

function constantTimeEqual(a: string, b: string): boolean {
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const secret = Deno.env.get("CRON_SECRET") ?? "";
  const given = request.headers.get("x-internal-secret") ?? "";
  if (secret.length < 32 || given.length !== secret.length || !constantTimeEqual(given, secret)) {
    return new Response("Forbidden", { status: 403 });
  }
  const body = (await request.json().catch(() => null)) as { trigger?: string; runId?: string } | null;
  const db = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let runId = typeof body?.runId === "string" ? body.runId : null;
  if (!runId) {
    // A new run. A run that is still going (started less than 25 minutes ago) is not started twice.
    const since = new Date(Date.now() - 25 * 60_000).toISOString();
    const { data: active } = await db.from("catalog_check_runs").select("id").eq("status", "running").gte("started_at", since).limit(1);
    if (active && active.length > 0) return Response.json({ accepted: false, runId: active[0].id, reason: "already_running" }, { status: 200 });
    // Runs that were left "running" long ago (a crashed chain) are closed.
    await db.from("catalog_check_runs").update({ status: "partial", finished_at: new Date().toISOString() }).eq("status", "running").lt("started_at", since);
    const { data, error } = await db
      .from("catalog_check_runs")
      .insert({ started_by: body?.trigger === "manual" ? "manual" : "cron" })
      .select("id")
      .single();
    if (error || !data) return Response.json({ error: "Could not start" }, { status: 500 });
    runId = data.id as string;
  }

  EdgeRuntime.waitUntil(work(db, runId));
  return Response.json({ accepted: true, runId }, { status: 202 });
});
