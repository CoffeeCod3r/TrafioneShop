/**
 * Checks product links and prices in code, without AI (lib/catalog-check). Writes to the database in .env.local.
 *
 *   npm run catalog:verify                          every product that is not broken, in id order
 *   npm run catalog:verify -- --only-stale          only products not checked for 3 days, oldest first
 *   npm run catalog:verify -- --limit 50 --dry-run  show what would be checked, fetch and write nothing
 *
 * PowerShell swallows the "--", so there use environment variables (they work everywhere):
 *   $env:LIMIT = "50"; $env:ONLY_STALE = "1"; $env:DRY_RUN = "1"; npm run catalog:verify
 *
 * With MOCK_MODE=true it still uses the REAL database (REAL_DB is forced), so it needs the Supabase keys.
 */
export {};
process.env.REAL_DB ??= "true";

const { getRepos } = await import("../lib/services/db.ts");
const { formatVerifyReport, previewVerify, runVerify } = await import("../lib/catalog-check/verify-run.ts");

const args = process.argv.slice(2);
const flagValue = (name: string) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : args.find((arg) => arg.startsWith(`${name}=`))?.split("=")[1];
};
const limitRaw = flagValue("--limit") ?? process.env.LIMIT;
const limit = limitRaw ? Number(limitRaw) : undefined;
if (limit !== undefined && (!Number.isInteger(limit) || limit < 1)) {
  console.error("--limit musi być dodatnią liczbą całkowitą.");
  process.exit(1);
}
const onlyStale = args.includes("--only-stale") || process.env.ONLY_STALE === "1";
const dryRun = args.includes("--dry-run") || args.includes("--test") || process.env.DRY_RUN === "1";
const options = { limit, staleAfterDays: onlyStale ? 3 : undefined };

const repos = getRepos();
if (dryRun) {
  const { total, selected } = await previewVerify(repos, options);
  console.log(`Na próbę (bez zapytań i bez zapisu): ${selected.length} z ${total} produktów do sprawdzenia.`);
  for (const product of selected.slice(0, 10)) {
    console.log(`- ${product.name.slice(0, 60)} | ${product.status} | ostatnio: ${product.last_check_at ?? "nigdy"}`);
  }
  process.exit(0);
}

console.log(`Sprawdzanie: ${onlyStale ? "tylko nieaktualne (> 3 dni)" : "wszystkie"}${limit ? `, maks. ${limit}` : ""}`);
const report = await runVerify(repos, { ...options, startedBy: "manual" });
console.log(formatVerifyReport(report));
