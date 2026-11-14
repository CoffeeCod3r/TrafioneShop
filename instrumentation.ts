import { getEnv } from "./lib/env.ts";
import { isMockMode } from "./lib/mode.ts";

/** Runs once when the server starts: refuse to start with a bad configuration. */
export function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  try {
    getEnv();
  } catch (error) {
    console.error(`\n[startup] ${error instanceof Error ? error.message : "Invalid configuration"}\n`);
    throw error;
  }
  if (isMockMode()) console.warn("[startup] MOCK_MODE=true – demo services are active (no real AI, payments or database).");
}
