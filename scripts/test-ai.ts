/**
 * End-to-end test of the AI on the REAL stack: real Claude, the real Supabase database, Stripe in TEST mode.
 * It goes through the app itself (a local `next dev` started by this script), exactly like a visitor.
 *
 *   npm run test:ai                 full run (costs real AI: about 3 USD)
 *   npm run test:ai -- --only=free  only part A (free results)
 *   npm run test:ai -- --preflight  only check the setup (no AI, no writes)
 *   PowerShell: $env:TEST_ONLY = "free"; $env:TEST_PREFLIGHT = "1"
 *
 * Setup (.env.test-ai, set by the owner, never printed): MOCK_MODE=false, all service keys, STRIPE_SECRET_KEY must be
 * sk_test_..., STRIPE_WEBHOOK_SECRET whsec_..., Cloudflare's official Turnstile TEST keys (always pass),
 * PAYMENTS_ENABLED=true, SOURCE_MODE=web. The free and paid searches run in the deployed Edge Function run-search.
 *
 * A) 10 personas, free result: profile, real web search (ai_usage), 5 products from allowed shops, links and
 *    prices checked by our own code, fit, saved products, result memory, daily budget fallback.
 * B) 3 paid: single, single, pack of 10 (test payment + signed webhook event): 10 products, no repeats, <= 10
 *    searches, links and prices, 3 dedications; forced failure -> refund / pack credit back; pack exhausted -> 409;
 *    two concurrent redeems with one credit -> one wins.
 * C) Photos: only neutral images from scripts/fixtures/photos (no people). Skipped when the folder is empty.
 * D) Report: reports/ai-test-<date>.md (+ .json for the comparison with the previous run). No keys, no personal data.
 *
 * Test data is marked with source "test:ai" and deleted at the end (results, purchases); checked products stay.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseEnv } from "node:util";

import Stripe from "stripe";

import { usageCostUsd } from "../lib/ai/cost.ts";
import { checkUrl, type CheckDeps } from "../lib/catalog-check/check.ts";
import { ruleFor } from "../lib/catalog-check/domains.ts";
import { createPolite } from "../lib/catalog-check/polite.ts";
import { getSupabase } from "../lib/services/impl/supabase.ts";
import { isAllowedTag } from "../lib/tags.ts";

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

// .env.local is loaded by npm (--env-file); .env.test-ai overrides it, but only with NON-empty values, so the empty
// lines left from the template do not wipe out values that come from .env.local.
if (existsSync(".env.test-ai")) {
  for (const [key, value] of Object.entries(parseEnv(readFileSync(".env.test-ai", "utf8")))) if (value !== "") process.env[key] = value;
}

const args = process.argv.slice(2);
const only = args.find((arg) => arg.startsWith("--only="))?.split("=")[1] ?? process.env.TEST_ONLY ?? "all";
const preflightOnly = args.includes("--preflight") || process.env.TEST_PREFLIGHT === "1";
const PORT = Number(process.env.TEST_PORT ?? "3210");
const BASE = `http://localhost:${PORT}`;
const SOURCE = "test:ai";
const TURNSTILE_TEST_TOKEN = "XXXX.DUMMY.TOKEN.XXXX";
const USD_PLN = Number(process.env.USD_PLN_RATE ?? "4");
const startedAt = new Date();

type Status = "OK" | "BŁĄD" | "OSTRZ";
type Row = { persona: string; test: string; status: Status; details: string; seconds: number; costPln: number; severity: number };
const rows: Row[] = [];
function record(persona: string, test: string, status: Status, details: string, seconds = 0, costPln = 0, severity = 2): void {
  rows.push({ persona, test, status, details, seconds, costPln, severity });
  console.log(`  ${status.padEnd(5)} ${persona} · ${test}: ${details}`);
}

function preflight(): string[] {
  const problems: string[] = [];
  const need = [
    "NEXT_PUBLIC_SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "ANTHROPIC_API_KEY",
    "STRIPE_SECRET_KEY",
    "STRIPE_WEBHOOK_SECRET",
    "CRON_SECRET",
    "IP_HASH_SALT",
    "TURNSTILE_SECRET_KEY",
    "NEXT_PUBLIC_TURNSTILE_SITE_KEY",
  ];
  for (const name of need) if (!process.env[name]) problems.push(`brak zmiennej ${name}`);
  if (process.env.MOCK_MODE !== "false") problems.push("MOCK_MODE musi być false");
  if (process.env.STRIPE_SECRET_KEY && !process.env.STRIPE_SECRET_KEY.startsWith("sk_test_")) problems.push("STRIPE_SECRET_KEY musi być kluczem TESTOWYM (sk_test_...)");
  if (process.env.PAYMENTS_ENABLED !== "true") problems.push("PAYMENTS_ENABLED musi być true (tylko w .env.test-ai)");
  if ((process.env.SOURCE_MODE ?? "web") !== "web") problems.push("SOURCE_MODE musi być web");
  if (process.env.TURNSTILE_SECRET_KEY && !process.env.TURNSTILE_SECRET_KEY.startsWith("1x0000000000000000000000000000000AA"))
    problems.push("TURNSTILE_SECRET_KEY powinien być oficjalnym testowym kluczem Cloudflare (zawsze przepuszcza)");
  return problems;
}

const problems = preflight();
if (problems.length > 0) {
  console.error("Przygotowanie niekompletne:\n- " + problems.join("\n- "));
  console.error("\nUzupełnij .env.test-ai (wartości wpisujesz sam) i uruchom ponownie.");
  process.exit(1);
}
if (preflightOnly) {
  console.log("Przygotowanie OK (zmienne obecne, Stripe w trybie testowym, MOCK_MODE=false).");
  process.exit(0);
}

const db = getSupabase();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

// ---------------------------------------------------------------------------
// Local app server
// ---------------------------------------------------------------------------

let server: ChildProcess | null = null;

/**
 * Services the tested paths never use (e-mail: contact form and sign-ups; PostHog: analytics after consent) still
 * must be configured when MOCK_MODE=false. When they are missing, the TEST server gets harmless placeholders
 * (never the real app) and the report says so.
 */
