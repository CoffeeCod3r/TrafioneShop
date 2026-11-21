/**
 * Preflight check of the real external services.
 *
 *   npm run check:services
 *
 * Checks (read-only, except one test row that is created and removed again):
 *   1. required environment variables are set and well-formed,
 *   2. Supabase: product count, write + delete of a test row in `results`,
 *   3. Supabase RLS: the anon client can neither read nor write any table,
 *   4. Stripe: account is reachable, test-mode key, BLIK is available.
 *
 * Output is a list of OK / BŁĄD lines (in Polish) with a short hint on how to fix each error.
 * Secret values are never printed (error messages are scrubbed as well).
 * Exit code is 1 when any check fails.
 *
 * This script deliberately talks to Supabase/Stripe directly instead of through
 * getRepos()/getPayments(): it must test the real services, regardless of MOCK_MODE.
 */
import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";

import { parseFeedSources } from "../lib/feeds/config.ts";

// ---------------------------------------------------------------------------
// Tiny reporting framework
// ---------------------------------------------------------------------------

/** An expected failure with a hint for the developer. */
class CheckError extends Error {
  readonly fix: string;
  constructor(message: string, fix: string) {
    super(message);
    this.fix = fix;
  }
}

type Result = { ok: boolean; name: string; detail: string; fix?: string };
const results: Result[] = [];

const SECRET_NAMES = [
  "SUPABASE_SERVICE_ROLE_KEY",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "ANTHROPIC_API_KEY",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "TURNSTILE_SECRET_KEY",
  "RESEND_API_KEY",
  "CRON_SECRET",
  "IP_HASH_SALT",
  "EMAIL_TOKEN_SECRET",
  "ADMIN_PASSWORD",
];

/** Removes any configured secret value from a message before it is printed. */
function redact(text: string): string {
  let out = text;
  for (const name of SECRET_NAMES) {
    const value = process.env[name];
    if (value && value.length >= 6) out = out.split(value).join("***");
  }
  return out;
}

function record(name: string, ok: boolean, detail: string, fix?: string) {
  results.push({ ok, name, detail: redact(detail), fix: fix ? redact(fix) : undefined });
}

async function check(name: string, run: () => Promise<string> | string): Promise<void> {
  try {
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new CheckError("przekroczono limit czasu (20 s)", "Sprawdź połączenie z internetem i adres usługi.")), 20_000).unref(),
    );
    record(name, true, await Promise.race([Promise.resolve(run()), timeout]));
  } catch (error) {
    if (error instanceof CheckError) record(name, false, error.message, error.fix);
    else record(name, false, error instanceof Error ? error.message : String(error), "Nieoczekiwany błąd – zobacz komunikat powyżej.");
  }
}

// ---------------------------------------------------------------------------
// 1. Environment variables
// ---------------------------------------------------------------------------

type EnvRule = { name: string; hint: string; valid: (value: string) => boolean };

const startsWith = (prefix: string) => (value: string) => value.startsWith(prefix);
const minLength = (length: number) => (value: string) => value.length >= length;
const isUrl = (value: string) => {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
};
const validFeeds = (value: string) => {
  try {
    parseFeedSources(value);
    return true;
  } catch {
    return false;
  }
};

