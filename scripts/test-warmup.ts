/**
 * Tests of the pool warm-up (no network, no AI, temporary demo database):
 *
 *   npm run test:warmup
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const tempDir = mkdtempSync(path.join(tmpdir(), "warmup-test-"));
process.env.DEMO_DB_PATH = path.join(tempDir, "db.json");
process.env.REAL_DB = "false";
process.env.MOCK_MODE = "true";

const { getRepos } = await import("../lib/services/db.ts");
const warmup = await import("../lib/catalog/warmup.ts");
const { STARTER_COMBOS, comboKey } = await import("../lib/catalog/warmup-combos.ts");
const { isAllowedTag } = await import("../lib/tags.ts");
type Candidate = import("../lib/picks/candidates.ts").Candidate;

let failures = 0;
function check(condition: boolean, text: string): void {
  console.log(`  ${condition ? "OK  " : "FAIL"}  ${text}`);
  if (!condition) failures++;
}

const repos = getRepos();
const combo = { recipient: "mom", budget: 100, interest: "kawa" } as const;

console.log("\nLista kombinacji");
check(STARTER_COMBOS.length === 40, `40 kombinacji startowych (${STARTER_COMBOS.length})`);
check(new Set(STARTER_COMBOS.map(comboKey)).size === STARTER_COMBOS.length, "bez powtórzeń");
check(STARTER_COMBOS.every((item) => isAllowedTag(item.interest)), "każde zainteresowanie jest tagiem quizu");

console.log("\nPusta pula");
let empty: Awaited<ReturnType<typeof warmup.scoreCombo>> | null = null;
let threw = false;
try {
  empty = await warmup.scoreCombo(repos, combo);
} catch {
  threw = true;
}
check(!threw && empty !== null && !empty.healthy && empty.candidates === 0, "kombinacja z pustą pulą: bez błędu, trafia do niezdrowych");
check(warmup.toWarmRow(empty!).product_ids.length === 0 && !warmup.toWarmRow(empty!).healthy, "niezdrowa kombinacja nie dostaje gotowego wyniku");

console.log("\nWybór top 5 z różnych kategorii");
const fake = (id: string, category: string): Candidate =>
  ({ id, name: id, description: null, price_pln: 80, merchant: "S", category, tags: ["kawa"], image_url: null, affiliate_url: "", commission_rate: null, network: "webepartners", sharedTags: ["kawa"] }) as Candidate;
const picked = warmup.diversify([fake("a", "kawa-herbata"), fake("b", "kawa-herbata"), fake("c", "kawa-herbata"), fake("d", "kuchnia"), fake("e", "dom"), fake("f", "kuchnia")]);
check(picked.map((item) => item.id).join("") === "adebf", `najpierw różne kategorie, potem kolejne (${picked.map((item) => item.id).join("")})`);

console.log("\nZdrowa kombinacja i gotowy wynik");
const categories = ["kawa-herbata", "kuchnia", "dom"];
await repos.products.saveDirect(
  Array.from({ length: 18 }, (_, index) => ({
    merchant: `Sklep ${index % 4}`,
    external_id: `warm-${index}`,
    name: `Produkt kawowy ${index}`,
    description: null,
    price_pln: 45 + index * 3,
    category: categories[index % 3],
    tags: ["kawa"],
    image_url: null,
    affiliate_url: `https://sklep.example/p/${index}`,
    url: `https://sklep.example/p/${index}`,
    checked_at: new Date().toISOString(),
  })),
);
const healthy = await warmup.scoreCombo(repos, combo);
check(healthy.healthy && healthy.candidates === 18 && healthy.categories === 3 && healthy.top.length === 5, `18 kandydatów, top 5 z 3 kategorii -> zdrowa (${healthy.candidates}, ${healthy.categories} kat.)`);
check(healthy.top.every((item) => item.price_pln >= 40 && item.price_pln <= 100), "top 5 w przedziale 40-100% budżetu");
const tooExpensive = await warmup.scoreCombo(repos, { recipient: "mom", budget: 50, interest: "kawa" });
check(!tooExpensive.healthy, "ten sam towar przy budżecie 50 zł: za mało kandydatów, niezdrowa");

const refreshed = await warmup.refreshWarmResults(repos, [combo, { recipient: "dad", budget: 100, interest: "książki" }]);
check(refreshed.healthy === 1 && refreshed.total === 2, `odświeżenie: 1 z 2 zdrowa (${refreshed.healthy}/${refreshed.total})`);
const row = refreshed.rows.find((item) => item.healthy)!;
check(row.product_ids.length === 5 && Object.keys(row.reasons).length === 5, "gotowy wynik: 5 produktów z uzasadnieniem z szablonu");
check(Object.values(row.reasons).every((reason) => reason.includes("kawa") && reason.includes("100 zł")), `uzasadnienie bez AI: „${Object.values(row.reasons)[0]}”`);

console.log("\nDopasowanie quizu do gotowego wyniku");
check((await repos.catalog.findWarmResult("mom", 100, ["gotowanie", "kawa", "ogród"]))?.combo_key === comboKey(combo), "quiz mama, 100 zł, zainteresowania z kawą -> gotowy wynik");
check((await repos.catalog.findWarmResult("dad", 100, ["kawa", "sport", "gry"])) === null, "inny odbiorca -> brak (zwykła ścieżka)");
check((await repos.catalog.findWarmResult("mom", 200, ["kawa", "sport", "gry"])) === null, "inny budżet -> brak");
check((await repos.catalog.findWarmResult("dad", 100, ["książki", "sport", "gry"])) === null, "niezdrowa kombinacja nie jest podawana");
await repos.catalog.saveWarmResults([{ ...row, expires_at: new Date(Date.now() - 1000).toISOString() }]);
check((await repos.catalog.findWarmResult("mom", 100, ["kawa", "sport", "gry"])) === null, "po 24 h gotowy wynik wygasa");

console.log("\nZapytania z szablonu");
const queries = warmup.queriesFor({ recipient: "dad", budget: 100, interest: "kawa" });
check(queries.length === 3 && queries[0] === "prezent dla taty do 100 zł kawa", `3 zapytania bez AI (${queries.join(" | ")})`);
check((await repos.aiUsage.listSince(new Date(0).toISOString())).length === 0, "zero zapisów w ai_usage");

rmSync(tempDir, { recursive: true, force: true });
console.log(failures === 0 ? "\nWszystkie testy przeszły." : `\nNiepowodzenia: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
