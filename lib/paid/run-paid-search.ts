import { recordAiUsage } from "@/lib/ai/usage";
import type { StyleProfile } from "@/lib/analyze/schema";
import type { AllowedShopRow, PurchaseRow } from "@/lib/db";
import { describeError, logEvent } from "@/lib/log";
import { isMockMode } from "@/lib/mode";
import {
  type Dedications,
  MAX_WEB_PICKS,
  MIN_VERIFIED_WEB_PICKS,
  webPickSchema,
  type WebPick,
} from "@/lib/paid/schema";
import { quizAnswersSchema } from "@/lib/quiz/schema";
import { isAllowedTag } from "@/lib/tags";
import { getAi } from "@/lib/services/ai";
import { getRepos } from "@/lib/services/db";
import { getPayments } from "@/lib/services/payments";

const FALLBACK_DEDICATIONS: Dedications = [
  "Mały prezent od serca, z najlepszymi życzeniami.",
  "Żeby było Ci miło za każdym razem, gdy na to spojrzysz.",
  "Z pozdrowieniami i uśmiechem.",
];

function domainMatches(hostname: string, domain: string): boolean {
  return hostname === domain || hostname.endsWith(`.${domain}`);
}

/**
 * Server-side check of web picks: valid shape, shop on the allow list, link on that shop's
 * domain (demo links /demo-produkt/... are accepted only in MOCK_MODE), within budget, no duplicates.
 */
export function filterWebPicks(picks: unknown[], shops: AllowedShopRow[], budget: number | null): WebPick[] {
  const domains = shops.filter((shop) => shop.active).map((shop) => shop.domain);
  const seen = new Set<string>();
  const accepted: WebPick[] = [];

  for (const candidate of picks) {
    const parsed = webPickSchema.safeParse(candidate);
    if (!parsed.success) continue;
    const pick = parsed.data;
    const shopDomain = pick.shopDomain.toLowerCase();
    if (!domains.some((domain) => domainMatches(shopDomain, domain))) continue;
    if (budget !== null && pick.pricePln > budget) continue;

    if (pick.url.startsWith("/")) {
      if (!isMockMode() || !pick.url.startsWith("/demo-produkt/")) continue;
    } else {
      try {
        const url = new URL(pick.url);
        if (url.protocol !== "https:" || !domainMatches(url.hostname.toLowerCase(), shopDomain)) continue;
      } catch {
        continue;
      }
    }
    if (seen.has(pick.url)) continue;
    seen.add(pick.url);
    accepted.push(pick);
  }
  return accepted.slice(0, MAX_WEB_PICKS);
}

async function refundPurchase(purchase: PurchaseRow, reason: string): Promise<void> {
  const repos = getRepos();
  try {
    const { refundId } = await getPayments().refund({
      sessionId: purchase.stripe_session_id,
      paymentIntentId: purchase.payment_intent_id,
      idempotencyKey: `refund-${purchase.id}`,
    });
    await repos.purchases.update(purchase.id, { status: "refunded" });
    if (purchase.result_id) await repos.results.update(purchase.result_id, { paid_status: "refunded", web_picks: null });
    logEvent("paid.refunded", { reason, refundId });
  } catch (error) {
    // Needs manual attention: the customer paid and did not get results.
    logEvent("paid.refund_failed", { reason, purchaseId: purchase.id, ...describeError(error) });
  }
}

/** Runs after payment: web search + dedications, then "ready", or an automatic refund. */
export async function runPaidSearch(purchase: PurchaseRow): Promise<void> {
  const repos = getRepos();
  const resultId = purchase.result_id;
  if (!resultId) return refundPurchase(purchase, "missing_result");

  try {
    const result = await repos.results.getById(resultId);
    const answers = quizAnswersSchema.safeParse(result?.answers);
    if (!result || !answers.success) return refundPurchase(purchase, "invalid_result");

    // Only the finished style profile goes to the paid search, never the photo (it was never stored).
    const profile: StyleProfile = {
      styleProfile: result.style_profile ?? "",
      tags: result.tags.filter(isAllowedTag),
      avoid: result.avoid.filter(isAllowedTag),
    };
    const shops = await repos.allowedShops.listActive();
    const ai = getAi();

    const [search, dedications] = await Promise.allSettled([
      ai.webSearch({ answers: answers.data, profile, allowedShops: shops }),
      ai.writeDedications(answers.data, profile),
    ]);
    await recordAiUsage(
      [
        ...(search.status === "fulfilled" ? search.value.usage : []),
        ...(dedications.status === "fulfilled" ? dedications.value.usage : []),
      ],
      resultId,
    );

    if (search.status === "rejected") {
      logEvent("paid.search_failed", describeError(search.reason));
      return refundPurchase(purchase, "search_failed");
    }
    const verified = filterWebPicks(search.value.picks, shops, result.budget_pln);
    if (verified.length < MIN_VERIFIED_WEB_PICKS) {
      return refundPurchase(purchase, `too_few_verified_${verified.length}`);
    }

    await repos.results.update(resultId, {
      paid_status: "ready",
      web_picks: verified,
      dedications: dedications.status === "fulfilled" ? dedications.value.dedications : FALLBACK_DEDICATIONS,
    });
    logEvent("paid.ready", { picks: verified.length, dedicationsFallback: dedications.status === "rejected" });
  } catch (error) {
    logEvent("paid.failed", describeError(error));
    await refundPurchase(purchase, "error");
  }
}
