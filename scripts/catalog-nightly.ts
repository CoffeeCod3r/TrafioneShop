/**
 * The nightly pool job: verify stale products, find thin cells of the coverage grid, top them up with a targeted AI
 * search, verify and tag the new products, write the report to catalog_runs. See lib/catalog/nightly.ts.
 *
 *   npm run catalog:nightly                 the real run
 *   npm run catalog:nightly -- --dry-run    shows what it would do: no writes, no AI, no shop page is opened
 *
 * PowerShell swallows the "--": use DRY_RUN=1 there.
 * Env: REAL_DB=true, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY (CATALOG_AI_PROVIDER, default
 * anthropic), NIGHTLY_AI_BUDGET_USD (default 0.30). Exit code 1 on failure (data is never deleted).
 */
import { parseArgs } from "node:util";

import { DEFAULT_NIGHTLY_BUDGET_USD, planNightly, runNightly } from "../lib/catalog/nightly.ts";
import { createProvider, type CatalogAiProvider } from "../lib/catalog/provider.ts";
import { isRealService } from "../lib/mode.ts";
import { getRepos } from "../lib/services/db.ts";

const { values } = parseArgs({ options: { "dry-run": { type: "boolean", default: false } }, strict: false });
const dryRun = values["dry-run"] === true || process.env.DRY_RUN === "1";
const budgetUsd = process.env.NIGHTLY_AI_BUDGET_USD ? Number(process.env.NIGHTLY_AI_BUDGET_USD) : DEFAULT_NIGHTLY_BUDGET_USD;
if (!Number.isFinite(budgetUsd) || budgetUsd <= 0) {
  console.error("NIGHTLY_AI_BUDGET_USD musi być dodatnią liczbą.");
  process.exit(1);
}

const repos = getRepos();
console.log(`${dryRun ? "[dry-run] " : ""}Baza: ${isRealService("db") ? "Supabase" : "plik demo (ustaw REAL_DB=true dla prawdziwej puli)"} · limit kosztów AI $${budgetUsd.toFixed(2)}`);

if (dryRun) {
  const plan = await planNightly({ repos, budgetUsd });
  console.log("\nKrok a) weryfikacja przeterminowanych (bez AI):");
  console.log(`  do sprawdzenia: ${plan.toVerify.total}, z adresem sklepu: ${plan.toVerify.resolvable}, bez adresu (pominięte): ${plan.toVerify.withoutAddress}`);
  console.log(`  dziś zostałoby sprawdzonych: ${plan.toVerify.wouldCheck} (limit 400/noc)`);
  for (const [domain, count] of plan.toVerify.domains) console.log(`    ${domain}: ${count}`);
  console.log(`\nKrok b) pokrycie puli: ${plan.coverage.belowThreshold} z ${plan.coverage.cells} komórek poniżej progu`);
  console.log(`\nKrok c) uzupełnianie: ${plan.cells.length} celowanych zapytań (web_search max 2, bez web_fetch):`);
  for (const cell of plan.cells) {
    console.log(`  - ${cell.query.category} · ${cell.query.price} · dla: ${cell.query.recipient}  [w puli ${cell.active_count}, popyt 7 dni: ${cell.demand}]`);
  }
  console.log(`  najgorszy koszt: $${plan.worstCaseCostUsd.toFixed(2)} z limitu $${plan.budgetUsd.toFixed(2)}`);
  console.log("\nNic nie zapisano, AI nie wywołano, żadna strona sklepu nie została pobrana.");
  process.exit(0);
}

let provider: CatalogAiProvider | null = null;
try {
  provider = createProvider();
} catch (error) {
  // Without a provider the verification step still runs; the report says the top-up was skipped.
  console.warn(`Uwaga: ${error instanceof Error ? error.message : "brak dostawcy AI"} Pomijam krok c).`);
}

const report = await runNightly({
  repos,
  provider,
  deps: { fetch: (url, init) => fetch(url, init) },
  trigger: process.env.GITHUB_EVENT_NAME === "schedule" ? "schedule" : "manual",
  budgetUsd,
  log: (message) => console.log(message),
});

console.log("\n=== Raport nocnego uzupełniania ===");
console.log(`Status:            ${report.status}`);
console.log(`Sprawdzone:        ${report.checked}`);
console.log(`  aktywne:         ${report.active}`);
console.log(`  broken:          ${report.broken}`);
console.log(`  out_of_stock:    ${report.out_of_stock}`);
console.log(`  zmiany cen >20%: ${report.price_changes}`);
console.log(`  nie do oceny:    ${report.unverifiable}`);
console.log(`Dodane do puli:    ${report.added}`);
console.log(`Komórki < progu:   ${report.cells_below_threshold}`);
console.log(`Koszt AI:          $${report.ai_cost_usd.toFixed(4)} (${report.ai_calls} zapytań, limit $${budgetUsd.toFixed(2)})`);
console.log(`Czas:              ${Math.round((report.duration_ms ?? 0) / 1000)} s`);
if (Object.keys(report.notes as object).length > 0) console.log(`Uwagi:             ${JSON.stringify(report.notes)}`);
console.log(`Raport zapisany w catalog_runs (${report.runId}).`);
