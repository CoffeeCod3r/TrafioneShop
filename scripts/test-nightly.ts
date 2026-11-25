/**
 * Tests of the nightly pool job (lib/catalog/nightly.ts) on a temporary demo database with a fake shop and the demo
 * AI provider: order of the steps, the cost limit, the report, tagging, the dry run (no writes, no AI, no requests).
 *
 *   npm run test:nightly
 */
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import type { CatalogAiProvider } from "../lib/catalog/provider.ts";
import type { VerifyFetch } from "../lib/catalog/verify.ts";

const dbPath = path.join(mkdtempSync(path.join(tmpdir(), "nightly-")), "db.json");
process.env.DEMO_DB_PATH = dbPath;
process.env.REAL_DB = "false";
process.env.MOCK_MODE = "true";

const { getRepos } = await import("../lib/services/db.ts");
const { runNightly, planNightly } = await import("../lib/catalog/nightly.ts");
const { CELL_COST_ESTIMATE_USD } = await import("../lib/catalog/build.ts");
const { createDemoProvider } = await import("../lib/catalog/provider.ts");
const { pickGaps } = await import("../lib/catalog/gaps.ts");
const { computeCoverage } = await import("../lib/catalog/pool.ts");

let failures = 0;
function check(condition: boolean, text: string): void {
  console.log(`  ${condition ? "OK  " : "FAIL"}  ${text}`);
  if (!condition) failures++;
}

const page = (price: string) =>
  `<html><head><script type="application/ld+json">${JSON.stringify({
    "@context": "https://schema.org",
    "@type": "Product",
    name: "P",
    offers: { "@type": "Offer", price, priceCurrency: "PLN", availability: "https://schema.org/InStock" },
  })}</script></head></html>`;

const requested: string[] = [];
const fetchFake: VerifyFetch = async (url) => {
  requested.push(url);
  const { pathname } = new URL(url);
  if (pathname === "/robots.txt") return new Response("", { status: 404 });
  if (pathname.startsWith("/gone/")) return new Response("", { status: 404 });
  if (pathname.startsWith("/demo/zle/")) return new Response("", { status: 404 });
  return new Response(page("99.00"), { status: 200, headers: { "content-type": "text/html" } });
};

const repos = getRepos();
const shop = (await repos.allowedShops.listActive())[0];
const old = new Date(Date.now() - 5 * 86_400_000).toISOString();
await repos.products.saveDirect([
  { merchant: shop.name, external_id: "stale-ok", name: "Stary, działa", description: null, price_pln: 99, category: "Kuchnia", tags: [], image_url: null, affiliate_url: `https://${shop.domain}/ok/1`, url: `https://${shop.domain}/ok/1`, checked_at: old },
  { merchant: shop.name, external_id: "stale-gone", name: "Stary, usunięty", description: null, price_pln: 99, category: "Kuchnia", tags: [], image_url: null, affiliate_url: `https://${shop.domain}/gone/1`, url: `https://${shop.domain}/gone/1`, checked_at: old },
  { merchant: shop.name, external_id: "fresh", name: "Świeży, nie do sprawdzenia", description: null, price_pln: 99, category: "Kuchnia", tags: [], image_url: null, affiliate_url: `https://${shop.domain}/ok/2`, url: `https://${shop.domain}/ok/2`, checked_at: new Date().toISOString() },
]);
// saveDirect marks them as just verified; the test makes "stale-*" look attempted 5 days ago.
for (const external of ["stale-ok", "stale-gone"]) {
  const product = (await repos.catalog.listForVerify({ onlyStale: false, staleBeforeIso: old })).find((item) => item.url?.endsWith(external === "stale-ok" ? "/ok/1" : "/gone/1"))!;
  await repos.catalog.applyVerification(product.id, { fail_count: external === "stale-gone" ? 1 : 0, last_check_at: old, last_check_result: "test" });
}

// ---------------------------------------------------------------------------
console.log("Dry run: bez zapisu, bez AI, bez pobierania stron");
const before = readFileSync(dbPath, "utf8");
const plan = await planNightly({ repos, budgetUsd: 0.3 });
const after = readFileSync(dbPath, "utf8");
check(before === after, "plik bazy bez zmian po planie");
check(requested.length === 0, "żadna strona sklepu nie została pobrana");
check(plan.toVerify.wouldCheck === 2 && plan.toVerify.resolvable === 2, `do weryfikacji dziś: ${plan.toVerify.wouldCheck} (dwa przeterminowane, świeży pomijany)`);
check(plan.cells.length === 10 && plan.coverage.belowThreshold > 10, `plan: 10 komórek z ${plan.coverage.belowThreshold} poniżej progu`);
check(plan.worstCaseCostUsd <= 0.3, `najgorszy koszt $${plan.worstCaseCostUsd} mieści się w limicie $0.30`);

