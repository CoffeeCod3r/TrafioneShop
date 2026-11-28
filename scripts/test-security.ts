/**
 * Security tests.
 *   npm run test:security                         unit tests only (no network; runs in CI)
 *   BASE_URL=http://localhost:3000 npm run test:security   also HTTP tests against a running app
 *                                                 (npm run dev with MOCK_MODE=true, or a deploy preview)
 * The HTTP part never sends a valid secret, password or Stripe signature.
 */
import { affiliateNetworkDomains, safeOutboundUrl } from "../lib/outbound.ts";
import { isFetchableUrl, isPrivateHost } from "../lib/net-guard.ts";
import { isSameSecret } from "../lib/secret.ts";

let failures = 0;
function check(ok: boolean, label: string) {
  if (!ok) failures += 1;
  console.log(`  ${ok ? "OK  " : "FAIL"}  ${label}`);
}

const SITE = "https://prezentoskop.pl/go/123";
const SHOPS = ["empik.com", "x-kom.pl", ...affiliateNetworkDomains("partner.example")];

console.log("Przekierowania do sklepów (safeOutboundUrl)");
check(safeOutboundUrl("https://www.empik.com/produkt/1", SITE, SHOPS)?.hostname === "www.empik.com", "sklep z allowed_shops (subdomena) – dozwolony");
check(safeOutboundUrl("https://webep1.com/r?x=1", SITE, SHOPS) !== null, "sieć afiliacyjna webep1.com – dozwolona");
check(safeOutboundUrl("https://www.ceneo.pl/123", SITE, SHOPS) !== null, "ceneo.pl – dozwolone");
check(safeOutboundUrl("https://go.partner.example/x", SITE, SHOPS) !== null, "domena z AFFILIATE_NETWORK_DOMAINS – dozwolona");
check(safeOutboundUrl("https://evil.com/", SITE, SHOPS) === null, "obca domena – zablokowana");
check(safeOutboundUrl("https://empik.com.evil.com/", SITE, SHOPS) === null, "domena udająca sklep (sufiks) – zablokowana");
check(safeOutboundUrl("https://evilempik.com/", SITE, SHOPS) === null, "domena z tą samą końcówką bez kropki – zablokowana");
check(safeOutboundUrl("http://www.empik.com/", SITE, SHOPS) === null, "http (bez TLS) – zablokowane");
check(safeOutboundUrl("javascript:alert(1)", SITE, SHOPS) === null, "javascript: – zablokowane");
check(safeOutboundUrl("https://user:pw@www.empik.com/", SITE, SHOPS) === null, "URL z loginem – zablokowany");
check(safeOutboundUrl("//evil.com/x", SITE, SHOPS) === null, "„//evil.com” – zablokowane");
check(safeOutboundUrl("/\\evil.com", SITE, SHOPS) === null, "„/\\evil.com” – zablokowane");
check(safeOutboundUrl("/demo-produkt/demo-001", SITE, SHOPS)?.origin === "https://prezentoskop.pl", "własna ścieżka (demo) – dozwolona");
check(safeOutboundUrl("", SITE, SHOPS) === null, "pusty URL – zablokowany");

console.log("\nSSRF (isFetchableUrl)");
for (const url of [
  "http://www.empik.com/",
  "https://localhost/",
  "https://127.0.0.1/",
  "https://10.0.0.5/",
  "https://172.20.1.1/",
  "https://192.168.1.1/",
  "https://169.254.169.254/latest/meta-data/",
  "https://[::1]/",
  "https://[fd00::1]/",
  "https://[::ffff:127.0.0.1]/",
  "https://2130706433/",
  "https://0x7f000001/",
  "file:///etc/passwd",
  "ftp://empik.com/",
]) {
  check(!isFetchableUrl(url), `zablokowany: ${url}`);
}
check(isFetchableUrl("https://www.empik.com/produkt"), "dozwolony: https://www.empik.com/produkt");
check(isFetchableUrl("https://8a.pl/x"), "dozwolony: https://8a.pl/x (domena zaczynająca się cyfrą)");
check(!isPrivateHost("172.32.0.1"), "172.32.0.1 to adres publiczny");
check(isFetchableUrl("http://127.0.0.1:4000/", true), "testy: lokalny serwer dozwolony tylko z allowLocal");

console.log("\nSekrety (isSameSecret)");
check(isSameSecret("a".repeat(40), "a".repeat(40)), "ten sam sekret – zgodny");
check(!isSameSecret("a".repeat(39), "a".repeat(40)), "inna długość – niezgodny");
check(!isSameSecret("", "a".repeat(40)) && !isSameSecret(null, "a".repeat(40)), "brak sekretu – niezgodny");

