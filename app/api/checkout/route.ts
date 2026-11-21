import { z } from "zod";

import { getEnv } from "@/lib/env";
import { describeError, logEvent } from "@/lib/log";
import { OFFERS } from "@/lib/offers";
import { getOffersQuote } from "@/lib/offers-server";
import { canUsePayments } from "@/lib/payments-gate";
import { consumeRateLimit } from "@/lib/rate-limit";
import { getClientIp, hashIp } from "@/lib/request";
import { getRepos } from "@/lib/services/db";
import { getPayments } from "@/lib/services/payments";

const bodySchema = z.object({
  resultId: z.uuid(),
  /** Consent to immediate performance and loss of the right of withdrawal (required by law). */
  consent: z.literal(true),
  offer: z.enum(["single", "pack8"]),
  /** The price the customer saw, in grosze. The server charges only this exact price. */
  expectedAmountGrosze: z.number().int().positive(),
});

/** POST /api/checkout – starts payment for "Szukaj w całym internecie". Returns { url }. */
export async function POST(request: Request) {
  try {
    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return Response.json({ error: "Zaznacz zgodę, aby przejść do płatności." }, { status: 400 });

    if (!(await canUsePayments())) {
      return Response.json({ error: "Płatności będą dostępne już wkrótce." }, { status: 403 });
    }

    const allowed = await consumeRateLimit("checkout", hashIp(getClientIp(request), getEnv().IP_HASH_SALT));
    if (!allowed) return Response.json({ error: "Zbyt wiele prób płatności. Spróbuj jutro." }, { status: 429 });

    const { resultId, offer, expectedAmountGrosze } = parsed.data;
    const repos = getRepos();
    const result = await repos.results.getById(resultId);
    if (!result) return Response.json({ error: "Nie znaleziono wyniku." }, { status: 404 });
    // One result can be paid only once. paid_status changes only in the webhook.
    if (result.paid_status !== "none") {
      return Response.json({ error: "To wyszukiwanie zostało już opłacone." }, { status: 409 });
    }

    // The price is decided here, never by the browser. If the promotion ended (or started) since the
    // page was rendered, the customer must see the new price before paying.
    const amountGrosze = getOffersQuote().prices[offer];
    if (amountGrosze !== expectedAmountGrosze) {
      return Response.json(
        { error: "Cena się zmieniła (promocja właśnie się skończyła). Odśwież stronę, aby zobaczyć aktualną cenę.", priceChanged: true },
        { status: 409 },
      );
    }

    const siteUrl = getEnv().NEXT_PUBLIC_SITE_URL;
    const { url } = await getPayments().createCheckout({
      resultId,
      offer,
      amountGrosze,
      // A pack sets its cookie on the way back (the code derives from the session id Stripe puts in the URL).
      successUrl:
        OFFERS[offer].searches > 1
          ? `${siteUrl}/api/pack/claim?session_id={CHECKOUT_SESSION_ID}&result=${resultId}`
          : `${siteUrl}/wynik/${resultId}?platnosc=ok`,
      cancelUrl: `${siteUrl}/wynik/${resultId}`,
    });
    return Response.json({ url });
  } catch (error) {
    logEvent("checkout.failed", describeError(error));
    return Response.json({ error: "Nie udało się rozpocząć płatności. Spróbuj ponownie." }, { status: 500 });
  }
}
