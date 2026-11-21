import { fallbackPicks, fallbackSummary } from "@/lib/ai/picks";
import { recordAiUsage } from "@/lib/ai/usage";
import type { FreeSource, PurchaseRow } from "@/lib/db";
import { getEnv, getServiceEnv } from "@/lib/env";
import { describeError, logEvent } from "@/lib/log";
import { isMockMode } from "@/lib/mode";
import { PICKS_COUNT, selectCandidates } from "@/lib/picks/candidates";
import { quizAnswersSchema } from "@/lib/quiz/schema";
import {
  runSearchJob,
  SEARCH_LIMITS,
  type SearchJob,
  type SearchStore,
} from "@/lib/search/core";
import { getAi } from "@/lib/services/ai";
import { getRepos } from "@/lib/services/db";
import { isAllowedTag } from "@/lib/tags";

/** A free search that is still "searching" after this long is finished from the catalog. */
export const FREE_STUCK_AFTER_MS = 5 * 60 * 1000;

export function freeSearchJob(resultId: string, quizHash: string | null): SearchJob {
  const limits = SEARCH_LIMITS.free;
  return { kind: "free", resultId, count: limits.count, maxSearches: limits.maxSearches, maxFetches: limits.maxFetches, quizHash };
}

export function paidSearchJob(resultId: string, purchaseId: string): SearchJob {
  const env = getEnv();
  return {
    kind: "paid",
    resultId,
    purchaseId,
    count: SEARCH_LIMITS.paid.count,
    maxSearches: env.PAID_SEARCH_MAX_SEARCHES,
    maxFetches: env.PAID_SEARCH_MAX_FETCHES,
  };
}

/** The search core's database access, backed by the app's repositories. */
function appStore(): SearchStore {
  const repos = getRepos();
  return {
    getResult: (id) => repos.results.getById(id),
    listShops: () => repos.allowedShops.listActive(),
    async productNames(ids) {
      return (await repos.products.getByIds(ids)).map((product) => product.name);
    },
    async saveProducts(rows) {
      const saved = await repos.products.saveDirect(rows);
      return saved.map((product) => ({ id: product.id, external_id: product.external_id }));
    },
    updateResult: (id, patch) => repos.results.update(id, patch),
    recordUsage: (entries, resultId) => recordAiUsage(entries, resultId),
  };
}

/**
 * Starts a search in the background, without waiting for it.
 * - Demo mode: runs in this process (the demo AI is instant).
 * - Real mode: calls the Supabase Edge Function `run-search`, which has no 26 s Netlify limit. It answers 202
 *   at once and keeps working; when the search fails it calls /api/internal/search-failed.
 * Call it inside `after()` so the HTTP response is not held up. Never throws.
 */
export async function dispatchSearch(job: SearchJob): Promise<void> {
  try {
    if (isMockMode()) {
      const outcome = await runSearchJob(
        { store: appStore(), ai: getAi(), allowDemoLinks: true, log: (event, data) => logEvent(event, flat(data)) },
        job,
      );
      if (!outcome.ok) await handleSearchFailure(job, outcome.reason);
      return;
    }

    const env = getServiceEnv();
    const response = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/run-search`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        // The function checks this itself (it is deployed with verify_jwt=false).
        "x-internal-secret": env.CRON_SECRET,
      },
      body: JSON.stringify(job),
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) throw new Error(`Edge function answered ${response.status}`);
  } catch (error) {
    logEvent("search.dispatch_failed", { kind: job.kind, ...describeError(error) });
    await handleSearchFailure(job, "dispatch_failed").catch((failure) =>
      logEvent("search.failure_handler_failed", { kind: job.kind, ...describeError(failure) }),
    );
  }
}

function flat(data: Record<string, unknown> | undefined): Record<string, string | number | boolean | null> {
  const out: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(data ?? {})) {
    out[key] = typeof value === "string" || typeof value === "number" || typeof value === "boolean" ? value : null;
  }
  return out;
}

/**
 * A search did not deliver. Paid: automatic refund (single) or the search goes back into the pack.
 * Free: the result is finished from the catalog, keeping any products the search did verify.
 */
export async function handleSearchFailure(job: SearchJob, reason: string): Promise<void> {
  if (job.kind === "free") {
    await completeFreeFromCatalog(job.resultId, "catalog_fallback");
    return;
  }
  // Imported here: lib/web-search.ts imports this module.
  const { refundPurchase } = await import("@/lib/web-search");
  const purchase: PurchaseRow | null = job.purchaseId ? await getRepos().purchases.getById(job.purchaseId) : null;
  if (!purchase) {
    logEvent("paid.failure_without_purchase", { reason });
    return;
  }
  // `result_id` is the result this search was for (a pack search may be used on another result than the purchase's).
  await refundPurchase({ ...purchase, result_id: job.resultId }, reason);
}

/**
 * Finishes a free result with products from the `products` table (non-AI selection, the same ranking
 * the catalog path uses). Used when the daily budget or device limit is reached after the fact,
 * when the web search failed, and when it got stuck. Keeps products the search already verified.
 * Does nothing unless the result is still "searching".
 */
export async function completeFreeFromCatalog(resultId: string, source: FreeSource): Promise<boolean> {
  const repos = getRepos();
  const result = await repos.results.getById(resultId);
  if (!result || result.search_status !== "searching") return false;

  const answers = quizAnswersSchema.safeParse(result.answers);
  const kept = result.product_ids;
  let productIds = kept;
  let reasons = (result.reasons ?? {}) as Record<string, string>;
  let summary: string | null = null;

  if (answers.success && kept.length < PICKS_COUNT) {
    const profile = { styleProfile: result.style_profile ?? "", tags: result.tags.filter(isAllowedTag), avoid: result.avoid.filter(isAllowedTag) };
    const { candidates } = await selectCandidates({ budget: answers.data.budget, tags: profile.tags, avoid: profile.avoid });
    const fresh = candidates.filter((candidate) => !kept.includes(candidate.id));
    const picks = fallbackPicks(fresh, profile).slice(0, PICKS_COUNT - kept.length);
    productIds = [...kept, ...picks.map((pick) => pick.productId)];
    reasons = { ...reasons, ...Object.fromEntries(picks.map((pick) => [pick.productId, pick.reason])) };
    if (kept.length === 0) summary = fallbackSummary(picks, fresh, profile);
  }

  await repos.results.update(resultId, {
    product_ids: productIds,
    reasons,
    pick_summary: summary,
    search_status: "ready",
    free_source: source,
  });
  logEvent("free.completed_from_catalog", { source, kept: kept.length, total: productIds.length });
  return true;
}

/** A free search that has been running too long (the Edge Function died): finish it from the catalog. */
export async function recoverStuckFreeSearch(resultId: string): Promise<boolean> {
  const result = await getRepos().results.getById(resultId);
  if (!result || result.search_status !== "searching") return false;
  const startedAt = new Date(result.search_started_at ?? result.created_at).getTime();
  if (Date.now() - startedAt < FREE_STUCK_AFTER_MS) return false;
  logEvent("free.stuck_recovered");
  return completeFreeFromCatalog(resultId, "catalog_fallback");
}
