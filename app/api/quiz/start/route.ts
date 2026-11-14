import { isValidSource } from "@/lib/attribution";
import { getEnv } from "@/lib/env";
import { describeError, logEvent } from "@/lib/log";
import { consumeRateLimit } from "@/lib/rate-limit";
import { getClientIp, hashIp } from "@/lib/request";
import { getRepos } from "@/lib/services/db";

/**
 * POST /api/quiz/start – anonymous counter of started quizzes (only time and source,
 * no IP, no cookies). Used for the completion rate and revenue per visit in /admin.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { source?: unknown } | null;
  try {
    // Keeps the funnel stats honest: repeated calls from one IP stop counting after the daily limit.
    if (!(await consumeRateLimit("quizStart", hashIp(getClientIp(request), getEnv().IP_HASH_SALT)))) {
      return new Response(null, { status: 204 });
    }
    await getRepos().quizStarts.create({ source: isValidSource(body?.source) ? body.source : null });
  } catch (error) {
    logEvent("quiz_start.failed", describeError(error));
  }
  return new Response(null, { status: 204 });
}
