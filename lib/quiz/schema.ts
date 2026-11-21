import { z } from "zod";

import { ALLOWED_TAGS } from "../tags.ts";

/**
 * Quiz options and validation. Values are stable English codes (stored in results.answers),
 * labels are Polish UI text. Shared by the client wizard and the server API.
 */

type Option<V extends string | number> = { value: V; label: string; emoji: string };

export const RECIPIENT_OPTIONS = [
  { value: "dad", label: "Tata", emoji: "👨" },
  { value: "mom", label: "Mama", emoji: "👩" },
  { value: "girlfriend", label: "Dziewczyna", emoji: "💁‍♀️" },
  { value: "boyfriend", label: "Chłopak", emoji: "💁‍♂️" },
  { value: "friend", label: "Przyjaciel / przyjaciółka", emoji: "🤝" },
  { value: "boss", label: "Szef / szefowa", emoji: "💼" },
  { value: "grandparent", label: "Dziadek / babcia", emoji: "👵" },
] as const satisfies readonly Option<string>[];

export const BUDGET_OPTIONS = [
  { value: 50, label: "do 50 zł", emoji: "🪙" },
  { value: 100, label: "do 100 zł", emoji: "💵" },
  { value: 200, label: "do 200 zł", emoji: "💳" },
  { value: 500, label: "do 500 zł", emoji: "💎" },
] as const satisfies readonly Option<number>[];

export const OCCASION_OPTIONS = [
  { value: "christmas", label: "Święta", emoji: "🎄" },
  { value: "st_nicholas", label: "Mikołajki", emoji: "🎅" },
  { value: "birthday", label: "Urodziny", emoji: "🎂" },
  { value: "other", label: "Inna okazja", emoji: "🎁" },
] as const satisfies readonly Option<string>[];

export const LIFESTYLE_OPTIONS = [
  { value: "homebody", label: "Domator", emoji: "🛋️" },
  { value: "athlete", label: "Sportowiec", emoji: "🏃" },
  { value: "gamer", label: "Gracz", emoji: "🎮" },
  { value: "traveler", label: "Podróżnik", emoji: "🧳" },
  { value: "artist", label: "Artysta", emoji: "🎨" },
  { value: "workaholic", label: "Pracoholik", emoji: "💻" },
] as const satisfies readonly Option<string>[];

export const GIFT_TYPE_OPTIONS = [
  { value: "thing", label: "Rzecz", emoji: "📦" },
  { value: "experience", label: "Przeżycie", emoji: "🎟️" },
  { value: "practical", label: "Coś praktycznego", emoji: "🧰" },
  { value: "funny", label: "Coś śmiesznego", emoji: "😄" },
] as const satisfies readonly Option<string>[];

export const DESCRIPTION_MAX_LENGTH = 200;

/** Quick suggestions under the description field: each one appends its text. */
export const DESCRIPTION_SUGGESTIONS = [
  "kocha zwierzęta",
  "ma wszystko",
  "lubi gotować",
  "ciągle w podróży",
  "słucha winyli",
  "gra w planszówki",
] as const;

/**
 * Cleans the free-text description of the recipient. Everything that could carry contact data or an
 * injected link is replaced by a space: control and invisible characters, angle brackets and braces
 * (they could close the <opis_od_uzytkownika> tag in the prompts), links, e-mail addresses, bare domains
 * and phone numbers. Idempotent; an empty result is valid.
 */
