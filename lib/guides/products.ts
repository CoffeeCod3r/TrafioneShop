import { cacheLife, cacheTag } from "next/cache";

import { getGuide } from "@/lib/guides/data";
import { describeError, logEvent } from "@/lib/log";
import { quizFit, selectCandidates } from "@/lib/picks/candidates";
import { getRepos } from "@/lib/services/db";

/** Cache tag of every guide page; the weekly refresh calls revalidateTag("guides") through /api/revalidate-guides. */
export const GUIDES_CACHE_TAG = "guides";

export type GuideProductView = {
  id: string;
  name: string;
  price_pln: number;
  merchant: string;
  category: string | null;
  /** Source network; a photo is shown only for partner feeds, never for web ("direct") products. */
  network: string;
  image_url: string | null;
  /** When price and availability were checked on the shop's page (web products); null for catalog products. */
  checked_at: string | null;
  /** "Why this is a good choice". */
  reason: string;
  /** Partner catalog product that earns a commission. */
  affiliate: boolean;
};

export type GuideProducts = {
  products: GuideProductView[];
  /** Latest refresh of the stored products (ISO), null when the guide shows the catalog fallback. */
  refreshedAt: string | null;
  source: "stored" | "catalog" | "none";
};

const MAX_SHOWN = 8;
/** A guide with fewer available products than this is topped up from the catalog pool (no AI, no web search). */
export const MIN_GUIDE_PRODUCTS = 6;

type CandidateLike = Awaited<ReturnType<typeof selectCandidates>>["candidates"][number];

function fromCandidate(candidate: CandidateLike): GuideProductView {
  return {
    id: candidate.id,
    name: candidate.name,
    price_pln: candidate.price_pln,
    merchant: candidate.merchant,
    category: candidate.category,
    network: candidate.network,
    image_url: candidate.image_url,
    checked_at: null,
    reason:
      candidate.sharedTags.length > 0
        ? `Pasuje do zainteresowań: ${candidate.sharedTags.slice(0, 3).join(", ")}.`
        : "Mieści się w budżecie i pasuje do tego poradnika.",
    affiliate: (candidate.commission_rate ?? 0) > 0,
  };
}

/**
 * Products of a guide, read once and cached for a week (the pages are static; no search ever runs on a visit).
 * Stored products come from `npm run guides:refresh`. Until a guide has been refreshed (or when the database is
 * unavailable) the page falls back to the best-matching catalog products, so it is never empty.
 */
export async function getGuideProducts(slug: string): Promise<GuideProducts> {
  "use cache";
  cacheTag(GUIDES_CACHE_TAG);

  const guide = getGuide(slug);
  if (!guide) {
    cacheLife("minutes");
    return { products: [], refreshedAt: null, source: "none" };
  }

  try {
    const { answers, tags, avoid } = guide.search;
    // Unavailable products (and ones that now cost more than the guide's budget) are never shown.
    const stored = (await getRepos().guides.listProducts(slug)).filter(
      ({ product }) => product.in_stock && product.price_pln <= answers.budget,
    );
    if (stored.length > 0) {
      const shown: GuideProductView[] = stored.slice(0, MAX_SHOWN).map(({ product, reason }) => ({
        id: product.id,
        name: product.name,
        price_pln: product.price_pln,
        merchant: product.merchant,
        category: product.category,
        network: product.network,
        image_url: product.image_url,
        checked_at: product.checked_at,
        reason,
        affiliate: (product.commission_rate ?? 0) > 0,
      }));
      if (shown.length < MIN_GUIDE_PRODUCTS) {
        // Top up from the same budget/tag pool: plain database selection, no search and no AI.
        const { candidates } = await selectCandidates({ budget: answers.budget, tags, avoid, fit: quizFit(answers) });
        const have = new Set(shown.map((product) => product.id));
        for (const candidate of candidates) {
          if (shown.length >= MIN_GUIDE_PRODUCTS) break;
          if (!have.has(candidate.id)) shown.push(fromCandidate(candidate));
        }
      }
      cacheLife("weeks");
      return {
        products: shown,
        refreshedAt: stored.map((item) => item.refreshedAt).sort().at(-1) ?? null,
        source: "stored",
      };
    }

    const { candidates } = await selectCandidates({ budget: answers.budget, tags, avoid, fit: quizFit(answers) });
    // Not refreshed yet: the catalog fallback is shown, and checked again soon.
    cacheLife("hours");
    return { products: candidates.slice(0, MAX_SHOWN).map(fromCandidate), refreshedAt: null, source: "catalog" };
  } catch (error) {
    logEvent("guides.products_failed", { slug, ...describeError(error) });
    cacheLife("minutes");
    return { products: [], refreshedAt: null, source: "none" };
  }
}
