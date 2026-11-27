/**
 * Nightly maintenance of the product pool (GitHub Actions .github/workflows/nightly-catalog.yml, or by hand).
 *
 *   npm run catalog:nightly                 a) verify stale products (no AI)  b) read pool_coverage
 *                                           c) AI top-up of up to 10 thin cells + tags  d) report to catalog_check_runs
 *   npm run catalog:nightly -- --dry-run    show what it would do: no AI, no writes (reads the database)
 *   npm run catalog:build                   only the AI top-up (steps b, c)
 *   npm run catalog:tag                     only tags for untagged products
 *
 * PowerShell swallows the "--": use $env:DRY_RUN = "1" (and $env:STEPS = "build" / "tag" / "verify") instead.
 *
 * Hard cost limit: NIGHTLY_AI_BUDGET_USD (default 0.30). Before each AI call the job checks that the estimated cost
 * still fits; once the limit is reached the top-up stops and the report says so. The verification never uses AI.
 * Env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY (not for --dry-run),
 * CATALOG_AI_PROVIDER (only "anthropic" is supported), ANTHROPIC_MODEL (default claude-haiku-5-5).
 * No key is ever printed.
 */
export {};
process.env.REAL_DB ??= "true";

const { getRepos } = await import("../lib/services/db.ts");
const { formatVerifyReport, previewVerify, runVerify } = await import("../lib/catalog-check/verify-run.ts");
const { createPolite } = await import("../lib/catalog-check/polite.ts");
const build = await import("../lib/catalog-build/build.ts");
type UsageEntry = import("../lib/search/core.ts").UsageEntry;

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run") || args.includes("--test") || process.env.DRY_RUN === "1";
const stepsArg = args.find((arg) => arg.startsWith("--steps="))?.split("=")[1] ?? args[args.indexOf("--steps") + 1];
const stepsRaw = (args.includes("--steps") || args.some((arg) => arg.startsWith("--steps=")) ? stepsArg : undefined) ?? process.env.STEPS ?? "verify,build,tag";
const steps = new Set(stepsRaw.split(",").map((step) => step.trim()));
const budgetUsd = Number(process.env.NIGHTLY_AI_BUDGET_USD ?? "0.30");
const provider = (process.env.CATALOG_AI_PROVIDER ?? "anthropic").toLowerCase();
const model = process.env.ANTHROPIC_MODEL || "claude-haiku-5-5";
const STALE_DAYS = 3;
const VERIFY_LIMIT = Number(process.env.VERIFY_LIMIT ?? "400");
const TAG_LIMIT = 40;
/**
 * The AI top-up waits until the pool has been checked: while products are still "pending" (never checked), the
 * coverage counts them as missing and the AI would fill cells that the existing products cover once checked.
 * BUILD_WHILE_PENDING=1 overrides this.
 */
const buildWhilePending = process.env.BUILD_WHILE_PENDING === "1";
async function pendingProducts(): Promise<number> {
  // Products never checked at all (a shop that blocks us leaves them pending but checked: those do not hold the AI back).
  return (await repos.catalog.listCheckable()).filter((product) => product.last_check_at === null).length;
}

if (!Number.isFinite(budgetUsd) || budgetUsd < 0) {
  console.error("NIGHTLY_AI_BUDGET_USD musi być liczbą >= 0.");
  process.exit(1);
}
if (provider !== "anthropic") {
  console.error(`CATALOG_AI_PROVIDER="${provider}" nie jest obsługiwany. Dostępny jest tylko "anthropic".`);
  process.exit(1);
}

const repos = getRepos();
const started = Date.now();
const usd = (value: number) => `$${value.toFixed(4)}`;