export function sanitizeDescription(value: string): string {
  return value
    .normalize("NFC")
    .replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, " ")
    .replace(/[<>{}]/g, " ")
    .replace(/(?:https?:\/\/|ftp:\/\/|www\.)\S*/gi, " ")
    .replace(/[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+\.[\p{L}]{2,}/gu, " ")
    .replace(/\b(?:[a-z0-9-]+\.)+(?:pl|com|net|org|eu|io|co|info|xyz|de|ru|shop|store|online|site|me|tv)\b\S*/gi, " ")
    .replace(/(?:\+|00)?\d(?:[\s().-]?\d){6,}/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Lowercase, without punctuation: the form of the description used in the result-memory hash. */
export function normalizeDescription(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export const MIN_INTERESTS = 3;
export const MAX_INTERESTS = 5;
export const OWNED_ITEMS_MAX_LENGTH = 100;

type Values<T extends readonly { value: unknown }[]> = T[number]["value"];

function valuesOf<const T extends readonly { value: string }[]>(options: T) {
  return options.map((option) => option.value) as [Values<T>, ...Values<T>[]];
}

const required = (message: string) => ({ error: () => message });

export const recipientSchema = z.enum(valuesOf(RECIPIENT_OPTIONS), required("Wybierz, dla kogo szukasz prezentu."));
export const budgetSchema = z.literal(
  BUDGET_OPTIONS.map((option) => option.value) as Values<typeof BUDGET_OPTIONS>[],
  required("Wybierz budżet."),
);
export const occasionSchema = z.enum(valuesOf(OCCASION_OPTIONS), required("Wybierz okazję."));
export const interestsSchema = z
  .array(z.enum(ALLOWED_TAGS, required("Nieznane zainteresowanie.")), required("Wybierz zainteresowania."))
  .min(MIN_INTERESTS, `Wybierz co najmniej ${MIN_INTERESTS} zainteresowania.`)
  .max(MAX_INTERESTS, `Możesz wybrać maksymalnie ${MAX_INTERESTS} zainteresowań.`)
  .refine((items) => new Set(items).size === items.length, "Zainteresowania nie mogą się powtarzać.");
export const lifestyleSchema = z.enum(valuesOf(LIFESTYLE_OPTIONS), required("Wybierz styl życia."));
export const giftTypeSchema = z.enum(valuesOf(GIFT_TYPE_OPTIONS), required("Wybierz typ prezentu."));
export const ownedItemsSchema = z
  .string()
  .trim()
  .max(OWNED_ITEMS_MAX_LENGTH, `Maksymalnie ${OWNED_ITEMS_MAX_LENGTH} znaków.`)
  .optional();

/** Optional description of the person. At most 1000 raw characters are examined, 200 may remain after cleaning. */
export const descriptionSchema = z
  .string()
  .max(1000, `Maksymalnie ${DESCRIPTION_MAX_LENGTH} znaków.`)
  .transform(sanitizeDescription)
  .pipe(z.string().max(DESCRIPTION_MAX_LENGTH, `Maksymalnie ${DESCRIPTION_MAX_LENGTH} znaków.`))
  .optional();

export const quizAnswersSchema = z.object({
  recipient: recipientSchema,
  budget: budgetSchema,
  occasion: occasionSchema,
  interests: interestsSchema,
  lifestyle: lifestyleSchema,
  giftType: giftTypeSchema,
  ownedItems: ownedItemsSchema,
  description: descriptionSchema,
});

export type QuizAnswers = z.infer<typeof quizAnswersSchema>;
export type QuizDraft = Partial<QuizAnswers>;
export type QuizField = keyof QuizAnswers;

/** Fields validated on each question screen, in order. */
export const QUIZ_QUESTION_FIELDS: QuizField[][] = [
  ["recipient"],
  ["budget"],
  ["occasion"],
  ["interests"],
  ["lifestyle"],
  ["giftType", "ownedItems"],
  ["description"],
];

/** Validates only the given fields of a draft. Returns the first error per field. */
export function validateFields(draft: QuizDraft, fields: QuizField[]): Partial<Record<QuizField, string>> {
  const shape = Object.fromEntries(fields.map((field) => [field, quizAnswersSchema.shape[field]]));
  const result = z.object(shape).safeParse(draft);
  if (result.success) return {};

  const errors: Partial<Record<QuizField, string>> = {};
  for (const issue of result.error.issues) {
    const field = issue.path[0] as QuizField;
    errors[field] ??= issue.message;
  }
  return errors;
}

export function tagLabel(tag: string): string {
  const text = tag.replace(/-/g, " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}
