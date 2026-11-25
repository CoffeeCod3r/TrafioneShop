/**
 * Tests of the pool verification (lib/catalog/verify.ts): the JSON-LD / meta parser on 5 saved shop pages
 * (scripts/fixtures/shops), the verdicts, the rules, the address resolver and the run (concurrency, 1 request per
 * second per domain, robots.txt, no affiliate link ever opened).
 *
 *   npm run test:verify
 *
 * No network, no AI, no real database: a fake `fetch` and a temporary demo database file.
 */
import { readFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import type { VerifyFetch } from "../lib/catalog/verify.ts";

process.env.DEMO_DB_PATH = path.join(mkdtempSync(path.join(tmpdir(), "verify-")), "db.json");
process.env.REAL_DB = "false";
process.env.MOCK_MODE = "true";

const { extractPageInfo } = await import("../lib/catalog-check/extract.ts");
const verify = await import("../lib/catalog/verify.ts");
const { createVerifyStore } = await import("../lib/catalog/store.ts");
const { getRepos } = await import("../lib/services/db.ts");
const { decide, judge, fetchProductPage, resolveTargetUrl, runVerify } = verify;

let failures = 0;
function check(condition: boolean, text: string): void {
  console.log(`  ${condition ? "OK  " : "FAIL"}  ${text}`);
  if (!condition) failures++;
}
const fixture = (name: string) => readFileSync(new URL(`./fixtures/shops/${name}`, import.meta.url), "utf8");

// ---------------------------------------------------------------------------
console.log("Parser JSON-LD / meta na 5 zapisanych stronach");
const empik = extractPageInfo(fixture("empik.html"));
check(empik.price === 129.99 && empik.currency === "PLN" && empik.availability === "in_stock" && empik.source === "jsonld", "Empik: JSON-LD w @graph, 129,99 PLN, InStock");
const allegro = extractPageInfo(fixture("allegro-type.html"));
check(allegro.price === 1199 && allegro.availability === "out_of_stock", "typ Allegro: AggregateOffer, cena '1 199,00', wszystkie oferty OutOfStock");
const allegroIn = extractPageInfo(fixture("allegro-type.html").replaceAll("OutOfStock", "InStock"));
check(allegroIn.price === 1199 && allegroIn.availability === "in_stock", "typ Allegro: te same oferty jako InStock");
const plain = extractPageInfo(fixture("no-jsonld.html"));
check(plain.price === 49.9 && plain.currency === "PLN" && plain.availability === "in_stock" && plain.source === "meta", "sklep bez JSON-LD: product:price:amount '49,90', in stock (meta)");
const notFound = extractPageInfo(fixture("not-found.html"));
check(notFound.price === null && notFound.source === "none", "strona 404: brak danych o produkcie");
const home = extractPageInfo(fixture("redirect-home.html"));
check(home.price === null && home.source === "none", "strona główna: brak danych o produkcie");

// ---------------------------------------------------------------------------
console.log("\nPobieranie strony i werdykt (fałszywy fetch)");
type Route = { status: number; body?: string; location?: string; contentType?: string };
function routedFetch(routes: Record<string, Route>, seen: string[] = []): VerifyFetch {
  return async (url) => {
    seen.push(url);
    const route = routes[url];
    if (!route) return new Response("nie ma", { status: 404, headers: { "content-type": "text/html" } });
    const headers: Record<string, string> = { "content-type": route.contentType ?? "text/html; charset=utf-8" };
    if (route.location) headers.location = route.location;
    return new Response(route.body ?? "", { status: route.status, headers });
  };
}
const shop = "https://www.sklep.test";
const verdict = async (routes: Record<string, Route>, url = `${shop}/produkt/1`) => judge(url, await fetchProductPage(url, { fetch: routedFetch(routes) }));

const ok = await verdict({ [`${shop}/produkt/1`]: { status: 200, body: fixture("empik.html") } });
check(ok.kind === "ok" && ok.price === 129.99, "200 z JSON-LD -> ok, cena 129,99");
const gone = await verdict({ [`${shop}/produkt/1`]: { status: 404, body: fixture("not-found.html") } });
check(gone.kind === "failed" && gone.reason === "http_404", "404 (strona z fixtury) -> porażka http_404");
check((await verdict({ [`${shop}/produkt/1`]: { status: 410 } })).kind === "failed", "410 -> porażka");
const toHome = await verdict({
  [`${shop}/produkt/1`]: { status: 301, location: "/" },
  [`${shop}/`]: { status: 200, body: fixture("redirect-home.html") },
});
check(toHome.kind === "failed" && toHome.reason === "redirect_to_home", "przekierowanie na stronę główną (fixtura) -> porażka redirect_to_home");
const sameHostMove = await verdict({
  [`${shop}/produkt/1`]: { status: 301, location: `https://sklep.test/p/nowy-adres` },
  "https://sklep.test/p/nowy-adres": { status: 200, body: fixture("empik.html") },
});
check(sameHostMove.kind === "ok", "przekierowanie na nowy adres produktu w tej samej domenie (www -> bez www) jest w porządku");
const offDomain = await verdict({ [`${shop}/produkt/1`]: { status: 302, location: "https://inny-sklep.test/produkt/1" } });
check(offDomain.kind === "failed" && offDomain.reason === "redirect_off_domain", "przekierowanie na inną domenę -> porażka (strona obca nie jest pobierana)");
const three = await verdict({
  [`${shop}/produkt/1`]: { status: 301, location: "/p/2" },
  [`${shop}/p/2`]: { status: 301, location: "/p/3" },
  [`${shop}/p/3`]: { status: 301, location: "/p/4" },
  [`${shop}/p/4`]: { status: 200, body: fixture("empik.html") },
});
check(three.kind === "ok", "3 przekierowania są dozwolone");
const four = await verdict({
  [`${shop}/produkt/1`]: { status: 301, location: "/p/2" },
  [`${shop}/p/2`]: { status: 301, location: "/p/3" },
  [`${shop}/p/3`]: { status: 301, location: "/p/4" },
  [`${shop}/p/4`]: { status: 301, location: "/p/5" },
  [`${shop}/p/5`]: { status: 200, body: fixture("empik.html") },
});
check(four.kind === "failed" && four.reason === "too_many_redirects", "4. przekierowanie -> porażka too_many_redirects");
check((await verdict({ [`${shop}/produkt/1`]: { status: 200, body: fixture("allegro-type.html") } })).kind === "out_of_stock", "OutOfStock -> out_of_stock");
check((await verdict({ [`${shop}/produkt/1`]: { status: 403 } })).kind === "unverified", "403 (blokada bota) -> nie do oceny, nie porażka");
check((await verdict({ [`${shop}/produkt/1`]: { status: 503 } })).kind === "failed", "503 -> porażka");
check((await verdict({ [`${shop}/produkt/1`]: { status: 200, body: "<html><body>Produkt</body></html>" } })).kind === "unverified", "200 bez danych -> nie do oceny");
let timedOut = false;
try {
  await fetchProductPage(`${shop}/produkt/1`, { timeoutMs: 30, fetch: (_url, init) => new Promise((_resolve, reject) => init.signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })))) });
} catch (error) {
  timedOut = error instanceof Error && error.name === "AbortError";
}
check(timedOut, "timeout przerywa żądanie (limit produkcyjny: 8 s)");
check(verify.VERIFY_TIMEOUT_MS === 8000 && verify.MAX_REDIRECTS === 3 && verify.CONCURRENCY === 5 && verify.DOMAIN_INTERVAL_MS === 1000, "stałe: 8 s, 3 przekierowania, 5 równolegle, 1 żądanie/s na domenę");

