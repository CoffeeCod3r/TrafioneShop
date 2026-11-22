import type { ProductCardData } from "@/components/products/product-card";
import type { GuideProductView } from "@/lib/guides/products";
import type { WebPick } from "@/lib/paid/schema";
import type { ResultProduct } from "@/lib/results";

/**
 * A photo is shown only for partner-feed products. Everything found on the web ("direct", and the old "demo" rows)
 * uses the category illustration: shop photos are never fetched, stored or shown.
 */
export function feedPhoto(network: string, imageUrl: string | null): string | null {
  return network === "direct" || network === "demo" ? null : imageUrl;
}

/** Free result (catalog or web picks stored as products). */
export function fromResultProduct(product: ResultProduct, position: number, resultId: string, shared: boolean): ProductCardData {
  return {
    id: `produkt-${position}`,
    name: product.name,
    pricePln: product.price_pln,
    checkedAt: product.checked_at,
    shop: product.merchant,
    reason: product.reason || null,
    category: product.category,
    photoUrl: feedPhoto(product.network, product.image_url),
    href: `/go/${product.id}?r=${resultId}${shared ? "&src=share" : ""}`,
    track: { source: shared ? "share" : "free", position },
    badge: position,
    replaces: product.replaces,
    revealDelayMs: 150 + position * 90,
  };
}

/** Paid result: products of the open-web search (always "direct": no shop photo, the illustration is used). */
export function fromWebPick(pick: WebPick, index: number, resultId: string): ProductCardData {
  return {
    name: pick.title,
    pricePln: pick.pricePln,
    checkedAt: pick.checkedAt,
    shop: pick.shopName ?? pick.shopDomain,
    reason: pick.reason || null,
    category: pick.category ?? null,
    photoUrl: null,
    href: `/go/w/${resultId}/${index}`,
    track: { source: "web", position: index + 1 },
  };
}

/** Product in a guide. */
export function fromGuideProduct(product: GuideProductView): ProductCardData {
  return {
    name: product.name,
    pricePln: product.price_pln,
    checkedAt: product.checked_at,
    shop: product.merchant,
    reason: product.reason || null,
    category: product.category,
    photoUrl: feedPhoto(product.network, product.image_url),
    href: `/go/${product.id}`,
  };
}