// Mirrors serviceSchema in lib/env.ts (everything required when MOCK_MODE=false).
const ENV_RULES: EnvRule[] = [
  { name: "NEXT_PUBLIC_SUPABASE_URL", hint: "Supabase → Project Settings → API → Project URL", valid: isUrl },
  { name: "NEXT_PUBLIC_SUPABASE_ANON_KEY", hint: "Supabase → Project Settings → API Keys → klucz publishable (anon)", valid: minLength(1) },
  { name: "SUPABASE_SERVICE_ROLE_KEY", hint: "Supabase → Project Settings → API Keys → klucz secret (service_role)", valid: minLength(1) },
  { name: "ANTHROPIC_API_KEY", hint: "console.anthropic.com → API Keys (zaczyna się od sk-ant-)", valid: (v) => startsWith("sk-ant-")(v) && v.length > 12 },
  { name: "STRIPE_SECRET_KEY", hint: "Stripe Dashboard → Developers → API keys (w trybie testowym sk_test_…)", valid: (v) => /^sk_(test|live)_.{8,}/.test(v) },
  { name: "STRIPE_WEBHOOK_SECRET", hint: "Stripe → Developers → Webhooks → signing secret albo `stripe listen` (whsec_…)", valid: (v) => startsWith("whsec_")(v) && v.length > 10 },
  { name: "NEXT_PUBLIC_TURNSTILE_SITE_KEY", hint: "Cloudflare → Turnstile → site key (klucz testowy: 1x00000000000000000000AA)", valid: minLength(1) },
  { name: "TURNSTILE_SECRET_KEY", hint: "Cloudflare → Turnstile → secret key", valid: minLength(1) },
  { name: "RESEND_API_KEY", hint: "resend.com → API Keys (zaczyna się od re_)", valid: (v) => startsWith("re_")(v) && v.length > 5 },
  { name: "EMAIL_FROM", hint: 'Nadawca z domeny zweryfikowanej w Resend, np. "Prezentoskop <prezenty@twojadomena.pl>"', valid: minLength(3) },
  { name: "NEXT_PUBLIC_POSTHOG_KEY", hint: "PostHog → Project settings → Project API key (phc_…)", valid: minLength(4) },
  { name: "CRON_SECRET", hint: "Losowy ciąg, min. 32 znaki (np. `openssl rand -hex 32`)", valid: minLength(32) },
  { name: "IP_HASH_SALT", hint: "Losowy ciąg, min. 32 znaki", valid: minLength(32) },
  { name: "EMAIL_TOKEN_SECRET", hint: "Losowy ciąg, min. 32 znaki", valid: minLength(32) },
  { name: "ADMIN_PASSWORD", hint: "Hasło do /admin, min. 12 znaków", valid: minLength(12) },
  { name: "FEED_URLS", hint: 'Wpisy "sieć=url" oddzielone białymi znakami (awin, webepartners, gmc), całość w cudzysłowie', valid: validFeeds },
];

const envOk = new Set<string>();

function checkEnv() {
  for (const rule of ENV_RULES) {
    const value = process.env[rule.name];
    if (value === undefined || value.trim() === "") {
      record(`ENV ${rule.name}`, false, "nie ustawiona", `Dodaj ${rule.name} do .env.local. ${rule.hint}.`);
    } else if (!rule.valid(value)) {
      record(`ENV ${rule.name}`, false, "ma niepoprawny format", `Popraw ${rule.name} w .env.local. ${rule.hint}.`);
    } else {
      record(`ENV ${rule.name}`, true, "ustawiona");
      envOk.add(rule.name);
    }
  }

  // Secrets must never be exposed to the browser through NEXT_PUBLIC_*.
  const leaked = Object.keys(process.env).filter((key) => /^NEXT_PUBLIC_.*(SECRET|SERVICE_ROLE|PRIVATE)/i.test(key));
  record(
    "ENV brak sekretów w NEXT_PUBLIC_*",
    leaked.length === 0,
    leaked.length === 0 ? "nie znaleziono" : `podejrzane: ${leaked.join(", ")}`,
    leaked.length ? "Zmień nazwę zmiennych, usuwając prefiks NEXT_PUBLIC_ – inaczej trafią do kodu w przeglądarce." : undefined,
  );

  // Promo deadline of the pack of 8 (optional; the built-in default is Black Friday 2026).
  const promoRaw = process.env.PROMO_ENDS_AT?.trim();
  const promoEnd = new Date(promoRaw || "2026-11-27T23:59:59+01:00");
  if (Number.isNaN(promoEnd.getTime())) {
    record("Promocja: PROMO_ENDS_AT", false, "niepoprawna data", "Wpisz datę w formacie ISO 8601, np. 2026-11-27T23:59:59+01:00, albo usuń zmienną.");
  } else {
    const active = promoEnd.getTime() > Date.now();
    record(
      "Promocja: koniec ceny promocyjnej pakietu",
      true,
      `${promoEnd.toLocaleString("pl-PL", { timeZone: "Europe/Warsaw" })} (${active ? "trwa" : "zakończona, pakiet kosztuje 19,99 zł"})`,
    );
  }

  const mock = (process.env.MOCK_MODE ?? "true").trim().toLowerCase();
  if (["true", "1", "yes", "on"].includes(mock)) {
    console.log("Info: MOCK_MODE=true – aplikacja używa usług demo, ale ten skrypt i tak sprawdza prawdziwe usługi.\n");
  }
}

