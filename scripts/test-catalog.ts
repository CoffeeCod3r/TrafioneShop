/**
 * Tests of the weekly catalog check (lib/catalog-check) against a local server with example shop pages.
 *
 *   npm run test:catalog
 *
 * No network, no AI, no real database: a temporary demo database and an http server on 127.0.0.1.
 * Covered: a working product, 404, 410, a redirect to a category and to the home page, a price change of
 * more than 20 % (history), a small price change, "out of stock" in JSON-LD, meta-tag prices, a timeout twice in a row
 * (out of stock only after the second one) and a good check resetting the counter, 5xx, a robots.txt that forbids a
 * page, a page without structured data, the 1 MB size cap, the 1 request per second per domain rule, the 20 minute
 * limit with resuming from the cursor, and that nothing is ever written to ai_usage.
 */
import { createServer } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";

// Always the demo database in a temp file, whatever .env.local says.
const tempDir = mkdtempSync(path.join(tmpdir(), "catalog-check-"));
process.env.DEMO_DB_PATH = path.join(tempDir, "db.json");
process.env.REAL_DB = "false";
process.env.MOCK_MODE = "true";

const { getRepos } = await import("../lib/services/db.ts");
const { createRepoStore } = await import("../lib/catalog-check/repo-store.ts");
const { runCatalogCheck, decide, selectProducts, MIN_INTERVAL_MS, FAILED_CHECKS_LIMIT } = await import("../lib/catalog-check/runner.ts");
type CheckProduct = import("../lib/catalog-check/runner.ts").CheckProduct;
const { extractPageInfo } = await import("../lib/catalog-check/extract.ts");
const { parseRobots } = await import("../lib/catalog-check/robots.ts");
const { USER_AGENT, ROBOTS_TOKEN } = await import("../lib/catalog-check/check.ts");

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

let failures = 0;
function check(condition: boolean, text: string): void {
  console.log(`  ${condition ? "OK  " : "FAIL"}  ${text}`);
  if (!condition) failures++;
}

// ---------------------------------------------------------------------------
// Example shop (local http server)
// ---------------------------------------------------------------------------

const jsonLd = (price: string, availability = "InStock", currency = "PLN") =>
  `<html><head><script type="application/ld+json">${JSON.stringify({
    "@context": "https://schema.org",
    "@type": "Product",
    name: "Produkt",
    offers: { "@type": "Offer", price, priceCurrency: currency, availability: `https://schema.org/${availability}` },
  })}</script></head><body>Produkt</body></html>`;

const seen: { url: string; ua: string; at: number }[] = [];
let flakyCalls = 0;

const server = createServer((request, response) => {
  const url = request.url ?? "/";
  seen.push({ url, ua: String(request.headers["user-agent"] ?? ""), at: Date.now() });
  const html = (body: string, status = 200) => {
    response.writeHead(status, { "content-type": "text/html; charset=utf-8" });
    response.end(body);
  };
  if (url === "/robots.txt") {
    response.writeHead(200, { "content-type": "text/plain" });
    return response.end("User-agent: *\nDisallow: /zablokowany\n");
  }
  if (url === "/p/dziala") return html(jsonLd("100,00"));
  if (url === "/p/zmiana-ceny") return html(jsonLd("150.00")); // +50 % from 100
  if (url === "/p/mala-zmiana") return html(jsonLd("110.00")); // +10 % from 100
  if (url === "/p/brak-w-magazynie") return html(jsonLd("100.00", "OutOfStock"));
  if (url === "/p/meta") {
    return html('<html><head><meta property="product:price:amount" content="1 299,00"><meta property="product:price:currency" content="PLN"><meta property="product:availability" content="in stock"></head></html>');
  }
  if (url === "/p/404") return html("brak", 404);
  if (url === "/p/410") return html("usuniety", 410);
  if (url === "/produkty/kategoria/stary-produkt") {
    response.writeHead(302, { location: "/produkty/kategoria" });
    return response.end();
  }
  if (url === "/produkty/kategoria") return html("<html><body>Kategoria: lista produktow</body></html>");
  if (url === "/p/na-strone-glowna") {
    response.writeHead(301, { location: "/" });
    return response.end();
  }
  if (url === "/") return html("<html><body>Strona glowna sklepu</body></html>");
  if (url === "/p/zawsze-timeout") return; // never answers
  if (url === "/p/raz-timeout") {
    flakyCalls++;
    if (flakyCalls === 1) return; // first call hangs, later ones answer
    return html(jsonLd("100.00"));
  }
  if (url === "/p/blad-5xx") return html("blad", 503);
  if (url === "/p/bez-danych") return html("<html><body>Strona bez danych strukturalnych</body></html>");
  if (url === "/zablokowany") return html(jsonLd("100.00"));
  if (url === "/p/duza-strona") return html(`${jsonLd("100.00")}${"x".repeat(3_000_000)}`);
  html("nieznany", 404);
});
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const port = (server.address() as AddressInfo).port;
const base = `http://127.0.0.1:${port}`;

