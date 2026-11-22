/**
 * Runs the catalog check (links and prices, no AI) by hand against the database in .env.local.
 *
 *   npm run catalog:check
 *
 * The same code the weekly Edge Function `check-links` runs. Prints what happened to every product.
 * With MOCK_MODE=true it still uses the REAL database (REAL_DB is forced), so it needs the Supabase keys.
 */
export {};
process.env.REAL_DB = "true";

const { getRepos } = await import("../lib/services/db.ts");
const { createRepoStore } = await import("../lib/catalog-check/repo-store.ts");
const { runCatalogCheck } = await import("../lib/catalog-check/runner.ts");

const repos = getRepos();
const before = await repos.catalog.listCheckable();
console.log(`Do sprawdzenia: ${before.length} produktów (dostępne produkty z sieci + produkty z poradników)`);

const run = await repos.catalog.createRun("manual");
const started = Date.now();
const result = await runCatalogCheck(createRepoStore(repos), {
  runId: run.id,
  budgetMs: 20 * 60_000,
  deps: { fetch: (url, init) => fetch(url, init), isAllowedHost: () => false },
  log: (message) => console.log(`  ${message}`),
});
const finished = (await repos.catalog.getRun(run.id))!;

console.log(`\nStatus: ${result.status}, czas ${Math.round((Date.now() - started) / 1000)} s`);
console.log(
  `Sprawdzono ${finished.processed}/${finished.total} · w porządku ${finished.ok} · zmiany cen >20% ${finished.price_changes} · ` +
    `nowo niedostępne ${finished.became_unavailable} · pominięte robots.txt ${finished.skipped_robots} · ` +
    `bez danych/nie do sprawdzenia ${finished.unverified} · błędy sieci ${finished.errors}`,
);
if (Object.keys(finished.failures).length > 0) console.log("Błędy według sklepu:", JSON.stringify(finished.failures));

const ids = before.map((product) => product.id);
const after = await repos.products.getByIds(ids);
console.log("\nProdukty:");
for (const product of after) {
  console.log(`- ${product.name.slice(0, 60)} | ${new URL(product.url ?? product.affiliate_url).hostname} | ${product.price_pln} zł | ${product.in_stock ? "dostępny" : "NIEDOSTĘPNY"} | ${product.last_check_result}`);
}
const usage = (await repos.aiUsage.listSince(new Date(started).toISOString())).length;
console.log(`\nZapisów w ai_usage w tym przebiegu: ${usage}`);
