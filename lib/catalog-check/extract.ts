/**
 * Reads price and availability from a product page WITHOUT any AI: schema.org JSON-LD (Product / Offer /
 * AggregateOffer) first, then meta tags (product:price:amount, og:price:amount, itemprop="price", ...).
 * Portable (no imports): used by the Next.js app, the scripts and the Supabase Edge Function `check-links`.
 */

export type Availability = "in_stock" | "out_of_stock" | "unknown";

export type PageInfo = {
  /** Price in the page's currency; null when the page does not state one. */
  price: number | null;
  currency: string | null;
  availability: Availability;
  source: "jsonld" | "meta" | "none";
};

const OUT_OF_STOCK = /(outofstock|soldout|discontinued|out of stock|out_of_stock|oos|niedostepn|brak)/i;
const IN_STOCK = /(instock|in stock|in_stock|limitedavailability|onlineonly|instoreonly|dostepn)/i;

function classifyAvailability(value: unknown): Availability {
  if (typeof value !== "string") return "unknown";
  const text = value.normalize("NFD").replace(/[̀-ͯ]/g, "");
  // "OutOfStock" must win over "InStock" inside "...schema.org/OutOfStock" (no overlap, but be explicit).
  if (OUT_OF_STOCK.test(text)) return "out_of_stock";
  if (IN_STOCK.test(text)) return "in_stock";
  return "unknown";
}

/** "49,99", "1 299,00", "1.299,00", "49.99", 49.99 -> number; anything else -> null. */
export function parsePrice(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) && value >= 0 ? value : null;
  if (typeof value !== "string") return null;
  let text = value.replace(/[^\d.,-]/g, "");
  if (!/\d/.test(text)) return null;
  const lastDot = text.lastIndexOf(".");
  const lastComma = text.lastIndexOf(",");
  if (lastDot !== -1 && lastComma !== -1) {
    const decimal = lastDot > lastComma ? "." : ",";
    const thousands = decimal === "." ? "," : ".";
    text = text.split(thousands).join("").replace(decimal, ".");
  } else if (lastComma !== -1) {
    text = /^\d{1,3}(,\d{3})+$/.test(text) ? text.replace(/,/g, "") : text.replace(",", ".");
  }
  const number = Number(text);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

type Json = unknown;
const asArray = (value: Json): Json[] => (Array.isArray(value) ? value : value === undefined || value === null ? [] : [value]);
const isObject = (value: Json): value is Record<string, Json> => typeof value === "object" && value !== null && !Array.isArray(value);

function hasType(node: Record<string, Json>, wanted: string): boolean {
  return asArray(node["@type"]).some((type) => typeof type === "string" && type.toLowerCase().endsWith(wanted.toLowerCase()));
}

/** Every object in a JSON-LD document (handles @graph, arrays and nesting). */
function* walk(node: Json, depth = 0): Generator<Record<string, Json>> {
  if (depth > 8) return;
  if (Array.isArray(node)) {
    for (const item of node) yield* walk(item, depth + 1);
  } else if (isObject(node)) {
    yield node;
    for (const value of Object.values(node)) if (typeof value === "object" && value !== null) yield* walk(value, depth + 1);
  }
}

type OfferData = { price: number | null; currency: string | null; availability: Availability };

function readOffer(offer: Record<string, Json>): OfferData[] {
  const result: OfferData[] = [];
  const spec = isObject(offer.priceSpecification) ? offer.priceSpecification : asArray(offer.priceSpecification).find(isObject);
  const price =
    parsePrice(offer.price) ?? parsePrice(offer.lowPrice) ?? (isObject(spec) ? parsePrice(spec.price) : null);
  const currencyRaw = offer.priceCurrency ?? (isObject(spec) ? spec.priceCurrency : undefined);
  const currency = typeof currencyRaw === "string" ? currencyRaw.toUpperCase() : null;
  result.push({ price, currency, availability: classifyAvailability(offer.availability) });
  // AggregateOffer / offer lists: look inside as well.
  for (const nested of asArray(offer.offers)) if (isObject(nested)) result.push(...readOffer(nested));
  return result;
}

function fromJsonLd(html: string): PageInfo | null {
  const blocks = html.matchAll(/<script\b[^>]*type\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi);
  const offers: OfferData[] = [];
  for (const block of blocks) {
    let data: Json;
    try {
      data = JSON.parse(block[1].trim().replace(/^<!--|-->$/g, ""));
    } catch {
      continue;
    }
    for (const node of walk(data)) {
      if (!hasType(node, "Product")) continue;
      for (const offer of asArray(node.offers)) if (isObject(offer)) offers.push(...readOffer(offer));
    }
  }
  if (offers.length === 0) return null;
  const priced = offers.find((offer) => offer.price !== null) ?? null;
  const availabilities = offers.map((offer) => offer.availability).filter((value) => value !== "unknown");
  let availability: Availability = "unknown";
  if (availabilities.includes("in_stock")) availability = "in_stock";
  else if (availabilities.length > 0 && availabilities.every((value) => value === "out_of_stock")) availability = "out_of_stock";
  return { price: priced?.price ?? null, currency: priced?.currency ?? null, availability, source: "jsonld" };
}

function attribute(tag: string, name: string): string | null {
  const match = new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i").exec(tag);
  return match ? (match[2] ?? match[3] ?? match[4] ?? null) : null;
}

function fromMeta(html: string): PageInfo | null {
  const meta = new Map<string, string>();
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const key = (attribute(tag, "property") ?? attribute(tag, "name") ?? attribute(tag, "itemprop"))?.toLowerCase();
    const content = attribute(tag, "content");
    if (key && content !== null && !meta.has(key)) meta.set(key, content);
  }
  const price = parsePrice(meta.get("product:price:amount") ?? meta.get("og:price:amount") ?? meta.get("price"));
  const currencyRaw = meta.get("product:price:currency") ?? meta.get("og:price:currency") ?? meta.get("pricecurrency");
  const availability = classifyAvailability(meta.get("product:availability") ?? meta.get("og:availability") ?? meta.get("availability"));
  if (price === null && availability === "unknown") return null;
  return { price, currency: currencyRaw ? currencyRaw.toUpperCase() : null, availability, source: "meta" };
}

export function extractPageInfo(html: string): PageInfo {
  const jsonLd = fromJsonLd(html);
  // JSON-LD can state availability without a price (or the other way round): complete it from the meta tags.
  if (jsonLd && jsonLd.price !== null) return jsonLd;
  const meta = fromMeta(html);
  if (jsonLd && meta) {
    return {
      price: meta.price,
      currency: meta.currency,
      availability: jsonLd.availability !== "unknown" ? jsonLd.availability : meta.availability,
      source: "jsonld",
    };
  }
  return jsonLd ?? meta ?? { price: null, currency: null, availability: "unknown", source: "none" };
}