// ---------------------------------------------------------------------------
// Pure parts: extraction, robots.txt, decision rules
// ---------------------------------------------------------------------------

console.log("\nOdczyt ceny i dostępności (JSON-LD, meta)");
check(extractPageInfo(jsonLd("49,99")).price === 49.99, "JSON-LD: cena „49,99” -> 49.99");
check(extractPageInfo(jsonLd("1 299,00")).price === 1299, "JSON-LD: cena „1 299,00” -> 1299");
check(extractPageInfo(jsonLd("10", "OutOfStock")).availability === "out_of_stock", "JSON-LD: OutOfStock -> brak w magazynie");
check(extractPageInfo(jsonLd("10", "InStock")).availability === "in_stock", "JSON-LD: InStock -> dostępny");
check(extractPageInfo('<script type="application/ld+json">{"@graph":[{"@type":"Product","offers":[{"price":"5","priceCurrency":"PLN"}]}]}</script>').price === 5, "JSON-LD: @graph i lista ofert");
check(extractPageInfo('<script type="application/ld+json">{"@type":"Product","offers":{"@type":"AggregateOffer","lowPrice":"20","priceCurrency":"PLN"}}</script>').price === 20, "JSON-LD: AggregateOffer (lowPrice)");
check(extractPageInfo('<script type="application/ld+json">{niepoprawny json</script>').source === "none", "niepoprawny JSON-LD nie psuje odczytu");
const meta = extractPageInfo('<meta property="og:price:amount" content="39,90"><meta property="og:price:currency" content="PLN">');
check(meta.price === 39.9 && meta.source === "meta", "meta tagi: og:price:amount");

console.log("\nrobots.txt");
const rules = parseRobots("User-agent: *\nDisallow: /koszyk\nAllow: /koszyk/pomoc\nUser-agent: Prezentoskop-LinkChecker\nDisallow: /tajne$\n", ROBOTS_TOKEN);
check(!rules.isAllowed("/tajne"), "reguła dla naszego User-Agenta: /tajne zablokowane");
check(rules.isAllowed("/tajne/inne") && rules.isAllowed("/koszyk"), "grupa dla nas wyprzedza grupę „*”");
const star = parseRobots("User-agent: *\nDisallow: /koszyk\nAllow: /koszyk/pomoc\nDisallow: /*?sesja=", ROBOTS_TOKEN);
check(!star.isAllowed("/koszyk/x") && star.isAllowed("/koszyk/pomoc") && !star.isAllowed("/p?sesja=1") && star.isAllowed("/p"), "Disallow/Allow, najdłuższa reguła wygrywa, wildcard *");

console.log("\nReguły wyniku");
const product: CheckProduct = { id: "x", name: "P", url: "u", affiliate_url: "u", price_pln: 100, network: "direct", failed_checks: 0, status: "pending", last_check_at: null };
const now = new Date().toISOString();
const okPage = (price: number) => ({ kind: "ok" as const, price, availability: "in_stock" as const, source: "jsonld" as const, finalUrl: "https://sklep.pl/p" });
const ok150 = decide(product, okPage(150), now);
check(ok150.history?.new_price === 150 && ok150.patch.status === "active" && ok150.patch.price_checked === 150, "zmiana ceny o ponad 20%: historia, status active, zapisana sprawdzona cena");
check(decide(product, okPage(110), now).history === undefined, "zmiana o 10% nie trafia do historii, cena jest aktualizowana");
check(decide({ ...product, failed_checks: 1 }, okPage(100), now).patch.failed_checks === 0, "udane sprawdzenie zeruje licznik");
check(ok150.patch.final_url === "https://sklep.pl/p", "zapisany finalny adres po przekierowaniach");
const first404 = decide(product, { kind: "gone", reason: "http_404" }, now);
check(first404.patch.in_stock === undefined && first404.patch.failed_checks === 1, "404 (1. raz): licznik = 1, produkt zostaje");
check(decide({ ...product, failed_checks: 1 }, { kind: "gone", reason: "http_404" }, now).patch.status === "broken", "404 (2. raz z rzędu): status broken");
check(decide({ ...product, failed_checks: 1 }, { kind: "gone", reason: "redirect_off_site" }, now).patch.status === "broken", "przekierowanie na inną domenę liczy się jak błąd");
check(decide({ ...product, status: "active" }, { kind: "sold_out" }, now).patch.status === "out_of_stock", "„brak w magazynie”: od razu out_of_stock");
check(decide({ ...product, status: "out_of_stock" }, okPage(100), now).patch.status === "active", "produkt, który wrócił do sprzedaży: znowu active");
check(decide(product, { kind: "error", reason: "timeout" }, now).patch.in_stock === undefined, "pierwszy timeout: jeszcze dostępny");
const blocked = decide({ ...product, failed_checks: FAILED_CHECKS_LIMIT - 1 }, { kind: "error", reason: "blocked" }, now);
check(blocked.patch.status === undefined && blocked.patch.failed_checks === FAILED_CHECKS_LIMIT - 1 && blocked.failure === "blocked", "blokada 403/429: produkt bez zmian, licznik błędów nie rośnie, sklep trafia do tabeli błędów");
check(decide({ ...product, failed_checks: FAILED_CHECKS_LIMIT - 1 }, { kind: "error", reason: "http_5xx" }, now).patch.status === "broken", "drugi błąd 5xx z rzędu: broken");

