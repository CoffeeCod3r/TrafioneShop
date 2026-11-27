/**
 * Warm-up of the product pool for the most common quiz combinations (lib/catalog/warmup-combos.ts).
 *
 *   npm run catalog:warmup -- --check     table of the combinations: candidates, diversity, healthy or not (read only)
 *   npm run catalog:warmup -- --dry-run   the check plus what a real run would do (read only, no AI)
 *   npm run catalog:warmup                fill the gaps (AI, limit WARMUP_AI_BUDGET_USD), save the ready results
 *
 * PowerShell swallows the "--": use $env:WARMUP_MODE = "check" (or "dry-run") instead.
 * Needs NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY; the real run also ANTHROPIC_API_KEY. No key is printed.
 */
export {};
process.env.REAL_DB ??= "true";

const { getRepos } = await import("../lib/services/db.ts");
const { STARTER_COMBOS, comboLabel } = await import("../lib/catalog/warmup-combos.ts");
const warmup = await import("../lib/catalog/warmup.ts");
const build = await import("../lib/catalog-build/build.ts");
const { createPolite } = await import("../lib/catalog-check/polite.ts");
const { ruleFor } = await import("../lib/catalog-check/domains.ts");
const { formatVerifyReport, runVerify } = await import("../lib/catalog-check/verify-run.ts");
type UsageEntry = import("../lib/search/core.ts").UsageEntry;

const args = process.argv.slice(2);
const envMode = process.env.WARMUP_MODE ?? "";
const checkOnly = args.includes("--check") || envMode === "check";
const dryRun = args.includes("--dry-run") || envMode === "dry-run";

const repos = getRepos();
const { combos, source } = await warmup.warmupCombos(repos, STARTER_COMBOS);

type Health = Awaited<ReturnType<typeof warmup.scoreCombo>>;

async function checkAll(): Promise<Health[]> {
  const results: Health[] = [];
  for (const combo of combos) results.push(await warmup.scoreCombo(repos, combo));
  return results;
}

function printTable(rows: Health[], title: string): void {
  const healthy = rows.filter((row) => row.healthy).length;
  console.log(`\n${title}: ${healthy}/${rows.length} zdrowych (min. ${warmup.HEALTHY_MIN_CANDIDATES} kandydatów, top 5 z min. ${warmup.HEALTHY_MIN_CATEGORIES} kategorii)`);
  console.log("kombinacja                                   | kandydaci | różnorodność (kat./sklepy) | status");
  console.log("---------------------------------------------|-----------|----------------------------|---------");
  for (const row of rows) {
    const label = comboLabel(row.combo).padEnd(44).slice(0, 44);
    const diversity = `${row.categories} kat. / ${row.shops} skl.`.padEnd(26);
    console.log(`${label} | ${String(row.candidates).padStart(9)} | ${diversity} | ${row.healthy ? "zdrowa" : "NIEZDROWA"}`);
  }
}

console.log(`Kombinacje: ${combos.length} (${source === "results" ? "najczęstsze z wyników z 30 dni" : "lista startowa"})`);
const before = await checkAll();
printTable(before, "Pokrycie");

if (checkOnly) process.exit(0);
const budgetUsd = Number(process.env.WARMUP_AI_BUDGET_USD ?? "2.00");
const unhealthyBefore = before.filter((row) => !row.healthy);
if (dryRun) {
  const toVerify = await warmup.productsToVerify(repos, unhealthyBefore.map((row) => row.combo));
  console.log(`\nNA PRÓBĘ (bez AI i bez zapisu). Prawdziwy przebieg:`);
  console.log(`a) sprawdzi strony ${toVerify.length} produktów, które mogą wypełnić niezdrowe kombinacje (Ceneo maks. 60, bez AI),`);
  console.log(`b) uzupełni ${unhealthyBefore.length} niezdrowych kombinacji przez AI (maks. 2 rundy, ok. $${build.ESTIMATED_CELL_COST_USD} za rundę, limit $${budgetUsd.toFixed(2)}),`);
  console.log("c) otaguje nowe produkty, d) zapisze gotowe top 5 dla zdrowych kombinacji (24 h).");
  console.log("Zapytania z szablonu, np.:");
  for (const row of unhealthyBefore.slice(0, 3)) console.log(`   ${comboLabel(row.combo)}: ${warmup.queriesFor(row.combo).join(" | ")}`);
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Real run
// ---------------------------------------------------------------------------
if (!Number.isFinite(budgetUsd) || budgetUsd < 0) {
  console.error("WARMUP_AI_BUDGET_USD musi być liczbą >= 0.");
  process.exit(1);
}
const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
  console.error("Brak ANTHROPIC_API_KEY.");
  process.exit(1);
}
const model = process.env.ANTHROPIC_MODEL || "claude-haiku-5-5";
const run = await repos.catalog.createRun("manual", "warmup");
const started = Date.now();
const usage: UsageEntry[] = [];
const spent = () => build.costUsd(usage);
let added = 0;
let budgetExceeded = false;

