import { after } from "next/server";

import { describeError, logEvent } from "@/lib/log";
import { handlePaymentEvent } from "@/lib/paid/handle-payment";
import { getPayments } from "@/lib/services/payments";

// Vercel Hobby (Fluid compute): 300 s is both default and maximum. The web search runs
// in the background via `after` (waitUntil) and is capped well below this.
export const maxDuration = 300;

/** POST /api/stripe/webhook – verified payment events (Stripe signature; demo: see payments-demo). */
export async function POST(request: Request) {
  const rawBody = await request.text();
  const event = await getPayments().verifyWebhook(rawBody, request.headers.get("stripe-signature"));
  if (!event) return Response.json({ error: "Invalid signature" }, { status: 400 });

  try {
    const { status } = await handlePaymentEvent(event, after);
    return Response.json({ received: true, status });
  } catch (error) {
    logEvent("webhook.failed", describeError(error));
    // 500 makes Stripe retry; the handler is idempotent.
    return Response.json({ error: "Webhook handling failed" }, { status: 500 });
  }
}
