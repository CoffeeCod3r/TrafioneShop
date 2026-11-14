import { getDb, type AiUsageStep } from "@/lib/db";
import { describeError, logEvent } from "@/lib/log";

export type UsageEntry = {
  step: AiUsageStep;
  model: string;
  inputTokens: number;
  outputTokens: number;
  webSearches?: number;
  webFetches?: number;
  resultId?: string | null;
};

/** Stores token usage only (no prompts, no answers, no photos). Never throws. */
export async function recordAiUsage(entries: UsageEntry[]): Promise<void> {
  if (entries.length === 0) return;
  try {
    const { error } = await getDb()
      .from("ai_usage")
      .insert(
        entries.map((entry) => ({
          result_id: entry.resultId ?? null,
          step: entry.step,
          model: entry.model,
          input_tokens: entry.inputTokens,
          output_tokens: entry.outputTokens,
          web_searches: entry.webSearches ?? 0,
          web_fetches: entry.webFetches ?? 0,
        })),
      );
    if (error) logEvent("ai_usage.insert_failed", { code: error.code });
  } catch (error) {
    logEvent("ai_usage.insert_failed", describeError(error));
  }
}