// ---------------------------------------------------------------------------
// 2. + 3. Supabase
// ---------------------------------------------------------------------------

// Every table created in supabase/migrations (all must be closed to anon).
const TABLES = ["products", "results", "allowed_shops", "clicks", "purchases", "subscribers", "rate_limits", "ai_usage", "quiz_starts"];

const authOptions = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };

function need(names: string[], what: string) {
  const missing = names.filter((name) => !envOk.has(name));
  if (missing.length) {
    throw new CheckError(`pominięto – brakuje lub błędne: ${missing.join(", ")}`, `Najpierw popraw zmienne z listy powyżej (${what}).`);
  }
}

const SUPABASE_FIX = "Sprawdź NEXT_PUBLIC_SUPABASE_URL i klucz service_role (Supabase → Project Settings → API).";

async function checkSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

  const admin = () => createClient(url, serviceKey, authOptions);

  await check("Supabase: liczba produktów (service role)", async () => {
    need(["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"], "połączenie z Supabase");
    const { count, error } = await admin().from("products").select("*", { count: "exact", head: true });
    if (error) {
      const missingTable = error.code === "42P01" || error.code === "PGRST205";
      throw new CheckError(
        `odczyt nie powiódł się: ${error.message || error.code || "brak szczegółów (najpewniej błędny klucz service role)"}`,
        missingTable ? "Zastosuj migracje: `supabase db push` (folder supabase/migrations)." : SUPABASE_FIX,
      );
    }
    if (!count) {
      throw new CheckError("połączono, ale tabela `products` jest pusta", "Załaduj katalog: ustaw MOCK_MODE=false i uruchom `npm run seed` (albo `npm run import:feed`).");
    }
    return `${count} produktów`;
  });

  await check("Supabase: katalog bez produktów demo (wymagane na produkcji)", async () => {
    need(["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"], "połączenie z Supabase");
    const { count, error } = await admin().from("products").select("*", { count: "exact", head: true }).eq("network", "demo");
    if (error) throw new CheckError(`odczyt nie powiódł się: ${error.message || error.code || "brak szczegółów"}`, SUPABASE_FIX);
    if (count) {
      throw new CheckError(
        `${count} produktów z sieci „demo” (ich linki /demo-produkt/… dają 404 poza trybem demo, a katalog jest za mały do trafnych wyników)`,
        "Na produkcji zaimportuj prawdziwe feedy: ustaw FEED_URLS i uruchom `npm run import:feed`; produkty demo usuń: delete from products where network = 'demo';",
      );
    }
    return "brak produktów demo";
  });

  await check("Supabase: migracja ofert i pakietów (purchases.offer, funkcje pakietu)", async () => {
    need(["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"], "połączenie z Supabase");
    const client = admin();
    const columns = await client.from("purchases").select("offer, searches_total, searches_left, pack_code").limit(1);
    // A random id: the function finds nothing and changes nothing, it only proves that it exists.
    const rpc = await client.rpc("consume_pack_search", { p_id: "00000000-0000-4000-8000-000000000000" });
    if (columns.error || rpc.error) {
      throw new CheckError(
        `brak kolumn lub funkcji (${columns.error?.message || rpc.error?.message || "błąd"})`,
        "Zastosuj migrację supabase/migrations/20261119000000_offers_and_packs.sql (`supabase db push` albo wklej ją w SQL Editor).",
      );
    }
    return "kolumny i funkcje pakietu istnieją";
  });

  await check("Supabase: zapis i usunięcie testowego wiersza w `results`", async () => {
    need(["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"], "połączenie z Supabase");
    const client = admin();
    const marker = `check-services-${Date.now()}`;
    const { data, error } = await client.from("results").insert({ recipient: marker }).select("id").single();
    if (error || !data) {
      throw new CheckError(
        `zapis nie powiódł się: ${error?.message ?? "brak zwróconego wiersza"}`,
        "Upewnij się, że SUPABASE_SERVICE_ROLE_KEY to tajny klucz service_role (nie publishable) i że migracje są zastosowane.",
      );
    }
    const { error: deleteError } = await client.from("results").delete().eq("id", data.id);
    if (deleteError) {
      throw new CheckError(
        `testowy wiersz został dodany, ale nie udało się go usunąć: ${deleteError.message}`,
        `Usuń go ręcznie: delete from results where recipient = '${marker}';`,
      );
    }
    const { count } = await client.from("results").select("*", { count: "exact", head: true }).eq("id", data.id);
    if (count) throw new CheckError("testowy wiersz nadal istnieje po usunięciu", `Usuń go ręcznie: delete from results where recipient = '${marker}';`);
    return "zapis i usunięcie OK, nic nie zostało";
  });

  // --- RLS: anon must not be able to read or write ---------------------------------------------
  const anonReady = envOk.has("NEXT_PUBLIC_SUPABASE_URL") && envOk.has("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  const anon = anonReady ? createClient(url, anonKey, authOptions) : undefined;
  const serviceReady = envOk.has("SUPABASE_SERVICE_ROLE_KEY") && envOk.has("NEXT_PUBLIC_SUPABASE_URL");

  const rlsFix = (table: string) =>
    `Wykonaj: alter table public.${table} enable row level security; revoke all on table public.${table} from anon, authenticated; (zob. migrację 20261114040000_lock_default_privileges.sql)`;

  for (const table of TABLES) {
    await check(`Supabase RLS: anon nie czyta \`${table}\``, async () => {
      if (!anon) need(["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"], "klient anon");
      const { data, error } = await anon!.from(table).select("*").limit(1);
      if (error) {
        // 42501 = permission denied (grants revoked), PGRST205 = table not visible/missing for this role.
        if (error.code === "PGRST205" && serviceReady) {
          const probe = await admin().from(table).select("*", { count: "exact", head: true });
          if (probe.error) {
            throw new CheckError(`tabela nie istnieje: ${probe.error.message}`, "Zastosuj migracje: `supabase db push`.");
          }
        }
        return `zablokowane (${error.code ?? "błąd"})`;
      }
      if (data && data.length > 0) {
        throw new CheckError("klient anon ODCZYTAŁ WIERSZE – tabela jest otwarta!", rlsFix(table));
      }
      // No error and no rows: either RLS filters everything or the table is empty.
      if (serviceReady) {
        const { count } = await admin().from(table).select("*", { count: "exact", head: true });
        if (count === 0) return "0 wierszy (tabela pusta, odczytem nie da się potwierdzić RLS – patrz test zapisu)";
      }
      return "0 wierszy (RLS je odfiltrowuje)";
    });
  }

  await check("Supabase RLS: anon nie zapisuje do `results`", async () => {
    if (!anon) need(["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"], "klient anon");
    const marker = `check-services-anon-${Date.now()}`;
    const { error } = await anon!.from("results").insert({ recipient: marker });
    if (error) return `zablokowane (${error.code ?? "błąd"})`;
    // The write went through: clean up with the service role if we can, then fail.
    if (serviceReady) await admin().from("results").delete().eq("recipient", marker);
    throw new CheckError(
      "klient anon ZAPISAŁ wiersz – tabela jest otwarta na zapis!",
      serviceReady ? rlsFix("results") : `${rlsFix("results")} Usuń też wiersz: delete from results where recipient = '${marker}';`,
    );
  });
}

