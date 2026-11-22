import { contactRequestSchema } from "@/lib/contact/schema";
import { getEnv } from "@/lib/env";
import { describeError, logEvent } from "@/lib/log";
import { consumeRateLimit } from "@/lib/rate-limit";
import { getClientIp, hashIp, readJsonBody, RequestBodyError } from "@/lib/request";
import { getCaptcha } from "@/lib/services/captcha";
import { getEmail } from "@/lib/services/email";
import { CONTACT_EMAIL, SITE_NAME } from "@/lib/site";

const MAX_BODY_BYTES = 16 * 1024;
const OK_MESSAGE = "Dziękujemy! Wiadomość została wysłana. Odpowiemy na podany adres e-mail.";

/**
 * POST /api/contact – the contact form. Order: validation → honeypot → Turnstile → rate limit → email.
 * The message is emailed to CONTACT_EMAIL (Reply-To = the sender) and is NOT stored in the database. Message text,
 * name and address are never logged. The subject is fixed, so nothing the visitor types can reach a header.
 */
export async function POST(request: Request) {
  try {
    let body: unknown;
    try {
      body = await readJsonBody(request, MAX_BODY_BYTES);
    } catch (caught) {
      if (caught instanceof RequestBodyError) return Response.json({ error: caught.message }, { status: caught.status });
      throw caught;
    }

    const parsed = contactRequestSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json({ error: parsed.error.issues[0]?.message ?? "Nieprawidłowe dane." }, { status: 400 });
    }
    const { name, email, message, website, turnstileToken } = parsed.data;
    // Honeypot filled in: pretend success, send nothing.
    if (website) return Response.json({ message: OK_MESSAGE });

    const env = getEnv();
    const ip = getClientIp(request);
    if (!(await getCaptcha().verify({ token: turnstileToken, ip, action: "contact" }))) {
      return Response.json({ error: "Weryfikacja nie powiodła się. Odśwież stronę i spróbuj ponownie." }, { status: 403 });
    }
    if (!(await consumeRateLimit("contact", hashIp(ip, env.IP_HASH_SALT)))) {
      return Response.json({ error: "Zbyt wiele wiadomości. Spróbuj jutro albo napisz na " + CONTACT_EMAIL + "." }, { status: 429 });
    }

    await getEmail().send({
      to: CONTACT_EMAIL,
      subject: `${SITE_NAME}: wiadomość z formularza kontaktowego`,
      text: [`Od: ${name ? `${name} ` : ""}<${email}>`, "", message].join("\n"),
      headers: { "Reply-To": email },
    });
    logEvent("contact.sent");
    return Response.json({ message: OK_MESSAGE });
  } catch (error) {
    logEvent("contact.failed", describeError(error));
    return Response.json(
      { error: `Nie udało się wysłać wiadomości. Spróbuj ponownie za chwilę albo napisz na ${CONTACT_EMAIL}.` },
      { status: 500 },
    );
  }
}
