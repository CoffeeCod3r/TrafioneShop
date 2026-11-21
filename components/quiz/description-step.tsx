"use client";

import { Info } from "lucide-react";

import {
  DESCRIPTION_MAX_LENGTH,
  DESCRIPTION_SUGGESTIONS,
  sanitizeDescription,
} from "@/lib/quiz/schema";

type DescriptionStepProps = {
  value: string;
  onChange: (value: string) => void;
  error?: string;
};

/** Appends a suggestion to the text, separated by a comma, within the character limit. */
function append(current: string, suggestion: string): string {
  const text = current.trim().replace(/[,\s]+$/, "");
  const next = text ? `${text}, ${suggestion}` : suggestion;
  return next.length > DESCRIPTION_MAX_LENGTH ? current : next;
}

/** Optional free-text description of the person ("Opisz tę osobę w kilku słowach"). */
export function DescriptionStep({ value, onChange, error }: DescriptionStepProps) {
  const length = value.length;
  // Links, e-mail addresses and phone numbers are removed on the server; tell the person up front.
  const willBeCleaned = value.trim() !== "" && sanitizeDescription(value) !== value.replace(/\s+/g, " ").trim();

  return (
    <div className="flex flex-col gap-4">
      <div>
        <label htmlFor="description" className="mb-2 block font-medium">
          Kilka słów o tej osobie <span className="font-normal text-muted-foreground">(opcjonalnie)</span>
        </label>
        <textarea
          id="description"
          rows={4}
          maxLength={DESCRIPTION_MAX_LENGTH}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="np. alternatywka, kocha koty, słucha winyli, pije matchę"
          aria-invalid={Boolean(error)}
          aria-describedby="description-hint description-privacy"
          className="w-full resize-none rounded-xl border-2 bg-card px-4 py-3 text-base outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
        />
        <p id="description-hint" className="mt-1 text-right text-sm text-muted-foreground" aria-live="polite">
          {length}/{DESCRIPTION_MAX_LENGTH}
        </p>
      </div>

      <div>
        <p className="mb-2 text-sm text-muted-foreground">Dotknij, żeby dopisać:</p>
        <div className="flex flex-wrap gap-2">
          {DESCRIPTION_SUGGESTIONS.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onClick={() => onChange(append(value, suggestion))}
              className="min-h-11 rounded-full border-2 bg-card px-4 py-2 text-sm font-medium transition-colors hover:bg-secondary focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              + {suggestion}
            </button>
          ))}
        </div>
      </div>

      <p id="description-privacy" className="flex items-start gap-2 text-sm text-muted-foreground">
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
        Nie podawaj imienia, nazwiska ani danych kontaktowych.
      </p>
      {willBeCleaned && (
        <p className="rounded-lg bg-secondary p-3 text-sm" role="status">
          Linki, adresy e-mail i numery telefonu usuniemy z opisu.
        </p>
      )}
    </div>
  );
}
