import { logEvent } from "@/lib/log";
import { runPaidSearch } from "@/lib/paid/run-paid-search";
import { getRepos } from "@/lib/services/db";
import type { PaymentEvent } from "@/lib/services/payments";

/**
 * Single handler for payment events: used by the Stripe webhook and by the demo
 * "Zapłać (demo)" button, so both paths run exactly the same logic.
 * Idempotent: a repeated event for the same session does nothing.
 *
 * @param schedule runs the slow search after the response (pass Next.js `after`).
 */
export async function handlePaymentEvent(
  event: PaymentEvent,
  schedule: (task: () => Promise<void>) => void,
): Promise<{ status: "ignored" | "duplicate" | "accepted" }> {
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

  await repos.results.update(event.resultId, { paid_status: "searching" });
  logEvent("payment.accepted", { priceVariant: event.priceVariant });
  schedule(() => runPaidSearch(purchase));
  return { status: "accepted" };
}
