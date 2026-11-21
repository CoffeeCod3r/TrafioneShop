/**
 * AI service. Implementations: Anthropic (impl/ai-real.ts) and demo (impl/ai-demo.ts).
 * The rest of the code uses only this interface via getAi().
 */
import type { ProfileResult, StyleProfile } from "@/lib/analyze/schema";
import { isMockMode } from "@/lib/mode";
import type { Dedications } from "@/lib/paid/schema";
import type { Candidate } from "@/lib/picks/candidates";
import type { QuizAnswers } from "@/lib/quiz/schema";
import { createDemoAi } from "@/lib/services/impl/ai-demo";
import { createRealAi } from "@/lib/services/impl/ai-real";

export type { UsageEntry, WebSearchInput, WebSearchOutput } from "@/lib/search/core";
import type { UsageEntry, WebSearchInput, WebSearchOutput } from "@/lib/search/core";

export type Photo = { mediaType: "image/jpeg"; base64: string };

export type GiftPick = { productId: string; reason: string };
export type PicksResult = {
  picks: GiftPick[];
  /** 2–3 sentences shown above the picks: which gift fits best (the first one) and why. */
  summary: string;
  source: "ai" | "fallback" | "too_few_candidates" | "demo";
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
  /** Web search in trusted shops (free result or paid search): price and availability checked on the page. */
  webSearch(input: WebSearchInput): Promise<WebSearchOutput>;
  /** Paid: 3 short gift-card dedications. */
  writeDedications(answers: QuizAnswers, profile: StyleProfile): Promise<{ dedications: Dedications; usage: UsageEntry[] }>;
};

let service: AiService | undefined;

export function getAi(): AiService {
  service ??= isMockMode() ? createDemoAi() : createRealAi();
  return service;
}