try {
  // a) pages of products that could fill the unhealthy combinations (no AI)
  const toVerify = await warmup.productsToVerify(repos, unhealthyBefore.map((row) => row.combo));
  if (toVerify.length > 0) {
    console.log(`\na) Sprawdzam strony ${toVerify.length} produktów (bez AI, Ceneo maks. 60)...`);
    const verify = await runVerify(repos, { onlyIds: toVerify, maxRunMs: 20 * 60_000, startedBy: "manual" });
    console.log(formatVerifyReport(verify));
  }
  let current = await checkAll();
  printTable(current, "Po sprawdzeniu stron");

  // b) AI top-up of what is still unhealthy, at most 2 rounds per combination
  const Anthropic = (await import("@anthropic-ai/sdk")).default;
  const client = new Anthropic({ apiKey, maxRetries: 1 });
  const shopDomains = (await repos.allowedShops.listActive()).map((shop) => shop.domain);
  const polite = createPolite({ intervalMs: 1_000, intervalFor: (host) => ruleFor(host).intervalMs, now: Date.now, sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)) });
  console.log(`\nb) Uzupełnianie przez AI (limit $${budgetUsd.toFixed(2)})`);
  for (const [index, health] of current.entries()) {
    if (health.healthy) continue;
    let latest = health;
    for (let round = 1; round <= 2 && !latest.healthy; round++) {
      if (spent() + build.ESTIMATED_CELL_COST_USD > budgetUsd) {
        budgetExceeded = true;
        break;
      }
      const cell = warmup.comboCell(latest.combo, latest);
      try {
        const found = await build.findProductsForCell(client, model, cell, shopDomains);
        usage.push(found.usage);
        const verified = await build.verifyCandidates(cell, found.products, { fetch: (url, init) => fetch(url, init), polite, shopDomains, now: Date.now });
        const saved = await repos.catalog.saveBuilt(verified.products);
        added += saved;
        latest = await warmup.scoreCombo(repos, latest.combo);
        console.log(`   ${comboLabel(latest.combo)} · runda ${round}: AI ${found.products.length}, zapisane ${saved}, kandydaci ${latest.candidates}, ${latest.categories} kat. -> ${latest.healthy ? "zdrowa" : "nadal niezdrowa"}`);
      } catch (error) {
        console.log(`   ${comboLabel(latest.combo)} · runda ${round}: błąd (${error instanceof Error ? error.name : "unknown"})`);
        break;
      }
    }
    current[index] = latest;
    if (budgetExceeded) {
      console.log(`   Limit $${budgetUsd.toFixed(2)} osiągnięty (wydano $${spent().toFixed(4)}): zatrzymuję uzupełnianie.`);
      break;
    }
  }

  // c) tags for products without tags
  const untagged = await repos.catalog.listUntagged(40);
  let tagged = 0;
  if (untagged.length > 0 && spent() + 0.01 <= budgetUsd) {
    const result = await build.tagProducts(client, model, untagged);
    usage.push(result.usage);
    for (const patch of result.patches) await repos.catalog.updateTags(patch.id, patch);
    tagged = result.patches.length;
  }

  // final check after everything; scores of other combinations may have changed too
  current = await checkAll();
  printTable(current, "Po rozgrzaniu");
  const stillUnhealthy = current.filter((row) => !row.healthy).map((row) => comboLabel(row.combo));

  // d) ready results for the healthy combinations
  const saved = await saveWarmResults(current);

  await repos.aiUsage.createMany(
    usage
      .filter((entry) => entry.inputTokens > 0 || entry.outputTokens > 0)
      .map((entry) => ({ result_id: null, step: entry.step, model: entry.model, input_tokens: entry.inputTokens, output_tokens: entry.outputTokens, web_searches: entry.webSearches ?? 0, web_fetches: entry.webFetches ?? 0 })),
  );
  const healthyAfter = current.filter((row) => row.healthy).length;
  await repos.catalog.updateRun(run.id, {
    status: "completed",
    finished_at: new Date().toISOString(),
    total: combos.length,
    processed: combos.length,
    ok: healthyAfter,
    added,
    ai_cost_usd: Number(spent().toFixed(4)),
    details: { healthyBefore: before.filter((row) => row.healthy).length, healthyAfter, combos: combos.length, unhealthy: stillUnhealthy, tagged, warmResults: saved, budgetExceeded, budgetUsd },
  });
  console.log("\n=== Raport rozgrzania ===");
  console.log(`Zdrowe kombinacje: ${before.filter((row) => row.healthy).length} -> ${healthyAfter} z ${combos.length}`);
  console.log(`Dodane produkty: ${added} · otagowane: ${tagged} · gotowe wyniki: ${saved}`);
  console.log(`Koszt AI: $${spent().toFixed(4)} / $${budgetUsd.toFixed(2)}${budgetExceeded ? " (LIMIT OSIĄGNIĘTY)" : ""} · czas ${Math.round((Date.now() - started) / 1000)} s`);
  if (stillUnhealthy.length > 0) console.log(`Nadal niezdrowe (${stillUnhealthy.length}): ${stillUnhealthy.join("; ")}`);
} catch (error) {
  const message = error instanceof Error ? error.message.slice(0, 200) : "unknown";
  console.error(`Błąd rozgrzania: ${message}`);
  await repos.catalog.updateRun(run.id, { status: "failed", finished_at: new Date().toISOString(), added, ai_cost_usd: Number(spent().toFixed(4)), details: { error: message } }).catch(() => undefined);
  process.exit(1);
}

/** Ready top 5 per combination (healthy ones), valid 24 h; the nightly job refreshes them. */
async function saveWarmResults(rows: Health[]): Promise<number> {
  const warmRows = rows.map((row) => warmup.toWarmRow(row));
  await repos.catalog.saveWarmResults(warmRows);
  return warmRows.filter((row) => row.healthy).length;
}
