import { GUIDES } from "@/lib/guides/data";
import { getGuideProducts, MIN_GUIDE_PRODUCTS } from "@/lib/guides/products";
import type { CatalogCheckRunRow } from "@/lib/db";
import { getRepos } from "@/lib/services/db";

export type CatalogHealth = {
  available: number;
  unavailable: number;
  lastRun: CatalogCheckRunRow | null;
  /** A check is going right now (started less than 25 minutes ago). */
  running: boolean;
  /** Seconds between start and finish of the last finished run. */
  durationSec: number | null;
  /** Most frequent errors per shop in the last run, most frequent first. */
  errors: { shop: string; kind: string; count: number }[];
  /** Guides that still have fewer than 6 products after topping up from the catalog pool. */
  guidesToComplete: { slug: string; title: string; count: number }[];
};

export const ERROR_LABELS: Record<string, string> = {
  timeout: "brak odpowiedzi w 5 s",
  http_5xx: "błąd serwera sklepu (5xx)",
  blocked: "blokada (401/403/429)",
  network: "błąd połączenia",
};

export async function getCatalogHealth(): Promise<CatalogHealth> {
  const repos = getRepos();
  const [counts, runs] = await Promise.all([repos.catalog.countProducts(), repos.catalog.recentRuns(5)]);
  const lastRun = runs[0] ?? null;
  const finished = runs.find((run) => run.finished_at);

  const errors = Object.entries(lastRun?.failures ?? {})
    .flatMap(([shop, kinds]) => Object.entries(kinds).map(([kind, count]) => ({ shop, kind, count })))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  const guidesToComplete: CatalogHealth["guidesToComplete"] = [];
  for (const guide of GUIDES) {
    const { products } = await getGuideProducts(guide.slug);
    if (products.length < MIN_GUIDE_PRODUCTS) guidesToComplete.push({ slug: guide.slug, title: guide.title, count: products.length });
  }

  return {
    ...counts,
    lastRun,
    running: lastRun?.status === "running" && Date.now() - Date.parse(lastRun.started_at) < 25 * 60_000,
    durationSec: finished?.finished_at ? Math.round((Date.parse(finished.finished_at) - Date.parse(finished.started_at)) / 1000) : null,
    errors,
    guidesToComplete,
  };
}
