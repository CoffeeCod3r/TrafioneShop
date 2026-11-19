import { recordAiUsage } from "@/lib/ai/usage";
import type { StyleProfile } from "@/lib/analyze/schema";
import type { AllowedShopRow, PurchaseRow } from "@/lib/db";
import { describeError, logEvent } from "@/lib/log";
import { isMockMode } from "@/lib/mode";
import {
  type Dedications,
  type FetchedPage,
  MAX_WEB_PICKS,
  MIN_VERIFIED_WEB_PICKS,
  type RawWebPick,
  type WebPick,
} from "@/lib/paid/schema";
import { quizAnswersSchema } from "@/lib/quiz/schema";
import { getAi, type UsageEntry } from "@/lib/services/ai";
import { getRepos } from "@/lib/services/db";
import { getPayments } from "@/lib/services/payments";
import { isAllowedTag } from "@/lib/tags";

/** Leave room under the 300 s Vercel limit before starting a second search attempt. */
const SECOND_ATTEMPT_DEADLINE_MS = 150_000;

const FALLBACK_DEDICATIONS: Dedications = [
  "Mały prezent od serca, z najlepszymi życzeniami.",
  "Żeby było Ci miło za każdym razem, gdy na to spojrzysz.",
  "Z pozdrowieniami i uśmiechem.",
];

function domainMatches(hostname: string, domain: string): boolean {
  return hostname === domain || hostname.endsWith(`.${domain}`);
}

/** Comparable form of a URL: no hash, no trailing slash, no tracking params, lowercase host. */
export function normalizeUrl(value: string): string | null {
  try {
    const url = new URL(value);
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_|gclid|fbclid)/i.test(key)) url.searchParams.delete(key);
    }
    url.hostname = url.hostname.toLowerCase();
    return url.toString().replace(/\/$/, "");
  } catch {
    return value.startsWith("/") ? value.replace(/\/$/, "") : null;
  }
}

