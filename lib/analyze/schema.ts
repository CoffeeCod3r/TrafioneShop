import { z } from "zod";

import { PHOTO_MAX_BASE64_LENGTH } from "../photo/constants.ts";
import { quizAnswersSchema } from "../quiz/schema.ts";
import { SOURCE_PATTERN } from "../attribution.ts";
import type { AllowedTag } from "../tags.ts";

export const analyzePhotoSchema = z.object({
  mediaType: z.literal("image/jpeg"),
  base64: z
    .string()
    .max(PHOTO_MAX_BASE64_LENGTH, "Zdjęcie jest za duże (maks. 300 KB).")
    .regex(/^[A-Za-z0-9+/]+={0,2}$/, "Nieprawidłowy format zdjęcia.")
    // Every JPEG starts with FF D8 FF, which is "/9j/" in base64.
    .refine((value) => value.startsWith("/9j/"), "Nieprawidłowy format zdjęcia."),
});

export const analyzeRequestSchema = z.object({
  turnstileToken: z.string().min(1).max(2048),
  answers: quizAnswersSchema,
  photo: analyzePhotoSchema.nullish(),
  /** Traffic source (utm_source or ref:<code>), see lib/attribution.ts. */
  source: z.string().regex(SOURCE_PATTERN).nullish(),
});

export type AnalyzeRequest = z.infer<typeof analyzeRequestSchema>;

export type StyleProfile = {
  styleProfile: string;
  tags: AllowedTag[];
  avoid: AllowedTag[];
};

export type AnalyzeResponse = {
  /** results.id – the front redirects to /wynik/[id] */
  resultId: string;
  refCode: string;
  profile: StyleProfile;
  /** "ai" = from the model, "fallback" = built from quiz answers after AI failure, "demo" = MOCK_MODE */
  source: "ai" | "fallback" | "demo";
  /** true: the picks are still being searched in the background; the result page shows progress. */
  searching?: boolean;
  /** User-facing message, e.g. when a photo was not analyzed */
  notice?: string;
};

/** Internal result of step 1 (profile), before picks and saving. */
export type ProfileResult = Omit<AnalyzeResponse, "resultId" | "refCode">;

export const CHILD_PHOTO_NOTICE = "Nie analizujemy zdjęć dzieci, dobierzemy prezent na podstawie odpowiedzi";
