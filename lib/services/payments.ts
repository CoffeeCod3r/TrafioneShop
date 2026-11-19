/**
 * Payments service. Implementations: Stripe Checkout (impl/payments-real.ts) and demo
 * (impl/payments-demo.ts, which opens /demo-checkout instead of Stripe).
 * The rest of the code uses only this interface via getPayments().
 */
import type { PurchaseOffer } from "@/lib/db";
import { isRealService } from "@/lib/mode";
import { createDemoPayments } from "@/lib/services/impl/payments-demo";
import { createRealPayments } from "@/lib/services/impl/payments-real";

export type CheckoutInput = {
  resultId: string;
  offer: PurchaseOffer;
  /** Amount to charge in grosze, decided on the server (see lib/offers-server.ts). */
  amountGrosze: number;
  /** May contain Stripe's {CHECKOUT_SESSION_ID} placeholder. */
  successUrl: string;
  cancelUrl: string;
};

export type CheckoutSession = { sessionId: string; url: string };

/** Provider-independent payment event, handled by lib/paid/handle-payment.ts. */
export type PaymentEvent =
  | {
      type: "checkout_completed";
      sessionId: string;
      paymentIntentId: string | null;
      resultId: string;
      offer: PurchaseOffer;
      amountGrosze: number;
    }
  | { type: "ignored"; reason: string };

export type PaymentsService = {
  createCheckout(input: CheckoutInput): Promise<CheckoutSession>;
  /** Full refund. The idempotency key makes retries safe (never refunds twice). */
  refund(input: { sessionId: string; paymentIntentId: string | null; idempotencyKey: string }): Promise<{ refundId: string }>;
  /** Returns null when the signature is invalid. */
  verifyWebhook(rawBody: string, signature: string | null): Promise<PaymentEvent | null>;
};

let service: PaymentsService | undefined;

export function getPayments(): PaymentsService {
  service ??= isRealService("payments") ? createRealPayments() : createDemoPayments();
  return service;
}
