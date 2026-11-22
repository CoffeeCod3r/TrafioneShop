import { runCatalogCheck } from "@/lib/catalog-check/runner";
import { createRepoStore } from "@/lib/catalog-check/repo-store";
import { getServiceEnv } from "@/lib/env";
import { describeError, logEvent } from "@/lib/log";
import { isMockMode } from "@/lib/mode";
import { getRepos } from "@/lib/services/db";

/** A run that started less than this long ago counts as still going (the check itself is capped at 20 minutes). */
const ACTIVE_WINDOW_MS = 25 * 60_000;

export type StartResult = { started: boolean; runId: string | null; reason?: "already_running" | "failed" };

/**
 * Starts the catalog check ("Sprawdź linki teraz"). Never starts a second one while one is going.
 * - Real mode: asks the Supabase Edge Function `check-links` (it runs in the background, in batches, and answers at once).
 * - Demo mode: runs in this process after returning `background`, so call it inside `after()`.
 */
export async function startCatalogCheck(): Promise<StartResult & { background?: () => Promise<void> }> {
  const repos = getRepos();
  const [latest] = await repos.catalog.recentRuns(1);
  if (latest && latest.status === "running" && Date.now() - Date.parse(latest.started_at) < ACTIVE_WINDOW_MS) {
    return { started: false, runId: latest.id, reason: "already_running" };
  }

  if (isMockMode()) {
    const run = await repos.catalog.createRun("manual");
    return {
      started: true,
      runId: run.id,
      background: async () => {
        try {
          await runCatalogCheck(createRepoStore(repos), {
            runId: run.id,
            budgetMs: 10 * 60_000,
            deps: { fetch: (url, init) => fetch(url, init), isAllowedHost: () => false },
          });
        } catch (error) {
          logEvent("catalog_check.demo_run_failed", describeError(error));
          await repos.catalog.updateRun(run.id, { status: "failed", finished_at: new Date().toISOString() });
        }
      },
    };
  }

  try {
    const env = getServiceEnv();
    const response = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/check-links`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        "x-internal-secret": env.CRON_SECRET,
      },
      body: JSON.stringify({ trigger: "manual" }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) throw new Error(`Edge function answered ${response.status}`);
    const body = (await response.json()) as { accepted?: boolean; runId?: string; reason?: string };
    if (body.accepted === false) return { started: false, runId: body.runId ?? null, reason: "already_running" };
    return { started: true, runId: body.runId ?? null };
  } catch (error) {
    logEvent("catalog_check.dispatch_failed", describeError(error));
    return { started: false, runId: null, reason: "failed" };
  }
}