console.log("\nWybór produktów do przebiegu");
const day = 86_400_000;
const nowMs = Date.now();
const pool: CheckProduct[] = [
  { ...product, id: "a", last_check_at: new Date(nowMs - 1 * day).toISOString() },
  { ...product, id: "b", last_check_at: new Date(nowMs - 10 * day).toISOString() },
  { ...product, id: "c", last_check_at: null },
  { ...product, id: "d", last_check_at: new Date(nowMs - 5 * day).toISOString() },
];
const stale = selectProducts(pool, { cursor: null, staleAfterDays: 3, now: nowMs });
check(stale.map((item) => item.id).join(",") === "c,b,d", `--only-stale: tylko starsze niż 3 dni, najstarsze pierwsze (${stale.map((item) => item.id).join(",")})`);
check(selectProducts(pool, { cursor: null, staleAfterDays: 3, limit: 2, now: nowMs }).length === 2, "--limit 2: najwyżej 2 produkty");
check(selectProducts(pool, { cursor: "b", now: nowMs }).map((item) => item.id).join(",") === "c,d", "pełny przebieg: kolejność po id od kursora");

// ---------------------------------------------------------------------------
// The run, against the local server
// ---------------------------------------------------------------------------

const repos = getRepos();
const aiUsageBefore = (await repos.aiUsage.listSince(new Date(0).toISOString())).length;

const specs: [string, string, number][] = [
  ["dziala", "/p/dziala", 100],
  ["zmiana-ceny", "/p/zmiana-ceny", 100],
  ["mala-zmiana", "/p/mala-zmiana", 100],
  ["brak-w-magazynie", "/p/brak-w-magazynie", 100],
  ["meta", "/p/meta", 1250],
  ["404", "/p/404", 100],
  ["410", "/p/410", 100],
  ["przekierowanie-kategoria", "/produkty/kategoria/stary-produkt", 100],
  ["przekierowanie-glowna", "/p/na-strone-glowna", 100],
  ["zawsze-timeout", "/p/zawsze-timeout", 100],
  ["raz-timeout", "/p/raz-timeout", 100],
  ["blad-5xx", "/p/blad-5xx", 100],
  ["bez-danych", "/p/bez-danych", 100],
  ["zablokowany", "/zablokowany", 100],
  ["duza-strona", "/p/duza-strona", 100],
];
const saved = await repos.products.saveDirect(
  specs.map(([key, route, price]) => ({
    merchant: "Sklep testowy",
    external_id: `test-${key}`,
    name: key,
    description: null,
    price_pln: price,
    category: "inne",
    tags: [],
    image_url: null,
    affiliate_url: `${base}${route}`,
    url: `${base}${route}`,
    checked_at: new Date(0).toISOString(),
  })),
);
const idOf = (key: string) => saved.find((row) => row.external_id === `test-${key}`)!.id;
const productOf = async (key: string) => (await repos.products.getById(idOf(key)))!;

const store = createRepoStore(repos, ["127.0.0.1"]);
// Client-side start time of every request: the spacing test measures what the checker does, not server jitter.
const sent: number[] = [];
const deps = {
  fetch: (url: string, init: RequestInit) => {
    sent.push(Date.now());
    return fetch(url, init);
  },
  timeoutMs: 400,
  isAllowedHost: () => true,
};

