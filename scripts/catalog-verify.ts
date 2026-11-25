/**
 * Verifies links, prices and availability of the product pool. NO AI, nothing is sent to the affiliate networks.
 *
 *   npm run catalog:verify                          every product, the longest-unattempted first
 *   npm run catalog:verify -- --limit 50            at most 50 products
 *   npm run catalog:verify -- --only-stale          only products last attempted more than 3 days ago (or failing)
 *
 * PowerShell swallows the "--": use LIMIT=50 and ONLY_STALE=1 environment variables there.
 * Writes to the database chosen by the mode (REAL_DB=true or MOCK_MODE=false: Supabase, otherwise the demo file).
 * Rules and limits: lib/catalog/verify.ts.
 */
import { parseArgs } from "node:util";

import { createVerifyStore } from "../lib/catalog/store.ts";
import { runVerify } from "../lib/catalog/verify.ts";
import { isRealService } from "../lib/mode.ts";
import { getRepos } from "../lib/services/db.ts";

const { values } = parseArgs({
  options: { limit: { type: "string" }, "only-stale": { type: "boolean", default: false } },
  strict: false,
});
const limitText = typeof values.limit === "string" ? values.limit : process.env.LIMIT;
const limit = limitText ? Number.parseInt(limitText, 10) : undefined;
if (limit !== undefined && (!Number.isInteger(limit) || limit < 1)) {
  console.error("--limit musi być dodatnią liczbą całkowitą.");
  process.exit(1);
}
const onlyStale = values["only-stale"] === true || process.env.ONLY_STALE === "1";

console.log(`Baza: ${isRealService("db") ? "Supabase" : "plik demo (ustaw REAL_DB=true, żeby sprawdzać prawdziwą pulę)"}`);
const started = Date.now();
const summary = await runVerify(createVerifyStore(getRepos()), {
  deps: { fetch: (url, init) => fetch(url, init) },
  limit,
  onlyStale,
  log: (message) => console.log(`  ${message}`),
});

console.log(
  `\nSprawdzono ${summary.checked} · aktywne ${summary.active} · nowo broken ${summary.broken} · nowo out_of_stock ${summary.out_of_stock} · ` +
    `pierwsza porażka ${summary.failed_once} · zmiany cen >20% ${summary.price_changes} · nie do oceny ${summary.unverifiable} · czas ${Math.round((Date.now() - started) / 1000)} s`,
);
if (Object.keys(summary.failures).length > 0) console.log("Porażki według sklepu:", JSON.stringify(summary.failures));
