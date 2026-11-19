import { getEnv } from "./lib/env.ts";
import { isMockMode, isRealService } from "./lib/mode.ts";

/** Runs once when the server starts: refuse to start with a bad configuration. */
export function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  try {
    getEnv();
  } catch (error) {
    console.error(`\n[startup] ${error instanceof Error ? error.message : "Invalid configuration"}\n`);
    throw error;
  }
  if (isMockMode()) {
    const real = (["db", "payments"] as const).filter(isRealService);
    console.warn(
      `[startup] MOCK_MODE=true – demo services are active${real.length ? `, except real: ${real.join(", ")} (REAL_*)` : " (no real AI, payments or database)"}.`,
    );
  }
}
