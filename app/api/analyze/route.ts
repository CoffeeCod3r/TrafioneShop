import { after } from "next/server";

import { fallbackResult } from "@/lib/ai/picks";
import { recordAiUsage } from "@/lib/ai/usage";
import { analyzeRequestSchema, type AnalyzeResponse } from "@/lib/analyze/schema";
import type { FreeSource } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { describeError, logEvent } from "@/lib/log";
import { getSourceMode } from "@/lib/mode";
import { quizFit, selectCandidates } from "@/lib/picks/candidates";
import { consumeRateLimit } from "@/lib/rate-limit";
import { getClientIp, hashIp, readJsonBody, RequestBodyError } from "@/lib/request";
import { copyRememberedResult, createResult, profileOf } from "@/lib/results";
import { dispatchSearch, freeSearchJob } from "@/lib/search/job";
import { consumeFreeWebSlot, DEVICE_COOKIE, findRememberedResult, isDailyBudgetExceeded, quizHash } from "@/lib/search/gates";
import { getAi } from "@/lib/services/ai";
import { getCaptcha } from "@/lib/services/captcha";

// Node.js runtime and dynamic rendering are the defaults (cacheComponents forbids `runtime`/`dynamic` exports).
// Profile (with possible retries) + picks (with retry) + DB writes.
export const maxDuration = 90;

/** 300 KB photo + answers + token, with headroom. */
const MAX_BODY_BYTES = 360 * 1024;

const DEVICE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Anonymous device id from the `dv` cookie (only used to limit free web searches per device). */
function readDeviceId(request: Request): { id: string; isNew: boolean } {
  const match = /(?:^|;\s*)dv=([^;]+)/.exec(request.headers.get("cookie") ?? "");
  const value = match?.[1] ?? "";
  return DEVICE_ID.test(value) ? { id: value, isNew: false } : { id: crypto.randomUUID(), isNew: true };
}

function deviceCookie(id: string, secure: boolean): string {
  return `${DEVICE_COOKIE}=${id}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${365 * 24 * 3600}${secure ? "; Secure" : ""}`;
}

function error(status: number, message: string, extra: Record<string, unknown> = {}) {
  return Response.json({ error: message, ...extra }, { status });
}

/** Pipeline steps, used only to log where a request failed and to pick a user-facing message. */
type Step = "env" | "captcha" | "rate_limit" | "memory" | "gates" | "profile" | "candidates" | "picks" | "save" | "usage";

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
  memory: DB_ERROR,
  gates: DB_ERROR,
  profile: "Nie udało się połączyć z AI. Spróbuj ponownie za chwilę.",
  candidates: DB_ERROR,
  picks: "Nie udało się połączyć z AI. Spróbuj ponownie za chwilę.",
  save: DB_ERROR,
  usage: DB_ERROR,
};

/**
 * POST /api/analyze
 * Order: Turnstile → rate limit → validation → result memory → profile (AI) → gates (budget, device)
 * → either the background web search (SOURCE_MODE=web) or candidates → picks (AI) → save result → usage.
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

    // 4. Free result source. SOURCE_MODE=web: the AI searches the shops in the background (Edge Function);
    //    result memory (same quiz within 24 h), the daily budget and the device limit send the visitor to the catalog.
    const { answers, photo, source } = parsed.data;
    const webMode = getSourceMode() === "web";
    const ai = getAi();
    const device = readDeviceId(request);
    const respond = (body: AnalyzeResponse) =>
      Response.json(
        body,
        device.isNew ? { headers: { "set-cookie": deviceCookie(device.id, env.NODE_ENV === "production") } } : undefined,
      );

    let hash: string | null = null;
    if (webMode && !photo) {
      // No photo: the memory is checked before any AI call is paid for.
      hash = quizHash(answers, null);
      const key = hash;
      const remembered = await runStep("memory", () => findRememberedResult(key));
      if (remembered) {
        const copy = await runStep("save", () => copyRememberedResult(remembered, answers, source));
        logEvent("analyze.done", { withPhoto, freeSource: "cache" });
        return respond({ ...copy, profile: profileOf(remembered), source: "ai" });
      }
    }

    // 5. Style profile (the photo is used only here and then dropped)
    const profileStep = await runStep("profile", () => ai.analyzeProfile(answers, photo ?? null));
    const { profile } = profileStep.response;

    if (webMode && photo) {
      // With a photo the profile tags join the hash (they describe what the photo showed).
      hash = quizHash(answers, profile.tags);
      const key = hash;
      const remembered = await runStep("memory", () => findRememberedResult(key));
      if (remembered) {
        const copy = await runStep("save", () => copyRememberedResult(remembered, answers, source));
        await runStep("usage", () => recordAiUsage(profileStep.usage, copy.resultId));
        logEvent("analyze.done", { withPhoto, freeSource: "cache" });
        return respond({ ...profileStep.response, ...copy, profile: profileOf(remembered) });
      }
    }

    let freeSource: FreeSource = "catalog";
    if (webMode) {
      if (profileStep.response.source === "fallback") freeSource = "catalog_fallback";
      else if (await runStep("gates", () => isDailyBudgetExceeded())) freeSource = "catalog_budget";
      else if (!(await runStep("gates", () => consumeFreeWebSlot(ip, device.id)))) freeSource = "catalog_device";
      else {
        // Web search in the background: the result exists at once with status "searching".
        const { id, refCode } = await runStep("save", () =>
          createResult({ answers, profile, picks: [], summary: null, source, searchStatus: "searching" }),
        );
        await runStep("usage", () => recordAiUsage(profileStep.usage, id));
        const job = freeSearchJob(id, hash);
        after(() => dispatchSearch(job));
        logEvent("analyze.done", { withPhoto, freeSource: "web", profileSource: profileStep.response.source });
        return respond({ resultId: id, refCode, ...profileStep.response, searching: true });
      }
    }

    // 6. Catalog path (SOURCE_MODE=catalog, or the web search is not available right now): prompts A and B.
    const { candidates, relaxed } = await runStep("candidates", () =>
      selectCandidates({ budget: answers.budget, tags: profile.tags, avoid: profile.avoid, fit: quizFit(answers) }),
    );
    // If the profile step already fell back (AI down or failing), do not wait on AI again.
    const picksStep =
      profileStep.response.source === "fallback"
        ? { result: fallbackResult(candidates, profile, "fallback"), usage: [] }
        : await runStep("picks", () => ai.pickProducts(answers, profile, candidates));

    // 7. Save the result (no photo) and the token usage
    const { id, refCode } = await runStep("save", () =>
      createResult({
        answers,
        profile,
        picks: picksStep.result.picks,
        summary: picksStep.result.summary,
        source,
        freeSource,
      }),
    );
    await runStep("usage", () => recordAiUsage([...profileStep.usage, ...picksStep.usage], id));

    logEvent("analyze.done", {
      withPhoto,
      freeSource,
      profileSource: profileStep.response.source,
      picksSource: picksStep.result.source,
      candidates: candidates.length,
      relaxed,
      childPhoto: Boolean(profileStep.response.notice),
    });

    return respond({ resultId: id, refCode, ...profileStep.response });
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
