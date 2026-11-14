import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

import { getAnthropic } from "@/lib/ai/anthropic";
import { formatAnswers } from "@/lib/ai/profile";
import type { StyleProfile } from "@/lib/analyze/schema";
import { getEnv } from "@/lib/env";
import { describeError, logEvent } from "@/lib/log";
import { dedicationsSchema, type Dedications } from "@/lib/paid/schema";
import { DEDICATIONS_SYSTEM_PROMPT, SAVE_DEDICATIONS_TOOL } from "@/lib/prompts";
import type { QuizAnswers } from "@/lib/quiz/schema";
import type { UsageEntry } from "@/lib/services/ai";

export const DEDICATIONS_MAX_TOKENS = 400;

const outputSchema = z.object({ dedications: dedicationsSchema });

export async function writeDedicationsWithClaude(
  answers: QuizAnswers,
  profile: StyleProfile,
): Promise<{ dedications: Dedications; usage: UsageEntry[] }> {
  const model = getEnv().ANTHROPIC_MODEL;
  const usage: UsageEntry[] = [];

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const message = await getAnthropic().messages.create({
        model,
        max_tokens: DEDICATIONS_MAX_TOKENS,
        system: DEDICATIONS_SYSTEM_PROMPT,
        tools: [SAVE_DEDICATIONS_TOOL],
        tool_choice: { type: "tool", name: SAVE_DEDICATIONS_TOOL.name, disable_parallel_tool_use: true },
        messages: [
          {
            role: "user",
            content: `Profil: ${profile.styleProfile}\n\n${formatAnswers(answers, false).replace(/\nZdjęcie: .*$/, "")}`,
          },
        ],
      });
      usage.push({
        step: "dedications",
        model: message.model ?? model,
        inputTokens: message.usage.input_tokens,
        outputTokens: message.usage.output_tokens,
      });
      const toolUse = message.content.find(
        (block): block is Anthropic.ToolUseBlock => block.type === "tool_use" && block.name === SAVE_DEDICATIONS_TOOL.name,
      );
      const parsed = outputSchema.safeParse(toolUse?.input);
      if (parsed.success) return { dedications: parsed.data.dedications, usage };
      logEvent("dedications.invalid_tool_output");
    } catch (error) {
      logEvent("dedications.model_error", { attempt, ...describeError(error) });
    }
  }
  throw new Error("Dedications failed after retry");
}