const base = process.env.BASE_URL?.replace(/\/$/, "");
if (base) {
  console.log(`\nHTTP (${base})`);
  const origin = new URL(base).origin;
  const request = (path: string, init: RequestInit = {}) => fetch(`${base}${path}`, { redirect: "manual", ...init });

  const go = await request(`/go/00000000-0000-4000-8000-000000000000?url=https://evil.com&next=https://evil.com&returnTo=//evil.com`);
  const location = go.headers.get("location") ?? "";
  check(go.status === 302 && new URL(location, base).origin === origin, `/go z obcym url w parametrze → tylko na naszą stronę (${go.status} ${location})`);
  const goBad = await request(`/go/not-a-uuid?url=https://evil.com`);
  // Netlify keeps the query string on the redirect ("/?url=…"); what matters is that the target is our own origin.
  check(new URL(goBad.headers.get("location") ?? "/", base).origin === origin, "/go z błędnym id → tylko na naszą stronę");
  const claim = await request(`/api/pack/claim?session_id=x&result=https://evil.com`);
  check(new URL(claim.headers.get("location") ?? "/", base).origin === origin, "/api/pack/claim z obcym result → tylko nasza strona");

  const adminNoOrigin = await request("/api/admin/check-links", { method: "POST" });
  check(adminNoOrigin.status === 403, `/api/admin/check-links bez Origin → 403 (${adminNoOrigin.status})`);
  const adminNoSession = await request("/api/admin/check-links", { method: "POST", headers: { origin } });
  check(adminNoSession.status === 401, `/api/admin/check-links bez sesji → 401 (${adminNoSession.status})`);
  const adminForged = await request("/api/admin/check-links", {
    method: "POST",
    headers: { origin, cookie: `admin_session=${Math.floor(Date.now() / 1000) + 3600}.forged` },
  });
  check(adminForged.status === 401, `/api/admin/check-links z podrobioną sesją → 401 (${adminForged.status})`);
  const adminOtherApi = await request("/api/admin/anything", { headers: { origin } });
  check(adminOtherApi.status === 401, `każdy /api/admin/* bez sesji → 401 (${adminOtherApi.status})`);
  const loginCsrf = await request("/api/admin/login", {
    method: "POST",
    headers: { origin: "https://evil.com", "content-type": "application/json" },
    body: JSON.stringify({ password: "x" }),
  });
  check(loginCsrf.status === 403, `/api/admin/login z obcego Origin → 403 (${loginCsrf.status})`);
  const adminPage = await request("/admin");
  check((adminPage.headers.get("x-robots-tag") ?? "").includes("noindex"), "/admin ma X-Robots-Tag: noindex");

  const webhook = await request("/api/stripe/webhook", { method: "POST", body: "{}", headers: { "content-type": "application/json" } });
  check(webhook.status === 400, `webhook Stripe bez podpisu → 400 (${webhook.status})`);
  const webhookBad = await request("/api/stripe/webhook", {
    method: "POST",
    body: "{}",
    headers: { "content-type": "application/json", "stripe-signature": "t=1,v1=deadbeef" },
  });
  check(webhookBad.status === 400 || webhookBad.status === 200, `webhook Stripe ze złym podpisem → odrzucony (${webhookBad.status}; 200 tylko w MOCK_MODE)`);

  const cron = await request("/api/cron/import");
  check(cron.status === 401, `cron bez sekretu → 401 (${cron.status})`);
  const cronBad = await request("/api/cron/import", { headers: { authorization: "Bearer wrong" } });
  check(cronBad.status === 401, `cron ze złym sekretem → 401 (${cronBad.status})`);
  const internal = await request("/api/internal/search-failed", { method: "POST", body: "{}" });
  check(internal.status === 401, `/api/internal/search-failed bez sekretu → 401 (${internal.status})`);
  const revalidate = await request("/api/revalidate-guides", { method: "POST" });
  check(revalidate.status === 401, `/api/revalidate-guides bez sekretu → 401 (${revalidate.status})`);

  const bigPhoto = "/9j/" + "A".repeat(3 * 1024 * 1024);
  const analyze = await request("/api/analyze", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ turnstileToken: "x", answers: {}, photo: { mediaType: "image/jpeg", base64: bigPhoto } }),
  }).catch(() => null);
  check(analyze?.status === 413, `za duże zdjęcie (3 MB) → 413 (${analyze?.status ?? "połączenie zerwane"})`);

  const home = await request("/");
  const headers = home.headers;
  check(!headers.has("x-powered-by"), "brak X-Powered-By");
  check(headers.get("x-content-type-options") === "nosniff", "X-Content-Type-Options: nosniff");
  check(headers.get("x-frame-options") === "DENY", "X-Frame-Options: DENY");
  check((headers.get("strict-transport-security") ?? "").includes("max-age=31536000"), "Strict-Transport-Security");
  check((headers.get("permissions-policy") ?? "").includes("camera=()"), "Permissions-Policy");
  const csp = headers.get("content-security-policy") ?? headers.get("content-security-policy-report-only") ?? "";
  check(csp.includes("frame-ancestors 'none'") && csp.includes("object-src 'none'"), "Content-Security-Policy (frame-ancestors, object-src)");
} else {
  console.log("\n(Testy HTTP pominięte: ustaw BASE_URL, np. BASE_URL=http://localhost:3000)");
}

console.log(failures === 0 ? "\nWszystkie testy przeszły." : `\nNiepowodzenia: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
