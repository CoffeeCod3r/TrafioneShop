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
if (dryRun) {
  const unhealthy = before.filter((row) => !row.healthy);
  console.log(`\nNA PRÓBĘ: prawdziwy przebieg uzupełniłby ${unhealthy.length} niezdrowych kombinacji (maks. 2 rundy, limit $${process.env.WARMUP_AI_BUDGET_USD ?? "2.00"}) i zapisał gotowe wyniki dla zdrowych.`);
  process.exit(0);
}

console.error("Prawdziwy przebieg dochodzi w kolejnym etapie. Użyj --check albo --dry-run.");
process.exit(1);
