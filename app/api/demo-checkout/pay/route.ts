import { after } from "next/server";
import { z } from "zod";

import { describeError, logEvent } from "@/lib/log";
import { isMockMode } from "@/lib/mode";
import { handlePaymentEvent } from "@/lib/paid/handle-payment";
import type { PaymentEvent } from "@/lib/services/payments";

export const maxDuration = 120;

const bodySchema = z.object({
  session: z.string().startsWith("demo_cs_").max(100),
  resultId: z.uuid(),
  variant: z.union([z.literal(499), z.literal(999)]),
});

/**
 * POST /api/demo-checkout/pay – "Zapłać (demo)". Builds the same PaymentEvent a Stripe
 * webhook would produce and passes it to the same handler. Exists only in MOCK_MODE.
 */
export async function POST(request: Request) {
  if (!isMockMode()) return Response.json({ error: "Not found" }, { status: 404 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Nieprawidłowa sesja demo." }, { status: 400 });

  const { session, resultId, variant } = parsed.data;
  const event: PaymentEvent = {
    type: "checkout_completed",
    sessionId: session,
    paymentIntentId: `demo_pi_${session.slice("demo_cs_".length)}`,
    resultId,
    amountGrosze: variant,
    priceVariant: variant,
  };

  try {
    const { status } = await handlePaymentEvent(event, after);
    if (status === "ignored") return Response.json({ error: "Nie znaleziono wyniku." }, { status: 404 });
    return Response.json({ redirect: `/wynik/${resultId}?platnosc=ok` });
  } catch (error) {
    logEvent("demo_checkout.failed", describeError(error));
    return Response.json({ error: "Płatność demo nie powiodła się." }, { status: 500 });
  }
}
