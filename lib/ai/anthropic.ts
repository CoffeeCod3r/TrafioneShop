import Anthropic from "@anthropic-ai/sdk";

import { getServiceEnv } from "@/lib/env";

let client: Anthropic | undefined;

/** Server-only Anthropic client (real AI implementation only). Retries are handled by callers (one retry, then fallback). */
export function getAnthropic(): Anthropic {
  if (typeof window !== "undefined") throw new Error("Anthropic client is server-only");
  if (client) return client;
  client = new Anthropic({
    apiKey: getServiceEnv().ANTHROPIC_API_KEY,
    maxRetries: 0,
    timeout: 15_000,
    // Never let the SDK log requests (they can contain the photo), even if ANTHROPIC_LOG is set.
    logLevel: "off",
  });
  return client;
}
