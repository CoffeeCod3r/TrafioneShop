"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Camera, Gift, Pencil } from "lucide-react";

import { OptionTile } from "@/components/quiz/option-tile";
import { TagChip } from "@/components/quiz/tag-chip";
import { Button } from "@/components/ui/button";
import {
  BUDGET_OPTIONS,
  GIFT_TYPE_OPTIONS,
  LIFESTYLE_OPTIONS,
  MAX_INTERESTS,
  MIN_INTERESTS,
  OCCASION_OPTIONS,
  OWNED_ITEMS_MAX_LENGTH,
  QUIZ_QUESTION_FIELDS,
  quizAnswersSchema,
  RECIPIENT_OPTIONS,
  tagLabel,
  validateFields,
  type QuizAnswers,
  type QuizDraft,
  type QuizField,
} from "@/lib/quiz/schema";
import { ALLOWED_TAGS, type AllowedTag } from "@/lib/tags";

const QUESTION_COUNT = QUIZ_QUESTION_FIELDS.length;
/** Questions + the final photo screen. */
const SCREEN_COUNT = QUESTION_COUNT + 1;

const TITLES = [
  "Dla kogo szukasz prezentu?",
  "Jaki masz budżet?",
  "Z jakiej okazji?",
  "Czym się interesuje?",
  "Jaki ma styl życia?",
  "Jaki prezent wolisz?",
  "Dodaj zdjęcie (opcjonalnie)",
];

type Errors = Partial<Record<QuizField, string>>;

type QuizWizardProps = {
  /** Called with validated answers. Wired to the results API in a later step. */
  onComplete?: (answers: QuizAnswers) => void | Promise<void>;
};

