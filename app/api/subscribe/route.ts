import { getEnv } from "@/lib/env";
import { describeError, logEvent } from "@/lib/log";
import { dayWindowStart } from "@/lib/rate-limit";
import { getClientIp, hashIp } from "@/lib/request";
import { getRepos } from "@/lib/services/db";
import { getEmail } from "@/lib/services/email";
import { confirmationEmail } from "@/lib/subscribe/emails";
import { subscribeRequestSchema } from "@/lib/subscribe/schema";

const DAILY_LIMIT_PER_IP = 5;
/** Same answer whether the address is new, pending or already confirmed (no email enumeration). */
const OK_MESSAGE = "Sprawdź skrzynkę i kliknij link potwierdzający. Bez tego nie wyślemy żadnych wiadomości.";

/**
 * POST /api/subscribe – step 1 of double opt-in.
 * Saves an unconfirmed sign-up (confirmed_at = null) and emails a signed confirmation link.
 * An already confirmed address is not changed here; its new occasions apply after confirming.
 */
export async function POST(request: Request) {
  try {
    const parsed = subscribeRequestSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return Response.json({ error: parsed.error.issues[0]?.message ?? "Nieprawidłowe dane." }, { status: 400 });
    }
    const { email, occasions, website } = parsed.data;
    // Honeypot filled in: pretend success, do nothing.
    if (website) return Response.json({ message: OK_MESSAGE });

    const env = getEnv();
    const repos = getRepos();
    const allowed = await repos.rateLimits.consume(
      `subscribe:${hashIp(getClientIp(request), env.IP_HASH_SALT)}`,
      dayWindowStart(),
      DAILY_LIMIT_PER_IP,
    );
    if (!allowed) return Response.json({ error: "Zbyt wiele prób. Spróbuj jutro." }, { status: 429 });

    const existing = await repos.subscribers.getByEmail(email);
    if (!existing) {
      await repos.subscribers.upsertByEmail({ email, occasions, consent_at: new Date().toISOString(), confirmed_at: null });
    } else if (!existing.confirmed_at) {
      await repos.subscribers.updateByEmail(email, { occasions, consent_at: new Date().toISOString() });
    }

    await getEmail().send(confirmationEmail(email, occasions));
    logEvent("subscribe.requested", { existing: Boolean(existing) });
    return Response.json({ message: OK_MESSAGE });
  } catch (error) {
    logEvent("subscribe.failed", describeError(error));
    return Response.json({ error: "Nie udało się zapisać. Spróbuj ponownie za chwilę." }, { status: 500 });
  }
}
