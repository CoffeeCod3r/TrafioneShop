import { logEvent } from "@/lib/log";
import { getRepos } from "@/lib/services/db";
import type { PaymentEvent } from "@/lib/services/payments";
import { refundPurchase, runWebSearch } from "@/lib/web-search";

/**
 * Single handler for payment events: used by the Stripe webhook and by the demo
 * "Zapłać (demo)" button, so both paths run exactly the same logic.
 * Idempotent by stripe_session_id. A second payment for an already paid result is refunded.
 *
 * @param schedule runs the slow search after the response (Next.js `after`, i.e. waitUntil).
 */
export async function handlePaymentEvent(
  event: PaymentEvent,
  schedule: (task: () => Promise<void>) => void,
): Promise<{ status: "ignored" | "duplicate" | "already_paid" | "accepted" }> {
  if (event.type !== "checkout_completed") {
    logEvent("payment.ignored", { reason: event.reason });
    return { status: "ignored" };
  }

  const repos = getRepos();
  const result = await repos.results.getById(event.resultId);
  if (!result) {
    logEvent("payment.unknown_result");
    return { status: "ignored" };
  }

  const { purchase, created } = await repos.purchases.createIfNew({
    result_id: event.resultId,
    stripe_session_id: event.sessionId,
    payment_intent_id: event.paymentIntentId,
    amount_pln: event.amountGrosze / 100,
    price_variant: event.priceVariant,
    status: "paid",
  });
  if (!created) return { status: "duplicate" };

  if (result.paid_status !== "none") {
    // One result can be paid only once (e.g. two checkout tabs): refund the extra payment.
    // result_id: null so the refund does not touch the already paid result.
    schedule(() => refundPurchase({ ...purchase, result_id: null }, "already_paid"));
    return { status: "already_paid" };
  }

  await repos.results.update(event.resultId, { paid_status: "pending" });
  logEvent("payment.accepted", { priceVariant: event.priceVariant });
  schedule(() => runWebSearch(purchase));
  return { status: "accepted" };
}
