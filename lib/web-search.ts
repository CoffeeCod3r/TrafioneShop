import type { PurchaseRow } from "@/lib/db";
import { describeError, logEvent } from "@/lib/log";
import { dispatchSearch, paidSearchJob } from "@/lib/search/job";
import { getRepos } from "@/lib/services/db";
import { getPayments } from "@/lib/services/payments";

export { normalizeUrl, toOutboundUrl, verifyWebPicks } from "@/lib/search/core";

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

/**
 * Paid search for one purchase (also a search used from a pack): marks the result "searching" and starts the
 * background job (Supabase Edge Function; in demo mode it runs in this process). On failure the job refunds
 * the payment (single) or gives the search back to the pack. The photo is never used (only the stored profile).
 */
export async function runWebSearch(purchase: PurchaseRow): Promise<void> {
  const resultId = purchase.result_id;
  if (!resultId) return refund(purchase, "missing_result");
  try {
    await getRepos().results.update(resultId, { paid_status: "searching" });
  } catch (error) {
    logEvent("paid.failed", describeError(error));
    return refund(purchase, "error");
  }
  await dispatchSearch(paidSearchJob(resultId, purchase.id));
}
