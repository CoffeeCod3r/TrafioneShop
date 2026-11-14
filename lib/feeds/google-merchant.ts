import type { FeedAdapter, FeedContext, RawProduct } from "./types.ts";
import { child, childText, findAll, parseXml, type XmlNode } from "./xml.ts";

/**
 * Google Merchant Center XML (RSS 2.0 `<item>` or Atom `<entry>` with `g:` fields).
 * Many affiliate networks and shops export product feeds in this format.
 */
export function parseGoogleMerchantFeed(body: string, context: FeedContext): RawProduct[] {
  const root = parseXml(body);
  const channelTitle = findAll(root, ["channel"])[0];
  const merchant =
    (channelTitle && childText(channelTitle, ["title"])) || hostnameOf(context.sourceUrl);

  return findAll(root, ["item", "entry"]).map((item) => {
    const salePrice = childText(item, ["g:sale_price", "sale_price"]);
    const price = salePrice ?? childText(item, ["g:price", "price"]);
    const availability = childText(item, ["g:availability", "availability"])?.toLowerCase();

    return {
      externalId: childText(item, ["g:id", "id"]),
      name: childText(item, ["g:title", "title"]),
      description: childText(item, ["g:description", "description", "summary"]),
      price,
      category:
        childText(item, ["g:product_type", "product_type"]) ??
        childText(item, ["g:google_product_category", "google_product_category"]),
      imageUrl: childText(item, ["g:image_link", "image_link"]),
      url: childText(item, ["g:link", "link"]) ?? atomLinkHref(item),
      merchant: childText(item, ["g:brand_store", "g:store"]) ?? merchant,
      inStock: availability === undefined ? true : !/out[ _]of[ _]stock|niedost/.test(availability),
    } satisfies RawProduct;
  });
}

function atomLinkHref(item: XmlNode): string | undefined {
  return child(item, ["link"])?.attrs.href;
}

export function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "unknown";
  }
}

export function googleMerchantAdapter(network: string): FeedAdapter {
  return { network, parse: parseGoogleMerchantFeed };
}
