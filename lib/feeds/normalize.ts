import type { Insert } from "../db.ts";
import { tagsForProduct } from "../tags.ts";
import type { RawProduct } from "./types.ts";

export const MAX_PRICE_PLN = 1000;

/** What the importer writes. commission_rate is managed separately and never overwritten. */
export type ProductUpsert = Omit<Insert<"products">, "id" | "updated_at" | "commission_rate">;

export const REJECT_REASONS = [
  "missing_id",
  "missing_name",
  "missing_price",
  "invalid_price",
  "too_expensive",
  "wrong_currency",
  "missing_image",
  "missing_link",
] as const;
export type RejectReason = (typeof REJECT_REASONS)[number];

export type NormalizeResult =
  | { ok: true; product: ProductUpsert }
  | { ok: false; reason: RejectReason };

/** Parses "49.99", "49,99 zł", "1 299,00 PLN", "1.299,00", "1,299.00". */
export function parsePrice(value: string | undefined): number | null {
  if (!value) return null;
  let text = value.replace(/[^\d.,-]/g, "");
  if (!text || !/\d/.test(text)) return null;

  const lastDot = text.lastIndexOf(".");
  const lastComma = text.lastIndexOf(",");
  if (lastDot !== -1 && lastComma !== -1) {
    const decimal = lastDot > lastComma ? "." : ",";
    const thousands = decimal === "." ? "," : ".";
    text = text.split(thousands).join("").replace(decimal, ".");
  } else if (lastComma !== -1) {
    text = /^\d{1,3}(,\d{3})+$/.test(text) ? text.replace(/,/g, "") : text.replace(",", ".");
  } else if (/^\d{1,3}(\.\d{3}){2,}$/.test(text)) {
    text = text.replace(/\./g, "");
  }

  const price = Number(text);
  return Number.isFinite(price) ? Math.round(price * 100) / 100 : null;
}

function detectCurrency(raw: RawProduct): string | undefined {
  const explicit = raw.currency?.trim().toUpperCase();
  if (explicit) return explicit === "ZŁ" || explicit === "ZL" ? "PLN" : explicit;
  const match = raw.price?.match(/[A-Za-z]{3}|zł/i)?.[0];
  if (!match) return undefined;
  return match.toLowerCase() === "zł" ? "PLN" : match.toUpperCase();
}

function isHttpUrl(value: string | undefined): value is string {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function cleanText(value: string | undefined, maxLength: number): string | null {
  if (!value) return null;
  const text = value
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .trim();
  return text ? text.slice(0, maxLength) : null;
}

export function normalizeProduct(raw: RawProduct, network: string, fallbackMerchant: string): NormalizeResult {
  const externalId = raw.externalId?.trim();
  if (!externalId) return { ok: false, reason: "missing_id" };

  const name = cleanText(raw.name, 300);
  if (!name) return { ok: false, reason: "missing_name" };

  if (!raw.price?.trim()) return { ok: false, reason: "missing_price" };
  const currency = detectCurrency(raw);
  if (currency && currency !== "PLN") return { ok: false, reason: "wrong_currency" };
  const price = parsePrice(raw.price);
  if (price === null || price <= 0) return { ok: false, reason: "invalid_price" };
  if (price > MAX_PRICE_PLN) return { ok: false, reason: "too_expensive" };

  const imageUrl = raw.imageUrl?.trim();
  if (!isHttpUrl(imageUrl)) return { ok: false, reason: "missing_image" };

  const url = raw.url?.trim();
  if (!isHttpUrl(url)) return { ok: false, reason: "missing_link" };

  const category = cleanText(raw.category, 300);

  return {
    ok: true,
    product: {
      network,
      merchant: cleanText(raw.merchant, 200) ?? fallbackMerchant,
      external_id: externalId.slice(0, 200),
      name,
      description: cleanText(raw.description, 2000),
      price_pln: price,
      category,
      tags: tagsForProduct(category, name),
      image_url: imageUrl,
      affiliate_url: url,
      in_stock: raw.inStock ?? true,
    },
  };
}
