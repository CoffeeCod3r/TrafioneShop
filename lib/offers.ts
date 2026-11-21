/**
 * Paid offers. Pure data and helpers, safe for client and server code (no env access here;
 * the promo deadline is read on the server in lib/offers-server.ts and passed down).
 *
 * single: one web search, fixed price.
 * pack8:  8 web searches for 8 different recipients. Promo price until the promo deadline,
 *         then the regular price. The price shown is always the price charged: the server
 *         rejects a checkout whose expected amount no longer matches.
 */
import type { PurchaseOffer } from "./db.ts";

export type Offer = {
  id: PurchaseOffer;
  /** Name shown on the Stripe Checkout page. */
  checkoutName: string;
  searches: number;
  /** Price in grosze outside the promotion. */
  regularGrosze: number;
  /** Price in grosze during the promotion; null when the offer has no promotion. */
  promoGrosze: number | null;
};

export const OFFERS: Record<PurchaseOffer, Offer> = {
  single: { id: "single", checkoutName: "Więcej propozycji: 10 prezentów z całego internetu", searches: 1, regularGrosze: 499, promoGrosze: null },
  pack8: {
    id: "pack8",
    checkoutName: "Więcej propozycji: pakiet na 8 osób",
    searches: 8,
    regularGrosze: 1999,
    promoGrosze: 1299,
  },
};

export const OFFER_IDS = Object.keys(OFFERS) as PurchaseOffer[];

export function isOfferId(value: unknown): value is PurchaseOffer {
  return typeof value === "string" && (OFFER_IDS as string[]).includes(value);
}

/** Black Friday 2026: promo ends on 27 November at the end of the day (Warsaw time, UTC+1). */
export const DEFAULT_PROMO_ENDS_AT = "2026-11-27T23:59:59+01:00";

export function isPromoActive(endsAt: Date | null, now: Date = new Date()): boolean {
  return endsAt !== null && now.getTime() < endsAt.getTime();
}

/** Price in grosze that is charged right now. */
export function priceFor(offer: Offer, promoActive: boolean): number {
  return promoActive && offer.promoGrosze !== null ? offer.promoGrosze : offer.regularGrosze;
}

/** Price of one search when the same number of searches is bought one by one. */
export function singlesTotal(searches: number): number {
  return OFFERS.single.regularGrosze * searches;
}
