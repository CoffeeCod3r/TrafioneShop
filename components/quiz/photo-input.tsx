"use client";

import { useId, useRef, useState } from "react";
import Image from "next/image";
import { Camera, Loader2, ShieldCheck, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { track } from "@/lib/analytics/client";
import { PHOTO_ACCEPTED_TYPES } from "@/lib/photo/constants";
import { PhotoError, processPhoto, type ProcessedPhoto } from "@/lib/photo/resize";

type PhotoInputProps = {
  value: ProcessedPhoto | null;
  onChange: (photo: ProcessedPhoto | null) => void;
};

/**
 * Optional photo of the recipient. Resized in the browser and kept only in React state.
 * Never logged, stored or sent to analytics.
 */
export function PhotoInput({ value, onChange }: PhotoInputProps) {
  const consentId = useId();
  const noticeId = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const [consent, setConsent] = useState(value !== null);
  const [busy, setBusy] = useState(false);
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

  async function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    resetFileInput();
    if (!file || !consent) return;

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

  return (
    <div className="flex flex-col gap-4 rounded-xl border-2 border-dashed p-4">
      <p id={noticeId} className="flex items-start gap-2 text-sm text-muted-foreground">
        <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
        Zdjęcie trafia tylko do analizy AI i nie jest nigdzie zapisywane.
      </p>

      <label htmlFor={consentId} className="flex min-h-11 cursor-pointer items-start gap-3">
        <input
          id={consentId}
          type="checkbox"
          checked={consent}
          onChange={(event) => toggleConsent(event.target.checked)}
          className="mt-0.5 size-5 shrink-0 accent-primary"
        />
        <span className="text-sm">
          To moje zdjęcie albo mam zgodę osoby ze zdjęcia. Nie wgrywam zdjęć dzieci.
        </span>
      </label>

      <input
        ref={fileRef}
        type="file"
        accept={PHOTO_ACCEPTED_TYPES.join(",")}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={handleFile}
      />

      {value ? (
        <div className="flex flex-col items-center gap-3">
          <Image
            src={value.dataUrl}
            alt="Podgląd wybranego zdjęcia"
            width={value.width}
            height={value.height}
            unoptimized
            className="max-h-72 w-auto rounded-lg object-contain"
          />
          <div className="flex w-full gap-3">
            <Button type="button" variant="outline" size="lg" className="flex-1" onClick={() => fileRef.current?.click()}>
              <Camera aria-hidden />
              Zmień
            </Button>
            <Button type="button" variant="outline" size="lg" className="flex-1" onClick={remove}>
              <Trash2 aria-hidden />
              Usuń
            </Button>
          </div>
        </div>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="xl"
          disabled={!consent || busy}
          aria-describedby={noticeId}
          onClick={() => fileRef.current?.click()}
        >
          {busy ? <Loader2 className="animate-spin" aria-hidden /> : <Camera aria-hidden />}
          {busy ? "Przetwarzam zdjęcie…" : "Dodaj zdjęcie"}
        </Button>
      )}

      {!consent && !value && (
        <p className="text-center text-sm text-muted-foreground">Zaznacz zgodę powyżej, aby dodać zdjęcie.</p>
      )}
      <p className="text-center text-sm text-muted-foreground">JPG, PNG lub WEBP, do 10 MB. Zdjęcie jest opcjonalne.</p>

      {error && (
        <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
