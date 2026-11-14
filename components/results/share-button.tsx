"use client";

import { useState } from "react";
import { Check, Share2 } from "lucide-react";

import { Button } from "@/components/ui/button";

type ShareButtonProps = { resultId: string; refCode: string | null };

/** Native share sheet on phones, copy-to-clipboard elsewhere. */
export function ShareButton({ resultId, refCode }: ShareButtonProps) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(false);

  async function share() {
    const url = new URL(`/wynik/${resultId}`, window.location.origin);
    if (refCode) url.searchParams.set("ref", refCode);
    const data = { title: "Prezentownik AI", text: "Zobacz, jakie prezenty dobrało AI:", url: url.toString() };

    if (navigator.share) {
      try {
        await navigator.share(data);
        return;
      } catch (caught) {
        if ((caught as DOMException).name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(url.toString());
      setCopied(true);
      setError(false);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setError(true);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Button type="button" variant="outline" size="xl" onClick={share}>
        {copied ? <Check aria-hidden /> : <Share2 aria-hidden />}
        {copied ? "Link skopiowany" : "Udostępnij wynik"}
      </Button>
      {error && (
        <p className="text-center text-sm text-muted-foreground" role="alert">
          Nie udało się skopiować. Skopiuj adres strony z paska przeglądarki.
        </p>
      )}
    </div>
  );
}
