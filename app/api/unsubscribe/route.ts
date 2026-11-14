import { describeError, logEvent } from "@/lib/log";
import { getRepos } from "@/lib/services/db";
import { readUnsubscribeToken } from "@/lib/subscribe/tokens";

/**
 * POST /api/unsubscribe?token=… – deletes the subscriber record.
 * Used by the /wypisz page and by mail clients' one-click unsubscribe (RFC 8058,
 * which POSTs "List-Unsubscribe=One-Click" to the URL from the List-Unsubscribe header).
 */
export async function POST(request: Request) {
  const fromQuery = new URL(request.url).searchParams.get("token");
  let token = fromQuery;
  if (!token && request.headers.get("content-type")?.includes("application/json")) {
    token = ((await request.json().catch(() => null)) as { token?: string } | null)?.token ?? null;
  }

  const data = readUnsubscribeToken(token);
  if (!data) return Response.json({ error: "Link jest nieprawidłowy." }, { status: 400 });

  try {
    const deleted = await getRepos().subscribers.deleteByEmail(data.email);
    logEvent("subscribe.unsubscribed", { deleted });
    // Same answer either way: unsubscribing twice is not an error.
    return Response.json({ ok: true });
  } catch (error) {
    logEvent("subscribe.unsubscribe_failed", describeError(error));
    return Response.json({ error: "Nie udało się wypisać. Spróbuj ponownie." }, { status: 500 });
  }
}
