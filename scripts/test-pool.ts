/**
 * Tests of the product pool (no network outside this machine, no AI, no real database):
 *
 *   npm run test:pool
 *
 *  - the JSON-LD / meta parser on 5 saved pages (scripts/fixtures/catalog): an Empik-type page (@graph, Offer), an
 *    Allegro-type page (AggregateOffer, "1 299,00"), a shop without JSON-LD (meta tags), a 404 page and a redirect
 *    to the home page (both served by a local server and classified like in production);
 *  - pool coverage and the choice of thin cells for the nightly top-up;
 *  - verification of AI proposals by our own code (allowed shop, page opened, price inside the band);
 *  - `catalog:nightly --dry-run`: no AI key needed, nothing written.
 */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";

const tempDir = mkdtempSync(path.join(tmpdir(), "pool-test-"));
process.env.DEMO_DB_PATH = path.join(tempDir, "db.json");
process.env.REAL_DB = "false";
process.env.MOCK_MODE = "true";

const { extractPageInfo } = await import("../lib/catalog-check/extract.ts");
const { checkUrl } = await import("../lib/catalog-check/check.ts");
const { runCatalogCheck, BLOCKS_BEFORE_BACKING_OFF } = await import("../lib/catalog-check/runner.ts");
type CheckProduct = import("../lib/catalog-check/runner.ts").CheckProduct;
const { createPolite } = await import("../lib/catalog-check/polite.ts");
const { computeCoverage, bandOfBudget, POOL_HEALTHY_MIN } = await import("../lib/catalog-build/coverage.ts");
const { chooseCells, verifyCandidates } = await import("../lib/catalog-build/build.ts");
const { getRepos } = await import("../lib/services/db.ts");

let failures = 0;
function check(condition: boolean, text: string): void {
  console.log(`  ${condition ? "OK  " : "FAIL"}  ${text}`);
  if (!condition) failures++;
}
const fixture = (name: string) => readFileSync(path.join("scripts", "fixtures", "catalog", name), "utf8");

console.log("\nParser JSON-LD / meta na zapisanych stronach");
const empik = extractPageInfo(fixture("empik.html"));
check(empik.price === 79.99 && empik.currency === "PLN" && empik.availability === "in_stock" && empik.source === "jsonld", `Empik (@graph, Offer): 79,99 zł, dostępny (${JSON.stringify(empik)})`);
const allegro = extractPageInfo(fixture("allegro.html"));
check(allegro.price === 1299 && allegro.availability === "in_stock", `Allegro (AggregateOffer, „1 299,00”, jedna oferta wyprzedana): 1299 zł, dostępny (${JSON.stringify(allegro)})`);
const meta = extractPageInfo(fixture("no-jsonld.html"));
check(meta.price === 39.9 && meta.source === "meta" && meta.availability === "in_stock", `sklep bez JSON-LD: cena z meta 39,90 zł (${JSON.stringify(meta)})`);
check(extractPageInfo(fixture("not-found.html")).source === "none", "strona 404: brak danych produktu");
check(extractPageInfo(fixture("home.html")).price === null, "strona główna: JSON-LD bez produktu nie daje ceny");

// ---------------------------------------------------------------------------
// Local shop
// ---------------------------------------------------------------------------
let captchaHits = 0;
const server = createServer((request, response) => {
  const url = request.url ?? "/";
  const html = (body: string, status = 200) => {
    response.writeHead(status, { "content-type": "text/html; charset=utf-8" });
    response.end(body);
  };
  if (url === "/robots.txt") {
    response.writeHead(200, { "content-type": "text/plain" });
    return response.end("User-agent: *\nDisallow: /koszyk\n");
  }
  if (url === "/empik/kubek") return html(fixture("empik.html"));
  if (url === "/allegro/gra") return html(fixture("allegro.html"));
  if (url === "/maly-sklep/swieca") return html(fixture("no-jsonld.html"));
  if (url === "/stary-produkt") {
    response.writeHead(302, { location: "/" });
    return response.end();
  }
  if (url === "/") return html(fixture("home.html"));
  if (url === "/koszyk/produkt") return html(fixture("empik.html"));
  if (url.startsWith("/zablokowany-sklep/")) {
    captchaHits++;
    response.writeHead(302, { location: `/Captcha/Add?ReturnUrl=${encodeURIComponent(url)}` });
    return response.end();
  }
  if (url.startsWith("/Captcha/Add")) return html("<html><body>Potwierdź, że nie jesteś robotem</body></html>");
  html(fixture("not-found.html"), 404);
});
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
const deps = { fetch: (url: string, init: RequestInit) => fetch(url, init), timeoutMs: 2_000, isAllowedHost: () => true };