// ---------------------------------------------------------------------------
console.log("\nWybór komórek");
const coverage = computeCoverage([]).map((cell) => ({ ...cell }));
const wanted = pickGaps(coverage, [{ recipient: "mom", budget_pln: 100, tags: ["kawa", "gotowanie"] }, { recipient: "mom", budget_pln: 100, tags: ["kawa"] }], 10);
check(wanted.picked.length === 10 && wanted.picked[0].recipient === "mom" && wanted.picked[0].price_bucket === "50-100" && wanted.picked[0].demand === 2, "najpierw komórki, o które pytano w ostatnich 7 dniach (mama, 50–100, jedzenie/kuchnia)");

check(new Set(wanted.picked.map((cell) => `${cell.category}|${cell.price_bucket}`)).size === 10, "10 komórek to 10 różnych par kategoria × przedział (jeden produkt pasuje do wielu odbiorców)");

// ---------------------------------------------------------------------------
console.log("\nPełny przebieg (limit $0.045: dwa zapytania AI, trzecie się nie mieści)");
const result = await runNightly({
  repos,
  provider: createDemoProvider(),
  deps: { fetch: fetchFake },
  trigger: "manual",
  budgetUsd: 0.045,
  maxCells: 5,
  intervalMs: 1,
  allowInsecure: false,
});
check(result.status === "stopped_budget" && result.ai_calls === 2, `status ${result.status}, zapytań AI: ${result.ai_calls}`);
check(result.ai_cost_usd > 0 && result.ai_cost_usd + CELL_COST_ESTIMATE_USD > 0.045 && result.ai_cost_usd <= 0.045, `koszt $${result.ai_cost_usd} nie przekracza limitu`);
check(typeof result.notes === "object" && JSON.stringify(result.notes).includes("limit"), "raport mówi o przerwaniu z powodu limitu");
check(result.checked >= 2 + 6 - 3, `sprawdzono ${result.checked} (2 stare + nowe)`);
check(result.broken === 1 && result.active >= 7, `stary produkt z jedną porażką i kolejnym 404 -> broken (${result.broken}); działające -> aktywne (${result.active})`);
const pool = await repos.catalog.poolCounts();
check(pool.pending === 0, "po weryfikacji nie zostają produkty 'pending'");
check(result.added === 6, `dodane do puli: ${result.added} (2 komórki x 3 produkty)`);
const created = (await repos.products.findCandidates({ minPrice: 0, maxPrice: 1000, limit: 1000 })).filter((p) => p.source === "catalog_build" && p.external_id.length === 32 && p.name.startsWith("Produkt demo"));
check(created.length === 6 && created.every((p) => p.status === "active" && p.price_checked === 99 && p.last_checked_at !== null), "nowe produkty są aktywne, mają cenę ze strony sklepu (99 zł), nie od AI");
const usage = await repos.aiUsage.listSince("2000-01-01T00:00:00Z");
check(usage.length === 2 && usage.every((row) => row.step === "catalog_build" && row.web_fetches === 0), "każde zapytanie AI zapisane w ai_usage (step catalog_build, bez web_fetch)");
const report = await repos.catalog.latestNightlyRun();
check(report?.id === result.runId && report.finished_at !== null && report.cells_targeted !== null, "raport zapisany w catalog_runs");
check(requested.filter((url) => url.includes("awin")).length === 0, "żadne żądanie nie poszło do sieci afiliacyjnej");

// ---------------------------------------------------------------------------
console.log("\nKolejna noc: błąd AI nie przerywa zadania");
const failing: CatalogAiProvider = { name: "failing", model: "x", findProducts: async () => { throw new Error("sk-ant-api03-SEKRET przekroczono limit"); } };
const second = await runNightly({ repos, provider: failing, deps: { fetch: fetchFake }, trigger: "manual", budgetUsd: 0.1, maxCells: 2, intervalMs: 1 });
check(second.broken === 0 && (await repos.catalog.poolCounts()).broken === 1, "produkt broken nie wraca do puli i nie jest sprawdzany ponownie następnej nocy");
check(second.status === "completed" && second.ai_calls === 2, "błędy AI nie kończą zadania czerwono (status completed)");
check(!JSON.stringify(second.notes).includes("SEKRET"), "klucz API nie trafia do raportu");
check(second.ai_cost_usd === 2 * CELL_COST_ESTIMATE_USD, "nieudane zapytanie liczone po najgorszym koszcie ($0.03), więc limit zostaje twardy");

console.log("\nBez dostawcy AI weryfikacja nadal działa");
const third = await runNightly({ repos, provider: null, deps: { fetch: fetchFake }, trigger: "manual", intervalMs: 1 });
check(third.status === "completed" && third.ai_calls === 0 && JSON.stringify(third.notes).includes("brak dostawcy"), "krok c) pominięty, raport to zapisuje");

console.log(failures === 0 ? "\nWszystkie testy przeszły." : `\nNiepowodzenia: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