// ---------------------------------------------------------------------------
console.log("\nReguły (decide)");
const now = new Date().toISOString();
const product = { id: "p", name: "P", url: null, affiliate_url: "x", network: "direct", price_pln: 100, status: "active" as const, fail_count: 0, source: "catalog_build" as const };
const first = decide(product, { kind: "failed", reason: "http_404" }, now);
check(first.patch.fail_count === 1 && first.patch.status === undefined && first.patch.last_checked_at === undefined && first.effect === "failed_once", "pierwsza porażka: fail_count 1, status bez zmian, last_checked_at nie odświeżone");
const second = decide({ ...product, fail_count: 1 }, { kind: "failed", reason: "http_404" }, now);
check(second.patch.status === "broken" && second.patch.fail_count === 2 && second.effect === "became_broken", "druga porażka: status broken");
const oos = decide(product, { kind: "out_of_stock" }, now);
check(oos.patch.status === "out_of_stock" && oos.effect === "became_out_of_stock", "OutOfStock: status out_of_stock");
const jump = decide(product, { kind: "ok", price: 130, availability: "in_stock", source: "jsonld" }, now);
check(jump.history?.old_price === 100 && jump.history?.new_price === 130 && jump.patch.price_pln === 130 && jump.priceChanged, "cena +30%: zaktualizowana i wiersz w price_history");
const small = decide(product, { kind: "ok", price: 110, availability: "in_stock", source: "jsonld" }, now);
check(!small.history && small.patch.price_pln === 110 && small.patch.price_checked === 110 && !small.priceChanged, "cena +10%: zaktualizowana, bez historii");
const exact = decide(product, { kind: "ok", price: 120, availability: "in_stock", source: "jsonld" }, now);
check(!exact.history, "dokładnie 20% to jeszcze nie zmiana (próg: ponad 20%)");
const healed = decide({ ...product, status: "broken", fail_count: 1 }, { kind: "ok", price: 100, availability: "in_stock", source: "jsonld" }, now);
check(healed.patch.status === "active" && healed.patch.fail_count === 0 && healed.patch.last_checked_at === now, "sukces: active, fail_count 0, last_checked_at = teraz (także dla broken)");
const blocked = decide(product, { kind: "unverified", reason: "blocked" }, now);
check(blocked.patch.last_checked_at === undefined && blocked.patch.status === undefined && blocked.effect === "unverified", "blokada bota: nic się nie zmienia");
const newAi = decide({ ...product, status: "pending" }, { kind: "unverified", reason: "no_structured_data" }, now);
check(newAi.patch.status === undefined, "nowy produkt znaleziony przez AI bez ceny na stronie zostaje 'pending'");
const feedNoData = decide({ ...product, status: "pending", source: "feed" }, { kind: "unverified", reason: "no_structured_data" }, now);
check(feedNoData.patch.status === "active", "produkt z feedu (cena z feedu) bez danych na stronie, ale działający link -> active");

