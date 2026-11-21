import { getAnthropic } from "@/lib/ai/anthropic";
import { getEnv } from "@/lib/env";
import { searchWebWithClaude as run } from "@/lib/search/core";
import type { WebSearchInput, WebSearchOutput } from "@/lib/services/ai";

/** Claude web search (Prompt C) with the app's Anthropic client. The logic lives in lib/search/core.ts. */
export function searchWebWithClaude(input: WebSearchInput): Promise<WebSearchOutput> {
  return run(getAnthropic(), getEnv().ANTHROPIC_MODEL, input);
}