function normalizeName(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function isSameProduct(a: string, b: string): boolean {
  const x = normalizeName(a);
  const y = normalizeName(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const [short, long] = x.length < y.length ? [x, y] : [y, x];
  return short.length >= 12 && long.includes(short);
}

/** Affiliate deeplink for shops in our networks; otherwise the product URL itself. */
export function toOutboundUrl(url: string, shop: AllowedShopRow): string {
  // Demo links are local pages: no partner redirect.
  if (url.startsWith("/")) return url;
  if (!shop.has_affiliate || !shop.deeplink_template?.includes("{url}")) return url;
  return shop.deeplink_template.replace("{url}", encodeURIComponent(url));
}

/**
 * Server-side verification of AI picks:
 * - the URL's domain is an active allowed shop (https only; demo /demo-produkt/ links only in MOCK_MODE),
 * - the page was actually opened with web_fetch in this run,
 * - price within budget, no duplicates, nothing from the free results.
 */
export function verifyWebPicks(
  raw: RawWebPick[],
  context: {
    shops: AllowedShopRow[];
    fetchedPages: FetchedPage[];
    budget: number | null;
    freeProductNames: string[];
    already?: WebPick[];
  },
): WebPick[] {
  const shops = context.shops.filter((shop) => shop.active);
  const fetched = new Map<string, string | null>();
  for (const page of context.fetchedPages) {
    const key = normalizeUrl(page.url);
    if (key) fetched.set(key, page.retrievedAt);
  }
  const seenUrls = new Set((context.already ?? []).map((pick) => normalizeUrl(pick.url)));
  const seenNames = (context.already ?? []).map((pick) => pick.title);
  const accepted: WebPick[] = [];

  for (const pick of raw) {
    const key = normalizeUrl(pick.url);
    if (!key || seenUrls.has(key)) continue;

    let shop: AllowedShopRow | undefined;
    if (pick.url.startsWith("/")) {
      if (!isMockMode() || !pick.url.startsWith("/demo-produkt/")) continue;
      shop = shops.find((item) => normalizeName(item.name) === normalizeName(pick.shop)) ?? shops[0];
    } else {
      const url = new URL(pick.url);
      if (url.protocol !== "https:") continue;
      shop = shops.find((item) => domainMatches(url.hostname.toLowerCase(), item.domain));
    }
    if (!shop) continue;
    if (!fetched.has(key)) continue;
    if (context.budget !== null && pick.price_pln > context.budget) continue;
    if (context.freeProductNames.some((name) => isSameProduct(name, pick.name))) continue;
    if (seenNames.some((name) => isSameProduct(name, pick.name))) continue;

    seenUrls.add(key);
    seenNames.push(pick.name);
    accepted.push({
      title: pick.name,
      url: pick.url,
      outboundUrl: toOutboundUrl(pick.url, shop),
      shopDomain: shop.domain,
      shopName: shop.name,
      pricePln: Math.round(pick.price_pln * 100) / 100,
      imageUrl: null,
      reason: pick.reason.slice(0, 200),
      checkedAt: fetched.get(key) ?? new Date().toISOString(),
    });
  }
  return accepted;
}

async function refund(purchase: PurchaseRow, reason: string): Promise<void> {
  const repos = getRepos();
  if (purchase.offer === "pack8") {
    // A pack is not refunded per search: the failed search goes back into the pack and the
    // result can be searched again. (`purchase.result_id` is the result of this very search.)
    try {
      await repos.purchases.restoreSearch(purchase.id);
      if (purchase.result_id) {
        await repos.results.update(purchase.result_id, { paid_status: "none", web_picks: null, dedications: null });
      }
      logEvent("paid.credit_restored", { reason });
    } catch (error) {
      logEvent("paid.credit_restore_failed", { reason, purchaseId: purchase.id, ...describeError(error) });
    }
    return;
  }
  try {
    const { refundId } = await getPayments().refund({
      sessionId: purchase.stripe_session_id,
      paymentIntentId: purchase.payment_intent_id,
      idempotencyKey: `refund-${purchase.id}`,
    });
    await repos.purchases.update(purchase.id, { status: "refunded" });
    // Free results stay untouched; only the paid part is marked as refunded.
    if (purchase.result_id) await repos.results.update(purchase.result_id, { paid_status: "refunded", web_picks: null });
    logEvent("paid.refunded", { reason, refundId });
  } catch (error) {
    // Needs manual attention: the customer paid and did not get results.
    logEvent("paid.refund_failed", { reason, purchaseId: purchase.id, ...describeError(error) });
  }
}

export { refund as refundPurchase };

function todayInWarsaw(): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Warsaw" }).format(new Date());
}

/**
 * Paid "Szukaj w całym internecie" for one purchase:
 * searching → AI web search (+1 retry if < 5 verified) → dedications → ready,
 * or an automatic refund. The photo is never used here (only the stored profile).
 */
export async function runWebSearch(purchase: PurchaseRow): Promise<void> {
  const started = Date.now();
  const repos = getRepos();
  const resultId = purchase.result_id;
  if (!resultId) return refund(purchase, "missing_result");

  const usage: UsageEntry[] = [];
  try {
    await repos.results.update(resultId, { paid_status: "searching" });

    const result = await repos.results.getById(resultId);
    const answers = quizAnswersSchema.safeParse(result?.answers);
    if (!result || !answers.success) return refund(purchase, "invalid_result");

    const profile: StyleProfile = {
      styleProfile: result.style_profile ?? "",
      tags: result.tags.filter(isAllowedTag),
      avoid: result.avoid.filter(isAllowedTag),
    };
    const [shops, freeProducts] = await Promise.all([
      repos.allowedShops.listActive(),
      repos.products.getByIds(result.product_ids),
    ]);
    const freeProductNames = freeProducts.map((product) => product.name);
    const ai = getAi();
    const input = { answers: answers.data, profile, allowedShops: shops, freeProductNames, today: todayInWarsaw() };

    let verified: WebPick[] = [];
    for (let attempt = 1; attempt <= 2; attempt++) {
      if (attempt === 2 && Date.now() - started > SECOND_ATTEMPT_DEADLINE_MS) break;
      try {
        const output = await ai.webSearch(input);
        usage.push(...output.usage);
        const found = verifyWebPicks(output.picks, {
          shops,
          fetchedPages: output.fetchedPages,
          budget: result.budget_pln,
          freeProductNames,
          already: verified,
        });
        verified = [...verified, ...found];
        logEvent("paid.search_attempt", { attempt, raw: output.picks.length, verified: found.length });
      } catch (error) {
        logEvent("paid.search_error", { attempt, ...describeError(error) });
      }
      if (verified.length >= MIN_VERIFIED_WEB_PICKS) break;
    }

    if (verified.length < MIN_VERIFIED_WEB_PICKS) {
      await recordAiUsage(usage, resultId);
      return refund(purchase, `too_few_verified_${verified.length}`);
    }

    let dedications = FALLBACK_DEDICATIONS;
    try {
      const output = await ai.writeDedications(answers.data, profile);
      usage.push(...output.usage);
      dedications = output.dedications;
    } catch (error) {
      logEvent("paid.dedications_failed", describeError(error));
    }

    await repos.results.update(resultId, {
      paid_status: "ready",
      web_picks: verified.slice(0, MAX_WEB_PICKS),
      dedications,
    });
    await recordAiUsage(usage, resultId);
    logEvent("paid.ready", { picks: Math.min(verified.length, MAX_WEB_PICKS), seconds: Math.round((Date.now() - started) / 1000) });
  } catch (error) {
    logEvent("paid.failed", describeError(error));
    await recordAiUsage(usage, resultId);
    await refund(purchase, "error");
  }
}