console.log("\nKlasyfikacja stron (jak w produkcji)");
const notFound = await checkUrl(`${base}/nie-ma-takiego`, deps);
check(notFound.kind === "gone" && notFound.reason === "http_404", `404 -> gone/http_404 (${JSON.stringify(notFound)})`);
const home = await checkUrl(`${base}/stary-produkt`, deps);
check(home.kind === "gone" && home.reason === "redirect_to_listing", `przekierowanie na stronę główną -> gone/redirect_to_listing (${JSON.stringify(home)})`);
const ok = await checkUrl(`${base}/empik/kubek`, deps);
check(ok.kind === "ok" && ok.price === 79.99, "działająca strona -> ok, 79,99 zł");

// ---------------------------------------------------------------------------
// Coverage and cell choice
// ---------------------------------------------------------------------------
console.log("\nPokrycie puli i wybór komórek");
const now = Date.now();
const fresh = new Date(now - 86_400_000).toISOString();
const old = new Date(now - 10 * 86_400_000).toISOString();
const products = [
  ...Array.from({ length: 8 }, () => ({ network: "ceneo", category: "kawa-herbata", price_pln: 80, recipients: [] as string[], status: "active", last_check_at: fresh })),
  { network: "ceneo", category: "gry", price_pln: 40, recipients: ["dad"], status: "active", last_check_at: fresh },
  { network: "ceneo", category: "gry", price_pln: 40, recipients: [], status: "active", last_check_at: old },
  { network: "ceneo", category: "gry", price_pln: 40, recipients: [], status: "pending", last_check_at: null },
  { network: "demo", category: "demo-only", price_pln: 40, recipients: [], status: "broken", last_check_at: null },
];
const coverage = computeCoverage(products, now);
const cell = (category: string, band: string, recipient: string) => coverage.find((row) => row.category === category && row.band === band && row.recipient === recipient);
check(coverage.length === 2 * 4 * 7, `komórki: 2 kategorie x 4 przedziały x 7 odbiorców = ${coverage.length}`);
check(cell("kawa-herbata", "50-100", "mom")?.healthy === true && cell("kawa-herbata", "50-100", "mom")?.active === POOL_HEALTHY_MIN, "8 aktywnych bez odbiorców: zdrowa komórka dla każdego odbiorcy");
check(cell("gry", "do 50", "dad")?.active === 1 && cell("gry", "do 50", "mom")?.active === 0, "produkt tylko dla taty liczy się tylko u taty; stare i niesprawdzone się nie liczą");
check(!coverage.some((row) => row.category === "demo-only"), "produkty demo nie tworzą kategorii");
check(bandOfBudget(50) === "do 50" && bandOfBudget(100) === "50-100" && bandOfBudget(200) === "100-200" && bandOfBudget(500) === "200+", "budżet quizu -> przedział cen");
const demand = [
  ...Array.from({ length: 5 }, () => ({ recipient: "mom", budget_pln: 100 })),
  { recipient: "dad", budget_pln: 50 },
];
const cells = chooseCells(coverage, demand);
check(cells.length === 10, `maks. 10 komórek na noc (${cells.length})`);
check(cells[0].recipient === "mom" && cells[0].band === "50-100" && cells[0].category === "gry", `najpierw komórki, o które pytano najczęściej (${cells[0].category} | ${cells[0].band} | ${cells[0].recipient})`);
check(cells.every((item) => !(item.category === "kawa-herbata" && item.band === "50-100")), "zdrowe komórki nie są uzupełniane");

// ---------------------------------------------------------------------------
// Verification of AI proposals by our code
// ---------------------------------------------------------------------------
console.log("\nWeryfikacja propozycji AI naszym kodem");
const polite = createPolite({ intervalMs: 50, now: Date.now, sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)) });
const proposal = (name: string, route: string) => ({ name, url: `${base}${route}`, tags: ["kawa", "nie-ma-takiego-tagu"], recipients: ["mom", "zly-kod"], gift_types: ["thing"], lifestyles: [] });
const verified = await verifyCandidates(
  { category: "dom", band: "50-100", recipient: "mom", active: 0, demand: 0 },
  [
    proposal("Kubek", "/empik/kubek"),
    proposal("Za droga gra", "/allegro/gra"),
    proposal("Świeca", "/maly-sklep/swieca"),
    proposal("Nie istnieje", "/brak"),
    proposal("Zablokowany robots", "/koszyk/produkt"),
    { ...proposal("Obcy sklep", "/empik/kubek"), url: "https://obcy-sklep.example/p/1" },
  ],
  { fetch: deps.fetch, polite, shopDomains: ["127.0.0.1"], now: Date.now, allowInsecure: true },
);
const reasons = Object.fromEntries(verified.verdicts.map((verdict) => [verdict.url.replace(base, ""), verdict.reason]));
check(verified.products.length === 1 && verified.products[0].name === "Kubek" && verified.products[0].price_pln === 79.99, `zapisany tylko kubek 79,99 zł w przedziale 50-100 (${verified.products.map((p) => p.name).join(", ")})`);
check(reasons["/allegro/gra"]?.startsWith("price_outside_band"), "gra za 1299 zł: poza przedziałem, odrzucona");
check(reasons["/maly-sklep/swieca"]?.startsWith("price_outside_band"), "świeca za 39,90 zł: poza przedziałem 50-100, odrzucona");
check(reasons["/brak"] === "gone:http_404", "nieistniejąca strona: odrzucona");
check(reasons["/koszyk/produkt"] === "robots", "strona zablokowana w robots.txt: nieotwierana");
check(reasons["https://obcy-sklep.example/p/1"] === "shop_not_allowed", "sklep spoza allowed_shops: odrzucony bez otwierania");
check(verified.products[0]?.tags.join() === "kawa" && verified.products[0]?.recipients.join() === "mom", "tagi i odbiorcy spoza list są odrzucane");

