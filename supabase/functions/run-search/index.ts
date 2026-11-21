// Supabase Edge Function `run-search` (Deno).
//
// Runs one web search in the background, outside the 26 s limit of Netlify functions:
//   POST /functions/v1/run-search   (header x-internal-secret = CRON_SECRET; deployed with --no-verify-jwt)
//   body: SearchJob { kind: "free" | "paid", resultId, count, maxSearches, maxFetches, ... }
// It answers 202 at once and keeps working (EdgeRuntime.waitUntil). The search logic is the same module the
// Next.js app uses in demo mode (lib/search/core.ts, copied to _shared/lib by `npm run edge:sync`).
//
// On success it writes products, the result and ai_usage straight to Postgres. On failure it calls
// POST {SITE_URL}/api/internal/search-failed, which refunds a paid search or finishes a free result
// from the catalog (the app owns Stripe and the catalog selection).
//
// Secrets (supabase secrets set ...): ANTHROPIC_API_KEY, ANTHROPIC_MODEL (optional), SITE_URL, CRON_SECRET.
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase.
// The photo never reaches this function: only the finished style profile stored on the result is used.

import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "zod";

import {
  runSearchJob,
  searchWebWithClaude,
  writeDedicationsWithClaude,
  type SearchJob,
  type SearchStore,
} from "../_shared/lib/search/core.ts";

declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (request: Request) => Response | Promise<Response>): void;
};
declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void };

const jobSchema = z.object({
  kind: z.enum(["free", "paid"]),
  resultId: z.string().uuid(),
  purchaseId: z.string().uuid().optional(),
  count: z.number().int().min(1).max(10),
  maxSearches: z.number().int().min(1).max(20),
  maxFetches: z.number().int().min(1).max(30),
  quizHash: z.string().max(100).nullish(),
});

function env(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing secret ${name}`);
  return value;
}

function log(event: string, data: Record<string, unknown> = {}) {
  console.log(JSON.stringify({ event, ...data }));
}

// deno-lint-ignore no-explicit-any
function createStore(db: any): SearchStore {
  const check = (action: string, error: { code?: string } | null) => {
    if (error) throw new Error(`${action} failed (${error.code ?? "unknown"})`);
  };
  return {
    async getResult(id) {
      const { data, error } = await db.from("results").select("*").eq("id", id).maybeSingle();
      check("Loading result", error);
      return data;
    },
    async listShops() {
      const { data, error } = await db.from("allowed_shops").select("*").eq("active", true);
      check("Loading shops", error);
      return data ?? [];
    },
    async productNames(ids) {
      if (ids.length === 0) return [];
      const { data, error } = await db.from("products").select("name").in("id", ids);
      check("Loading products", error);
      return (data ?? []).map((row: { name: string }) => row.name);
    },
    async saveProducts(rows) {
      if (rows.length === 0) return [];
      const { data, error } = await db
        .from("products")
        .upsert(
          rows.map((row) => ({ ...row, network: "direct", commission_rate: 0, in_stock: true })),
          { onConflict: "network,external_id" },
        )
        .select("id, external_id");
      check("Saving products", error);
      return data ?? [];
    },
    async updateResult(id, patch) {
      const { error } = await db.from("results").update(patch).eq("id", id);
      check("Updating result", error);
    },
    async recordUsage(entries, resultId) {
      if (entries.length === 0) return;
      const { error } = await db.from("ai_usage").insert(
        entries.map((entry) => ({
          result_id: resultId,
          step: entry.step,
          model: entry.model,
          input_tokens: entry.inputTokens,
          output_tokens: entry.outputTokens,
          web_searches: entry.webSearches ?? 0,
          web_fetches: entry.webFetches ?? 0,
        })),
      );
      check("Saving usage", error);
    },
  };
}

/** Tells the app the search did not deliver (it refunds / finishes from the catalog). Retries a few times. */
async function reportFailure(job: SearchJob, reason: string): Promise<void> {
  const url = `${env("SITE_URL").replace(/\/$/, "")}/api/internal/search-failed`;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json", "x-internal-secret": env("CRON_SECRET") },
        body: JSON.stringify({ kind: job.kind, resultId: job.resultId, purchaseId: job.purchaseId, reason }),
        signal: AbortSignal.timeout(20_000),
      });
      if (response.ok) return;
      log("run_search.callback_status", { status: response.status, attempt });
    } catch (error) {
      log("run_search.callback_error", {
        attempt,
        message: error instanceof Error ? error.message.slice(0, 100) : "unknown",
      });
    }
    await new Promise((resolve) => setTimeout(resolve, attempt * 3000));
  }
  // The app also rescues stuck searches on its own (status polling), so giving up here is safe.
}

async function run(job: SearchJob): Promise<void> {
  try {
    const model = Deno.env.get("ANTHROPIC_MODEL") ?? "claude-haiku-5-5";
    const client = new Anthropic({ apiKey: env("ANTHROPIC_API_KEY"), maxRetries: 0, timeout: 120_000 });
    const db = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const outcome = await runSearchJob(
      {
        store: createStore(db),
        ai: {
          webSearch: (input) => searchWebWithClaude(client, model, input),
          writeDedications: (answers, profile) => writeDedicationsWithClaude(client, model, answers, profile),
        },
        log,
      },
      job,
    );
    if (!outcome.ok) await reportFailure(job, outcome.reason);
  } catch (error) {
    log("run_search.crashed", {
      kind: job.kind,
      message: error instanceof Error ? error.message.slice(0, 100) : "unknown",
    });
    await reportFailure(job, "crashed");
  }
}

function constantTimeEqual(a: string, b: string): boolean {
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
  // Own authentication (the function is deployed with verify_jwt=false so it works with any kind of Supabase key):
  // only the app, which knows CRON_SECRET, may start a search. Without the secret configured, nothing runs.
  const secret = Deno.env.get("CRON_SECRET") ?? "";
  const given = request.headers.get("x-internal-secret") ?? "";
  if (secret.length < 32 || given.length !== secret.length || !constantTimeEqual(given, secret)) {
    return new Response("Forbidden", { status: 403 });
  }
  const parsed = jobSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Bad job" }, { status: 400 });

  EdgeRuntime.waitUntil(run(parsed.data));
  return Response.json({ accepted: true }, { status: 202 });
});
