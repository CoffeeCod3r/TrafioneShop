import { writeDedicationsWithClaude } from "@/lib/ai/dedications";
import { choosePicks } from "@/lib/ai/picks";
import { analyzeProfile } from "@/lib/ai/profile";
import { searchWebWithClaude } from "@/lib/ai/web-search-claude";
import type { AiService } from "@/lib/services/ai";

/** Anthropic (claude-haiku-5-5) implementation. */
export function createRealAi(): AiService {
  return {
    analyzeProfile,
    pickProducts: choosePicks,
    webSearch: searchWebWithClaude,
    writeDedications: writeDedicationsWithClaude,
  };
}
