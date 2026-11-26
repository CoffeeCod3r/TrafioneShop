import { runCatalogCheck } from "@/lib/catalog-check/runner";
import { createRepoStore } from "@/lib/catalog-check/repo-store";
import { describeError, logEvent } from "@/lib/log";
import { isMockMode } from "@/lib/mode";
import { getRepos } from "@/lib/services/db";

/** A run that started less than this long ago counts as still going (the check itself is capped at 20 minutes). */
const ACTIVE_WINDOW_MS = 25 * 60_000;

export type StartResult = { started: boolean; runId: string | null; reason?: "already_running" | "failed" | "use_github_actions" };

/**
 * Starts the catalog check ("Sprawdź linki teraz"). Never starts a second one while one is going.
 * - Demo mode: runs in this process after returning `background`, so call it inside `after()`.
 * - Real mode: the pool is checked by GitHub Actions (.github/workflows/nightly-catalog.yml, also started by hand
 *   from the Actions tab); the admin panel links there. Nothing is started from the app (Netlify functions have a
 *   short time limit and the old Edge Function check-links is no longer used).
 */
export async function startCatalogCheck(): Promise<StartResult & { background?: () => Promise<void> }> {
  if (!isMockMode()) return { started: false, runId: null, reason: "use_github_actions" };

  const repos = getRepos();
  const [latest] = await repos.catalog.recentRuns(1);
  if (latest && latest.status === "running" && Date.now() - Date.parse(latest.started_at) < ACTIVE_WINDOW_MS) {
    return { started: false, runId: latest.id, reason: "already_running" };
  }

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
