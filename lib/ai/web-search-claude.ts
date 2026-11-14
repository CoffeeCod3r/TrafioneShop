import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

import { getAnthropic } from "@/lib/ai/anthropic";
import { formatAnswers } from "@/lib/ai/profile";
import { getEnv } from "@/lib/env";
import { logEvent } from "@/lib/log";
import { rawWebPickSchema, type FetchedPage, type RawWebPick } from "@/lib/paid/schema";
import { SAVE_WEB_PICKS_TOOL, WEB_SEARCH_SYSTEM_PROMPT } from "@/lib/prompts";
import type { UsageEntry, WebSearchInput, WebSearchOutput } from "@/lib/services/ai";

export const WEB_SEARCH_MAX_USES = 8;
export const WEB_FETCH_MAX_USES = 12;
const MAX_TOKENS = 4000;
/** Continuations after pause_turn (server tools hit the per-request iteration limit). */
const MAX_CONTINUATIONS = 6;
/** Server tools make single requests slow; this overrides the client's 15 s default. */
const REQUEST_TIMEOUT_MS = 120_000;

const savePicksSchema = z.object({ picks: z.array(z.unknown()).max(20) });

function buildUserMessage(input: WebSearchInput): string {
  return [
    `Dzisiejsza data: ${input.today}`,
    `Budżet: maks. ${input.answers.budget} zł za prezent`,
    `Profil stylu: ${input.profile.styleProfile}`,
    `Tagi: ${input.profile.tags.join(", ")}`,
    `Unikać: ${input.profile.avoid.join(", ") || "brak"}`,
    "",
    formatAnswers(input.answers, false).replace(/\nZdjęcie: .*$/, ""),
    "",
    "Prezenty, które klient już dostał za darmo (nie powtarzaj ich):",
    "<darmowe>",
    ...input.freeProductNames.map((name) => `- ${name.replace(/[<>{}]/g, "")}`),
    "</darmowe>",
    "",
    `Dozwolone sklepy: ${input.allowedShops.map((shop) => `${shop.name} (${shop.domain})`).join(", ")}`,
  ].join("\n");
}

/** Collects pages fetched by web_fetch (direct or via dynamic filtering) from a response. */
function collectFetchedPages(content: Anthropic.ContentBlock[], into: FetchedPage[]): void {
  for (const block of content) {
    if (block.type !== "web_fetch_tool_result") continue;
    const result = block.content;
    if (result.type === "web_fetch_result" && result.url) {
      into.push({ url: result.url, retrievedAt: result.retrieved_at ?? null });
    }
  }
}

/**
 * Claude with web_search + web_fetch (latest versions, limited to allowed_shops)
 * and the client tool save_web_picks. Handles pause_turn continuations.
 * Returns unverified picks plus the evidence (fetched pages) and usage.
 */
export async function searchWebWithClaude(input: WebSearchInput): Promise<WebSearchOutput> {
  const model = getEnv().ANTHROPIC_MODEL;
  const domains = input.allowedShops.filter((shop) => shop.active).map((shop) => shop.domain);
  if (domains.length === 0) throw new Error("No active allowed shops");

  const tools: Anthropic.ToolUnion[] = [
    {
      type: "web_search_20260318",
      name: "web_search",
      max_uses: WEB_SEARCH_MAX_USES,
      allowed_domains: domains,
      user_location: { type: "approximate", country: "PL", timezone: "Europe/Warsaw" },
    },
    {
      type: "web_fetch_20260318",
      name: "web_fetch",
      max_uses: WEB_FETCH_MAX_USES,
      allowed_domains: domains,
      max_content_tokens: 12_000,
      // Keep fetch result blocks in the response: they are our proof that a page was opened.
      response_inclusion: "full",
    },
    SAVE_WEB_PICKS_TOOL,
  ];

  const messages: Anthropic.MessageParam[] = [{ role: "user", content: buildUserMessage(input) }];
  const fetchedPages: FetchedPage[] = [];
  const usage: UsageEntry = { step: "web_search", model, inputTokens: 0, outputTokens: 0, webSearches: 0, webFetches: 0 };
  let picks: RawWebPick[] = [];

  for (let request = 0; request <= MAX_CONTINUATIONS; request++) {
    const message = await getAnthropic().messages.create(
      { model, max_tokens: MAX_TOKENS, system: WEB_SEARCH_SYSTEM_PROMPT, tools, messages },
      { timeout: REQUEST_TIMEOUT_MS },
    );

    usage.model = message.model ?? model;
    usage.inputTokens += message.usage.input_tokens;
    usage.outputTokens += message.usage.output_tokens;
    usage.webSearches = (usage.webSearches ?? 0) + (message.usage.server_tool_use?.web_search_requests ?? 0);
    usage.webFetches = (usage.webFetches ?? 0) + (message.usage.server_tool_use?.web_fetch_requests ?? 0);
    collectFetchedPages(message.content, fetchedPages);

    if (message.stop_reason === "pause_turn") {
      messages.push({ role: "assistant", content: message.content as Anthropic.ContentBlockParam[] });
      continue;
    }

    const save = message.content.find(
      (block): block is Anthropic.ToolUseBlock => block.type === "tool_use" && block.name === SAVE_WEB_PICKS_TOOL.name,
    );
    const parsed = savePicksSchema.safeParse(save?.input);
    if (parsed.success) {
      picks = parsed.data.picks.flatMap((item) => {
        const pick = rawWebPickSchema.safeParse(item);
        return pick.success ? [pick.data] : [];
      });
    } else {
      logEvent("web_search.no_picks", { stopReason: message.stop_reason ?? undefined });
    }
    break;
  }

  return { picks, fetchedPages, usage: [usage] };
}