// ---------------------------------------------------------------------------
// Dry run: read only
// ---------------------------------------------------------------------------
if (dryRun) {
  console.log("NA PRÓBĘ: bez AI, bez zapisu i bez sprawdzania stron.\n");
  if (steps.has("verify")) {
    const { total, selected } = await previewVerify(repos, { staleAfterDays: STALE_DAYS, limit: VERIFY_LIMIT });
    console.log(`a) Weryfikacja: ${selected.length} z ${total} produktów (niesprawdzane > ${STALE_DAYS} dni, maks. ${VERIFY_LIMIT}, najstarsze pierwsze).`);
  }
  if (steps.has("build")) {
    const coverage = await repos.catalog.poolCoverage();
    const demand = await repos.catalog.demandSince(new Date(Date.now() - 7 * 86_400_000).toISOString());
    const thin = coverage.filter((row) => !row.healthy).length;
    const cells = build.chooseCells(coverage, demand);
    console.log(`b) Pokrycie puli: ${coverage.length - thin}/${coverage.length} komórek zdrowych (min. ${build.POOL_HEALTHY_MIN}), ${thin} poniżej progu.`);
    const pending = await pendingProducts();
    if (pending > 0 && !buildWhilePending) {
      console.log(`c) Uzupełnianie AI wstrzymane: ${pending} produktów czeka na pierwsze sprawdzenie (pokrycie byłoby zaniżone). Koszt AI: $0.`);
    } else {
      console.log(`c) Uzupełnianie: ${cells.length} komórek, limit ${usd(budgetUsd)}, szacunkowo ${usd(Math.min(cells.length * build.ESTIMATED_CELL_COST_USD, budgetUsd))}:`);
      for (const cell of cells) console.log(`   - ${cell.category} | ${cell.band} zł | ${cell.recipient} | aktywnych ${cell.active} | zapytań w 7 dni ${cell.demand}`);
    }
  }
  if (steps.has("tag")) {
    const untagged = await repos.catalog.listUntagged(TAG_LIMIT);
    console.log(`   Tagowanie: ${untagged.length} produktów bez tagów (maks. ${TAG_LIMIT}).`);
  }
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Real run
// ---------------------------------------------------------------------------
const startedBy = process.env.GITHUB_ACTIONS === "true" && process.env.GITHUB_EVENT_NAME === "schedule" ? "cron" : "manual";
const nightly = await repos.catalog.createRun(startedBy, "nightly");
const usageEntries: UsageEntry[] = [];
const spent = () => build.costUsd(usageEntries);
const details: Record<string, unknown> = { steps: [...steps], budgetUsd, model };
let added = 0;
let budgetExceeded = false;
let verifySummary: Awaited<ReturnType<typeof runVerify>> | null = null;

try {
  // a) verification of stale products, no AI
  if (steps.has("verify")) {
    console.log(`a) Weryfikacja niesprawdzanych > ${STALE_DAYS} dni (maks. ${VERIFY_LIMIT})...`);
    verifySummary = await runVerify(repos, { staleAfterDays: STALE_DAYS, limit: VERIFY_LIMIT, maxRunMs: 18 * 60_000, startedBy });
    console.log(formatVerifyReport(verifySummary));
    details.verifyRunId = verifySummary.run.id;
  }

  const needsAi = steps.has("build") || steps.has("tag");
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (needsAi && !apiKey) throw new Error("Brak ANTHROPIC_API_KEY (krok uzupełniania wymaga AI).");
  const Anthropic = needsAi ? (await import("@anthropic-ai/sdk")).default : null;
  const client = Anthropic && apiKey ? new Anthropic({ apiKey, maxRetries: 1 }) : null;

  // b) + c) top-up of thin cells
  if (steps.has("build") && client) {
    const coverage = await repos.catalog.poolCoverage();
    const demand = await repos.catalog.demandSince(new Date(Date.now() - 7 * 86_400_000).toISOString());
    const pending = await pendingProducts();
    const cells = pending > 0 && !buildWhilePending ? [] : build.chooseCells(coverage, demand);
    if (pending > 0 && !buildWhilePending) {
      details.buildSkipped = { reason: "pool_not_checked", pending };
      console.log(`\nb) Uzupełnianie AI wstrzymane: ${pending} produktów czeka na pierwsze sprawdzenie (ruszy, gdy pula będzie sprawdzona).`);
    }
    const shopDomains = (await repos.allowedShops.listActive()).map((shop) => shop.domain);
    console.log(`\nb) Komórki poniżej progu: ${coverage.filter((row) => !row.healthy).length}/${coverage.length}; uzupełniam ${cells.length}.`);
    const polite = createPolite({ intervalMs: 1_000, now: Date.now, sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)) });
    const cellReports: Record<string, unknown>[] = [];
    for (const cell of cells) {
      if (spent() + build.ESTIMATED_CELL_COST_USD > budgetUsd) {
        budgetExceeded = true;
        console.log(`   Limit ${usd(budgetUsd)} osiągnięty (wydano ${usd(spent())}): przerywam uzupełnianie.`);
        break;
      }
      const label = `${cell.category} | ${cell.band} zł | ${cell.recipient}`;
      try {
        const found = await build.findProductsForCell(client, model, cell, shopDomains);
        usageEntries.push(found.usage);
        const verified = await build.verifyCandidates(cell, found.products, { fetch: (url, init) => fetch(url, init), polite, shopDomains, now: Date.now });
        const saved = await repos.catalog.saveBuilt(verified.products);
        added += saved;
        console.log(`   ${label}: AI ${found.products.length}, zweryfikowane ${verified.products.length}, zapisane ${saved}, koszt ${usd(build.costUsd([found.usage]))}`);
        cellReports.push({ ...cell, proposed: found.products.length, added: saved, rejected: verified.verdicts.filter((v) => !v.ok).map((v) => v.reason) });
      } catch (error) {
        console.log(`   ${label}: błąd (${error instanceof Error ? error.name : "unknown"})`);
        cellReports.push({ ...cell, error: error instanceof Error ? error.name : "unknown" });
      }
    }
    details.cells = cellReports;
  }

  // tags for untagged products
  if (steps.has("tag") && client) {
    const untagged = await repos.catalog.listUntagged(TAG_LIMIT);
    if (untagged.length > 0 && spent() + 0.01 <= budgetUsd) {
      const tagged = await build.tagProducts(client, model, untagged);
      usageEntries.push(tagged.usage);
      for (const patch of tagged.patches) await repos.catalog.updateTags(patch.id, patch);
      details.tagged = tagged.patches.length;
      console.log(`\nTagowanie: ${tagged.patches.length}/${untagged.length} produktów, koszt ${usd(build.costUsd([tagged.usage]))}`);
    } else if (untagged.length > 0) {
      budgetExceeded = true;
      details.tagged = 0;
    } else {
      details.tagged = 0;
    }
  }

  // d) report
  await repos.aiUsage.createMany(
    usageEntries
      .filter((entry) => entry.inputTokens > 0 || entry.outputTokens > 0)
      .map((entry) => ({
        result_id: null,
        step: entry.step,
        model: entry.model,
        input_tokens: entry.inputTokens,
        output_tokens: entry.outputTokens,
        web_searches: entry.webSearches ?? 0,
        web_fetches: entry.webFetches ?? 0,
      })),
  );
  details.budgetExceeded = budgetExceeded;
  details.pool = await repos.catalog.poolStatusCounts();
  const verifyRun = verifySummary?.run;
  await repos.catalog.updateRun(nightly.id, {
    status: "completed",
    finished_at: new Date().toISOString(),
    total: verifyRun?.total ?? 0,
    processed: verifyRun?.processed ?? 0,
    ok: verifyRun?.ok ?? 0,
    price_changes: verifyRun?.price_changes ?? 0,
    became_unavailable: verifyRun?.became_unavailable ?? 0,
    skipped_robots: verifyRun?.skipped_robots ?? 0,
    unverified: verifyRun?.unverified ?? 0,
    errors: verifyRun?.errors ?? 0,
    failures: verifyRun?.failures ?? {},
    added,
    ai_cost_usd: Number(spent().toFixed(4)),
    details,
  });

  console.log("\n=== Raport nocny ===");
  console.log(`Sprawdzone: ${verifyRun?.processed ?? 0} · zmiany cen: ${verifyRun?.price_changes ?? 0} · nowo niedostępne: ${verifyRun?.became_unavailable ?? 0}`);
  console.log(`Pula: ${JSON.stringify(details.pool)}`);
  console.log(`Dodane: ${added} · otagowane: ${details.tagged ?? 0} · koszt AI: ${usd(spent())} / ${usd(budgetUsd)}${budgetExceeded ? " (LIMIT OSIĄGNIĘTY)" : ""}`);
  console.log(`Czas: ${Math.round((Date.now() - started) / 1000)} s · raport: catalog_check_runs ${nightly.id}`);
} catch (error) {
  const message = error instanceof Error ? error.message.slice(0, 200) : "unknown";
  console.error(`Błąd nocnego przebiegu: ${message}`);
  await repos.catalog
    .updateRun(nightly.id, { status: "failed", finished_at: new Date().toISOString(), added, ai_cost_usd: Number(spent().toFixed(4)), details: { ...details, error: message } })
    .catch(() => undefined);
  process.exit(1);
}
