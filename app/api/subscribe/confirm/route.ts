import { describeError, logEvent } from "@/lib/log";
import { getRepos } from "@/lib/services/db";
import { readConfirmToken } from "@/lib/subscribe/tokens";

/**
 * POST /api/subscribe/confirm – step 2 of double opt-in: sets confirmed_at.
 * POST (from a button on /zapis/potwierdz), not GET, so link scanners in mailboxes cannot confirm.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as { token?: string } | null;
    const data = readConfirmToken(body?.token);
    if (!data) return Response.json({ error: "Link jest nieprawidłowy albo wygasł. Zapisz się ponownie." }, { status: 400 });

    const repos = getRepos();
    const now = new Date().toISOString();
    const existing = await repos.subscribers.getByEmail(data.email);
    if (existing) {
      await repos.subscribers.updateByEmail(data.email, { occasions: data.occasions, confirmed_at: now, consent_at: now });
    } else {
      // Record was cleaned up (or unsubscribed) but the link is still valid: the click is a fresh confirmation.
      await repos.subscribers.upsertByEmail({ email: data.email, occasions: data.occasions, consent_at: now, confirmed_at: now });
    }
    logEvent("subscribe.confirmed");
    return Response.json({ ok: true });
  } catch (error) {
    logEvent("subscribe.confirm_failed", describeError(error));
    return Response.json({ error: "Nie udało się potwierdzić. Spróbuj ponownie." }, { status: 500 });
  }
}
