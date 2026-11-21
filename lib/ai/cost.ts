import type { AiUsageRow } from "@/lib/db";

/** AI prices (USD): claude-haiku-5-5 tokens and web search requests. Web fetch has no extra fee. */
export const AI_PRICES = { inputPerMTok: 0.1, outputPerMTok: 0.5, perWebSearch: 0.01 };

export function usageCostUsd(row: Pick<AiUsageRow, "input_tokens" | "output_tokens" | "web_searches">): number {
  return (
    (row.input_tokens / 1e6) * AI_PRICES.inputPerMTok +
    (row.output_tokens / 1e6) * AI_PRICES.outputPerMTok +
    row.web_searches * AI_PRICES.perWebSearch
  );
}
