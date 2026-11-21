/**
 * Paid offers. Pure data and helpers, safe for client and server code (no env access here;
 * the promo deadline is read on the server in lib/offers-server.ts and passed down).
 *
 * single: one web search, fixed price (4.99 PLN).
 * pack10: 10 web searches for 10 different recipients, fixed price (14.99 PLN). An offer may have a
 *         promo price until the promo deadline (promoGrosze); today none has. The price shown is always
 *         the price charged: the server rejects a checkout whose expected amount no longer matches.
 * pack8:  LEGACY pack of 8 (sold before 2026-11-22). Never offered any more; kept so that purchases made
 *         under it (and checkouts still in flight) keep working.
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

/** Offers that can be bought now (pack8 is legacy). */
export type CheckoutOffer = Exclude<PurchaseOffer, "pack8">;
export const CHECKOUT_OFFERS = ["single", "pack10"] as const satisfies readonly CheckoutOffer[];

export const OFFERS: Record<PurchaseOffer, Offer> = {
  single: { id: "single", checkoutName: "Więcej propozycji: 10 prezentów z całego internetu", searches: 1, regularGrosze: 499, promoGrosze: null },
  pack10: {
    id: "pack10",
    checkoutName: "Więcej propozycji: pakiet na 10 osób",
    searches: 10,
    regularGrosze: 1499,
    promoGrosze: null,
  },
  // Legacy, not offered any more.
  pack8: {
    id: "pack8",
    checkoutName: "Więcej propozycji: pakiet na 8 osób",
    searches: 8,
    regularGrosze: 1999,
    promoGrosze: 1299,
  },
};

/** A pack (several searches, held by a cookie / pack link) as opposed to a single search. */
export function isPackOffer(offer: PurchaseOffer): boolean {
  return offer !== "single";
}

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
