/**
 * Tests of the product pool rules (lib/catalog/pool.ts) and of the free-results query on the demo database.
 *
 *   npm run test:pool
 *
 * No network, no AI, no real database (a temporary demo database file).
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

process.env.DEMO_DB_PATH = path.join(mkdtempSync(path.join(tmpdir(), "pool-")), "db.json");
process.env.REAL_DB = "false";
process.env.MOCK_MODE = "true";

const { getRepos } = await import("../lib/services/db.ts");
const { computeCoverage, belowThreshold, priceBucket, poolCategory, POOL_MIN_PER_CELL, POOL_RECIPIENTS } = await import("../lib/catalog/pool.ts");

let failures = 0;
function check(condition: boolean, text: string): void {
  console.log(`  ${condition ? "OK  " : "FAIL"}  ${text}`);
  if (!condition) failures++;
}

console.log("Przedziały cen i kategorie");
check(priceBucket(50) === "do-50" && priceBucket(50.01) === "50-100", "50 zł to jeszcze 'do 50', 50,01 to '50–100'");
check(priceBucket(100) === "50-100" && priceBucket(200) === "100-200" && priceBucket(200.5) === "200+", "granice 100 i 200");
check(poolCategory("Kuchnia > Akcesoria") === "kuchnia" && poolCategory("Podróże") === "podroze" && poolCategory("Żywność") === "jedzenie", "kategorie z feedów składają się do 12 kategorii puli");
check(poolCategory("Motoryzacja") === null && poolCategory(null) === null, "kategoria spoza siatki nie wchodzi do pokrycia");

console.log("\nPokrycie puli");
const day = 86_400_000;
const now = Date.now();
const iso = (daysAgo: number) => new Date(now - daysAgo * day).toISOString();
const base = { category: "Kuchnia", price_pln: 80, recipients: [] as string[] };
const products = [
  { ...base, status: "active", last_checked_at: iso(1) },
  { ...base, status: "active", last_checked_at: iso(6.9) },
  { ...base, status: "active", last_checked_at: iso(8) }, // too old
  { ...base, status: "broken", last_checked_at: iso(1) },
  { ...base, status: "out_of_stock", last_checked_at: iso(1) },
  { ...base, status: "pending", last_checked_at: null },
  { ...base, status: "active", last_checked_at: iso(1), recipients: ["mom"] },
];
const cells = computeCoverage(products, now);
const cell = (recipient: string) => cells.find((c) => c.category === "kuchnia" && c.price_bucket === "50-100" && c.recipient === recipient)!;
check(cells.length === 12 * 4 * POOL_RECIPIENTS.length, `siatka ma ${cells.length} komórek (kategorie × 4 przedziały × odbiorcy)`);
check(cell("dad").active_count === 2, "liczą się tylko aktywne i sprawdzone w ostatnich 7 dniach (tata: 2)");
check(cell("mom").active_count === 3, "produkt tylko dla mamy liczy się wyłącznie dla mamy (mama: 3)");
check(belowThreshold(cells).length === cells.length, `przy progu ${POOL_MIN_PER_CELL} wszystkie komórki są poniżej progu`);

console.log("\nWyniki darmowe biorą tylko pulę");
const repos = getRepos();
await repos.products.upsertMany([
  { network: "awin", merchant: "Sklep", external_id: "p-fresh", name: "Świeży", price_pln: 60, category: "Kuchnia", tags: ["kawa"], affiliate_url: "https://sklep.pl/a", image_url: "https://sklep.pl/a.jpg", in_stock: true },
]);
const query = { minPrice: 0, maxPrice: 1000, limit: 100 };
const before = await repos.products.findCandidates(query);
check(!before.some((p) => p.external_id === "p-fresh"), "świeżo zaimportowany produkt jest 'pending' i nie trafia do wyników");
const saved = await repos.products.saveDirect([
  { merchant: "Sklep", external_id: "web-1", name: "Z sieci", description: null, price_pln: 70, category: "Kuchnia", tags: ["kawa"], image_url: null, affiliate_url: "https://sklep.pl/b", url: "https://sklep.pl/b", checked_at: new Date().toISOString() },
]);
check(saved[0]?.status === "active" && saved[0].source === "catalog_build", "produkt znaleziony w sieci wchodzi do puli jako aktywny (source catalog_build)");
check((await repos.products.findCandidates(query)).some((p) => p.external_id === "web-1"), "aktywny i świeży produkt trafia do wyników");
const counts = await repos.catalog.poolCounts();
check(counts.pending === 1 && counts.active >= 1, `liczniki puli: aktywne ${counts.active}, oczekujące ${counts.pending}`);

console.log(failures === 0 ? "\nWszystkie testy przeszły." : `\nNiepowodzenia: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
