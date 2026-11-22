import { z } from "zod";

export const CONTACT_MESSAGE_MIN = 10;
export const CONTACT_MESSAGE_MAX = 2000;
export const CONTACT_NAME_MAX = 80;

/** Control characters (and bidi/invisible ones) have no place in a name or a message; line breaks are kept in messages. */
const cleanLine = (value: string) => value.replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, " ").replace(/\s+/g, " ").trim();
const cleanMessage = (value: string) =>
  value
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map(cleanLine)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

export const contactRequestSchema = z.object({
  name: z.string().max(200).transform(cleanLine).pipe(z.string().max(CONTACT_NAME_MAX, "Imię jest za długie.")).optional(),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(254, "Adres e-mail jest za długi.")
    .pipe(z.email({ error: () => "Podaj poprawny adres e-mail." })),
  message: z
    .string()
    .max(CONTACT_MESSAGE_MAX * 2, `Wiadomość może mieć maksymalnie ${CONTACT_MESSAGE_MAX} znaków.`)
    .transform(cleanMessage)
    .pipe(
      z
        .string()
        .min(CONTACT_MESSAGE_MIN, `Napisz co najmniej ${CONTACT_MESSAGE_MIN} znaków.`)
        .max(CONTACT_MESSAGE_MAX, `Wiadomość może mieć maksymalnie ${CONTACT_MESSAGE_MAX} znaków.`),
    ),
  /** Cloudflare Turnstile token (demo mode: any value). */
  turnstileToken: z.string().max(2048).optional(),
  /** Honeypot: real users never fill it. */
  website: z.string().max(500).optional(),
});

export type ContactRequest = z.infer<typeof contactRequestSchema>;
