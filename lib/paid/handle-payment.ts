import { logEvent } from "@/lib/log";
import { isPackOffer, OFFERS } from "@/lib/offers";
import { packCodeForSession } from "@/lib/packs";
import { getRepos } from "@/lib/services/db";
import type { PaymentEvent } from "@/lib/services/payments";
import { refundPurchase, runWebSearch } from "@/lib/web-search";

/**
 * Single handler for payment events: used by the Stripe webhook and by the demo
 * "Zapłać (demo)" button, so both paths run exactly the same logic.
 * Idempotent by stripe_session_id. A second payment for an already paid result is refunded
 * (a pack keeps all its searches instead). A pack uses its first search on this result right away.
 *
 * @param schedule runs the slow search after the response (Next.js `after`, i.e. waitUntil).
 */
export async function handlePaymentEvent(
  event: PaymentEvent,
  schedule: (task: () => Promise<void>) => void,
): Promise<{ status: "ignored" | "duplicate" | "already_paid" | "pack_only" | "accepted" }> {
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

  const total = OFFERS[event.offer].searches;
  const isPack = isPackOffer(event.offer);
  const { purchase, created } = await repos.purchases.createIfNew({
    result_id: event.resultId,
    stripe_session_id: event.sessionId,
    payment_intent_id: event.paymentIntentId,
    amount_pln: event.amountGrosze / 100,
    price_variant: event.amountGrosze,
    status: "paid",
    offer: event.offer,
    searches_total: total,
    // The first search is used on this result below.
    searches_left: total - 1,
    pack_code: isPack ? packCodeForSession(event.sessionId) : null,
  });
  if (!created) return { status: "duplicate" };

  // Atomic "none" → "pending": two concurrent payments for one result cannot both win.
  if (!(await repos.results.claimPayment(event.resultId))) {
    if (isPack) {
      // The result was already paid: do not refund the pack, the customer keeps all searches.
      await repos.purchases.update(purchase.id, { searches_left: total });
      logEvent("payment.pack_only", { offer: event.offer });
      return { status: "pack_only" };
    }
    // One result can be paid only once (e.g. two checkout tabs): refund the extra payment.
    // result_id: null so the refund does not touch the already paid result.
    schedule(() => refundPurchase({ ...purchase, result_id: null }, "already_paid"));
    return { status: "already_paid" };
  }

  logEvent("payment.accepted", { offer: event.offer, amountGrosze: event.amountGrosze });
  schedule(() => runWebSearch(purchase));
  return { status: "accepted" };
}
