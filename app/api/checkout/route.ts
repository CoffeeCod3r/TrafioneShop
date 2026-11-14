import { z } from "zod";

import { getEnv } from "@/lib/env";
import { describeError, logEvent } from "@/lib/log";
import { consumeRateLimit } from "@/lib/rate-limit";
import { getClientIp, hashIp } from "@/lib/request";
import { pickPriceVariant } from "@/lib/results";
import { getRepos } from "@/lib/services/db";
import { getPayments } from "@/lib/services/payments";

const bodySchema = z.object({
  resultId: z.uuid(),
  /** Consent to immediate performance and loss of the right of withdrawal (required by law). */
  consent: z.literal(true),
});

/** POST /api/checkout – starts payment for "Szukaj w całym internecie". Returns { url }. */
export async function POST(request: Request) {
  try {
    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return Response.json({ error: "Zaznacz zgodę, aby przejść do płatności." }, { status: 400 });

    const allowed = await consumeRateLimit("checkout", hashIp(getClientIp(request), getEnv().IP_HASH_SALT));
    if (!allowed) return Response.json({ error: "Zbyt wiele prób płatności. Spróbuj jutro." }, { status: 429 });

    const { resultId } = parsed.data;
    const repos = getRepos();
    const result = await repos.results.getById(resultId);
    if (!result) return Response.json({ error: "Nie znaleziono wyniku." }, { status: 404 });
    // One result can be paid only once. paid_status changes only in the webhook.
    if (result.paid_status !== "none") {
      return Response.json({ error: "To wyszukiwanie zostało już opłacone." }, { status: 409 });
    }

    // The price shown on the result page; assigned at creation, kept forever.
    let priceVariant = result.price_variant;
    if (!priceVariant) {
      priceVariant = pickPriceVariant();
      await repos.results.update(resultId, { price_variant: priceVariant });
    }

    const siteUrl = getEnv().NEXT_PUBLIC_SITE_URL;
    const { url } = await getPayments().createCheckout({
      resultId,
      priceVariant,
      successUrl: `${siteUrl}/wynik/${resultId}?platnosc=ok`,
      cancelUrl: `${siteUrl}/wynik/${resultId}`,
    });
    return Response.json({ url });
  } catch (error) {
    logEvent("checkout.failed", describeError(error));
    return Response.json({ error: "Nie udało się rozpocząć płatności. Spróbuj ponownie." }, { status: 500 });
  }
}
