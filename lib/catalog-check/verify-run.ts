/**
 * One verification run against the app's repositories (real Supabase or the demo JSON). Used by
 * `npm run catalog:verify` and by the nightly job (scripts/catalog-nightly.ts). No AI.
 */
import type { CatalogCheckRunRow } from "../db.ts";
import type { Repos } from "../services/db.ts";
import { createRepoStore } from "./repo-store.ts";
import { runCatalogCheck, selectProducts, type CheckProduct, type RunnerResult } from "./runner.ts";

export type VerifyOptions = {
  /** At most this many products. */
  limit?: number;
  /** Only products not checked for this many days (or never), oldest first. */
  staleAfterDays?: number;
  /** Whole run time limit (GitHub Actions job: 30 minutes). */
  maxRunMs?: number;
  startedBy?: CatalogCheckRunRow["started_by"];
  /** Only these products. */
  onlyIds?: readonly string[];
  log?: (message: string) => void;
};

export type VerifyReport = {
  run: CatalogCheckRunRow;
  result: RunnerResult;
  durationMs: number;
};

/** What a run would check, without fetching anything (dry run). */
export async function previewVerify(repos: Repos, options: VerifyOptions): Promise<{ total: number; selected: CheckProduct[] }> {
  const store = createRepoStore(repos);
  const products = await store.listProducts();
  const selected = selectProducts(products, { cursor: null, limit: options.limit, staleAfterDays: options.staleAfterDays, now: Date.now() });
  return { total: products.length, selected };
}

export async function runVerify(repos: Repos, options: VerifyOptions): Promise<VerifyReport> {
  const started = Date.now();
  const run = await repos.catalog.createRun(options.startedBy ?? "manual");
  const maxRunMs = options.maxRunMs ?? 25 * 60_000;
  const result = await runCatalogCheck(createRepoStore(repos), {
    runId: run.id,
    budgetMs: maxRunMs,
    maxRunMs,
    limit: options.limit,
    staleAfterDays: options.staleAfterDays,
    onlyIds: options.onlyIds,
    deps: { fetch: (url, init) => fetch(url, init), isAllowedHost: () => false },
    log: options.log,
  });
  return { run: (await repos.catalog.getRun(run.id))!, result, durationMs: Date.now() - started };
}

export function formatVerifyReport(report: VerifyReport): string {
  const { run, result, durationMs } = report;
  const lines = [
    `Status: ${result.status}, czas ${Math.round(durationMs / 1000)} s`,
    `Sprawdzono ${run.processed}/${run.total} · w porządku ${run.ok} · zmiany cen >20% ${run.price_changes} · ` +
      `nowo niedostępne ${run.became_unavailable} · pominięte robots.txt ${run.skipped_robots} · ` +
      `bez danych/zablokowane ${run.unverified} · błędy ${run.errors}`,
  ];
  if (Object.keys(run.failures).length > 0) lines.push(`Błędy według sklepu: ${JSON.stringify(run.failures)}`);
  return lines.join("\n");
}
