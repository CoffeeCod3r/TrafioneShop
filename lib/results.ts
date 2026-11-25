import { randomBytes } from "node:crypto";

import type { StyleProfile } from "@/lib/analyze/schema";
import type { FreeSource, ProductRow, ResultRow, SearchStatus } from "@/lib/db";
import { isAllowedTag } from "@/lib/tags";
import type { Dedications, WebPick } from "@/lib/paid/schema";
import type { QuizAnswers } from "@/lib/quiz/schema";
import type { GiftPick } from "@/lib/services/ai";
import { getRepos } from "@/lib/services/db";

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
  summary?: string | null;
  source?: string | null;
  /** "searching": the web search is running in the background and fills in the picks later. */
  searchStatus?: SearchStatus;
  freeSource?: FreeSource | null;
}): Promise<{ id: string; refCode: string }> {
  const { answers, profile, picks, summary = null, source = null, searchStatus = "ready", freeSource = null } = input;
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
        // No A/B price test any more: both offers (single / pack of 8) are shown to everyone.
        price_variant: null,
        source,
        pick_summary: summary,
        search_status: searchStatus,
        free_source: freeSource,
        search_started_at: searchStatus === "searching" ? new Date().toISOString() : null,
      });
      return { id: row.id, refCode: row.ref_code ?? refCode };
    } catch (error) {
      // 23505 = unique violation (ref_code collision): try a new code.
      if ((error as { code?: string }).code !== "23505") throw error;
    }
  }
  throw new Error("Saving result failed (ref_code collisions)");
}

/** Style profile stored on a result (used when a remembered result answers a new request). */
export function profileOf(row: Pick<ResultRow, "style_profile" | "tags" | "avoid">): StyleProfile {
  return {
    styleProfile: row.style_profile ?? "",
    tags: row.tags.filter(isAllowedTag),
    avoid: row.avoid.filter(isAllowedTag),
  };
}

/**
 * Result memory: the same quiz within 24 h gets the ready products of an earlier web search as a NEW result
 * (own id, own paid status). It carries no quiz hash, so memory never extends beyond the original 24 hours.
 */
export async function copyRememberedResult(
  original: ResultRow,
  answers: QuizAnswers,
  source: string | null | undefined,
): Promise<{ resultId: string; refCode: string }> {
  const reasons = (original.reasons ?? {}) as Record<string, string>;
  const { id, refCode } = await createResult({
    answers,
    profile: profileOf(original),
    picks: original.product_ids.map((productId) => ({ productId, reason: reasons[productId] ?? "" })),
    summary: original.pick_summary,
    source,
    freeSource: "cache",
  });
  return { resultId: id, refCode };
}

export type ResultProduct = Pick<
  ProductRow,
  "id" | "name" | "price_pln" | "merchant" | "image_url" | "affiliate_url" | "in_stock" | "category" | "checked_at" | "network"
> & {
  /** Partner catalog product that earns a commission (needs the affiliate disclosure). */
  affiliate: boolean;
  reason: string;
  /** Set when this card replaces an out-of-stock pick: the original product's name. */
  replaces: string | null;
};

export type ResultView = {
  result: Pick<
    ResultRow,
    | "id"
    | "created_at"
    | "recipient"
    | "style_profile"
    | "tags"
    | "ref_code"
    | "budget_pln"
    | "paid_status"
    | "price_variant"
    | "pick_summary"
    | "search_status"
    | "free_source"
  > & { webPicks: WebPick[] | null; dedications: Dedications | null };
  products: ResultProduct[];
};

function toCard(product: ProductRow, reason: string, replaces: string | null = null): ResultProduct {
  return {
    id: product.id,
    name: product.name,
    price_pln: product.price_pln,
    merchant: product.merchant,
    image_url: product.image_url,
    affiliate_url: product.affiliate_url,
    in_stock: product.in_stock,
    category: product.category,
    checked_at: product.checked_at ?? null,
    network: product.network,
    affiliate: (product.commission_rate ?? 0) > 0,
    reason,
    replaces,
  };
}

/** Shown only when it is in stock and, when the result has a budget, not above it. */
export function isDisplayable(product: Pick<ProductRow, "in_stock" | "price_pln">, budget: number | null): boolean {
  return product.in_stock && (budget === null || product.price_pln <= budget);
}

/**
 * In-stock replacement within the result's budget, not already on the list: first from the same category, then from
 * any category that shares a tag with the result. Prefers more shared tags, then the higher price. The commission
 * never decides. null = no replacement, the card is simply left out.
 */
async function findReplacement(
  original: ProductRow,
  context: { budget: number | null; tags: string[]; avoid: string[]; excludeIds: string[]; recipient?: string },
): Promise<ProductRow | null> {
  const repos = getRepos();
  const maxPrice = context.budget ?? Math.max(original.price_pln * 1.5, original.price_pln + 50);
  const score = (product: ProductRow) => product.tags.filter((tag) => context.tags.includes(tag)).length;
  const best = (candidates: ProductRow[]) =>
    candidates.filter((product) => isDisplayable(product, context.budget)).sort((a, b) => score(b) - score(a) || b.price_pln - a.price_pln)[0] ?? null;

  if (original.category) {
    const sameCategory = best(
      await repos.products.findCandidates({
        minPrice: 0,
        maxPrice,
        category: original.category,
        noneOfTags: context.avoid,
        recipient: context.recipient,
        excludeIds: context.excludeIds,
        limit: 50,
      }),
    );
    if (sameCategory) return sameCategory;
  }
  if (context.tags.length === 0) return null;
  return best(
    await repos.products.findCandidates({
      minPrice: 0,
      maxPrice,
      anyOfTags: context.tags,
      noneOfTags: context.avoid,
      recipient: context.recipient,
      excludeIds: context.excludeIds,
      limit: 50,
    }),
  );
}

/** Result with its products in pick order; out-of-stock picks get a replacement when possible. */
export async function getResultView(id: string): Promise<ResultView | null> {
  const repos = getRepos();
  const result = await repos.results.getById(id);
  if (!result) return null;

  const reasons = (result.reasons ?? {}) as Record<string, string>;
  const rows = await repos.products.getByIds(result.product_ids);
  const byId = new Map(rows.map((product) => [product.id, product]));
  const picked = result.product_ids
    .map((productId) => byId.get(productId))
    .filter((product): product is ProductRow => Boolean(product));

  const usedIds = new Set(picked.map((product) => product.id));
  const products: ResultProduct[] = [];
  for (const product of picked) {
    const reason = reasons[product.id] ?? "";
    if (isDisplayable(product, result.budget_pln)) {
      products.push(toCard(product, reason));
      continue;
    }
    // Unavailable (or above the budget after a price change): never shown, replaced when possible, else left out.
    const replacement = await findReplacement(product, {
      budget: result.budget_pln,
      tags: result.tags,
      avoid: result.avoid,
      excludeIds: [...usedIds],
      recipient: result.recipient ?? undefined,
    });
    if (replacement) {
      usedIds.add(replacement.id);
      products.push(toCard(replacement, reason, product.name));
    }
  }

  return {
    result: {
      id: result.id,
      created_at: result.created_at,
      recipient: result.recipient,
      style_profile: result.style_profile,
      tags: result.tags,
      ref_code: result.ref_code,
      budget_pln: result.budget_pln,
      paid_status: result.paid_status,
      price_variant: result.price_variant,
      pick_summary: result.pick_summary ?? null,
      search_status: result.search_status,
      free_source: result.free_source,
      webPicks: (result.web_picks as WebPick[] | null) ?? null,
      dedications: (result.dedications as Dedications | null) ?? null,
    },
    products,
  };
}
