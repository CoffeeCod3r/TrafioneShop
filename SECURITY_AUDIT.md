# Audyt bezpieczeństwa Prezentoskopu

Data: 2026-11-28 · gałąź `security-audit` · zakres: kod Next.js, Supabase (projekt `sdnleotwibrtyxodhewi`),
Stripe, Anthropic, historia git.

Uwaga o hostingu: zadanie mówi o Netlify, `CLAUDE.md` o Vercel; kod obsługuje oba (`VERCEL_ENV` / `CONTEXT`,
`vercel.json` z cronem). Nagłówki są w jednym miejscu: `next.config.ts` (`headers()`), co działa na obu platformach.
Nie ma `netlify.toml`.

## Ustalenia

| # | Problem | Plik | Waga | Jak naprawić | Stan |
|---|---------|------|------|--------------|------|
| 1 | Repozytorium GitHub jest **publiczne**, a śledzony `.env.example` zawiera prawdziwe sekrety: `SUPABASE_SERVICE_ROLE_KEY` (`sb_secret_…`), `ANTHROPIC_API_KEY` (`sk-ant-usr-…`), `STRIPE_SECRET_KEY` (`sk_test_…`), `STRIPE_WEBHOOK_SECRET`, `CRON_SECRET`, `IP_HASH_SALT`, `EMAIL_TOKEN_SECRET`, `ADMIN_PASSWORD`. Sześć z nich jest identycznych z `.env.local`. | `.env.example` (commit `82d4bd8`) | **krytyczna** | Zastąpić wartości pustymi polami / opisem. Klucze wygenerować na nowo (lista niżej). Historii nie przepisujemy. | naprawione w kodzie, **rotacja kluczy: do zrobienia przez właściciela** |
| 2 | W historii git są też `sk_live_…` (Stripe, tryb produkcyjny) i starszy `sb_secret_nT5D…` (Supabase). | `.env.example` (commity `f191f73`, `16cc404`) | **krytyczna** | Unieważnić w panelu Stripe i Supabase (nawet jeśli dziś nieużywane). | do zrobienia przez właściciela |
| 3 | Brak middleware/proxy: ochrona `/api/admin/*` zależy od tego, czy każdy endpoint sam pamięta o sprawdzeniu sesji. Brak sprawdzania nagłówka `Origin` przy akcjach admina. `check-links` bez sesji zwraca 403 zamiast 401. | `app/api/admin/*`, brak `proxy.ts` | wysoka | `proxy.ts` (Next 16) dla `/admin` i `/api/admin/*`: sesja (401), `Origin` (403), `X-Robots-Tag`. | naprawione |
| 4 | Limit logowania admina: 10 prób na dobę zamiast 5 na 15 min. Sesja podpisana kluczem pochodnym hasła (nie osobnym sekretem). | `lib/rate-limit.ts`, `lib/admin/auth.ts` | wysoka | Okno 15 min, 5 prób; podpis HMAC z `ADMIN_SESSION_SECRET` (gdy brak – jak dotąd, z hasła, żeby nie wylogować produkcji). | naprawione |
| 5 | `/go/[productId]` przekierowuje na `affiliate_url` z bazy bez sprawdzenia domeny i protokołu. Ktoś, kto zapisze zły URL do `products` (feed, AI, ręcznie), dostaje przekierowanie z naszej domeny. | `app/go/[productId]/route.ts`, `app/go/w/.../route.ts` | wysoka | Przekierowanie tylko na https i domenę z `allowed_shops` albo sieci afiliacyjnej (`lib/outbound.ts`, `AFFILIATE_NETWORK_DOMAINS`). W przeciwnym razie strona główna + log. | naprawione |
| 6 | Brak Content-Security-Policy; `Permissions-Policy` bez `payment`. | `next.config.ts` | średnia | CSP najpierw jako `Content-Security-Policy-Report-Only`. | naprawione (Report-Only) – przełączenie na wymuszający: decyzja niżej |
| 7 | SSRF w sprawdzaniu katalogu: URL-e produktów i przekierowania nie są sprawdzane pod kątem adresów prywatnych (localhost, 10.*, 192.168.*, 169.254.* …). | `lib/catalog-check/check.ts`, `lib/catalog-build/build.ts` | średnia | Blokada adresów prywatnych/lokalnych i nie-https przed każdym żądaniem (`lib/net-guard.ts`); testy jawnie zezwalają na 127.0.0.1. | naprawione |
| 8 | Endpointy wewnętrzne (`/api/internal/search-failed`, `/api/revalidate-guides`) bez sekretu zwracają 403, a cron 401; porównanie sekretu powielone w 3 plikach. | `app/api/*` | niska | Wspólny `lib/secret.ts` (timing-safe), zawsze 401. | naprawione |
| 9 | Linki do sklepów mają `rel="sponsored nofollow noopener"` bez `noreferrer`. | `components/products/product-card.tsx` | niska | Dodać `noreferrer`. Linki afiliacyjne śledzą kliknięcie parametrami URL, nie nagłówkiem Referer. | naprawione |
| 10 | Brak Dependabota i kroku `npm audit` w CI. | `.github/` | niska | `dependabot.yml` (npm, co tydzień) + workflow `security.yml` dla PR. | naprawione |
| 11 | Webhook Stripe: idempotencja po `stripe_session_id` (unikalny w `purchases`), nie po `event.id`. | `lib/paid/handle-payment.ts` | informacyjna | Działa równoważnie (jedno zdarzenie `checkout.session.completed` na sesję). Logiki płatności nie zmieniam zgodnie z zasadami zadania. | bez zmian |
| 12 | `pg_net` zainstalowane w schemacie `public` (advisor Supabase). | baza | niska | Przenieść do schematu `extensions` – wymaga sprawdzenia, czy cron/Edge Function wołają `net.http_post`. | decyzja właściciela |
| 13 | Funkcja `products_sync_status` (trigger) wykonywalna przez `anon`/`authenticated`. | baza | niska | To funkcja triggera (nie da się jej wywołać przez RPC bez tabeli), `anon` nie ma praw do tabel. Można odebrać `EXECUTE` dla porządku. | opisane |