async function fullRun(extra: Partial<Parameters<typeof runCatalogCheck>[1]> = {}) {
  const run = await repos.catalog.createRun("manual");
  const result = await runCatalogCheck(store, { runId: run.id, budgetMs: 60_000, deps, minIntervalMs: 120, allowInsecure: true, log: (message) => { if (process.env.DEBUG) console.log("    ", message); }, ...extra });
  return { run: (await repos.catalog.getRun(run.id))!, result };
}

console.log("\nPierwsze sprawdzenie (przykładowe strony)");
const sentBeforeFirst = sent.length;
const first = await fullRun();
const sentFirstRun = sent.slice(sentBeforeFirst);
check(first.result.status === "completed" && first.run.status === "completed", "przebieg zakończony");
check(first.run.processed === specs.length, `sprawdzono wszystkie produkty (${first.run.processed}/${specs.length})`);
let p = await productOf("dziala");
check(p.in_stock && p.price_pln === 100 && p.checked_at !== new Date(0).toISOString() && p.last_check_result === "ok", "działający produkt: dostępny, checked_at zaktualizowane");
p = await productOf("zmiana-ceny");
check(p.price_pln === 150 && p.last_check_result === "price_changed", "zmiana ceny: nowa cena zapisana");
const history = await repos.catalog.countProducts();
check(history.available > 0, "licznik produktów działa");
p = await productOf("mala-zmiana");
check(p.price_pln === 110, "mała zmiana ceny: aktualizacja bez historii");
p = await productOf("brak-w-magazynie");
check(!p.in_stock && p.status === "out_of_stock", "„brak w magazynie” w JSON-LD -> out_of_stock od razu");
p = await productOf("meta");
check(p.price_pln === 1299 && p.in_stock, "cena z meta tagów: 1 299,00 -> 1299");
p = await productOf("404");
check(p.in_stock && p.failed_checks === 1 && p.last_check_result === "gone_http_404", "404 (1. raz): licznik = 1, jeszcze dostępny");
check((await productOf("410")).failed_checks === 1, "410 (1. raz): licznik = 1");
check((await productOf("przekierowanie-kategoria")).last_check_result === "gone_redirect_to_listing", "przekierowanie na kategorię wykryte");
check((await productOf("przekierowanie-glowna")).last_check_result === "gone_redirect_to_listing", "przekierowanie na stronę główną wykryte");
p = await productOf("dziala");
check(p.status === "active" && !!p.final_url && p.price_checked === 100, "działający produkt: status active, finalny adres i sprawdzona cena zapisane");
p = await productOf("zawsze-timeout");
check(p.in_stock && p.failed_checks === 1 && p.last_check_result === "error_timeout", "timeout (1. raz): dostępny, licznik = 1");
p = await productOf("blad-5xx");
check(p.in_stock && p.failed_checks === 1, "5xx (1. raz): dostępny, licznik = 1");
p = await productOf("bez-danych");
check(p.in_stock && p.failed_checks === 0 && p.last_check_result === "unverified_no_structured_data", "brak danych strukturalnych: bez zmian, oznaczone");
p = await productOf("zablokowany");
check(p.in_stock && p.last_check_result === "skipped_robots", "robots.txt zabrania: pominięty, bez kary");
check(!seen.some((entry) => entry.url === "/zablokowany"), "serwer nie dostał zapytania o stronę zablokowaną w robots.txt");
p = await productOf("duza-strona");
check(p.price_pln === 100 && p.last_check_result === "ok", "strona 3 MB: odczytana z limitem 1 MB (JSON-LD na początku)");
check(first.run.price_changes === 1 && first.run.skipped_robots === 1, `podsumowanie przebiegu: zmian cen ${first.run.price_changes}, pominięto przez robots ${first.run.skipped_robots}`);
check(Object.values(first.run.failures).some((kinds) => kinds.timeout === 2), "błędy zapisane według sklepu (timeout)");
const historyRows = await (async () => {
  const raw = JSON.parse((await import("node:fs")).readFileSync(process.env.DEMO_DB_PATH!, "utf8")) as { price_history: { old_price: number; new_price: number }[] };
  return raw.price_history;
})();
check(historyRows.length === 1 && historyRows[0].old_price === 100 && historyRows[0].new_price === 150, "price_history: jeden wpis 100 -> 150");

