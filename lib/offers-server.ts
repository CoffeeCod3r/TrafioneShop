import { getEnv } from "@/lib/env";
import { CHECKOUT_OFFERS, DEFAULT_PROMO_ENDS_AT, isPromoActive, OFFERS, priceFor } from "@/lib/offers";

/** What the offer picker and the checkout agree on at one moment in time. */
export type OffersQuote = {
  /** ISO timestamp of the promo deadline, or null when there is no promo. */
  promoEndsAt: string | null;
  promoActive: boolean;
  /** Server clock, so the browser countdown is not skewed by a wrong device clock. */
  serverNow: number;
  prices: { single: number; pack10: number };
};

/** Promo deadline: PROMO_ENDS_AT (ISO 8601) or the built-in Black Friday date. */
export function getPromoEndsAt(): Date | null {
  const configured = getEnv().PROMO_ENDS_AT?.trim();
  const date = new Date(configured || DEFAULT_PROMO_ENDS_AT);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function getOffersQuote(now: Date = new Date()): OffersQuote {
  const endsAt = getPromoEndsAt();
  // A promotion exists only while some offer has a promo price (today none has).
  const promoActive = isPromoActive(endsAt, now) && CHECKOUT_OFFERS.some((id) => OFFERS[id].promoGrosze !== null);
  return {
    promoEndsAt: endsAt ? endsAt.toISOString() : null,
    promoActive,
    serverNow: now.getTime(),
    prices: { single: priceFor(OFFERS.single, promoActive), pack10: priceFor(OFFERS.pack10, promoActive) },
  };
}
