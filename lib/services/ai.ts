/**
 * AI service. Implementations: Anthropic (impl/ai-real.ts) and demo (impl/ai-demo.ts).
 * The rest of the code uses only this interface via getAi().
 */
import type { ProfileResult, StyleProfile } from "@/lib/analyze/schema";
import type { AiUsageStep, AllowedShopRow } from "@/lib/db";
import { isMockMode } from "@/lib/mode";
import type { Dedications, WebPick } from "@/lib/paid/schema";
import type { Candidate } from "@/lib/picks/candidates";
import type { QuizAnswers } from "@/lib/quiz/schema";
import { createDemoAi } from "@/lib/services/impl/ai-demo";
import { createRealAi } from "@/lib/services/impl/ai-real";

export type UsageEntry = {
  step: AiUsageStep;
  model: string;
  inputTokens: number;
  outputTokens: number;
  webSearches?: number;
  webFetches?: number;
};

export type Photo = { mediaType: "image/jpeg"; base64: string };

export type GiftPick = { productId: string; reason: string };
export type PicksResult = { picks: GiftPick[]; source: "ai" | "fallback" | "too_few_candidates" | "demo" };

export type WebSearchInput = {
  answers: QuizAnswers;
  profile: StyleProfile;
  /** Only these domains may appear in the results. */
  allowedShops: AllowedShopRow[];
};

export type AiService = {
  /** Style profile from quiz answers and an optional photo (photo is never stored). */
  analyzeProfile(answers: QuizAnswers, photo: Photo | null): Promise<{ response: ProfileResult; usage: UsageEntry[] }>;
  /** Exactly 5 picks from the candidate list. */
  pickProducts(
    answers: QuizAnswers,
    profile: StyleProfile,
    candidates: Candidate[],
  ): Promise<{ result: PicksResult; usage: UsageEntry[] }>;
  /** Paid: products from trusted shops outside the catalog, price and availability checked. */
  webSearch(input: WebSearchInput): Promise<{ picks: WebPick[]; usage: UsageEntry[] }>;
  /** Paid: 3 short gift-card dedications. */
  writeDedications(answers: QuizAnswers, profile: StyleProfile): Promise<{ dedications: Dedications; usage: UsageEntry[] }>;
};

let service: AiService | undefined;

export function getAi(): AiService {
  service ??= isMockMode() ? createDemoAi() : createRealAi();
  return service;
}