function placeholdersForUnusedServices(): Record<string, string> {
  const placeholders: Record<string, string> = {};
  if (!/^re_/.test(process.env.RESEND_API_KEY ?? "")) placeholders.RESEND_API_KEY = "re_test_placeholder_not_used";
  if (!process.env.EMAIL_FROM) placeholders.EMAIL_FROM = "Test <test@example.com>";
  if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) placeholders.NEXT_PUBLIC_POSTHOG_KEY = "phc_test_placeholder_not_used";
  return placeholders;
}

async function startServer(extraEnv: Record<string, string> = {}): Promise<void> {
  const nextBin = path.join("node_modules", "next", "dist", "bin", "next");
  const placeholders = placeholdersForUnusedServices();
  if (Object.keys(placeholders).length > 0 && !rows.some((row) => row.test === "konfiguracja")) {
    record("przygotowanie", "konfiguracja", "OSTRZ", `zastępniki tylko dla serwera testowego (nieużywane w testach): ${Object.keys(placeholders).join(", ")}`);
  }
  const output: string[] = [];
  const scrub = (text: string) => text.replace(/\b(sk|whsec|re|sb|phc|pk)_[A-Za-z0-9_]{6,}/g, "[klucz]");
  server = spawn(process.execPath, [nextBin, "dev", "-p", String(PORT)], {
    env: { ...process.env, ...placeholders, ...extraEnv },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const keep = (chunk: unknown) => {
    output.push(scrub(String(chunk)));
    if (output.length > 60) output.shift();
  };
  server.stdout?.on("data", keep);
  server.stderr?.on("data", keep);
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${BASE}/`, { signal: AbortSignal.timeout(30_000) });
      if (response.ok) return;
    } catch {
      // not up yet
    }
    await sleep(2_000);
  }
  const reason = output.join("").split("\n").filter((line) => /error|invalid|missing|brak/i.test(line)).slice(0, 4).join(" | ");
  throw new Error(`Lokalny serwer nie wystartował w 3 minuty${reason ? `: ${reason.slice(0, 300)}` : ""}`);
}

async function stopServer(): Promise<void> {
  if (!server) return;
  const child = server;
  server = null;
  if (process.platform === "win32" && child.pid) spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
  else child.kill("SIGTERM");
  await sleep(3_000);
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// ---------------------------------------------------------------------------
// Personas
// ---------------------------------------------------------------------------

type Answers = {
  recipient: string;
  budget: number;
  occasion: string;
  interests: string[];
  lifestyle: string;
  giftType: string;
  ownedItems?: string;
  description?: string;
};
type Persona = { id: string; name: string; answers: Answers; fitTags: string[]; fitWords: string[] };

const PERSONAS: Persona[] = [
  {
    id: "P1",
    name: "tata-wędkarz do 100 zł",
    answers: { recipient: "dad", budget: 100, occasion: "birthday", interests: ["wędkarstwo", "turystyka", "narzędzia"], lifestyle: "traveler", giftType: "practical", description: "spędza weekendy nad jeziorem z wędką" },
    fitTags: ["wędkarstwo", "turystyka", "kemping", "narzędzia", "góry"],
    fitWords: ["węd", "przynęt", "spławik", "kołowrot", "ryb", "nóż", "latark", "termos", "krzes"],
  },
  {
    id: "P2",
    name: "dziewczyna, fanka anime, do 200 zł",
    answers: { recipient: "girlfriend", budget: 200, occasion: "birthday", interests: ["anime", "komiksy", "rysowanie"], lifestyle: "artist", giftType: "thing", description: "ogląda anime i czyta mangi" },
    fitTags: ["anime", "komiksy", "rysowanie", "kreatywność"],
    fitWords: ["anime", "mang", "figur", "plakat", "szkicown", "marker", "japon"],
  },
  {
    id: "P3",
    name: "kolega gracz do 50 zł",
    answers: { recipient: "friend", budget: 50, occasion: "birthday", interests: ["gry", "gadżety", "technologia"], lifestyle: "gamer", giftType: "funny", description: "gra na konsoli wieczorami" },
    fitTags: ["gry", "gadżety", "technologia"],
    fitWords: ["gra", "gamer", "pad", "konsol", "podkładk", "mysz", "kubek"],
  },
  {
    id: "P4",
    name: "mama-ogrodniczka do 100 zł",
    answers: { recipient: "mom", budget: 100, occasion: "other", interests: ["ogród", "rośliny", "relaks"], lifestyle: "homebody", giftType: "practical", description: "uwielbia swój ogródek i kwiaty" },
    fitTags: ["ogród", "rośliny", "relaks", "dom"],
    fitWords: ["ogrod", "roślin", "doniczk", "nasion", "rękawic", "konewk", "sekator", "kwiat"],
  },
  {
    id: "P5",
    name: "babcia do 100 zł",
    answers: { recipient: "grandparent", budget: 100, occasion: "christmas", interests: ["herbata", "książki", "relaks"], lifestyle: "homebody", giftType: "thing", description: "lubi wieczory z herbatą i książką" },
    fitTags: ["herbata", "książki", "relaks", "dom", "świece"],
    fitWords: ["herbat", "książk", "koc", "kubek", "świec", "czytn"],
  },
  {
    id: "P6",
    name: "szef do 200 zł",
    answers: { recipient: "boss", budget: 200, occasion: "christmas", interests: ["kawa", "książki", "zegarki"], lifestyle: "workaholic", giftType: "thing", description: "elegancki, dużo pracuje, pije dużo kawy" },
    fitTags: ["kawa", "książki", "zegarki", "torby"],
    fitWords: ["kaw", "książk", "zegar", "notes", "pióro", "kubek", "termos"],
  },
  {
    id: "P7",
    name: "osoba, która ma wszystko, do 200 zł",
    answers: { recipient: "friend", budget: 200, occasion: "birthday", interests: ["relaks", "podróże", "kreatywność"], lifestyle: "traveler", giftType: "experience", ownedItems: "ma wszystko, nic nie potrzebuje" },
    fitTags: ["relaks", "podróże", "kreatywność", "spa"],
    fitWords: ["voucher", "bon", "warsztat", "zestaw", "spa", "podróż", "kurs", "przeżyc"],
  },
  {
    id: "P8",
    name: "prezent last minute do 100 zł",
    answers: { recipient: "boyfriend", budget: 100, occasion: "other", interests: ["sport", "muzyka", "gadżety"], lifestyle: "athlete", giftType: "thing", description: "potrzebuję czegoś na jutro, dostawa szybko" },
    fitTags: ["sport", "muzyka", "gadżety", "fitness", "bieganie"],
    fitWords: ["sport", "słuchawk", "bidon", "opask", "fitness", "głośnik", "biega"],
  },
  {
    id: "P9",
    name: "budżet 500 zł",
    answers: { recipient: "mom", budget: 500, occasion: "christmas", interests: ["gotowanie", "kawa", "dom"], lifestyle: "homebody", giftType: "practical", description: "lubi gotować dla całej rodziny" },
    fitTags: ["gotowanie", "kawa", "dom", "pieczenie"],
    fitWords: ["kuchen", "garn", "patel", "ekspres", "kaw", "nóż", "robot", "gotow"],
  },
  {
    id: "P10",
    name: "sprzeczne odpowiedzi",
    answers: { recipient: "dad", budget: 50, occasion: "birthday", interests: ["sport", "książki", "relaks"], lifestyle: "athlete", giftType: "experience", description: "nie znosi sportu i nie czyta książek" },
    fitTags: ["sport", "książki", "relaks"],
    fitWords: [],
  },
];

// ---------------------------------------------------------------------------
// Helpers: app calls, database, checks
// ---------------------------------------------------------------------------

let ipCounter = 10;
const nextIp = () => `10.99.${Math.floor(ipCounter / 250)}.${ipCounter++ % 250}`;

type AnalyzeResult = { resultId: string; profile: { styleProfile: string; tags: string[]; avoid: string[] }; searching?: boolean; source: string };

async function postQuiz(answers: Answers, photo: { mediaType: "image/jpeg"; base64: string } | null = null): Promise<{ status: number; body: AnalyzeResult & { error?: string }; seconds: number }> {
  const started = Date.now();
  const response = await fetch(`${BASE}/api/analyze`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-real-ip": nextIp() },
    body: JSON.stringify({ turnstileToken: TURNSTILE_TEST_TOKEN, answers, photo, source: SOURCE }),
    signal: AbortSignal.timeout(180_000),
  });
  const body = (await response.json().catch(() => ({}))) as AnalyzeResult & { error?: string };
  return { status: response.status, body, seconds: (Date.now() - started) / 1000 };
}

async function waitFor(resultId: string, done: (status: { paidStatus: string; searchStatus: string }) => boolean, timeoutMs = 300_000): Promise<{ paidStatus: string; searchStatus: string } | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const response = await fetch(`${BASE}/api/results/${resultId}/status`).catch(() => null);
    if (response?.ok) {
      const status = (await response.json()) as { paidStatus: string; searchStatus: string };
      if (done(status)) return status;
    }
    await sleep(3_000);
  }
  return null;
}

type ResultDb = { id: string; product_ids: string[]; free_source: string | null; paid_status: string; web_picks: { url: string; pricePln: number; shopDomain: string; title: string }[] | null; dedications: string[] | null };
async function loadResult(id: string): Promise<ResultDb> {
  const { data, error } = await db.from("results").select("id, product_ids, free_source, paid_status, web_picks, dedications").eq("id", id).single();
  if (error) throw new Error(`Loading result failed (${error.code})`);
  return data as unknown as ResultDb;
}

type UsageRow = { step: string; input_tokens: number; output_tokens: number; web_searches: number; web_fetches: number };
async function usageOf(resultId: string): Promise<UsageRow[]> {
  const { data } = await db.from("ai_usage").select("step, input_tokens, output_tokens, web_searches, web_fetches").eq("result_id", resultId);
  return (data ?? []) as UsageRow[];
}
const costPln = (usage: UsageRow[]) => usage.reduce((sum, row) => sum + usageCostUsd(row), 0) * USD_PLN;

let allowedDomains: string[] = [];
const matches = (host: string, domain: string) => host === domain || host.endsWith(`.${domain}`);
const polite = createPolite({ intervalMs: 1_000, intervalFor: (host) => ruleFor(host).intervalMs, now: Date.now, sleep });

/** Opens each product page with our own checker: 200, a product (structured data), price on the page. */
async function checkLinks(items: { url: string; price: number }[], budget: number): Promise<{ ok: number; problems: string[]; warnings: string[] }> {
  const problems: string[] = [];
  const warnings: string[] = [];
  let ok = 0;
  await Promise.all(
    items.map(async (item) => {
      let host: string;
      try {
        host = new URL(item.url).hostname.toLowerCase();
      } catch {
        problems.push(`zły adres`);
        return;
      }
      if (!allowedDomains.some((domain) => matches(host, domain))) {
        problems.push(`${host}: spoza allowed_shops`);
        return;
      }
      if (item.price > budget) problems.push(`${host}: ${item.price} zł > budżet ${budget} zł`);
      const deps: CheckDeps = { fetch: (url, init) => fetch(url, init), isAllowedHost: (h) => allowedDomains.some((domain) => matches(h, domain)), beforeRequest: polite.waitForTurn };
      const outcome = await checkUrl(item.url, deps);
      if (outcome.kind === "ok") {
        if (outcome.price !== null && Math.abs(outcome.price - item.price) / item.price > 0.05) {
          problems.push(`${host}: cena ${item.price} zł, na stronie ${outcome.price} zł`);
        } else ok++;
      } else if (outcome.kind === "error" && outcome.reason === "blocked") {
        warnings.push(`${host}: sklep blokuje roboty, nie da się sprawdzić`);
      } else if (outcome.kind === "unverified") {
        warnings.push(`${host}: brak danych produktu na stronie (${outcome.reason})`);
      } else {
        problems.push(`${host}: ${outcome.kind}${"reason" in outcome ? `/${outcome.reason}` : ""}`);
      }
    }),
  );
  return { ok, problems, warnings };
}

// "Wygląda na to, że..." (= it seems) is not about looks.
const APPEARANCE = /(wygląd(?! na to)|twarz|uroda fizyczn|szczupł|grub|otył|wiek(?!u)|zmarszcz|atrakcyjn|ładn[aey] (osoba|kobieta|mężczyzna)|włosy|sylwetk)/i;

// ---------------------------------------------------------------------------
// A) Free results
// ---------------------------------------------------------------------------

const freeResults = new Map<string, { resultId: string; productUrls: string[] }>();
const freeCosts: number[] = [];

async function testFree(persona: Persona): Promise<void> {
  const label = `${persona.id} ${persona.name}`;
  const quiz = await postQuiz(persona.answers);
  if (quiz.status !== 200 || !quiz.body.resultId) {
    record(label, "quiz", "BŁĄD", `HTTP ${quiz.status}: ${quiz.body.error ?? "brak wyniku"}`, quiz.seconds, 0, 0);
    return;
  }
  const resultId = quiz.body.resultId;

  // 1) style profile
  const profile = quiz.body.profile;
  const sentences = profile.styleProfile.split(/[.!?](\s|$)/).filter((part) => part.trim().length > 3).length;
  const badTags = profile.tags.filter((tag) => !isAllowedTag(tag));
  const polish = /[ąćęłńóśźż]|\b(i|w|na|lubi|się|jest)\b/i.test(profile.styleProfile);
  const profileProblems = [
    sentences !== 2 ? `${sentences} zdań zamiast 2` : "",
    badTags.length ? `tagi spoza listy: ${badTags.join(", ")}` : "",
    !polish ? "nie po polsku" : "",
    APPEARANCE.test(profile.styleProfile) ? "komentarz o wyglądzie" : "",
  ].filter(Boolean);
  record(label, "1 profil", profileProblems.length ? "BŁĄD" : "OK", profileProblems.join("; ") || `${sentences} zdania, tagi: ${profile.tags.join(", ")}`);

  const finished = await waitFor(resultId, (status) => status.searchStatus === "ready", 300_000);
  const totalSeconds = quiz.seconds + (finished ? 0 : 300);
  if (!finished) {
    record(label, "wyszukiwanie", "BŁĄD", "wynik nie gotowy w 5 minut", totalSeconds, 0, 0);
    return;
  }
  const result = await loadResult(resultId);
  const usage = await usageOf(resultId);
  const cost = costPln(usage);
  freeCosts.push(cost);

  // 2) the search really happened
  const search = usage.find((row) => row.step === "free_web_search");
  if (result.free_source !== "web") {
    record(label, "2 wyszukiwanie", "BŁĄD", `źródło wyniku: ${result.free_source} (oczekiwane web)`, totalSeconds, cost, 1);
  } else if (!search) {
    record(label, "2 wyszukiwanie", "BŁĄD", "brak wpisu free_web_search w ai_usage", totalSeconds, cost, 1);
  } else {
    const okSearch = search.web_searches > 0 && search.web_searches <= 4 && search.web_fetches > 0;
    record(label, "2 wyszukiwanie", okSearch ? "OK" : "BŁĄD", `wyszukiwania ${search.web_searches} (maks. 4), pobrania stron ${search.web_fetches}`, totalSeconds, cost, 1);
  }

  // 3) 5 products, links, prices, max 2 per shop
  const { data: products } = await db.from("products").select("id, url, affiliate_url, price_pln, network, tags, name").in("id", result.product_ids);
  const list = (products ?? []) as { id: string; url: string | null; affiliate_url: string; price_pln: number; network: string; tags: string[]; name: string }[];
  const perShop = new Map<string, number>();
  for (const product of list) {
    const host = new URL(product.url ?? product.affiliate_url).hostname;
    perShop.set(host, (perShop.get(host) ?? 0) + 1);
  }
  const links = await checkLinks(list.map((product) => ({ url: product.url ?? product.affiliate_url, price: Number(product.price_pln) })), persona.answers.budget);
  const shopProblem = [...perShop.entries()].filter(([, count]) => count > 2).map(([host, count]) => `${host}: ${count} produkty`);
  const productProblems = [result.product_ids.length !== 5 ? `${result.product_ids.length} produktów zamiast 5` : "", ...links.problems, ...shopProblem].filter(Boolean);
  record(
    label,
    "3 produkty i linki",
    productProblems.length ? "BŁĄD" : links.warnings.length ? "OSTRZ" : "OK",
    [`${links.ok}/${list.length} sprawdzone`, ...productProblems, ...links.warnings].join("; "),
    0,
    0,
    1,
  );

  // 4) fit
  const fitting = list.filter(
    (product) => product.tags.some((tag) => persona.fitTags.includes(tag)) || persona.fitWords.some((word) => product.name.toLowerCase().includes(word)),
  ).length;
  if (persona.id === "P10") record(label, "4 dopasowanie", "OSTRZ", `sprzeczne odpowiedzi: ${fitting}/5 pasuje do zainteresowań (do oceny ręcznej)`);
  else record(label, "4 dopasowanie", fitting >= 3 ? "OK" : "BŁĄD", `${fitting}/5 pasuje do zainteresowań`, 0, 0, 2);

  // 5) saved as direct products
  const direct = list.filter((product) => product.network === "direct").length;
  record(label, "5 zapis w products", direct === list.length && list.length > 0 ? "OK" : "BŁĄD", `${direct}/${list.length} jako network=direct`);

  freeResults.set(persona.id, { resultId, productUrls: list.map((product) => product.url ?? product.affiliate_url) });
}

async function testMemory(persona: Persona): Promise<void> {
  const label = `${persona.id} ${persona.name}`;
  const quiz = await postQuiz(persona.answers);
  if (quiz.status !== 200) {
    record(label, "6 pamięć wyników", "BŁĄD", `HTTP ${quiz.status}`, quiz.seconds);
    return;
  }
  const result = await loadResult(quiz.body.resultId);
  const usage = await usageOf(quiz.body.resultId);
  const searches = usage.reduce((sum, row) => sum + row.web_searches, 0);
  const ok = result.free_source === "cache" && searches === 0 && usage.length === 0;
  record(label, "6 pamięć wyników", ok ? "OK" : "BŁĄD", `źródło ${result.free_source}, wpisów ai_usage ${usage.length}, wyszukiwań ${searches}, ${quiz.seconds.toFixed(1)} s`, quiz.seconds, costPln(usage), 1);
}

async function testDailyBudget(persona: Persona): Promise<void> {
  const label = `${persona.id} ${persona.name}`;
  const quiz = await postQuiz({ ...persona.answers, occasion: persona.answers.occasion === "other" ? "birthday" : "other" });
  if (quiz.status !== 200) {
    record(label, "7 dzienny limit", "BŁĄD", `HTTP ${quiz.status}`, quiz.seconds);
    return;
  }
  const result = await loadResult(quiz.body.resultId);
  const usage = await usageOf(quiz.body.resultId);
  const searches = usage.reduce((sum, row) => sum + row.web_searches, 0);
  const ok = result.free_source === "catalog_budget" && searches === 0 && result.product_ids.length > 0;
  record(label, "7 dzienny limit", ok ? "OK" : "BŁĄD", `źródło ${result.free_source}, produktów ${result.product_ids.length}, wyszukiwań ${searches}`, quiz.seconds, costPln(usage), 1);
}

// ---------------------------------------------------------------------------
// B) Paid
// ---------------------------------------------------------------------------

const paidCosts: number[] = [];

async function testPayment(amountGrosze: number): Promise<string> {
  const intent = await stripe.paymentIntents.create({
    amount: amountGrosze,
    currency: "pln",
    payment_method: "pm_card_visa",
    automatic_payment_methods: { enabled: true, allow_redirects: "never" },
    confirm: true,
    description: "test:ai",
  });
  if (intent.status !== "succeeded") throw new Error(`Test payment ${intent.status}`);
  return intent.id;
}

async function sendCheckoutCompleted(resultId: string, offer: "single" | "pack10", amountGrosze: number, paymentIntentId: string): Promise<{ status: number; sessionId: string }> {
  const sessionId = `cs_test_ai_${randomUUID().replace(/-/g, "")}`;
  const payload = JSON.stringify({
    id: `evt_test_ai_${randomUUID().replace(/-/g, "")}`,
    object: "event",
    type: "checkout.session.completed",
    api_version: "2024-06-20",
    created: Math.floor(Date.now() / 1000),
    data: {
      object: {
        id: sessionId,
        object: "checkout.session",
        payment_status: "paid",
        amount_total: amountGrosze,
        currency: "pln",
        payment_intent: paymentIntentId,
        client_reference_id: resultId,
        metadata: { result_id: resultId, offer },
      },
    },
  });
  const signature = stripe.webhooks.generateTestHeaderString({ payload, secret: process.env.STRIPE_WEBHOOK_SECRET! });
  const response = await fetch(`${BASE}/api/stripe/webhook`, { method: "POST", headers: { "content-type": "application/json", "stripe-signature": signature }, body: payload });
  return { status: response.status, sessionId };
}

async function checkPaidResult(label: string, persona: Persona, resultId: string, seconds: number): Promise<void> {
  const result = await loadResult(resultId);
  const usage = await usageOf(resultId);
  const paidUsage = usage.filter((row) => row.step === "web_search" || row.step === "dedications");
  const cost = costPln(paidUsage);
  paidCosts.push(cost);
  if (result.paid_status !== "ready") {
    record(label, "B wynik płatny", "BŁĄD", `status ${result.paid_status}`, seconds, cost, 0);
    return;
  }
  const picks = result.web_picks ?? [];
  const free = new Set(freeResults.get(persona.id)?.productUrls ?? []);
  const repeats = picks.filter((pick) => free.has(pick.url)).length;
  const searches = paidUsage.reduce((sum, row) => sum + row.web_searches, 0);
  const basic = [picks.length !== 10 ? `${picks.length} produktów zamiast 10` : "", repeats ? `${repeats} powtórek z darmowego` : "", searches > 10 ? `${searches} wyszukiwań (> 10)` : ""].filter(Boolean);
  record(label, "B 10 produktów, bez powtórek, ≤10 wyszukiwań", basic.length ? "BŁĄD" : "OK", basic.join("; ") || `${picks.length} produktów, wyszukiwań ${searches}`, seconds, cost, 1);
  const links = await checkLinks(picks.map((pick) => ({ url: pick.url, price: pick.pricePln })), persona.answers.budget);
  record(label, "B linki i ceny", links.problems.length ? "BŁĄD" : links.warnings.length ? "OSTRZ" : "OK", [`${links.ok}/${picks.length} sprawdzone`, ...links.problems, ...links.warnings].join("; "), 0, 0, 1);
  const dedications = result.dedications ?? [];
  const longOnes = dedications.filter((text) => text.split(/\s+/).filter(Boolean).length > 25);
  const notPolish = dedications.filter((text) => !/[ąćęłńóśźż]|\b(i|w|na|się|dla|ci|cię)\b/i.test(text));
  const dedProblems = [dedications.length !== 3 ? `${dedications.length} dedykacji` : "", longOnes.length ? `${longOnes.length} dłuższe niż 25 słów` : "", notPolish.length ? `${notPolish.length} nie po polsku` : ""].filter(Boolean);
  record(label, "B 3 dedykacje", dedProblems.length ? "BŁĄD" : "OK", dedProblems.join("; ") || "3 dedykacje po polsku, do 25 słów", 0, 0, 2);
}

async function forceFailure(resultId: string, purchaseId: string): Promise<number> {
  const response = await fetch(`${BASE}/api/internal/search-failed`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-internal-secret": process.env.CRON_SECRET! },
    body: JSON.stringify({ kind: "paid", resultId, purchaseId, reason: "test_forced_failure" }),
  });
  return response.status;
}

async function purchaseFor(resultId: string): Promise<{ id: string; pack_code: string | null; searches_left: number; status: string; payment_intent_id: string | null } | null> {
  const { data } = await db.from("purchases").select("id, pack_code, searches_left, status, payment_intent_id").eq("result_id", resultId).order("created_at", { ascending: false }).limit(1);
  return (data?.[0] as never) ?? null;
}

async function redeem(resultId: string, packCode: string): Promise<number> {
  const response = await fetch(`${BASE}/api/pack/redeem`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: `pk=${packCode}`, "x-real-ip": nextIp() },
    body: JSON.stringify({ resultId }),
  });
  return response.status;
}

async function freshResult(persona: Persona): Promise<string | null> {
  // A result without a web search (budget fallback is not needed: an identical quiz is served from memory, no cost).
  const quiz = await postQuiz(persona.answers);
  return quiz.status === 200 ? quiz.body.resultId : null;
}

async function testPaid(): Promise<void> {
  // B1, B2: single searches on the free results of P1 and P2
  for (const persona of PERSONAS.slice(0, 2)) {
    const label = `${persona.id} płatne (pojedyncze)`;
    const free = freeResults.get(persona.id);
    if (!free) {
      record(label, "B płatność", "BŁĄD", "brak darmowego wyniku", 0, 0, 0);
      continue;
    }
    const started = Date.now();
    const intent = await testPayment(499);
    const webhook = await sendCheckoutCompleted(free.resultId, "single", 499, intent);
    record(label, "B webhook", webhook.status === 200 ? "OK" : "BŁĄD", `HTTP ${webhook.status}`, 0, 0, 0);
    await waitFor(free.resultId, (status) => status.paidStatus === "ready" || status.paidStatus === "refunded", 420_000);
    await checkPaidResult(label, persona, free.resultId, (Date.now() - started) / 1000);
  }

  // B3: pack of 10 on P5's free result
  const packPersona = PERSONAS[4];
  const packLabel = `${packPersona.id} płatne (pakiet 10)`;
  const packFree = freeResults.get(packPersona.id);
  if (!packFree) {
    record(packLabel, "B pakiet", "BŁĄD", "brak darmowego wyniku", 0, 0, 0);
    return;
  }
  const packStarted = Date.now();
  const packIntent = await testPayment(1499);
  const packHook = await sendCheckoutCompleted(packFree.resultId, "pack10", 1499, packIntent);
  record(packLabel, "B webhook pakietu", packHook.status === 200 ? "OK" : "BŁĄD", `HTTP ${packHook.status}`, 0, 0, 0);
  await waitFor(packFree.resultId, (status) => status.paidStatus === "ready" || status.paidStatus === "refunded", 420_000);
  await checkPaidResult(packLabel, packPersona, packFree.resultId, (Date.now() - packStarted) / 1000);
  const pack = await purchaseFor(packFree.resultId);
  if (!pack?.pack_code) {
    record(packLabel, "B pakiet", "BŁĄD", "brak kodu pakietu", 0, 0, 0);
    return;
  }
  record(packLabel, "B pakiet: zużycie 1. wyszukiwania", pack.searches_left === 9 ? "OK" : "BŁĄD", `pozostało ${pack.searches_left}/10`);

  // 11th attempt: the pack is used up
  await db.from("purchases").update({ searches_left: 0 }).eq("id", pack.id);
  const extra = await freshResult(PERSONAS[5]);
  if (extra) {
    const status = await redeem(extra, pack.pack_code);
    record(packLabel, "B pakiet: 11. próba odrzucona", status === 409 ? "OK" : "BŁĄD", `HTTP ${status}`, 0, 0, 1);
  }

  // two concurrent redeems with one credit left: exactly one wins
  await db.from("purchases").update({ searches_left: 1 }).eq("id", pack.id);
  const first = await freshResult(PERSONAS[6]);
  const second = await freshResult(PERSONAS[7]);
  if (first && second) {
    const statuses = await Promise.all([redeem(first, pack.pack_code), redeem(second, pack.pack_code)]);
    const after = await purchaseFor(packFree.resultId);
    const wins = statuses.filter((status) => status === 200).length;
    record(packLabel, "B pakiet: 2 równoczesne użycia, 1 kredyt", wins === 1 && after?.searches_left === 0 ? "OK" : "BŁĄD", `odpowiedzi ${statuses.join(" i ")}, pozostało ${after?.searches_left}`, 0, 0, 0);

    // forced failure of the redeemed pack search: the credit comes back
    const winner = statuses[0] === 200 ? first : second;
    const failStatus = await forceFailure(winner, pack.id);
    await sleep(5_000);
    const restored = await purchaseFor(packFree.resultId);
    record(packLabel, "B niepowodzenie: kredyt pakietu wraca", failStatus === 200 && restored?.searches_left === 1 ? "OK" : "BŁĄD", `callback HTTP ${failStatus}, pozostało ${restored?.searches_left}`, 0, 0, 0);
  }

  // forced failure of a single search: money back (Stripe test refund)
  const refundPersona = PERSONAS[3];
  const refundLabel = `${refundPersona.id} płatne (wymuszone niepowodzenie)`;
  const refundFree = freeResults.get(refundPersona.id);
  if (refundFree) {
    const intent = await testPayment(499);
    await sendCheckoutCompleted(refundFree.resultId, "single", 499, intent);
    const purchase = await purchaseFor(refundFree.resultId);
    const failStatus = purchase ? await forceFailure(refundFree.resultId, purchase.id) : 0;
    await sleep(8_000);
    const refunds = await stripe.refunds.list({ payment_intent: intent, limit: 5 });
    const after = await purchaseFor(refundFree.resultId);
    const ok = failStatus === 200 && refunds.data.length > 0 && after?.status === "refunded";
    record(refundLabel, "B niepowodzenie: zwrot pieniędzy", ok ? "OK" : "BŁĄD", `callback HTTP ${failStatus}, zwrotów w Stripe ${refunds.data.length}, zakup: ${after?.status}`, 0, 0, 0);
    // The search started by the payment keeps running in the Edge Function: what does it leave behind?
    await waitFor(refundFree.resultId, (status) => status.paidStatus !== "pending" && status.paidStatus !== "searching", 420_000);
    const final = await loadResult(refundFree.resultId);
    record(refundLabel, "B po zwrocie wynik się nie zmienia", final.paid_status === "refunded" ? "OK" : "BŁĄD", `końcowy status wyniku: ${final.paid_status}`, 0, 0, 0);
  }
}

// ---------------------------------------------------------------------------
// C) Photos (neutral images only)
// ---------------------------------------------------------------------------

async function testPhotos(): Promise<void> {
  const folder = path.join("scripts", "fixtures", "photos");
  const files = existsSync(folder) ? readdirSync(folder).filter((file) => /\.jpe?g$/i.test(file)) : [];
  if (files.length === 0) {
    record("C zdjęcia", "zdjęcia", "OSTRZ", "pominięte: brak plików JPEG w scripts/fixtures/photos (neutralne, bez ludzi)");
    return;
  }
  for (const file of files.slice(0, 3)) {
    const base64 = readFileSync(path.join(folder, file)).toString("base64");
    if (base64.length > 400_000) {
      record(`C ${file}`, "zdjęcie", "OSTRZ", "plik za duży (maks. ok. 300 KB)");
      continue;
    }
    const quiz = await postQuiz({ ...PERSONAS[5].answers, occasion: "other", description: undefined }, { mediaType: "image/jpeg", base64 });
    const profile = quiz.body.profile;
    const ok = quiz.status === 200 && !!profile && !APPEARANCE.test(profile.styleProfile) && profile.tags.every(isAllowedTag);
    record(`C ${file}`, "profil ze zdjęcia", ok ? "OK" : "BŁĄD", quiz.status === 200 ? `tagi: ${profile.tags.join(", ")}` : `HTTP ${quiz.status}`, quiz.seconds, 0, 1);
    if (quiz.body.resultId) await waitFor(quiz.body.resultId, (status) => status.searchStatus === "ready", 300_000);
  }
}

// ---------------------------------------------------------------------------
// D) Report
// ---------------------------------------------------------------------------

function writeReport(): string {
  const stamp = startedAt.toISOString().slice(0, 16).replace(/[:T]/g, "-");
  mkdirSync("reports", { recursive: true });
  const jsonPath = path.join("reports", `ai-test-${stamp}.json`);
  const mdPath = path.join("reports", `ai-test-${stamp}.md`);
  const previous = readdirSync("reports")
    .filter((file) => /^ai-test-.*\.json$/.test(file) && file !== path.basename(jsonPath))
    .sort()
    .at(-1);
  const prev = previous ? (JSON.parse(readFileSync(path.join("reports", previous), "utf8")) as { passRate: number; rows: Row[] }) : null;

  const counted = rows.filter((row) => row.status !== "OSTRZ");
  const passed = counted.filter((row) => row.status === "OK").length;
  const passRate = counted.length > 0 ? passed / counted.length : 0;
  const avg = (values: number[]) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0);
  const fmt = (value: number) => value.toFixed(2).replace(".", ",");
  const errors = rows.filter((row) => row.status === "BŁĄD").sort((a, b) => a.severity - b.severity);

  const lines = [
    `# Test AI na prawdziwym stosie: ${startedAt.toISOString().slice(0, 16).replace("T", " ")} UTC`,
    "",
    `Zaliczone: **${passed}/${counted.length} (${Math.round(passRate * 100)}%)**, ostrzeżenia: ${rows.length - counted.length}.`,
    `Średni koszt AI: darmowy wynik **${fmt(avg(freeCosts))} zł**, płatny wynik **${fmt(avg(paidCosts))} zł** (kurs ${USD_PLN} zł/USD).`,
    prev ? `Poprzedni przebieg (${previous}): ${Math.round(prev.passRate * 100)}% zaliczonych.` : "",
    "",
    "## Błędy od najważniejszych",
    "",
    ...(errors.length ? errors.map((row) => `- **${row.persona} · ${row.test}**: ${row.details}`) : ["Brak."]),
    "",
    "## Wszystkie testy",
    "",
    "| Persona | Test | Wynik | Szczegóły | Czas (s) | Koszt (zł) |",
    "|---|---|---|---|---|---|",
    ...rows.map((row) => `| ${row.persona} | ${row.test} | ${row.status} | ${row.details.replace(/\|/g, "/")} | ${row.seconds ? row.seconds.toFixed(1) : ""} | ${row.costPln ? fmt(row.costPln) : ""} |`),
  ];
  if (prev) {
    lines.push("", "## Porównanie z poprzednim przebiegiem", "", "| Persona | Test | Wcześniej | Teraz |", "|---|---|---|---|");
    for (const row of rows) {
      const before = prev.rows.find((item) => item.persona === row.persona && item.test === row.test);
      if (before && before.status !== row.status) lines.push(`| ${row.persona} | ${row.test} | ${before.status} | ${row.status} |`);
    }
  }
  writeFileSync(mdPath, lines.filter((line) => line !== undefined).join("\n") + "\n");
  writeFileSync(jsonPath, JSON.stringify({ startedAt, passRate, rows }, null, 2));
  return mdPath;
}

async function cleanup(): Promise<void> {
  const { data } = await db.from("results").select("id").eq("source", SOURCE);
  const ids = (data ?? []).map((row) => row.id);
  if (ids.length === 0) return;
  await db.from("purchases").delete().in("result_id", ids);
  await db.from("clicks").delete().in("result_id", ids);
  await db.from("results").delete().in("id", ids);
  console.log(`Sprzątanie: usunięto ${ids.length} testowych wyników (z płatnościami). Sprawdzone produkty zostają w puli.`);
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

try {
  const { data: shops } = await db.from("allowed_shops").select("domain").eq("active", true);
  allowedDomains = (shops ?? []).map((row) => row.domain);

  console.log("Start lokalnego serwera (MOCK_MODE=false)...");
  await startServer();

  if (only === "all" || only === "free") {
    console.log("\nA) Darmowe wyniki dla 10 person");
    for (const persona of PERSONAS) await testFree(persona);
    console.log("\nA6) Pamięć wyników");
    await testMemory(PERSONAS[0]);
  }
  if (only === "all" || only === "photos") {
    console.log("\nC) Zdjęcia");
    await testPhotos();
  }
  if (only === "all" || only === "paid") {
    console.log("\nB) Płatne");
    await testPaid();
  }
  if (only === "all" || only === "free") {
    console.log("\nA7) Dzienny limit (serwer z DAILY_AI_BUDGET_PLN=0.01)");
    await stopServer();
    await startServer({ DAILY_AI_BUDGET_PLN: "0.01" });
    await testDailyBudget(PERSONAS[2]);
  }
} catch (error) {
  record("przebieg", "przerwany", "BŁĄD", error instanceof Error ? error.message.slice(0, 200) : "unknown", 0, 0, 0);
} finally {
  await stopServer();
  const report = writeReport();
  await cleanup().catch(() => console.log("Sprzątanie nie powiodło się: usuń wyniki z source=test:ai ręcznie."));
  console.log(`\nRaport: ${report}`);
}