// ---------------------------------------------------------------------------
// A shop that starts showing a CAPTCHA (like Ceneo after many requests)
// ---------------------------------------------------------------------------
console.log("\nSklep pokazuje CAPTCHA: blokada i wycofanie");
const challenge = await checkUrl(`${base}/zablokowany-sklep/1`, deps);
check(challenge.kind === "error" && challenge.reason === "blocked", `przekierowanie na /Captcha/Add -> blokada, nie „brak danych” (${JSON.stringify(challenge)})`);
captchaHits = 0;
const blockedShop = `http://localhost:${(server.address() as AddressInfo).port}`;
const memory = new Map<string, { last_check_result?: string; last_check_at?: string }>();
const blockedProducts: CheckProduct[] = Array.from({ length: 8 }, (_, index) => ({
  id: `z${index}`,
  name: `Produkt ${index}`,
  url: `${blockedShop}/zablokowany-sklep/${index}`,
  affiliate_url: `${blockedShop}/zablokowany-sklep/${index}`,
  price_pln: 50,
  network: "ceneo",
  failed_checks: 0,
  status: "pending",
  last_check_at: null,
}));
const runState = { id: "run", started_at: new Date().toISOString(), total: 0, processed: 0, cursor: null, ok: 0, price_changes: 0, became_unavailable: 0, skipped_robots: 0, unverified: 0, errors: 0, failures: {} as Record<string, Record<string, number>> };
await runCatalogCheck(
  {
    listProducts: async () => blockedProducts,
    listShopDomains: async () => [],
    applyCheck: async (id, patch) => void memory.set(id, patch),
    getRun: async () => runState,
    updateRun: async (_id, patch) => void Object.assign(runState, patch),
  },
  { runId: "run", budgetMs: 30_000, deps, minIntervalMs: 30, allowInsecure: true },
);
const touched = [...memory.values()];
check(captchaHits === BLOCKS_BEFORE_BACKING_OFF, `po ${BLOCKS_BEFORE_BACKING_OFF} blokadach z rzędu kolejne zapytania nie są wysyłane (wysłano ${captchaHits} z 8)`);
check(touched.length === BLOCKS_BEFORE_BACKING_OFF && touched.every((patch) => patch.last_check_result === "unverified_blocked"), "zablokowane produkty: bez zmian statusu, wynik „zablokowany”");
check(runState.failures.localhost?.skipped_after_block === 8 - BLOCKS_BEFORE_BACKING_OFF, `pozostałe pominięte i sprawdzone w kolejnym przebiegu (${runState.failures.localhost?.skipped_after_block})`);

// ---------------------------------------------------------------------------
// Nightly dry run
// ---------------------------------------------------------------------------
console.log("\ncatalog:nightly --dry-run");
const repos = getRepos();
await repos.products.saveDirect([
  { merchant: "Sklep", external_id: "pool-1", name: "Produkt", description: null, price_pln: 60, category: "dom", tags: ["dom"], image_url: null, affiliate_url: `${base}/empik/kubek`, url: `${base}/empik/kubek`, checked_at: old },
]);
const dbBefore = createHash("sha256").update(readFileSync(process.env.DEMO_DB_PATH!)).digest("hex");
const output = execFileSync(process.execPath, ["--experimental-strip-types", "--no-warnings", "scripts/catalog-nightly.ts", "--dry-run"], {
  env: { ...process.env, ANTHROPIC_API_KEY: "", REAL_DB: "false", MOCK_MODE: "true", DEMO_DB_PATH: process.env.DEMO_DB_PATH },
  encoding: "utf8",
});
const dbAfter = createHash("sha256").update(readFileSync(process.env.DEMO_DB_PATH!)).digest("hex");
check(output.includes("NA PRÓBĘ") && output.includes("a) Weryfikacja") && output.includes("c) Uzupełnianie"), "pokazuje kroki a–c bez klucza AI");
check(dbBefore === dbAfter, "baza bez zmian po trybie próbnym");
check((await repos.aiUsage.listSince(new Date(0).toISOString())).length === 0, "zero zapisów w ai_usage");

server.closeAllConnections();
server.close();
rmSync(tempDir, { recursive: true, force: true });
console.log(failures === 0 ? "\nWszystkie testy przeszły." : `\nNiepowodzenia: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
