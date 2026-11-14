import { randomBytes, randomInt } from "node:crypto";

import type { StyleProfile } from "@/lib/analyze/schema";
import type { PriceVariant, ProductRow, ResultRow } from "@/lib/db";
import type { Dedications, WebPick } from "@/lib/paid/schema";
import type { QuizAnswers } from "@/lib/quiz/schema";
import type { GiftPick } from "@/lib/services/ai";
import { getRepos } from "@/lib/services/db";

/** No 0/O/1/I/L to avoid confusion when the code is typed or read aloud. */
const REF_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
export const REF_CODE_LENGTH = 7;
export const PRICE_VARIANTS: readonly PriceVariant[] = [499, 999];

export function generateRefCode(length = REF_CODE_LENGTH): string {
  const bytes = randomBytes(length);
  let code = "";
  for (const byte of bytes) code += REF_ALPHABET[byte % REF_ALPHABET.length];
  return code;
}

/** A/B price for paid search, assigned once per result so the shown price never changes. */
export function pickPriceVariant(): PriceVariant {
  return PRICE_VARIANTS[randomInt(PRICE_VARIANTS.length)];
}

/** Saves the result (answers and profile only, never the photo). Returns id and ref_code. */
export async function createResult(input: {
  answers: QuizAnswers;
  profile: StyleProfile;
  picks: GiftPick[];
}): Promise<{ id: string; refCode: string }> {
  const { answers, profile, picks } = input;
  const results = getRepos().results;

  for (let attempt = 1; attempt <= 3; attempt++) {
    const refCode = generateRefCode();
    try {
      const row = await results.create({
        recipient: answers.recipient,
        budget_pln: answers.budget,
        occasion: answers.occasion,
        answers,
        style_profile: profile.styleProfile,
        tags: profile.tags,
        avoid: profile.avoid,
        product_ids: picks.map((pick) => pick.productId),
        reasons: Object.fromEntries(picks.map((pick) => [pick.productId, pick.reason])),
        ref_code: refCode,
        price_variant: pickPriceVariant(),
      });
      return { id: row.id, refCode: row.ref_code ?? refCode };
    } catch (error) {
      // 23505 = unique violation (ref_code collision): try a new code.
      if ((error as { code?: string }).code !== "23505") throw error;
    }
  }
  throw new Error("Saving result failed (ref_code collisions)");
}

export type ResultProduct = Pick<
  ProductRow,
  "id" | "name" | "price_pln" | "merchant" | "image_url" | "affiliate_url" | "in_stock"
> & { reason: string };

export type ResultView = {
  result: Pick<
    ResultRow,
    "id" | "created_at" | "style_profile" | "tags" | "ref_code" | "budget_pln" | "paid_status" | "price_variant"
  > & { webPicks: WebPick[] | null; dedications: Dedications | null };
  products: ResultProduct[];
};

/** Result with its products in pick order. Returns null when not found. */
export async function getResultView(id: string): Promise<ResultView | null> {
  const repos = getRepos();
  const result = await repos.results.getById(id);
  if (!result) return null;

  const reasons = (result.reasons ?? {}) as Record<string, string>;
  const rows = await repos.products.getByIds(result.product_ids);
  const byId = new Map(rows.map((product) => [product.id, product]));
  const products = result.product_ids
    .map((productId) => byId.get(productId))
    .filter((product): product is ProductRow => Boolean(product))
    .map((product) => ({
      id: product.id,
      name: product.name,
      price_pln: product.price_pln,
      merchant: product.merchant,
      image_url: product.image_url,
      affiliate_url: product.affiliate_url,
      in_stock: product.in_stock,
      reason: reasons[product.id] ?? "",
    }));

  return {
    result: {
      id: result.id,
      created_at: result.created_at,
      style_profile: result.style_profile,
      tags: result.tags,
      ref_code: result.ref_code,
      budget_pln: result.budget_pln,
      paid_status: result.paid_status,
      price_variant: result.price_variant,
      webPicks: (result.web_picks as WebPick[] | null) ?? null,
      dedications: (result.dedications as Dedications | null) ?? null,
    },
    products,
  };
}
