import { z } from "zod";

import { getEnv } from "@/lib/env";
import { describeError, logEvent } from "@/lib/log";
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

    const { resultId } = parsed.data;
    const repos = getRepos();
    const result = await repos.results.getById(resultId);
    if (!result) return Response.json({ error: "Nie znaleziono wyniku." }, { status: 404 });
    if (result.paid_status !== "none" && result.paid_status !== "pending") {
      return Response.json({ error: "To wyszukiwanie zostało już opłacone." }, { status: 409 });
    }

    const priceVariant = result.price_variant ?? pickPriceVariant();
    await repos.results.update(resultId, { price_variant: priceVariant, paid_status: "pending" });

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