// ---------------------------------------------------------------------------
console.log("\nAdres docelowy (nigdy link afiliacyjny)");
check(resolveTargetUrl({ url: "https://s.test/a", affiliate_url: "https://awin1.com/cread.php?ued=https%3A%2F%2Fs.test%2Fb", network: "awin" }) === "https://s.test/a", "najpierw zwykły adres produktu (url)");
check(resolveTargetUrl({ url: null, affiliate_url: "https://www.awin1.com/cread.php?awinmid=1&ued=https%3A%2F%2Fs.test%2Fb%3Fx%3D1", network: "awin" }) === "https://s.test/b?x=1", "Awin: adres sklepu z parametru ued");
check(resolveTargetUrl({ url: null, affiliate_url: "https://track.webepartners.pl/click?id=5", network: "webepartners" }) === null, "link sieci bez adresu docelowego -> null (nic nie jest otwierane)");
check(resolveTargetUrl({ url: null, affiliate_url: "https://s.test/p?utm_source=x", network: "gmc" }) === "https://s.test/p?utm_source=x", "feed gmc: link prowadzi do sklepu");
check(resolveTargetUrl({ url: null, affiliate_url: "/demo-produkt/1", network: "demo" }) === null, "adres względny -> null");

// ---------------------------------------------------------------------------
console.log("\nPrzebieg na bazie demo");
const repos = getRepos();
const fixtureHtml = fixture("empik.html");
const hosts = ["a", "b", "c", "d", "e", "f"].map((letter) => `https://${letter}.sklep.test`);
const rows = [];
for (const host of hosts) {
  for (let i = 1; i <= 4; i++) {
    rows.push({ merchant: host, external_id: `${host}/${i}`, name: `Produkt ${i}`, description: null, price_pln: 129.99, category: "Dom", tags: [], image_url: null, affiliate_url: `${host}/p/${i}`, url: `${host}/p/${i}`, checked_at: new Date(Date.now() - 86_400_000).toISOString() });
  }
}
await repos.products.saveDirect(rows);
// A product behind an affiliate network link whose shop address is not known, and one that robots.txt forbids.
await repos.products.upsertMany([
  { network: "webepartners", merchant: "Sieć", external_id: "w-1", name: "Za linkiem sieci", price_pln: 20, category: "Dom", tags: [], affiliate_url: "https://track.webepartners.pl/click?id=9", image_url: "https://x.test/i.jpg", in_stock: true },
]);
await repos.products.saveDirect([
  { merchant: "zakaz", external_id: "z-1", name: "Zabroniony", description: null, price_pln: 50, category: "Dom", tags: [], image_url: null, affiliate_url: "https://zakaz.sklep.test/tajne/1", url: "https://zakaz.sklep.test/tajne/1", checked_at: new Date(Date.now() - 86_400_000).toISOString() },
]);

