import { getEnv } from "@/lib/env";
import { describeError, logEvent } from "@/lib/log";
import { consumeRateLimit } from "@/lib/rate-limit";
import { getClientIp, hashIp } from "@/lib/request";
import { getCaptcha } from "@/lib/services/captcha";
import { getRepos } from "@/lib/services/db";
import { getEmail } from "@/lib/services/email";
import { confirmationEmail } from "@/lib/subscribe/emails";
import { subscribeRequestSchema } from "@/lib/subscribe/schema";

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
    const { email, occasions, website, turnstileToken } = parsed.data;
    // Honeypot filled in: pretend success, do nothing.
    if (website) return Response.json({ message: OK_MESSAGE });

    const env = getEnv();
    const repos = getRepos();
    const ip = getClientIp(request);
    if (!(await getCaptcha().verify({ token: turnstileToken, ip, action: "subscribe" }))) {
      return Response.json({ error: "Weryfikacja nie powiodła się. Odśwież stronę i spróbuj ponownie." }, { status: 403 });
    }
    if (!(await consumeRateLimit("subscribe", hashIp(ip, env.IP_HASH_SALT)))) {
      return Response.json({ error: "Zbyt wiele prób. Spróbuj jutro." }, { status: 429 });
    }
    // Per-address limit: silently skip extra emails so the answer stays the same.
    if (!(await consumeRateLimit("subscribeEmail", hashIp(email, env.IP_HASH_SALT)))) {
      return Response.json({ message: OK_MESSAGE });
    }

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
