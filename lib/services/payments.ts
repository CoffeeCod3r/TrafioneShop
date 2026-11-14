/**
 * Payments service. Implementations: Stripe Checkout (impl/payments-real.ts) and demo
 * (impl/payments-demo.ts, which opens /demo-checkout instead of Stripe).
 * The rest of the code uses only this interface via getPayments().
 */
import type { PriceVariant } from "@/lib/db";
import { isMockMode } from "@/lib/mode";
import { createDemoPayments } from "@/lib/services/impl/payments-demo";
import { createRealPayments } from "@/lib/services/impl/payments-real";

export type CheckoutInput = {
  resultId: string;
  priceVariant: PriceVariant;
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
      amountGrosze: number;
      priceVariant: PriceVariant;
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
  service ??= isMockMode() ? createDemoPayments() : createRealPayments();
  return service;
}
