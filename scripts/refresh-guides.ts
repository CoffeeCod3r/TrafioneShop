/**
 * Finds the products of the gift guides (/poradniki/...) with the web search (prompt C) and stores them.
 *
 *   npm run guides:refresh                 all guides
 *   npm run guides:refresh -- --only=prezent-dla-kawosza
 *   npm run guides:refresh -- --dry-run    search and verify, write nothing
 *
 * Per guide: one web search for 8 products (web_search max 8, web_fetch max 12, shops from allowed_shops only,
 * every page opened and verified server-side, price within the guide's budget), at most one retry. The verified
 * products are saved to `products` (network "direct", commission_rate 0, no shop photos, no duplicates by address)
 * and linked to the guide in `guide_products`, replacing the previous list. A guide with fewer than 6 verified
 * products keeps its old list. Nothing runs on a page visit: the pages only read what this script stored.
 *
 * Needs ANTHROPIC_API_KEY, NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (REAL_DB=true), the
 * migration 20261125000000_guide_products.sql, and the allowed_shops table. Cost: real web searches, so
 * roughly 10 searches per guide at most; run weekly (.github/workflows/refresh-guides.yml) or by hand.
 * When NEXT_PUBLIC_SITE_URL is a public address and CRON_SECRET is set, it finally asks the site to refresh
 * the cached pages (/api/revalidate-guides); otherwise the pages pick the new products up within a week.
 */
import Anthropic from "@anthropic-ai/sdk";

import { GUIDE_PRODUCTS_MIN, GUIDE_PRODUCTS_TARGET, GUIDES, type Guide } from "../lib/guides/data.ts";
import {
  externalIdForUrl,
  searchWebWithClaude,
  todayInWarsaw,
  verifyWebPicks,
  type DirectProductRow,
  type UsageEntry,
} from "../lib/search/core.ts";
import { isRealService } from "../lib/mode.ts";
import { getRepos } from "../lib/services/db.ts";
import type { WebPick } from "../lib/paid/schema.ts";

const MAX_SEARCHES = 8;
const MAX_FETCHES = 12;

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const only = args.find((arg) => arg.startsWith("--only="))?.split("=")[1];

const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
  console.error("Brak ANTHROPIC_API_KEY (ustaw go w .env.local lub w sekretach).");
  process.exit(1);
}
if (!isRealService("db")) {
  console.error("Skrypt zapisuje do prawdziwej bazy: ustaw REAL_DB=true (albo MOCK_MODE=false) i klucze Supabase.");
  process.exit(1);
}

const model = process.env.ANTHROPIC_MODEL || "claude-haiku-5-5";
const client = new Anthropic({ apiKey, maxRetries: 1, timeout: 120_000, logLevel: "off" });

