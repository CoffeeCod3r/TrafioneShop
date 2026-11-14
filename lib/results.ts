import { randomBytes } from "node:crypto";

import type { GiftPick } from "@/lib/ai/picks";
import type { StyleProfile } from "@/lib/analyze/schema";
import { getDb, type ProductRow, type ResultRow } from "@/lib/db";
import type { QuizAnswers } from "@/lib/quiz/schema";

/** No 0/O/1/I/L to avoid confusion when the code is typed or read aloud. */
const REF_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
export const REF_CODE_LENGTH = 7;

export function generateRefCode(length = REF_CODE_LENGTH): string {
  const bytes = randomBytes(length);
  let code = "";
  for (const byte of bytes) code += REF_ALPHABET[byte % REF_ALPHABET.length];
  return code;
}

/** Saves the result (answers and profile only, never the photo). Returns id and ref_code. */
export async function createResult(input: {
  answers: QuizAnswers;
  profile: StyleProfile;
  picks: GiftPick[];
}): Promise<{ id: string; refCode: string }> {
  const { answers, profile, picks } = input;
  const db = getDb();

  for (let attempt = 1; attempt <= 3; attempt++) {
    const refCode = generateRefCode();
    const { data, error } = await db
      .from("results")
      .insert({
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
      })
      .select("id, ref_code")
      .single();

    if (!error) return { id: data.id, refCode: data.ref_code ?? refCode };
    // 23505 = unique violation (ref_code collision): try a new code.
    if (error.code !== "23505") throw new Error(`Saving result failed (${error.code ?? "unknown"})`);
  }
  throw new Error("Saving result failed (ref_code collisions)");
}

export type ResultProduct = Pick<
  ProductRow,
  "id" | "name" | "price_pln" | "merchant" | "image_url" | "affiliate_url" | "in_stock"
> & { reason: string };

export type ResultView = {
  result: Pick<ResultRow, "id" | "created_at" | "style_profile" | "tags" | "ref_code" | "budget_pln" | "paid_status">;
  products: ResultProduct[];
};

/** Result with its products in pick order. Returns null when not found. */
export async function getResultView(id: string): Promise<ResultView | null> {
  const db = getDb();
  const { data: result, error } = await db
    .from("results")
    .select("id, created_at, style_profile, tags, ref_code, budget_pln, paid_status, product_ids, reasons")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`Loading result failed (${error.code ?? "unknown"})`);
  if (!result) return null;

  const reasons = (result.reasons ?? {}) as Record<string, string>;
  let products: ResultProduct[] = [];
  if (result.product_ids.length > 0) {
    const { data, error: productsError } = await db
      .from("products")
      .select("id, name, price_pln, merchant, image_url, affiliate_url, in_stock")
      .in("id", result.product_ids);
    if (productsError) throw new Error(`Loading products failed (${productsError.code ?? "unknown"})`);
    const byId = new Map(data.map((product) => [product.id, product]));
    products = result.product_ids
      .map((productId) => byId.get(productId))
      .filter((product): product is NonNullable<typeof product> => Boolean(product))
      .map((product) => ({ ...product, reason: reasons[product.id] ?? "" }));
  }

  return {
    result: {
      id: result.id,
      created_at: result.created_at,
      style_profile: result.style_profile,
      tags: result.tags,
      ref_code: result.ref_code,
      budget_pln: result.budget_pln,
      paid_status: result.paid_status,
    },
    products,
  };
}