console.log("\nDrugie sprawdzenie (błąd dwa razy z rzędu)");
const second = await fullRun();
check(second.run.processed === specs.length, `drugi przebieg sprawdza wszystko, także out_of_stock (${second.run.processed})`);
for (const key of ["404", "410", "przekierowanie-kategoria", "przekierowanie-glowna", "zawsze-timeout", "blad-5xx"]) {
  p = await productOf(key);
  check(!p.in_stock && p.status === "broken" && p.failed_checks === 2, `${key}: 2. raz z rzędu -> broken`);
}
const third = await fullRun();
check(third.run.processed === specs.length - 6, `trzeci przebieg pomija broken (${third.run.processed} produktów)`);
const limited = await fullRun({ limit: 3 });
check(limited.run.processed === 3 && limited.run.total === 3, "--limit 3: sprawdzone dokładnie 3 produkty");

console.log("\nLicznik błędów zerowany po udanym sprawdzeniu");
// "raz-timeout": 1st call hangs (counter 1 in the first run), later calls answer: the second run resets it.
check((await productOf("raz-timeout")).failed_checks === 0 && (await productOf("raz-timeout")).in_stock, "produkt, który raz nie odpowiedział, a potem tak: licznik = 0, dostępny");

console.log("\nGrzeczność");
const userAgents = new Set(seen.map((entry) => entry.ua));
check(userAgents.size === 1 && [...userAgents][0] === USER_AGENT, "własny User-Agent z nazwą strony i adresem kontaktowym");
check(USER_AGENT.includes("prezentoskop.pl") && USER_AGENT.includes("kontakt@prezentoskop.pl"), "User-Agent zawiera stronę i e-mail");
check(MIN_INTERVAL_MS === 1000, "domyślny odstęp: 1 zapytanie na sekundę do jednej domeny");
const gaps = sentFirstRun.slice(1).map((at, index) => at - sentFirstRun[index]);
check(Math.min(...gaps) >= 110, `przy 5 zapytaniach naraz odstęp do jednej domeny ≥ 120 ms (najmniejszy: ${Math.min(...gaps)} ms)`);

console.log("\n20 minut i wznawianie od miejsca przerwania");
const resumeRepos = repos;
for (const [index, [key]] of specs.entries()) {
  await resumeRepos.products.saveDirect([
    { merchant: "Sklep testowy", external_id: `wznow-${index}`, name: `wznow-${key}`, description: null, price_pln: 100, category: "inne", tags: [], image_url: null, affiliate_url: `${base}/p/dziala`, url: `${base}/p/dziala`, checked_at: new Date(0).toISOString() },
  ]);
  if (index >= 5) break;
}
const resumeRun = await repos.catalog.createRun("cron");
const slice = await runCatalogCheck(store, { runId: resumeRun.id, budgetMs: 450, deps, minIntervalMs: 200, allowInsecure: true });
const afterSlice = (await repos.catalog.getRun(resumeRun.id))!;
check(slice.status === "paused" && afterSlice.status === "running" && afterSlice.cursor !== null, "przy wyczerpaniu budżetu przebieg staje i zapisuje kursor");
const resumed = await runCatalogCheck(store, { runId: resumeRun.id, budgetMs: 60_000, deps, minIntervalMs: 20, allowInsecure: true });
const afterResume = (await repos.catalog.getRun(resumeRun.id))!;
check(resumed.status === "completed" && afterResume.processed === afterResume.total, `kolejne wywołanie dokańcza od kursora (${afterResume.processed}/${afterResume.total})`);
const lateRun = await repos.catalog.createRun("cron");
const clock = { t: Date.parse((await repos.catalog.getRun(lateRun.id))!.started_at) + 21 * 60_000 };
const late = await runCatalogCheck(store, { runId: lateRun.id, budgetMs: 60_000, deps, minIntervalMs: 20, allowInsecure: true, now: () => clock.t });
check(late.status === "partial" && (await repos.catalog.getRun(lateRun.id))!.status === "partial", "po 20 minutach od startu przebieg się kończy (częściowy)");

console.log("\nBez AI");
const aiUsageAfter = (await repos.aiUsage.listSince(new Date(0).toISOString())).length;
check(aiUsageBefore === 0 && aiUsageAfter === 0, `zapisów w ai_usage: ${aiUsageAfter} (zadanie nie wywołuje Claude ani wyszukiwania)`);

server.closeAllConnections();
server.close();
rmSync(tempDir, { recursive: true, force: true });
console.log(failures === 0 ? "\nWszystkie testy przeszły." : `\nNiepowodzenia: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
