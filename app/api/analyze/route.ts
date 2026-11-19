import { fallbackResult } from "@/lib/ai/picks";
import { recordAiUsage } from "@/lib/ai/usage";
import { analyzeRequestSchema, type AnalyzeResponse } from "@/lib/analyze/schema";
import { getEnv } from "@/lib/env";
import { describeError, logEvent } from "@/lib/log";
import { selectCandidates } from "@/lib/picks/candidates";
import { consumeRateLimit } from "@/lib/rate-limit";
import { getClientIp, hashIp, readJsonBody, RequestBodyError } from "@/lib/request";
import { createResult } from "@/lib/results";
import { getAi } from "@/lib/services/ai";
import { getCaptcha } from "@/lib/services/captcha";

// Node.js runtime and dynamic rendering are the defaults (cacheComponents forbids `runtime`/`dynamic` exports).
// Profile (with possible retries) + picks (with retry) + DB writes.
export const maxDuration = 90;

/** 300 KB photo + answers + token, with headroom. */
const MAX_BODY_BYTES = 360 * 1024;

function error(status: number, message: string, extra: Record<string, unknown> = {}) {
  return Response.json({ error: message, ...extra }, { status });
}

/** Pipeline steps, used only to log where a request failed and to pick a user-facing message. */
type Step = "env" | "captcha" | "rate_limit" | "profile" | "candidates" | "picks" | "save" | "usage";

class StepError extends Error {
  readonly step: Step;
  readonly original: unknown;
  constructor(step: Step, original: unknown) {
    super(`analyze step failed: ${step}`);
    this.name = "StepError";
    this.step = step;
    this.original = original;
  }
}

async function runStep<T>(step: Step, run: () => Promise<T> | T): Promise<T> {
  try {
    return await run();
  } catch (caught) {
    throw new StepError(step, caught);
  }
}

const GENERIC_ERROR = "Coś poszło nie tak. Spróbuj ponownie za chwilę.";
const DB_ERROR = "Nie udało się połączyć z bazą danych. Spróbuj ponownie za chwilę.";
const STEP_MESSAGES: Record<Step, string> = {
  env: "Serwis jest chwilowo niedostępny z naszej strony. Pracujemy nad tym, spróbuj ponownie później.",
  captcha: "Nie udało się sprawdzić zabezpieczenia antyspamowego. Odśwież stronę i spróbuj ponownie.",
  rate_limit: DB_ERROR,
  profile: "Nie udało się połączyć z AI. Spróbuj ponownie za chwilę.",
  candidates: DB_ERROR,
  picks: "Nie udało się połączyć z AI. Spróbuj ponownie za chwilę.",
  save: DB_ERROR,
  usage: DB_ERROR,
};

/**
 * POST /api/analyze
 * Order: Turnstile → rate limit → validation → profile (AI) → candidates → picks (AI)
 * → save result → usage.
 * PRIVACY: the request body (answers + photo) is never logged, stored or forwarded to analytics.
 * The photo is used only for the profile call. results stores answers and picks, never the photo.
 */
export async function POST(request: Request) {
  try {
    const env = await runStep("env", () => getEnv());

    let body: unknown;
    try {
      body = await readJsonBody(request, MAX_BODY_BYTES);
    } catch (caught) {
      if (caught instanceof RequestBodyError) return error(caught.status, caught.message);
      throw caught;
    }
    const raw = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;

    // 1. Turnstile
    const ip = getClientIp(request);
    const human = await runStep("captcha", () =>
      getCaptcha().verify({
        token: typeof raw.turnstileToken === "string" ? raw.turnstileToken : undefined,
        ip,
        action: "analyze",
      }),
    );
    if (!human) return error(403, "Weryfikacja nie powiodła się. Odśwież stronę i spróbuj ponownie.");

    // 2. Rate limit (photo and no-photo analyses have separate daily limits)
    const withPhoto = raw.photo !== undefined && raw.photo !== null;
    const allowed = await runStep("rate_limit", () =>
      consumeRateLimit(withPhoto ? "analyzeWithPhoto" : "analyzeWithoutPhoto", hashIp(ip, env.IP_HASH_SALT)),
    );
    if (!allowed) {
      return error(
        429,
        withPhoto
          ? "Wykorzystano dzisiejszy limit analiz ze zdjęciem. Spróbuj bez zdjęcia albo jutro."
          : "Wykorzystano dzisiejszy limit analiz. Spróbuj jutro.",
      );
    }

    // 3. Validation (issue paths only: never echo input values back)
    const parsed = analyzeRequestSchema.safeParse(body);
    if (!parsed.success) {
      return error(400, "Nieprawidłowe dane.", {
        issues: parsed.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
      });
    }

    // 4. Style profile (the photo is used only here and then dropped)
    const { answers, photo, source } = parsed.data;
    const ai = getAi();
    const profileStep = await runStep("profile", () => ai.analyzeProfile(answers, photo ?? null));
    const { profile } = profileStep.response;

    // 5. Candidates from the catalog and AI picks
    const { candidates, relaxed } = await runStep("candidates", () =>
      selectCandidates({ budget: answers.budget, tags: profile.tags, avoid: profile.avoid }),
    );
    // If the profile step already fell back (AI down or failing), do not wait on AI again.
    const picksStep =
      profileStep.response.source === "fallback"
        ? { result: fallbackResult(candidates, profile, "fallback"), usage: [] }
        : await runStep("picks", () => ai.pickProducts(answers, profile, candidates));

    // 6. Save the result (no photo) and the token usage
    const { id, refCode } = await runStep("save", () =>
      createResult({
        answers,
        profile,
        picks: picksStep.result.picks,
        summary: picksStep.result.summary,
        source,
      }),
    );
    await runStep("usage", () => recordAiUsage([...profileStep.usage, ...picksStep.usage], id));

    logEvent("analyze.done", {
      withPhoto,
      profileSource: profileStep.response.source,
      picksSource: picksStep.result.source,
      candidates: candidates.length,
      relaxed,
      childPhoto: Boolean(profileStep.response.notice),
    });

    const response: AnalyzeResponse = { resultId: id, refCode, ...profileStep.response };
    return Response.json(response);
  } catch (caught) {
    const failed = caught instanceof StepError ? caught : null;
    const cause = failed ? failed.original : caught;
    logEvent("analyze.failed", {
      step: failed?.step ?? "other",
      ...describeError(cause),
      // Config errors list variable NAMES only (see lib/env.ts), never values, so they are safe to log.
      detail:
        failed?.step === "env" && cause instanceof Error && /environment variables|MOCK_MODE/i.test(cause.message)
          ? cause.message.slice(0, 200)
          : undefined,
    });
    return error(500, failed ? STEP_MESSAGES[failed.step] : GENERIC_ERROR);
  }
}
