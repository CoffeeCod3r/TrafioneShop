import { writeDedicationsWithClaude } from "@/lib/ai/dedications";
import { choosePicks } from "@/lib/ai/picks";
import { analyzeProfile } from "@/lib/ai/profile";
import type { AiService } from "@/lib/services/ai";

/** Anthropic (claude-haiku-5-5) implementation. */
export function createRealAi(): AiService {
  return {
    analyzeProfile,
    pickProducts: choosePicks,
    writeDedications: writeDedicationsWithClaude,
    async webSearch() {
      // TODO(paid search step): Claude with web_search + web_fetch limited to allowed_shops,
      // verifying each link server-side from the web_fetch tool blocks.
      throw new Error("Real web search is not implemented yet");
    },
  };
}
