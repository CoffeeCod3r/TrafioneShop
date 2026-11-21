import { randomUUID } from "node:crypto";
import { z } from "zod";

import { logEvent } from "@/lib/log";
import type { PaymentEvent, PaymentsService } from "@/lib/services/payments";

export const DEMO_WEBHOOK_SIGNATURE = "demo";

const demoEventSchema = z.object({
  type: z.literal("checkout_completed"),
  sessionId: z.string().startsWith("demo_cs_"),
  paymentIntentId: z.string().nullable(),
  resultId: z.uuid(),
  offer: z.enum(["single", "pack10"]),
  amountGrosze: z.number().int().positive(),
});

/** Demo payments: no Stripe. Checkout opens /demo-checkout with "Zapłać (demo)" and "Anuluj". */
export function createDemoPayments(): PaymentsService {
  return {
    async createCheckout({ resultId, offer, amountGrosze, cancelUrl }) {
      const sessionId = `demo_cs_${randomUUID()}`;
      const params = new URLSearchParams({
        session: sessionId,
        result: resultId,
        offer,
        amount: String(amountGrosze),
        cancel: cancelUrl,
      });
      return { sessionId, url: `/demo-checkout?${params}` };
    },

    async refund({ sessionId, idempotencyKey }) {
      const refundId = `demo_re_${idempotencyKey}`;
      logEvent("demo.refund", { sessionId, refundId });
      return { refundId };
    },

    async verifyWebhook(rawBody, signature) {
      if (signature !== DEMO_WEBHOOK_SIGNATURE) return null;
      try {
        const parsed = demoEventSchema.safeParse(JSON.parse(rawBody));
        return parsed.success ? (parsed.data as PaymentEvent) : null;
      } catch {
        return null;
      }
    },
  };
}