const times = new Map<string, number[]>();
const requested: string[] = [];
let inFlight = 0;
let maxInFlight = 0;
const fakeFetch: VerifyFetch = async (url) => {
  requested.push(url);
  const { hostname, pathname } = new URL(url);
  const list = times.get(hostname) ?? [];
  list.push(Date.now());
  times.set(hostname, list);
  inFlight++;
  maxInFlight = Math.max(maxInFlight, inFlight);
  await new Promise((resolve) => setTimeout(resolve, 15));
  inFlight--;
  if (pathname === "/robots.txt") {
    return new Response(hostname.startsWith("zakaz") ? "User-agent: *\nDisallow: /tajne/" : "", { status: hostname.startsWith("zakaz") ? 200 : 404, headers: { "content-type": "text/plain" } });
  }
  // d.sklep.test product 3 is gone, e.sklep.test redirects everything to the home page.
  if (hostname.startsWith("d.") && pathname === "/p/3") return new Response("", { status: 404 });
  if (hostname.startsWith("e.")) return new Response("", { status: 301, headers: { location: "/" } });
  if (url === "https://e.sklep.test/") return new Response(fixture("redirect-home.html"), { status: 200, headers: { "content-type": "text/html" } });
  return new Response(fixtureHtml, { status: 200, headers: { "content-type": "text/html" } });
};

const summary = await runVerify(createVerifyStore(repos), { deps: { fetch: fakeFetch }, intervalMs: 60 });
check(maxInFlight <= 5 && maxInFlight >= 3, `najwyżej 5 żądań naraz (zmierzone maksimum: ${maxInFlight})`);
const minGap = Math.min(
  ...[...times.values()].flatMap((list) => list.slice(1).map((time, index) => time - list[index])),
);
check(minGap >= 55, `co najmniej 60 ms przerwy między żądaniami do jednej domeny (zmierzone minimum: ${minGap} ms; w produkcji 1000 ms)`);
check(!requested.some((url) => url.includes("webepartners")), "link sieci afiliacyjnej nie został otwarty");
check(!requested.some((url) => url.includes("/tajne/")), "robots.txt: zabroniona ścieżka nie została pobrana");
check(summary.unverifiable === 2, `nie do oceny: ${summary.unverifiable} (link sieci i zakaz robots)`);
check(summary.failed_once === 5, `porażki pierwszego razu: ${summary.failed_once} (e.* ×4 i d.sklep.test/p/3)`);

const bySite = async (prefix: string) => (await repos.products.findCandidates({ minPrice: 0, maxPrice: 1000, limit: 1000 })).filter((p) => p.merchant.startsWith(`https://${prefix}.`));
check((await bySite("a")).length === 4, "działające produkty zostają w puli (a.sklep.test: 4)");
check((await bySite("e")).length === 4, "po pierwszej porażce produkt jeszcze jest (e.sklep.test: 4)");
const second2 = await runVerify(createVerifyStore(repos), { deps: { fetch: fakeFetch }, intervalMs: 5, onlyStale: true });
check(second2.broken === 5, `druga porażka z rzędu -> broken (${second2.broken}: e.* ×4 i d.sklep.test/p/3); --only-stale ponawia produkty z porażką`);
check((await bySite("e")).length === 0 && (await bySite("d")).length === 3, "broken znikają z wyników darmowych (e: 0, d: 3)");
const usage = await repos.aiUsage.listSince("2000-01-01T00:00:00Z");
check(usage.length === 0, "weryfikacja nie zapisuje nic w ai_usage (zero AI)");

console.log(failures === 0 ? "\nWszystkie testy przeszły." : `\nNiepowodzenia: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