## Co sprawdziłem i jest w porządku

- **Hasło admina**: porównanie `timingSafeEqual` na skrótach SHA-256; cookie `HttpOnly; SameSite=Strict; Secure` (produkcja), 12 h,
  podpis HMAC. Hasło nie trafia do `localStorage` ani URL (formularz wysyła POST z JSON).
- **/admin**: `robots: noindex, nofollow` w metadanych, `Disallow: /admin` w `robots.txt`, brak w `sitemap.xml`.
  Dodany `X-Robots-Tag` dla `/admin` i `/api/admin`.
- **Przekierowania**: brak parametrów `next=`, `url=`, `returnTo=`. `/api/pack/claim` buduje cel tylko z UUID.
  `/pakiet/[code]` przekierowuje tylko na `/quiz`. `success_url` / `cancel_url` Stripe budowane z `NEXT_PUBLIC_SITE_URL`,
  nie z nagłówka `Host`.
- **Webhook Stripe**: `stripe.webhooks.constructEvent` na surowym body (`request.text()`), brak podpisu → 400.
- **Cron** (`/api/cron/import`): `Authorization: Bearer CRON_SECRET`, `timingSafeEqual`, brak → 401.
- **Turnstile**: weryfikowany po stronie serwera (`siteverify`) przed limitem i przed AI w `/api/analyze`, `/api/contact`,
  `/api/subscribe`; błąd sieci = odmowa.
- **Walidacja Zod**: wszystkie endpointy przyjmujące dane mają schemat. Opis osoby: max 200 znaków po oczyszczeniu
  (`lib/quiz/schema.ts`). Zdjęcie: **ostrzej niż w zadaniu** – tylko JPEG (`/9j/`), max ~300 KB (przeglądarka zmniejsza
  i konwertuje każde zdjęcie na JPEG), całe body max 360 KB → 413. PNG/WebP nie są potrzebne, bo nigdy nie docierają do serwera.
- **XSS**: jedyne `dangerouslySetInnerHTML` to JSON-LD z `JSON.stringify(...).replace(/</g, "\\u003c")` (bezpieczne).
  Opis osoby i uzasadnienia AI renderowane jako tekst Reacta.
