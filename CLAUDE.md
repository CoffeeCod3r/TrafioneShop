# Prezentoskop (TrafioneShop)

Polish, mobile-first website that picks gifts in 60 seconds. The user answers 6 questions
about the recipient and can optionally add a photo of them.

## Business model
- FREE, `SOURCE_MODE` (env):
  - `web` (now, until the affiliate networks accept the site): the AI searches trusted Polish shops with the same
    web search as the paid one (`lib/search/core.ts`, prompt C with a product count): exactly 5 verified products,
    web_search max 4, web_fetch max 6. Label: "Wybrane przez AI z polskich sklepów". It runs in the background
    (Supabase Edge Function `supabase/functions/run-search`, `npm run edge:deploy`); the result starts as
    `search_status='searching'` and the page polls `/api/results/[id]/status` every 3 s.
    Cost guards: result memory (salted hash of the quiz answers, never the photo; the same quiz within 24 h gets
    the ready products), `DAILY_AI_BUDGET_PLN` (from `ai_usage`; above it free results use the catalog path with
    prompts A and B, paid searches go on), max 3 free web searches per day per device (cookie `dv`) and per IP.
    Every verified product is saved to `products` (`network='direct'`, `commission_rate=0`, no shop photos).
  - `catalog`: the AI picks 5 gifts from our catalog of partner shops (affiliate links, we earn a commission).
    Label: "Z naszych sklepów partnerskich".
  All outbound links go through `/go` with a click source: `free-web`, `paid-web`, `catalog` (or `share`).
- PAID: "Więcej propozycji" (10 gifts instead of 5, from the whole web, plus 3 dedications), two offers (lib/offers.ts): one search for 4.99 PLN, or a pack of
  10 searches for 10 recipients (14.99 PLN; offer id `pack10`; the old pack of 8 is legacy and only kept for
  purchases already made; an offer may get a promo price via `promoGrosze` + `PROMO_ENDS_AT`, today none has).
  The server decides the price and rejects a checkout whose expected price changed. Stripe prices
  are inline (`price_data`), there are no Stripe Price IDs. The pack is held by a cookie / pack link, no accounts.
  Description of the search itself: The AI with web search
  looks through trusted Polish shops, checks price and availability on each product page, and returns
  up to 10 suggestions (web_search max 10, web_fetch max 15, no repeats from the free result) plus 3
  gift-card dedications.
  If it finds fewer than 5 verified products, the payment is refunded automatically.

- `PAYMENTS_ENABLED` (default false): when false, paid offers are replaced by "Więcej propozycji z całego
  internetu – już wkrótce" and `/api/checkout` returns 403. An admin logged in at /admin can still pay (for tests).

## Product cards and catalog check
- ONE product card (`components/products/product-card.tsx`) for free results, paid results and guides; data comes
  through the adapters in `components/products/adapters.ts`. A feed photo is shown only for network ≠ `direct`
  (and not `demo`); everything found on the web shows the category illustration (`lib/illustrations.ts`, the only
  category → picture mapping, files in `public/illustrations`). Shop photos are never fetched, stored or shown.
  Unavailable products (or ones now above the result's budget) are never shown: replaced, else left out.
- Product pool (`products.status`: active | pending | out_of_stock | broken; a DB trigger keeps `in_stock` =
  status in (active, pending); `source`: catalog_build | feed | web_search | manual). View `pool_coverage`:
  active products checked in 7 days per category x price band x recipient, healthy at 8.
  `POOL_STRICT=true` makes free results use only active products checked within 7 days (off until the pool is checked).
- Pool check (code in `lib/catalog-check/*`, NO AI, never writes to `ai_usage`): own honest User-Agent (never a
  browser one), robots.txt, max 5 requests at once, max 1 request/s per domain, 8 s timeout, max 3 redirects. Checks
  the product's own page, never an affiliate link. 404/410/redirect home/listing/other domain/timeout/5xx: +1 fail,
  broken after 2; sold out: out_of_stock at once; blocked (401/403/429): unchanged. `npm run catalog:verify`
  (`--limit N`, `--only-stale`, `--dry-run`).
- Nightly (GitHub Actions `.github/workflows/nightly-catalog.yml`, `npm run catalog:nightly`): verify up to 400 stale
  products, then AI top-up of up to 10 thin pool cells (web_search max_uses 2, NO web_fetch) and tags, hard limit
  `NIGHTLY_AI_BUDGET_USD` (0.30). Rule for this top-up: a proposed product is saved only after OUR code opened its
  page (domain in `allowed_shops`, robots.txt, price from JSON-LD/meta inside the cell's band) - this replaces the
  web_fetch proof. Report in `catalog_check_runs` (kind nightly). Admin: tile "Pula". Tests: `npm run test:pool`,
  `npm run test:catalog`, `npm run test:cards`. The Supabase cron of the Edge Function `check-links` is removed.

## Stack
- Next.js (App Router) + TypeScript + Tailwind + shadcn/ui
- Supabase (Postgres)
- Anthropic SDK, model `claude-haiku-5-5` (paid search: `web_search` and `web_fetch` tools)
- Zod
- Stripe Checkout (BLIK + card, PLN; refunds via Stripe Refunds)
- Cloudflare Turnstile
- Resend
- PostHog
- Hosting: Vercel

## Rules (always follow)
- UI text in Polish; code, identifiers and comments in English.
- API keys only on the server (route handlers, server actions). Never in client code
  and never in `NEXT_PUBLIC_*` env vars.
- User photos are NEVER stored: not in the database, not on disk, not in logs,
  not in analytics (PostHog, Vercel logs, error reporting). Process in memory only.
  The photo never goes to the paid search, only the finished style profile does.
- Free tier, `SOURCE_MODE=catalog` (and the budget/limit fallback): the AI returns only product IDs from the list we pass to it.
- Free tier, `SOURCE_MODE=web`: same rule as the paid tier (domain in `allowed_shops` + page opened with `web_fetch`).
- Paid tier: accept only links whose domain is in the `allowed_shops` table AND that the AI
  actually opened with `web_fetch` in this run. Verify this server-side from the tool-use
  blocks in the response, never from the AI's own claims.
- Validate every AI response with Zod. On failure retry once, then fall back
  (free: non-AI selection; paid: automatic refund).
- Every AI call has a max_tokens limit; paid search also has a max number of searches/fetches.
  Record usage in the `ai_usage` table.
- Mobile-first: vertical layout, large tap targets, fast loading.
- After every change run typecheck and lint; at the end briefly describe what was done
  and how to test it.
- The commission never influences which products are picked or in what order (we state this on /jak-zarabiamy):
  not in the AI prompts, not in candidate ranking, not in replacements. Do not add it back.
- Do not add libraries outside the stack without asking first.
- Every external service (AI, payments, database, captcha, email) has an interface in
  `lib/services/<name>.ts` and two implementations in `lib/services/impl/`: a real one and
  a demo one. The rest of the code uses only the interface (`getAi()`, `getPayments()`,
  `getRepos()`, `getCaptcha()`, `getEmail()`), never an SDK or an implementation directly.
  `MOCK_MODE` (default `true`) picks the demo implementations. `MOCK_MODE=true` must never
  reach production: the build and the server refuse to start when `VERCEL_ENV=production`.
