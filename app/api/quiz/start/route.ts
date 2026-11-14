import { isValidSource } from "@/lib/attribution";
import { describeError, logEvent } from "@/lib/log";
import { getRepos } from "@/lib/services/db";

/**
 * POST /api/quiz/start – anonymous counter of started quizzes (only time and source,
 * no IP, no cookies). Used for the completion rate and revenue per visit in /admin.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { source?: unknown } | null;
  try {
    await getRepos().quizStarts.create({ source: isValidSource(body?.source) ? body.source : null });
  } catch (error) {
    logEvent("quiz_start.failed", describeError(error));
  }
  return new Response(null, { status: 204 });
}
