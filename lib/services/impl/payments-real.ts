import Stripe from "stripe";

import type { PriceVariant } from "@/lib/db";
import { getServiceEnv } from "@/lib/env";
import type { PaymentEvent, PaymentsService } from "@/lib/services/payments";

let stripe: Stripe | undefined;

function getStripe(): Stripe {
  stripe ??= new Stripe(getServiceEnv().STRIPE_SECRET_KEY, { maxNetworkRetries: 2 });
  return stripe;
}

function parseVariant(value: string | undefined): PriceVariant | null {
  return value === "499" ? 499 : value === "999" ? 999 : null;
}

function toEvent(event: Stripe.Event): PaymentEvent {
  if (event.type !== "checkout.session.completed" && event.type !== "checkout.session.async_payment_succeeded") {
    return { type: "ignored", reason: event.type };
  }
  const session = event.data.object;
  if (session.payment_status !== "paid") return { type: "ignored", reason: `payment_status=${session.payment_status}` };

  const resultId = session.metadata?.result_id ?? session.client_reference_id;
  const priceVariant = parseVariant(session.metadata?.price_variant);
  if (!resultId || !priceVariant) return { type: "ignored", reason: "missing metadata" };

  return {
    type: "checkout_completed",
    sessionId: session.id,
    paymentIntentId: typeof session.payment_intent === "string" ? session.payment_intent : (session.payment_intent?.id ?? null),
    resultId,
    amountGrosze: session.amount_total ?? priceVariant,
    priceVariant,
  };
}

/** Stripe Checkout (BLIK and card enabled in the Dashboard), refunds via Stripe Refunds. */
export function createRealPayments(): PaymentsService {
  return {
    async createCheckout({ resultId, priceVariant, successUrl, cancelUrl }) {
      const env = getServiceEnv();
      const session = await getStripe().checkout.sessions.create({
        mode: "payment",
        line_items: [{ price: priceVariant === 499 ? env.STRIPE_PRICE_ID_A : env.STRIPE_PRICE_ID_B, quantity: 1 }],
        // BLIK first, card second. This API version uses dynamic payment methods: the list filters
        // what is enabled in the Dashboard, and Stripe decides the final order (BLIK is shown
        // first for Polish customers). Both must be enabled in Dashboard → Payment methods.
        allowed_payment_method_types: ["blik", "card"],
        currency: "pln",
        locale: "pl",
        client_reference_id: resultId,
        metadata: { result_id: resultId, price_variant: String(priceVariant) },
        payment_intent_data: { metadata: { result_id: resultId, price_variant: String(priceVariant) } },
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
        const event = getStripe().webhooks.constructEvent(rawBody, signature, getServiceEnv().STRIPE_WEBHOOK_SECRET);
        return toEvent(event);
      } catch {
        return null;
      }
    },
  };
}