// ---------------------------------------------------------------------------
// 4. Stripe
// ---------------------------------------------------------------------------

async function checkStripe() {
  const key = process.env.STRIPE_SECRET_KEY ?? "";
  const stripe = envOk.has("STRIPE_SECRET_KEY") ? new Stripe(key, { maxNetworkRetries: 1 }) : undefined;

  await check("Stripe: pobranie konta", async () => {
    if (!stripe) need(["STRIPE_SECRET_KEY"], "klucz Stripe");
    try {
      const account = await stripe!.accounts.retrieveCurrent();
      const details = [account.country ? `kraj ${account.country}` : null, account.charges_enabled ? "płatności włączone" : "płatności NIEWŁĄCZONE"];
      return details.filter(Boolean).join(", ");
    } catch (error) {
      throw new CheckError(
        `błąd API Stripe: ${error instanceof Error ? error.message : String(error)}`,
        "Sprawdź STRIPE_SECRET_KEY (Stripe Dashboard → Developers → API keys). Klucz nie może być unieważniony ani ograniczony.",
      );
    }
  });

  await check("Stripe: klucz w trybie testowym", () => {
    need(["STRIPE_SECRET_KEY"], "klucz Stripe");
    if (key.startsWith("sk_test_")) return "sk_test_… (tryb testowy)";
    throw new CheckError(
      "to klucz PRODUKCYJNY (sk_live_…)",
      "W .env.local używaj klucza testowego (sk_test_…); klucze live trzymaj tylko w zmiennych produkcyjnych Vercel. Jeśli klucz live trafił kiedykolwiek do repozytorium lub gdzieś go wklejono, zrotuj go w Dashboardzie.",
    );
  });

  await check("Stripe: BLIK dostępny w Checkout", async () => {
    if (!stripe) need(["STRIPE_SECRET_KEY"], "klucz Stripe");
    let configs;
    try {
      configs = await stripe!.paymentMethodConfigurations.list({ limit: 100 });
    } catch (error) {
      throw new CheckError(
        `błąd API Stripe: ${error instanceof Error ? error.message : String(error)}`,
        "Klucz musi mieć uprawnienie do odczytu konfiguracji metod płatności (użyj pełnego klucza tajnego albo dodaj to uprawnienie do klucza ograniczonego).",
      );
    }
    const usable = configs.data.filter((config) => config.active !== false);
    const blik = usable.some((config) => config.blik?.available === true);
    const card = usable.some((config) => config.card?.available === true);
    if (!blik) {
      throw new CheckError(
        "BLIK nie jest dostępny w tym trybie",
        "Stripe Dashboard → Settings → Payment methods → włącz BLIK (konto musi obsługiwać PLN). Zrób to także w trybie testowym.",
      );
    }
    if (!card) {
      throw new CheckError("BLIK jest dostępny, ale karta nie", "Stripe Dashboard → Settings → Payment methods → włącz Cards (Checkout żąda obu metod).");
    }
    return "BLIK i karta dostępne";
  });

  // Prices are sent inline with every Checkout Session (see lib/offers.ts), so there are no Price IDs to check.
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  checkEnv();
  await checkSupabase();
  await checkStripe();

  console.log("Prezentoskop – sprawdzenie usług\n");
  for (const result of results) {
    if (result.ok) {
      console.log(`[OK]    ${result.name} – ${result.detail}`);
    } else {
      console.log(`[BŁĄD]  ${result.name} – ${result.detail}`);
      if (result.fix) console.log(`        Jak naprawić: ${result.fix}`);
    }
  }

  const failed = results.filter((result) => !result.ok).length;
  console.log(`\n${results.length - failed} OK, ${failed} BŁĄD`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(redact(error instanceof Error ? error.message : String(error)));
  process.exitCode = 1;
});
