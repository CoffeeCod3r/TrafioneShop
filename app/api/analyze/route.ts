import { analyzeProfile } from "@/lib/ai/profile";
import { recordAiUsage } from "@/lib/ai/usage";
import { analyzeRequestSchema } from "@/lib/analyze/schema";
import { getDb } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { describeError, logEvent } from "@/lib/log";
import { consumeRateLimit } from "@/lib/rate-limit";
import { getClientIp, hashIp, readJsonBody, RequestBodyError } from "@/lib/request";
import { verifyTurnstile } from "@/lib/turnstile";

// Node.js runtime and dynamic rendering are the defaults (cacheComponents forbids `runtime`/`dynamic` exports).
export const maxDuration = 60;

/** 300 KB photo + answers + token, with headroom. */
const MAX_BODY_BYTES = 360 * 1024;

function error(status: number, message: string, extra: Record<string, unknown> = {}) {
  return Response.json({ error: message, ...extra }, { status });
}

/**
 * POST /api/analyze
 * Order: Turnstile → rate limit → body validation → AI → usage.
 * PRIVACY: the request body (answers + photo) is never logged, stored or forwarded to analytics.
 * Only token counts go to ai_usage.
 */
export async function POST(request: Request) {
  try {
    const env = getEnv();

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
    const human = await verifyTurnstile({
      token: typeof raw.turnstileToken === "string" ? raw.turnstileToken : undefined,
      secret: env.TURNSTILE_SECRET_KEY,
      ip,
      expectedAction: "analyze",
    });
    if (!human) return error(403, "Weryfikacja nie powiodła się. Odśwież stronę i spróbuj ponownie.");

    // 2. Rate limit (photo and no-photo analyses have separate daily limits)
    const withPhoto = raw.photo !== undefined && raw.photo !== null;
    const allowed = await consumeRateLimit(
      getDb(),
      withPhoto ? "analyzeWithPhoto" : "analyzeWithoutPhoto",
      hashIp(ip, env.IP_HASH_SALT),
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

    // 4. AI
    const { answers, photo } = parsed.data;
    const { response, usage } = await analyzeProfile(answers, photo ?? null);

    // 5. Usage only
    await recordAiUsage(usage);
    logEvent("analyze.done", { withPhoto, source: response.source, childPhoto: Boolean(response.notice) });

    return Response.json(response);
  } catch (caught) {
    logEvent("analyze.failed", describeError(caught));
    return error(500, "Coś poszło nie tak. Spróbuj ponownie za chwilę.");
  }
}