export function QuizWizard({ onComplete }: QuizWizardProps) {
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<QuizDraft>({ interests: [] });
  const [errors, setErrors] = useState<Errors>({});
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
    window.scrollTo({ top: 0 });
  }, [step]);

  function update<K extends QuizField>(field: K, value: QuizDraft[K]) {
    setDraft((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  }

  function goTo(nextStep: number) {
    setErrors({});
    setStep(Math.max(0, Math.min(SCREEN_COUNT - 1, nextStep)));
  }

  function next(nextDraft: QuizDraft = draft) {
    const fields = QUIZ_QUESTION_FIELDS[step];
    if (fields) {
      const stepErrors = validateFields(nextDraft, fields);
      if (Object.keys(stepErrors).length > 0) {
        setErrors(stepErrors);
        return;
      }
    }
    goTo(step + 1);
  }

  /** Single-choice screens advance right after a tap. */
  function choose<K extends "recipient" | "budget" | "occasion" | "lifestyle">(field: K, value: QuizDraft[K]) {
    const nextDraft = { ...draft, [field]: value };
    setDraft(nextDraft);
    next(nextDraft);
  }

  function toggleInterest(tag: AllowedTag) {
    const current = draft.interests ?? [];
    update("interests", current.includes(tag) ? current.filter((item) => item !== tag) : [...current, tag]);
  }

  async function submit() {
    const result = quizAnswersSchema.safeParse(draft);
    if (!result.success) {
      // Jump back to the first screen with a problem.
      const field = result.error.issues[0]?.path[0] as QuizField | undefined;
      const index = QUIZ_QUESTION_FIELDS.findIndex((fields) => field && fields.includes(field));
      goTo(index === -1 ? 0 : index);
      setErrors(validateFields(draft, QUIZ_QUESTION_FIELDS[index === -1 ? 0 : index]));
      return;
    }
    setSubmitting(true);
    try {
      await onComplete?.(result.data);
      setDone(true);
    } finally {
      setSubmitting(false);
    }
  }

  const interests = draft.interests ?? [];
  const isQuestion = step < QUESTION_COUNT;
  const progress = ((step + 1) / SCREEN_COUNT) * 100;

  return (
    <div className="flex flex-1 flex-col pb-28 pt-6">
      <div className="mb-6">
        <div className="mb-2 flex justify-between text-sm text-muted-foreground">
          <span>{isQuestion ? `Pytanie ${step + 1} z ${QUESTION_COUNT}` : "Ostatni krok"}</span>
          <span>{Math.round(progress)}%</span>
        </div>
        <div
          className="h-2 overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-valuemin={1}
          aria-valuemax={SCREEN_COUNT}
          aria-valuenow={step + 1}
          aria-label="Postęp quizu"
        >
          <div className="h-full rounded-full bg-primary transition-all duration-300" style={{ width: `${progress}%` }} />
        </div>
      </div>

      <h1 ref={headingRef} tabIndex={-1} className="mb-6 text-2xl font-bold leading-tight outline-none">
        {TITLES[step]}
      </h1>

      {step === 0 && (
        <TileGrid>
          {RECIPIENT_OPTIONS.map((option) => (
            <OptionTile
              key={option.value}
              {...option}
              selected={draft.recipient === option.value}
              onSelect={() => choose("recipient", option.value)}
            />
          ))}
        </TileGrid>
      )}

      {step === 1 && (
        <TileGrid columns={2}>
          {BUDGET_OPTIONS.map((option) => (
            <OptionTile
              key={option.value}
              {...option}
              selected={draft.budget === option.value}
              onSelect={() => choose("budget", option.value)}
            />
          ))}
        </TileGrid>
      )}

      {step === 2 && (
        <TileGrid columns={2}>
          {OCCASION_OPTIONS.map((option) => (
            <OptionTile
              key={option.value}
              {...option}
              selected={draft.occasion === option.value}
              onSelect={() => choose("occasion", option.value)}
            />
          ))}
        </TileGrid>
      )}

      {step === 3 && (
        <div>
          <p className="mb-4 text-muted-foreground" aria-live="polite">
            Wybierz od {MIN_INTERESTS} do {MAX_INTERESTS}. Wybrano: {interests.length}/{MAX_INTERESTS}
          </p>
          <div className="flex flex-wrap gap-2">
            {ALLOWED_TAGS.map((tag) => {
              const selected = interests.includes(tag);
              return (
                <TagChip
                  key={tag}
                  label={tagLabel(tag)}
                  selected={selected}
                  disabled={!selected && interests.length >= MAX_INTERESTS}
                  onToggle={() => toggleInterest(tag)}
                />
              );
            })}
          </div>
        </div>
      )}

      {step === 4 && (
        <TileGrid columns={2}>
          {LIFESTYLE_OPTIONS.map((option) => (
            <OptionTile
              key={option.value}
              {...option}
              selected={draft.lifestyle === option.value}
              onSelect={() => choose("lifestyle", option.value)}
            />
          ))}
        </TileGrid>
      )}

      {step === 5 && (
        <div className="flex flex-col gap-6">
          <TileGrid columns={2}>
            {GIFT_TYPE_OPTIONS.map((option) => (
              <OptionTile
                key={option.value}
                {...option}
                selected={draft.giftType === option.value}
                onSelect={() => update("giftType", option.value)}
              />
            ))}
          </TileGrid>
          <div>
            <label htmlFor="owned-items" className="mb-2 block font-medium">
              Co już ma? <span className="font-normal text-muted-foreground">(opcjonalnie)</span>
            </label>
            <input
              id="owned-items"
              type="text"
              maxLength={OWNED_ITEMS_MAX_LENGTH}
              value={draft.ownedItems ?? ""}
              onChange={(event) => update("ownedItems", event.target.value)}
              placeholder="np. ekspres do kawy, czytnik e-booków"
              aria-invalid={Boolean(errors.ownedItems)}
              aria-describedby="owned-items-hint"
              className="h-12 w-full rounded-xl border-2 bg-card px-4 text-base outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
            />
            <p id="owned-items-hint" className="mt-1 text-right text-sm text-muted-foreground">
              {(draft.ownedItems ?? "").length}/{OWNED_ITEMS_MAX_LENGTH}
            </p>
          </div>
        </div>
      )}

      {step === 6 && (
        <div className="flex flex-col gap-6">
          {/* TODO(step 5): photo upload, processed in memory only, never stored. */}
          <div className="flex flex-col items-center gap-3 rounded-xl border-2 border-dashed p-8 text-center text-muted-foreground">
            <Camera className="size-8" aria-hidden />
            <p>Zdjęcie pomoże dobrać prezent do stylu obdarowanego. Nie zapisujemy go nigdzie.</p>
            <Button type="button" variant="outline" size="lg" disabled>
              Dodaj zdjęcie (wkrótce)
            </Button>
          </div>
          <Summary draft={draft} onEdit={goTo} />
          {done && (
            <p className="rounded-xl bg-secondary p-4 text-center" role="status">
              Gotowe! Szukamy prezentów…
            </p>
          )}
        </div>
      )}

      {Object.values(errors).some(Boolean) && (
        <p className="mt-4 rounded-lg bg-destructive/10 p-3 text-sm text-destructive" role="alert">
          {Object.values(errors).filter(Boolean)[0]}
        </p>
      )}

      <nav className="fixed inset-x-0 bottom-0 border-t bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-2xl gap-3 px-4 py-3">
          {step > 0 && (
            <Button type="button" variant="outline" size="xl" className="flex-1" onClick={() => goTo(step - 1)}>
              <ArrowLeft aria-hidden />
              Wstecz
            </Button>
          )}
          {isQuestion ? (
            <Button type="button" size="xl" className="flex-[2]" onClick={() => next()}>
              Dalej
              <ArrowRight aria-hidden />
            </Button>
          ) : (
            <Button type="button" size="xl" className="flex-[2]" onClick={submit} disabled={submitting}>
              <Gift aria-hidden />
              {submitting ? "Szukam…" : "Pokaż prezenty"}
            </Button>
          )}
        </div>
      </nav>
    </div>
  );
}

function TileGrid({ children, columns = 1 }: { children: React.ReactNode; columns?: 1 | 2 }) {
  return <div className={columns === 2 ? "grid grid-cols-2 gap-3" : "grid gap-3"}>{children}</div>;
}

function labelOf<V>(options: readonly { value: V; label: string }[], value: V | undefined) {
  return options.find((option) => option.value === value)?.label ?? "–";
}

function Summary({ draft, onEdit }: { draft: QuizDraft; onEdit: (step: number) => void }) {
  const rows: [string, string, number][] = [
    ["Dla kogo", labelOf(RECIPIENT_OPTIONS, draft.recipient), 0],
    ["Budżet", labelOf(BUDGET_OPTIONS, draft.budget), 1],
    ["Okazja", labelOf(OCCASION_OPTIONS, draft.occasion), 2],
    ["Zainteresowania", (draft.interests ?? []).map(tagLabel).join(", ") || "–", 3],
    ["Styl życia", labelOf(LIFESTYLE_OPTIONS, draft.lifestyle), 4],
    [
      "Typ prezentu",
      labelOf(GIFT_TYPE_OPTIONS, draft.giftType) + (draft.ownedItems?.trim() ? ` · ma już: ${draft.ownedItems.trim()}` : ""),
      5,
    ],
  ];
  return (
    <dl className="divide-y rounded-xl border">
      {rows.map(([label, value, step]) => (
        <div key={label} className="flex items-center gap-3 px-4 py-3">
          <div className="min-w-0 flex-1">
            <dt className="text-sm text-muted-foreground">{label}</dt>
            <dd className="break-words font-medium">{value}</dd>
          </div>
          <Button type="button" variant="ghost" size="icon" onClick={() => onEdit(step)} aria-label={`Zmień: ${label}`}>
            <Pencil aria-hidden />
          </Button>
        </div>
      ))}
    </dl>
  );
}