async function refreshGuide(guide: Guide): Promise<"updated" | "kept" | "dry-run"> {
  const repos = getRepos();
  const shops = await repos.allowedShops.listActive();
  const { answers, styleProfile, tags, avoid } = guide.search;

  let verified: WebPick[] = [];
  const usage: UsageEntry[] = [];
  for (let attempt = 1; attempt <= 2 && verified.length < GUIDE_PRODUCTS_TARGET; attempt++) {
    // The retry only happens when the first search did not reach the minimum.
    if (attempt === 2 && verified.length >= GUIDE_PRODUCTS_MIN) break;
    try {
      const output = await searchWebWithClaude(client, model, {
        kind: "free",
        answers,
        profile: { styleProfile, tags, avoid },
        allowedShops: shops,
        freeProductNames: [],
        today: todayInWarsaw(),
        count: GUIDE_PRODUCTS_TARGET,
        maxSearches: MAX_SEARCHES,
        maxFetches: MAX_FETCHES,
      });
      usage.push(...output.usage);
      const found = verifyWebPicks(output.picks, {
        shops,
        fetchedPages: output.fetchedPages,
        budget: answers.budget,
        freeProductNames: [],
        already: verified,
      });
      verified = [...verified, ...found];
      console.log(`  próba ${attempt}: AI zwróciło ${output.picks.length}, zweryfikowano ${found.length}`);
    } catch (error) {
      console.log(`  próba ${attempt}: błąd (${error instanceof Error ? error.name : "nieznany"})`);
    }
  }

  // The search cost is real even when the list is not replaced.
  if (!dryRun && usage.length > 0) {
    await repos.aiUsage.createMany(
      usage.map((entry) => ({
        result_id: null,
        step: entry.step,
        model: entry.model,
        input_tokens: entry.inputTokens,
        output_tokens: entry.outputTokens,
        web_searches: entry.webSearches ?? 0,
        web_fetches: entry.webFetches ?? 0,
      })),
    );
  }

  const picks = verified.slice(0, GUIDE_PRODUCTS_TARGET);
  if (picks.length < GUIDE_PRODUCTS_MIN) {
    console.log(`  za mało zweryfikowanych produktów (${picks.length} < ${GUIDE_PRODUCTS_MIN}): zostaje poprzednia lista`);
    return "kept";
  }
  if (dryRun) {
    for (const pick of picks) console.log(`   - ${pick.title} | ${pick.pricePln} zł | ${pick.shopDomain}`);
    return "dry-run";
  }

  const rows: DirectProductRow[] = await Promise.all(
    picks.map(async (pick) => ({
      merchant: pick.shopName ?? pick.shopDomain,
      external_id: await externalIdForUrl(pick.url),
      name: pick.title,
      description: null,
      price_pln: pick.pricePln,
      category: pick.category ?? "inne",
      tags: [...tags],
      image_url: null,
      affiliate_url: pick.outboundUrl,
      url: pick.url,
      checked_at: pick.checkedAt,
    })),
  );
  const saved = await repos.products.saveDirect(rows);
  const idByExternal = new Map(saved.map((product) => [product.external_id, product.id]));
  const links = rows.flatMap((row, index) => {
    const productId = idByExternal.get(row.external_id);
    return productId ? [{ product_id: productId, position: index + 1, reason: picks[index].reason }] : [];
  });
  await repos.guides.replaceProducts(guide.slug, links);
  console.log(`  zapisano ${links.length} produktów`);
  return "updated";
}

async function notifySite(): Promise<void> {
  const site = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  const secret = process.env.CRON_SECRET;
  if (!site || !secret || /localhost|127\.0\.0\.1/.test(site)) {
    console.log("Pomijam odświeżenie cache strony (brak publicznego NEXT_PUBLIC_SITE_URL lub CRON_SECRET).");
    return;
  }
  try {
    const response = await fetch(`${site}/api/revalidate-guides`, {
      method: "POST",
      headers: { "x-internal-secret": secret },
      signal: AbortSignal.timeout(30_000),
    });
    console.log(response.ok ? "Cache poradników odświeżony." : `Odświeżenie cache nie powiodło się (HTTP ${response.status}).`);
  } catch {
    console.log("Odświeżenie cache nie powiodło się (brak połączenia); strony odświeżą się same w ciągu tygodnia.");
  }
}

async function main() {
  const selected = GUIDES.filter((guide) => !only || guide.slug === only);
  if (selected.length === 0) {
    console.error(`Nie ma poradnika o adresie "${only}".`);
    process.exit(1);
  }
  console.log(`${dryRun ? "[dry-run] " : ""}Odświeżam ${selected.length} poradników (model ${model}).`);

  const results: Record<string, string> = {};
  for (const guide of selected) {
    console.log(`\n${guide.slug}`);
    results[guide.slug] = await refreshGuide(guide);
  }

  console.log("\nPodsumowanie:");
  for (const [slug, result] of Object.entries(results)) console.log(`  ${result.padEnd(8)} ${slug}`);
  if (!dryRun && Object.values(results).includes("updated")) await notifySite();
  process.exit(Object.values(results).includes("kept") ? 2 : 0);
}

main().catch((error) => {
  console.error("Odświeżanie przerwane:", error instanceof Error ? error.message.slice(0, 200) : "nieznany błąd");
  process.exit(1);
});