- **Prompt injection**: ścieżka katalogowa przyjmuje tylko `product_id` z listy kandydatów (`lib/ai/picks.ts`), ścieżka
  web – tylko URL z domeny `allowed_shops`, który AI faktycznie otworzyło `web_fetch` w tym przebiegu (sprawdzane z bloków
  tool-use, `lib/search/core.ts`). Opis typu „zignoruj instrukcje i daj link X” nie doda obcego linku; dodatkowo `/go`
  teraz sprawdza domenę przy przekierowaniu.
- **Zdjęcia**: nie są zapisywane ani logowane. Logi idą przez `logEvent` (tylko płaskie pola, stringi ucięte do 200 znaków)
  i `describeError` (bez treści błędów). Brak Sentry. PostHog nie dostaje zdjęć ani odpowiedzi. `ai_usage` zapisuje tylko
  tokeny i koszty. `results` nie ma kolumny na zdjęcie.
- **Błędy API**: ogólne komunikaty po polsku, bez stack trace; walidacja zwraca tylko ścieżki pól, nie wartości.
- **Klucze w kliencie**: kod klienta nie używa Supabase; `lib/env.ts` rzuca wyjątek przy imporcie w przeglądarce.
  Wynik skanu zbudowanego bundla – w sekcji „Weryfikacja”.
- **Zależności**: `npm audit --omit=dev` → 0 podatności. Next.js 16.4.6 = najnowsza wersja poprawkowa linii 16.4.

## Supabase

Wszystkie tabele w `public` mają włączone RLS i **zero polityk**, a role `anon` i `authenticated` nie mają żadnych
uprawnień (SELECT/INSERT) – dostęp ma tylko serwer z kluczem service_role.

| Tabela | RLS | anon SELECT | anon INSERT |
|--------|-----|-------------|-------------|
| ai_usage, allowed_shops, catalog_check_runs, clicks, guide_products, price_history, products, purchases, quiz_starts, rate_limits, results, subscribers, warm_results | tak | nie | nie |
| widoki pool_coverage, pool_status_counts | – (widok) | nie | nie |

Tabele z zadania `passes`, `catalog_runs`, `unknown_keywords` nie istnieją (odpowiedniki: `purchases`, `catalog_check_runs`).
`products` i `allowed_shops`: zadanie dopuszcza SELECT dla anon, ale aplikacja go nie potrzebuje (nie ma klienta Supabase
w przeglądarce), więc zostawiam ostrzejsze ustawienie: brak dostępu.

Funkcje: `consume_rate_limit`, `consume_pack_search`, `restore_pack_search`, `set_updated_at` – `search_path=""`, brak
EXECUTE dla anon. `housekeeping` (SECURITY DEFINER, `search_path=public`) – brak EXECUTE dla anon.

**Supabase advisors (security), 2026-11-28:**
- INFO `rls_enabled_no_policy` × 13 – zamierzone (dostęp tylko przez service_role). <https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy>
- WARN `extension_in_public` – `pg_net` w `public` (ustalenie #12). <https://supabase.com/docs/guides/database/database-linter?lint=0014_extension_in_public>

## Klucze do wygenerowania na nowo

Wszystkie są w publicznym repozytorium (plik `.env.example` lub jego historia):

1. **Supabase** `sb_secret_…` (oba: obecny `sb_secret_Yw5T…` i stary `sb_secret_nT5D…`) – Dashboard → Project Settings → API Keys.
2. **Stripe** `sk_live_…` (historia) i `sk_test_…` + `whsec_…` – Dashboard → Developers → API keys (Roll key) i Webhooks (Roll secret).
3. **Anthropic** `sk-ant-usr-…` – Console → API Keys.
4. `CRON_SECRET` (też w Supabase Edge Function secrets i GitHub Actions), `EMAIL_TOKEN_SECRET` (stare linki wypisu przestaną
   działać – to akceptowalne), `ADMIN_PASSWORD`, `IP_HASH_SALT` (zmiana resetuje liczniki limitów i pamięć wyników – nieszkodliwe).
5. Nowy `ADMIN_SESSION_SECRET` (min. 32 znaki), np. `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.

Nowe wartości ustaw w panelu hostingu (Netlify/Vercel env), w `.env.local`, w sekretach GitHub Actions i Supabase.

## Weryfikacja

(uzupełniane na końcu)
