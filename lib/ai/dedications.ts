import { getAnthropic } from "@/lib/ai/anthropic";
import type { StyleProfile } from "@/lib/analyze/schema";
import { getEnv } from "@/lib/env";
import type { Dedications } from "@/lib/paid/schema";
import type { QuizAnswers } from "@/lib/quiz/schema";
import { writeDedicationsWithClaude as run } from "@/lib/search/core";
import type { UsageEntry } from "@/lib/services/ai";

/** Prompt D with the app's Anthropic client. The logic lives in lib/search/core.ts. */
export function writeDedicationsWithClaude(
  answers: QuizAnswers,
  profile: StyleProfile,
): Promise<{ dedications: Dedications; usage: UsageEntry[] }> {
  return run(getAnthropic(), getEnv().ANTHROPIC_MODEL, answers, profile);
}
