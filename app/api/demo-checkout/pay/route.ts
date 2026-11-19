import { after } from "next/server";
import { z } from "zod";

import { describeError, logEvent } from "@/lib/log";
import { isMockMode } from "@/lib/mode";
import { getOffersQuote } from "@/lib/offers-server";
import { handlePaymentEvent } from "@/lib/paid/handle-payment";
import type { PaymentEvent } from "@/lib/services/payments";

// Vercel Hobby (Fluid compute): 300 s is both default and maximum. The web search runs
// in the background via `after` (waitUntil) and is capped well below this.
export const maxDuration = 300;

const bodySchema = z.object({
  session: z.string().startsWith("demo_cs_").max(100),
  resultId: z.uuid(),
  offer: z.enum(["single", "pack8"]),
  amount: z.number().int().positive(),
});

/**
 * POST /api/demo-checkout/pay – "Zapłać (demo)". Builds the same PaymentEvent a Stripe
 * webhook would produce and passes it to the same handler. Exists only in MOCK_MODE.
 */
export async function POST(request: Request) {
  if (!isMockMode()) return Response.json({ error: "Not found" }, { status: 404 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Nieprawidłowa sesja demo." }, { status: 400 });

  const { session, resultId, offer, amount } = parsed.data;
  if (amount !== getOffersQuote().prices[offer]) {
    return Response.json({ error: "Cena się zmieniła (promocja się skończyła). Wróć do wyniku i spróbuj ponownie." }, { status: 409 });
  }

  const event: PaymentEvent = {
    type: "checkout_completed",
    sessionId: session,
    paymentIntentId: `demo_pi_${session.slice("demo_cs_".length)}`,
    resultId,
    offer,
    amountGrosze: amount,
  };

  try {
    const { status } = await handlePaymentEvent(event, after);
    if (status === "ignored") return Response.json({ error: "Nie znaleziono wyniku." }, { status: 404 });
    // Packs set their cookie on the way back, exactly like the real Stripe return URL.
    const redirect =
      offer === "pack8"
        ? `/api/pack/claim?session_id=${encodeURIComponent(session)}&result=${resultId}`
        : `/wynik/${resultId}?platnosc=ok`;
    return Response.json({ redirect });
  } catch (error) {
    logEvent("demo_checkout.failed", describeError(error));
    return Response.json({ error: "Płatność demo nie powiodła się." }, { status: 500 });
  }
}
