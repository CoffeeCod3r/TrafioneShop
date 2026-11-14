import type { AnalyzeResponse } from "../analyze/schema.ts";
import type { ProcessedPhoto } from "../photo/resize.ts";
import type { QuizAnswers } from "./schema.ts";

export class SubmitError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/** Sends answers (and the in-memory photo, if any) to /api/analyze. */
export async function submitQuiz(input: {
  answers: QuizAnswers;
  photo: ProcessedPhoto | null;
  turnstileToken: string;
  source: string | null;
}): Promise<AnalyzeResponse> {
  let response: Response;
  try {
    response = await fetch("/api/analyze", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        turnstileToken: input.turnstileToken,
        answers: input.answers,
        photo: input.photo ? { mediaType: input.photo.mediaType, base64: input.photo.base64 } : null,
        source: input.source,
      }),
    });
  } catch {
    throw new SubmitError("Brak połączenia z internetem. Spróbuj ponownie.", 0);
  }

  const data = (await response.json().catch(() => null)) as (AnalyzeResponse & { error?: string }) | null;
  if (!response.ok || !data?.resultId) {
    throw new SubmitError(data?.error ?? "Coś poszło nie tak. Spróbuj ponownie.", response.status);
  }
  return data;
}
