import { z } from "zod";

export const SUBSCRIBE_OCCASIONS = [
  { value: "valentines", label: "Walentynki" },
  { value: "womens_day", label: "Dzień Kobiet" },
  { value: "mothers_day", label: "Dzień Matki" },
  { value: "fathers_day", label: "Dzień Ojca" },
  { value: "birthdays", label: "Urodziny bliskich" },
] as const;

export type SubscribeOccasion = (typeof SUBSCRIBE_OCCASIONS)[number]["value"];

const occasionValues = SUBSCRIBE_OCCASIONS.map((occasion) => occasion.value) as [
  SubscribeOccasion,
  ...SubscribeOccasion[],
];

export const MARKETING_CONSENT_TEXT =
  "Zgadzam się na otrzymywanie od Prezentoskopu wiadomości marketingowych e-mailem (przypomnienia o okazjach i pomysły na prezenty). Zgodę mogę wycofać w każdej chwili, klikając link w każdej wiadomości.";

export const occasionsSchema = z
  .array(z.enum(occasionValues, { error: () => "Nieznana okazja." }))
  .min(1, "Wybierz co najmniej jedną okazję.")
  .max(SUBSCRIBE_OCCASIONS.length)
  .transform((items) => [...new Set(items)]);

export const subscribeRequestSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(254, "Adres e-mail jest za długi.")
    .pipe(z.email({ error: () => "Podaj poprawny adres e-mail." })),
  occasions: occasionsSchema,
  consent: z.literal(true, { error: () => "Zaznacz zgodę, aby się zapisać." }),
  /** Cloudflare Turnstile token (demo mode: any value). */
  turnstileToken: z.string().max(2048).optional(),
  /** Honeypot: real users never fill it. */
  website: z.string().max(500).optional(),
});

export type SubscribeRequest = z.infer<typeof subscribeRequestSchema>;
