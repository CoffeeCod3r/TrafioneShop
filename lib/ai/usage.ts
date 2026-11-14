import { describeError, logEvent } from "@/lib/log";
import type { UsageEntry } from "@/lib/services/ai";
import { getRepos } from "@/lib/services/db";

/** Stores token usage only (no prompts, no answers, no photos). Never throws. */
export async function recordAiUsage(entries: UsageEntry[], resultId: string | null): Promise<void> {
  if (entries.length === 0) return;
  try {
    await getRepos().aiUsage.createMany(
      entries.map((entry) => ({
        result_id: resultId,
        step: entry.step,
        model: entry.model,
        input_tokens: entry.inputTokens,
        output_tokens: entry.outputTokens,
        web_searches: entry.webSearches ?? 0,
        web_fetches: entry.webFetches ?? 0,
      })),
    );
  } catch (error) {
    logEvent("ai_usage.insert_failed", describeError(error));
  }
}
