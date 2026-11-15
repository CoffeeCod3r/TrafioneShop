"use client";

import { useId, useRef, useState } from "react";
import Image from "next/image";
import { Camera, Check, Loader2, RefreshCw, ShieldCheck, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { track } from "@/lib/analytics/client";
import { PHOTO_ACCEPTED_TYPES } from "@/lib/photo/constants";
import { PhotoError, processPhoto, type ProcessedPhoto } from "@/lib/photo/resize";
import { cn } from "@/lib/utils";

type PhotoInputProps = {
  value: ProcessedPhoto | null;
  onChange: (photo: ProcessedPhoto | null) => void;
};

/**
 * Optional photo of the recipient: a "polaroid" drop area. Tap to choose on phones,
 * drag & drop on desktop. Resized in the browser and kept only in React state:
 * never logged, stored or sent to analytics.
 */
export function PhotoInput({ value, onChange }: PhotoInputProps) {
  const consentId = useId();
  const noticeId = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const [consent, setConsent] = useState(value !== null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function resetFileInput() {
    if (fileRef.current) fileRef.current.value = "";
  }

  function remove() {
    onChange(null);
    setError(null);
    resetFileInput();
  }

  function toggleConsent(checked: boolean) {
    setConsent(checked);
    // Withdrawing consent removes the photo.
    if (!checked) remove();
  }

  async function handleFile(file: File | undefined) {
    resetFileInput();
    if (!file) return;
    if (!consent) {
      setError("Najpierw zaznacz zgodę powyżej.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      onChange(await processPhoto(file));
      // Only the fact that a photo was added; never the image or its metadata.
      track("photo_added");
    } catch (caught) {
      onChange(null);
      setError(caught instanceof PhotoError ? caught.message : "Nie udało się przetworzyć zdjęcia.");
    } finally {
      setBusy(false);
    }
  }

  function onDrop(event: React.DragEvent) {
    event.preventDefault();
    setDragging(false);
    void handleFile(event.dataTransfer.files?.[0]);
  }

  return (
    <div className="flex flex-col gap-4">
      <label
        htmlFor={consentId}
        className="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border-2 border-border bg-card p-3 text-sm"
      >
        <input
          id={consentId}
          type="checkbox"
          checked={consent}
          onChange={(event) => toggleConsent(event.target.checked)}
          className="mt-0.5 size-5 shrink-0 accent-[var(--ink)]"
        />
        <span>To moje zdjęcie albo mam zgodę osoby ze zdjęcia. Nie wgrywam zdjęć dzieci.</span>
      </label>

      <input
        ref={fileRef}
        type="file"
        accept={PHOTO_ACCEPTED_TYPES.join(",")}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(event) => void handleFile(event.target.files?.[0])}
      />

      {value ? (
        <div className="flex flex-col items-center gap-4">
          {/* Polaroid preview */}
          <figure className="animate-in fade-in zoom-in-95 -rotate-2 bg-white p-3 pb-10 shadow-[6px_6px_0_var(--ink)] ring-2 ring-ink duration-300">
            <Image
              src={value.dataUrl}
              alt="Podgląd wybranego zdjęcia"
              width={value.width}
              height={value.height}
              unoptimized
              className="max-h-64 w-auto object-contain"
            />
            <figcaption className="mt-3 flex items-center justify-center gap-1.5 font-display text-sm font-bold">
              <Check className="size-4 text-ribbon" aria-hidden />
              Gotowe, tylko do analizy stylu
            </figcaption>
          </figure>
          <div className="flex w-full gap-3">
            <Button type="button" variant="outline" size="lg" className="flex-1" onClick={() => fileRef.current?.click()}>
              <RefreshCw aria-hidden />
              Zmień
            </Button>
            <Button type="button" variant="outline" size="lg" className="flex-1" onClick={remove}>
              <Trash2 aria-hidden />
              Usuń
            </Button>
          </div>
        </div>
      ) : (
        <div
          onDragOver={(event) => {
            event.preventDefault();
            if (consent) setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={cn(
            "flex flex-col items-center gap-4 rounded-2xl border-[3px] border-dashed p-6 text-center transition-colors",
            dragging ? "border-ribbon bg-secondary" : "border-ink/30 bg-card",
            !consent && "opacity-80",
          )}
        >
          {busy ? (
            <div className="flex flex-col items-center gap-3 py-4" role="status">
              <div className="h-32 w-28 animate-pulse bg-muted ring-2 ring-ink/20" aria-hidden />
              <p className="flex items-center gap-2 font-medium">
                <Loader2 className="size-4 animate-spin" aria-hidden />
                Zmniejszam zdjęcie…
              </p>
            </div>
          ) : (
            <>
              <PolaroidIllustration className="h-28 w-28" />
              <div className="flex flex-col gap-1">
                <p className="font-display text-xl font-bold">Dodaj zdjęcie obdarowanego</p>
                <p className="text-sm text-muted-foreground">
                  AI spojrzy na styl ubrań, kolory i przedmioty wokół, żeby lepiej trafić z prezentem.
                </p>
              </div>
              <Button
                type="button"
                size="xl"
                className="w-full sm:w-auto"
                disabled={!consent}
                aria-describedby={noticeId}
                onClick={() => fileRef.current?.click()}
              >
                <Camera aria-hidden />
                Wybierz zdjęcie
              </Button>
              <p className="text-xs text-muted-foreground">
                {consent ? (
                  <>
                    <span className="hidden sm:inline">Albo przeciągnij je tutaj. </span>JPG, PNG lub WEBP, do 10 MB.
                  </>
                ) : (
                  "Zaznacz zgodę powyżej, żeby dodać zdjęcie."
                )}
              </p>
            </>
          )}
        </div>
      )}

      <p id={noticeId} className="flex items-start gap-2 text-sm text-muted-foreground">
        <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
        Zdjęcie trafia tylko do analizy AI i nie jest nigdzie zapisywane. Możesz też pominąć ten krok.
      </p>

      {error && (
        <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

/** Small original illustration: a polaroid with a gift and a sparkle. */
function PolaroidIllustration({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 120" className={className} aria-hidden focusable="false">
      <g transform="rotate(-6 60 60)">
        <rect x="22" y="14" width="76" height="92" rx="4" fill="#ffffff" stroke="var(--ink)" strokeWidth="4" />
        <rect x="31" y="23" width="58" height="56" rx="2" fill="var(--lilac)" stroke="var(--ink)" strokeWidth="3" />
        <rect x="46" y="48" width="28" height="22" rx="3" fill="var(--mint)" stroke="var(--ink)" strokeWidth="3" />
        <rect x="42" y="42" width="36" height="9" rx="2" fill="var(--mint)" stroke="var(--ink)" strokeWidth="3" />
        <path d="M60 42v28" stroke="var(--ribbon)" strokeWidth="5" />
        <path d="M60 42c-5-9-15-10-15-4 0 4 9 5 15 4Zm0 0c5-9 15-10 15-4 0 4-9 5-15 4Z" fill="var(--ribbon)" stroke="var(--ink)" strokeWidth="2.5" strokeLinejoin="round" />
        <path d="M44 92h32" stroke="var(--ink)" strokeWidth="3" strokeLinecap="round" opacity="0.35" />
      </g>
      <path
        className="sparkle"
        d="M98 18l3 7 7 3-7 3-3 7-3-7-7-3 7-3Z"
        fill="var(--sun)"
        stroke="var(--ink)"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}
