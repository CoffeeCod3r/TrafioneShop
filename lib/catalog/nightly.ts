/**
 * The nightly pool job (`npm run catalog:nightly`). In order:
 *   a) verify the stale products (last attempt more than 3 days ago, oldest first, at most 400)      - no AI
 *   b) read pool_coverage, take at most 10 cells below the threshold (most asked-for in the last 7 days first)
 *   c) for those cells: targeted AI search (web_search max 2, no web_fetch) -> save as `pending` -> verify the new
 *      products with the same code as step a -> tag them                                              - AI only here
 *   d) write the report to catalog_runs
 * Hard cost limit NIGHTLY_AI_BUDGET_USD (default 0.30): before every AI call the worst-case cost of that call is
 * added to what was already spent, and when it would not fit the step stops (and the report says so).
 * Nothing here touches the paid path or Stripe. Portable: store, provider and fetch are injected.
 */
import type { CatalogRunRow } from "../db.ts";
import type { Repos } from "../services/db.ts";
import { buildCells, CELL_COST_ESTIMATE_USD, type CellReport } from "./build.ts";
import { MAX_CELLS_PER_NIGHT, pickGaps, type Gap } from "./gaps.ts";
import { describeCell } from "./labels.ts";
import type { CatalogAiProvider } from "./provider.ts";
import { createVerifyStore } from "./store.ts";
import { tagProducts } from "./tag.ts";
import { emptySummary, resolveTargetUrl, runVerify, STALE_AFTER_DAYS, type VerifyDeps, type VerifySummary } from "./verify.ts";

export const DEFAULT_NIGHTLY_BUDGET_USD = 0.3;
export const MAX_VERIFY_PER_NIGHT = 400;
/** Time limit of the verification steps, so the whole job stays well inside the workflow's 30 minutes. */
const VERIFY_MAX_MS = 12 * 60_000;

export type NightlyOptions = {
  repos: Repos;
  /** Null: nothing is searched (dry run, or the provider could not be created and the job reports it). */
  provider: CatalogAiProvider | null;
  deps: VerifyDeps;
  trigger: CatalogRunRow["trigger"];
  budgetUsd?: number;
  maxVerify?: number;
  maxCells?: number;
  /** Tests: shorter pause between requests to one domain, http addresses. */
  intervalMs?: number;
  allowInsecure?: boolean;
  now?: () => number;
  log?: (message: string) => void;
};

export type NightlyReport = Omit<CatalogRunRow, "id" | "started_at" | "finished_at" | "trigger">;

const log0 = () => {};

