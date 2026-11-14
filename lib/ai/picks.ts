import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

import { getAnthropic } from "@/lib/ai/anthropic";
import { formatAnswers } from "@/lib/ai/profile";
import type { GiftPick, PicksResult, UsageEntry } from "@/lib/services/ai";
import type { StyleProfile } from "@/lib/analyze/schema";
import { getEnv } from "@/lib/env";
import { describeError, logEvent } from "@/lib/log";
import { type Candidate, PICKS_COUNT } from "@/lib/picks/candidates";
import { PICKS_SYSTEM_PROMPT, SAVE_PICKS_TOOL } from "@/lib/prompts";
import type { QuizAnswers } from "@/lib/quiz/schema";

export const PICKS_MAX_TOKENS = 600;
const MAX_REASON_LENGTH = 200;


const toolOutputSchema = z.object({
  picks: z.array(z.object({ product_id: z.string(), reason: z.string().trim().min(3) })),
});

/** Short aliases (P01…P40) instead of UUIDs: fewer tokens and fewer copying mistakes. */
function aliasFor(index: number): string {
  return `P${String(index + 1).padStart(2, "0")}`;
}

function formatCandidates(candidates: Candidate[]): string {
  return candidates
    .map((candidate, index) => {
      const description = candidate.description?.replace(/[<>{}]/g, "").slice(0, 120);
      return [
        aliasFor(index),
        candidate.name.replace(/[<>{}]/g, ""),
        `${candidate.price_pln.toFixed(2)} zł`,
        candidate.merchant,
        `tagi: ${candidate.tags.join(", ") || "brak"}`,
        description ? `opis: ${description}` : null,
      ]
        .filter(Boolean)
        .join(" | ");
    })
    .join("\n");
}

/**
 * Exactly 5 distinct IDs, all from the candidate list. Returns real product UUIDs or null.
 */
export function validatePicks(raw: unknown, candidates: Candidate[]): GiftPick[] | null {
  const parsed = toolOutputSchema.safeParse(raw);
  if (!parsed.success || parsed.data.picks.length !== PICKS_COUNT) return null;

  const byAlias = new Map(candidates.map((candidate, index) => [aliasFor(index), candidate.id]));
  const ids = new Set(candidates.map((candidate) => candidate.id));
  const picks: GiftPick[] = [];
  for (const item of parsed.data.picks) {
    const key = item.product_id.trim().toUpperCase();
    // Accept the alias, or the real UUID if the model used it.
    const productId = byAlias.get(key) ?? (ids.has(item.product_id.trim()) ? item.product_id.trim() : undefined);
    if (!productId || picks.some((pick) => pick.productId === productId)) return null;
    picks.push({ productId, reason: item.reason.slice(0, MAX_REASON_LENGTH) });
  }
  return picks;
}

export function fallbackPicks(candidates: Candidate[], profile: StyleProfile): GiftPick[] {
  return candidates.slice(0, PICKS_COUNT).map((candidate) => {
    const tags = candidate.sharedTags.length > 0 ? candidate.sharedTags : profile.tags.slice(0, 3);
    return { productId: candidate.id, reason: `Pasuje do zainteresowań: ${tags.join(", ")}` };
  });
}

async function callModel(
  answers: QuizAnswers,
  profile: StyleProfile,
  candidates: Candidate[],
  usage: UsageEntry[],
): Promise<GiftPick[] | null> {
  const model = getEnv().ANTHROPIC_MODEL;
  const text = [
    `Profil stylu: ${profile.styleProfile}`,
    `Tagi: ${profile.tags.join(", ")}`,
    `Unikać: ${profile.avoid.join(", ") || "brak"}`,
    "",
    formatAnswers(answers, false).replace(/\nZdjęcie: .*$/, ""),
    "",
    "Kandydaci (identyfikator | nazwa | cena | sklep | tagi | opis):",
    "<kandydaci>",
    formatCandidates(candidates),
    "</kandydaci>",
  ].join("\n");

  const message = await getAnthropic().messages.create({
    model,
    max_tokens: PICKS_MAX_TOKENS,
    system: PICKS_SYSTEM_PROMPT,
    tools: [SAVE_PICKS_TOOL],
    tool_choice: { type: "tool", name: SAVE_PICKS_TOOL.name, disable_parallel_tool_use: true },
    messages: [{ role: "user", content: text }],
  });

  usage.push({
    step: "picks",
    model: message.model ?? model,
    inputTokens: message.usage.input_tokens,
    outputTokens: message.usage.output_tokens,
  });

  const toolUse = message.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === "tool_use" && block.name === SAVE_PICKS_TOOL.name,
  );
  const picks = validatePicks(toolUse?.input, candidates);
  if (!picks) logEvent("picks.invalid_tool_output", { stopReason: message.stop_reason ?? undefined });
  return picks;
}

/** AI picks with one retry, then the top-5 fallback. With 5 or fewer candidates no AI call is made. */
export async function choosePicks(
  answers: QuizAnswers,
  profile: StyleProfile,
  candidates: Candidate[],
): Promise<{ result: PicksResult; usage: UsageEntry[] }> {
  const usage: UsageEntry[] = [];
  if (candidates.length <= PICKS_COUNT) {
    return { result: { picks: fallbackPicks(candidates, profile), source: "too_few_candidates" }, usage };
  }

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const picks = await callModel(answers, profile, candidates, usage);
      if (picks) return { result: { picks, source: "ai" }, usage };
    } catch (error) {
      logEvent("picks.model_error", { attempt, ...describeError(error) });
    }
  }
  return { result: { picks: fallbackPicks(candidates, profile), source: "fallback" }, usage };
}
