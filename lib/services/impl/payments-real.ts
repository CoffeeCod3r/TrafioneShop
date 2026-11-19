import Stripe from "stripe";

import { requireEnv } from "@/lib/env";
import { isOfferId, OFFERS } from "@/lib/offers";
import type { PaymentEvent, PaymentsService } from "@/lib/services/payments";

let stripe: Stripe | undefined;

function getStripe(): Stripe {
  stripe ??= new Stripe(requireEnv("STRIPE_SECRET_KEY").STRIPE_SECRET_KEY, { maxNetworkRetries: 2 });
  return stripe;
}

function toEvent(event: Stripe.Event): PaymentEvent {
  if (event.type !== "checkout.session.completed" && event.type !== "checkout.session.async_payment_succeeded") {
    return { type: "ignored", reason: event.type };
  }
  const session = event.data.object;
  if (session.payment_status !== "paid") return { type: "ignored", reason: `payment_status=${session.payment_status}` };

  const resultId = session.metadata?.result_id ?? session.client_reference_id;
  // Sessions created before the offers existed carry no `offer`: they were single searches.
  const offer = session.metadata?.offer ?? "single";
  if (!resultId || !isOfferId(offer) || !session.amount_total) return { type: "ignored", reason: "missing metadata" };

  return {
    type: "checkout_completed",
    sessionId: session.id,
    paymentIntentId: typeof session.payment_intent === "string" ? session.payment_intent : (session.payment_intent?.id ?? null),
    resultId,
    offer,
    amountGrosze: session.amount_total,
  };
}

/** Stripe Checkout (BLIK and card enabled in the Dashboard), refunds via Stripe Refunds. */
export function createRealPayments(): PaymentsService {
  return {
    async createCheckout({ resultId, offer, amountGrosze, successUrl, cancelUrl }) {
      const metadata = { result_id: resultId, offer };
      const session = await getStripe().checkout.sessions.create({
        mode: "payment",
        // Inline price: the amount is decided by the server (promo or regular), no Stripe Price objects to keep in sync.
        line_items: [
          {
            price_data: {
              currency: "pln",
              unit_amount: amountGrosze,
              product_data: { name: OFFERS[offer].checkoutName },
            },
            quantity: 1,
          },
        ],
        // BLIK first, card second. This API version uses dynamic payment methods: the list filters
        // what is enabled in the Dashboard, and Stripe decides the final order (BLIK is shown
        // first for Polish customers). Both must be enabled in Dashboard → Payment methods.
        allowed_payment_method_types: ["blik", "card"],
        currency: "pln",
        locale: "pl",
        client_reference_id: resultId,
        metadata,
        payment_intent_data: { metadata },
        success_url: successUrl,
        cancel_url: cancelUrl,
      });
      if (!session.url) throw new Error("Stripe did not return a checkout URL");
      return { sessionId: session.id, url: session.url };
    },

    async refund({ sessionId, paymentIntentId, idempotencyKey }) {
      let intent = paymentIntentId;
      if (!intent) {
        const session = await getStripe().checkout.sessions.retrieve(sessionId);
        intent = typeof session.payment_intent === "string" ? session.payment_intent : (session.payment_intent?.id ?? null);
      }
      if (!intent) throw new Error("No payment intent to refund");
      const refund = await getStripe().refunds.create({ payment_intent: intent }, { idempotencyKey });
      return { refundId: refund.id };
    },

    async verifyWebhook(rawBody, signature) {
      if (!signature) return null;
      try {
        const event = getStripe().webhooks.constructEvent(rawBody, signature, requireEnv("STRIPE_WEBHOOK_SECRET").STRIPE_WEBHOOK_SECRET);
        return toEvent(event);
      } catch {
        return null;
      }
    },
  };
}