export async function runNightly(options: NightlyOptions): Promise<NightlyReport & { runId: string }> {
  const { repos, provider, deps } = options;
  const now = options.now ?? Date.now;
  const log = options.log ?? log0;
  const budget = options.budgetUsd ?? DEFAULT_NIGHTLY_BUDGET_USD;
  const started = now();

  const run = await repos.catalog.createNightlyRun(options.trigger);
  const notes: Record<string, unknown> = {};
  const cells: CellReport[] = [];
  let aiCalls = 0;
  let spent = 0;
  let status: CatalogRunRow["status"] = "completed";
  let verifyTotals: VerifySummary = emptySummary();
  let belowCount = 0;
  let added = 0;

  const finish = async (final: CatalogRunRow["status"]) => {
    const report: NightlyReport = {
      status: final,
      checked: verifyTotals.checked,
      active: verifyTotals.active,
      broken: verifyTotals.broken,
      out_of_stock: verifyTotals.out_of_stock,
      price_changes: verifyTotals.price_changes,
      unverifiable: verifyTotals.unverifiable,
      added,
      cells_below_threshold: belowCount,
      cells_targeted: cells.map((cell) => ({
        category: cell.category,
        price_bucket: cell.price_bucket,
        recipient: cell.recipient,
        demand: cell.demand,
        found: cell.found,
        added: cell.added,
      })),
      ai_calls: aiCalls,
      ai_cost_usd: Math.round(spent * 10_000) / 10_000,
      duration_ms: now() - started,
      notes: notes as CatalogRunRow["notes"],
    };
    await repos.catalog.updateNightlyRun(run.id, { ...report, finished_at: new Date(now()).toISOString() });
    return { ...report, runId: run.id };
  };

  try {
    const store = createVerifyStore(repos);
    const verifyOptions = { deps, intervalMs: options.intervalMs, allowInsecure: options.allowInsecure, now: options.now, log: (message: string) => log(`    ${message}`) };

    // a) stale products
    log(`a) weryfikacja przeterminowanych (ostatnia próba > ${STALE_AFTER_DAYS} dni temu, najstarsze pierwsze, max ${options.maxVerify ?? MAX_VERIFY_PER_NIGHT})`);
    verifyTotals = await runVerify(store, { ...verifyOptions, onlyStale: true, limit: options.maxVerify ?? MAX_VERIFY_PER_NIGHT, maxMs: VERIFY_MAX_MS });
    if (verifyTotals.remaining > 0) notes.verify_time_limit = `przerwano po limicie czasu, zostało ${verifyTotals.remaining}`;
    if (Object.keys(verifyTotals.failures).length > 0) notes.failures_by_shop = verifyTotals.failures;
    log(`   sprawdzono ${verifyTotals.checked}, broken ${verifyTotals.broken}, out_of_stock ${verifyTotals.out_of_stock}, zmiany cen ${verifyTotals.price_changes}`);

    // b) coverage
    const since = new Date(now() - 7 * 86_400_000).toISOString();
    const [coverage, demand] = await Promise.all([repos.catalog.poolCoverage(), repos.catalog.recentDemand(since)]);
    const { all, picked } = pickGaps(coverage, demand, options.maxCells ?? MAX_CELLS_PER_NIGHT);
    belowCount = all;
    log(`b) komórek poniżej progu: ${all}, do uzupełnienia dziś: ${picked.length}`);

    // c) targeted top-up
    let newIds: string[] = [];
    if (picked.length > 0 && !provider) {
      notes.top_up_skipped = "brak dostawcy AI";
    } else if (provider && picked.length > 0) {
      log("c) uzupełnianie: celowane zapytania AI (web_search max 2, bez web_fetch)");
      const built = await buildCells({ repos, provider, cells: picked, budgetUsd: budget, now: options.now, log });
      spent = built.spentUsd;
      aiCalls = built.aiCalls;
      cells.push(...built.cells);
      newIds = built.cells.flatMap((cell) => cell.ids);
      if (built.stoppedByBudget) {
        status = "stopped_budget";
        notes.budget = `krok c) przerwany: wydano $${spent.toFixed(4)} z limitu $${budget.toFixed(2)}, kolejne zapytanie mogło go przekroczyć`;
      }
      if (built.errors.length > 0) notes.ai_errors = built.errors;
    }

    // c, continued) verify and tag only what was just added
    if (newIds.length > 0) {
      log(`c) weryfikacja ${newIds.length} nowych produktów (ten sam kod co w kroku a, bez AI)`);
      const fresh = await runVerify(store, { ...verifyOptions, ids: newIds, maxMs: VERIFY_MAX_MS });
      verifyTotals = {
        ...verifyTotals,
        checked: verifyTotals.checked + fresh.checked,
        active: verifyTotals.active + fresh.active,
        broken: verifyTotals.broken + fresh.broken,
        out_of_stock: verifyTotals.out_of_stock + fresh.out_of_stock,
        price_changes: verifyTotals.price_changes + fresh.price_changes,
        unverifiable: verifyTotals.unverifiable + fresh.unverifiable,
      };
      const created = await repos.products.getByIds(newIds);
      const active = new Set(created.filter((product) => product.status === "active").map((product) => product.id));
      for (const cell of cells) cell.added = cell.ids.filter((id) => active.has(id)).length;
      added = active.size;
      const tagged = await tagProducts(repos, { ids: [...active] });
      log(`   w puli ${added} z ${newIds.length}, otagowano ${tagged.tagged}`);
      if (added < newIds.length) notes.not_added = `${newIds.length - added} nowych produktów nie przeszło weryfikacji (zostają 'pending')`;
    }

    return await finish(status);
  } catch (error) {
    notes.error = error instanceof Error ? error.message.slice(0, 300) : "nieznany błąd";
    await finish("failed");
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Dry run: what the job would do, without writing, without AI and without opening a single shop page
// ---------------------------------------------------------------------------

export type DryRunPlan = {
  toVerify: { total: number; resolvable: number; withoutAddress: number; wouldCheck: number; domains: [string, number][] };
  coverage: { cells: number; belowThreshold: number };
  cells: (Gap & { query: ReturnType<typeof describeCell> })[];
  worstCaseCostUsd: number;
  budgetUsd: number;
};

export async function planNightly(options: { repos: Repos; budgetUsd?: number; maxVerify?: number; maxCells?: number; now?: () => number }): Promise<DryRunPlan> {
  const { repos } = options;
  const now = options.now ?? Date.now;
  const staleBeforeIso = new Date(now() - STALE_AFTER_DAYS * 86_400_000).toISOString();
  const stale = await repos.catalog.listForVerify({ onlyStale: true, staleBeforeIso });
  const targets = stale.map((product) => resolveTargetUrl(product));
  const resolvable = targets.filter((url): url is string => url !== null);
  const wouldCheck = resolvable.slice(0, options.maxVerify ?? MAX_VERIFY_PER_NIGHT);
  const domains = new Map<string, number>();
  for (const url of wouldCheck) domains.set(new URL(url).hostname, (domains.get(new URL(url).hostname) ?? 0) + 1);

  const coverage = await repos.catalog.poolCoverage();
  const demand = await repos.catalog.recentDemand(new Date(now() - 7 * 86_400_000).toISOString());
  const { all, picked } = pickGaps(coverage, demand, options.maxCells ?? MAX_CELLS_PER_NIGHT);
  const budgetUsd = options.budgetUsd ?? DEFAULT_NIGHTLY_BUDGET_USD;
  const affordable = Math.min(picked.length, Math.floor(budgetUsd / CELL_COST_ESTIMATE_USD));
  return {
    toVerify: { total: stale.length, resolvable: resolvable.length, withoutAddress: stale.length - resolvable.length, wouldCheck: wouldCheck.length, domains: [...domains.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10) },
    coverage: { cells: coverage.length, belowThreshold: all },
    cells: picked.slice(0, affordable).map((cell) => ({ ...cell, query: describeCell(cell) })),
    worstCaseCostUsd: Math.round(affordable * CELL_COST_ESTIMATE_USD * 10_000) / 10_000,
    budgetUsd,
  };
}
